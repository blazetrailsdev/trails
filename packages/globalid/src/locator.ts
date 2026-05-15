import { GlobalID } from "./global-id.js";

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
  /** Use `where(pk: ids)` instead of `find(ids)` so missing records yield `null`. */
  ignoreMissing?: boolean;
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

  /** Mirrors: Locator.locate_many(gids, options) */
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
      for (const rec of records) {
        byId.set(idKey((rec as { id: unknown }).id), rec);
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
  if (options.ignoreMissing && klass.where) {
    const pk = klass.primaryKey ?? "id";
    const pkKey = Array.isArray(pk) ? pk[0] : pk;
    const rel = klass.where({ [pkKey]: ids });
    const records = await (rel.toArray ? rel.toArray() : []);
    return Array.isArray(records) ? records : [];
  }
  // Rails: model_class.find(ids) — single batch call returning an array.
  const result = await klass.find(ids);
  return Array.isArray(result) ? result : [result];
}

function idKey(id: unknown): string {
  return Array.isArray(id) ? id.map(String).join("/") : String(id);
}
