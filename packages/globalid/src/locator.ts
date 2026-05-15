import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";

/** Duck-typed model interface; globalid stays AR-agnostic. */
export interface LocatorModel {
  name: string;
  primaryKey?: string | string[];
  /** Single-id form returns a record; array form returns an ordered array. */
  find(id: unknown): Promise<unknown> | unknown;
  where?(conditions: Record<string, unknown>): {
    toArray?(): Promise<unknown[]> | unknown[];
  };
}

export interface LocateOptions {
  /** Class allowlist — only return records whose class matches one of these. */
  only?: LocatorModel | LocatorModel[];
  /**
   * Use `where(pk: ids)` instead of `find(ids)` so missing records are
   * silently skipped (the result array is shorter than the input). Without
   * this option, a missing record causes `find` to throw.
   */
  ignoreMissing?: boolean;
}

export interface LocateSignedOptions extends LocateOptions {
  /** Purpose to verify against (Rails: `for:`). */
  for?: string;
  /** Verifier to validate the SGID signature. */
  verifier: MessageVerifier;
}

/** Lookup function: given a model name, return the class (or undefined). */
export type ModelFinder = (name: string) => LocatorModel | undefined;

let _modelFinder: ModelFinder | undefined;

/** Register the model lookup function. Called from AR's wire side. */
export function setModelFinder(finder: ModelFinder): void {
  _modelFinder = finder;
}

/** @internal — test use only */
export function _resetModelFinder(): void {
  _modelFinder = undefined;
}

/** Mirrors: GlobalID::Locator */
export class Locator {
  /**
   * Mirrors: Locator.locate(gid, options).
   * Returns null if the GID is invalid, the model class isn't registered, or
   * the `only:` filter rejects it. Errors from `klass.find` propagate (Rails
   * raises RecordNotFound; use `locateMany` with `ignoreMissing` for graceful
   * missing-record handling).
   */
  static async locate(
    gid: string | GlobalID,
    options: LocateOptions = {},
  ): Promise<unknown | null> {
    const parsed = GlobalID.parse(gid);
    if (!parsed) return null;
    const klass = lookupClass(parsed.modelName);
    if (!klass) return null;
    if (!isAllowed(klass, options.only)) return null;
    const record = await klass.find(parsed.modelId);
    return record ?? null;
  }

  /**
   * Mirrors: Locator.locate_many(gids, options).
   *
   * Returns records matching the input GIDs in input order. Unknown classes,
   * invalid GIDs, and `only:`-rejected entries are skipped (no null
   * placeholders). With `ignoreMissing: true`, missing records are also
   * skipped — the result array may be shorter than the input array.
   *
   * Each model class is hit with a single batch `find(ids)` (Rails parity).
   */
  static async locateMany(
    gids: Array<string | GlobalID>,
    options: LocateOptions = {},
  ): Promise<unknown[]> {
    const allowed: Array<{ gid: GlobalID; klass: LocatorModel }> = [];
    const idsByClass = new Map<LocatorModel, unknown[]>();

    for (const g of gids) {
      const parsed = GlobalID.parse(g);
      if (!parsed) continue;
      const klass = lookupClass(parsed.modelName);
      if (!klass || !isAllowed(klass, options.only)) continue;
      allowed.push({ gid: parsed, klass });
      const ids = idsByClass.get(klass) ?? [];
      ids.push(parsed.modelId);
      idsByClass.set(klass, ids);
    }

    const recordsByClassAndId = new Map<string, Map<string, unknown>>();
    for (const [klass, ids] of idsByClass) {
      const records = await findRecords(klass, ids, options);
      const byId = new Map<string, unknown>();
      const pkProp = recordIdProp(klass);
      for (const rec of records) {
        byId.set(idKey((rec as Record<string, unknown>)[pkProp]), rec);
      }
      recordsByClassAndId.set(klass.name, byId);
    }

    const result: unknown[] = [];
    for (const { gid, klass } of allowed) {
      const byId = recordsByClassAndId.get(klass.name);
      const rec = byId?.get(idKey(gid.modelId));
      if (rec !== undefined) result.push(rec);
    }
    return result;
  }

  /**
   * Mirrors: Locator.locate_signed(sgid, options).
   * Parses the SGID with the supplied verifier; returns null on invalid
   * signature, expired token, purpose mismatch, or unknown model class.
   */
  static async locateSigned(sgid: string, options: LocateSignedOptions): Promise<unknown | null> {
    const parsed = SignedGlobalID.parse(sgid, {
      for: options.for,
      verifier: options.verifier,
    });
    if (!parsed) return null;
    return Locator.locate(parsed.uri, options);
  }

  /**
   * Mirrors: Locator.locate_many_signed(sgids, options).
   * Filters out invalid/expired SGIDs and locates the rest. Empty array if
   * none verify.
   */
  static async locateManySigned(sgids: string[], options: LocateSignedOptions): Promise<unknown[]> {
    const uris: string[] = [];
    for (const s of sgids) {
      const parsed = SignedGlobalID.parse(s, {
        purpose: options.for,
        verifier: options.verifier,
      });
      if (parsed) uris.push(parsed.uri);
    }
    return Locator.locateMany(uris, options);
  }
}

function lookupClass(name: string): LocatorModel | undefined {
  return _modelFinder?.(name);
}

type Ctor = new (...args: never[]) => unknown;

function isAllowed(klass: LocatorModel, only: LocateOptions["only"]): boolean {
  if (!only) return true;
  const list = Array.isArray(only) ? only : [only];
  const fn = klass as unknown as Ctor;
  return list.some((c) => {
    const cFn = c as unknown as Ctor;
    return fn === cFn || fn.prototype instanceof cFn;
  });
}

async function findRecords(
  klass: LocatorModel,
  ids: unknown[],
  options: LocateOptions,
): Promise<unknown[]> {
  // Composite primary keys would need where(cols, tuples) — Rails relation
  // form not yet supported by our AR layer. Fall through to find(ids), which
  // raises on missing; CPK + ignoreMissing is a known limitation.
  if (options.ignoreMissing && klass.where && !Array.isArray(klass.primaryKey)) {
    const pkKey = klass.primaryKey ?? "id";
    const rel = klass.where({ [pkKey]: ids });
    if (!rel.toArray) {
      throw new Error(
        "LocatorModel.where() returned a relation without .toArray() — required for ignoreMissing.",
      );
    }
    const records = await rel.toArray();
    return Array.isArray(records) ? records : [];
  }
  // Rails: model_class.find(ids) — single batch call returning an array.
  const result = await klass.find(ids);
  return Array.isArray(result) ? result : [result];
}

/** Property name to read the primary key value from a record instance. */
function recordIdProp(klass: LocatorModel): string {
  // AR exposes composite PKs through `.id` (array form), so use "id" for
  // composite. For scalar PKs, honor klass.primaryKey when set.
  return Array.isArray(klass.primaryKey) ? "id" : (klass.primaryKey ?? "id");
}

/** Serialize an id to a Map key, using JSON for arrays so `['a/b','c']` and
 *  `['a','b/c']` don't collide. @internal */
function idKey(id: unknown): string {
  return Array.isArray(id) ? JSON.stringify(id.map(String)) : String(id);
}
