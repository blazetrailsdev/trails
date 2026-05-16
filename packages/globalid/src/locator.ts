import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { validateApp } from "./uri/gid.js";
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
  /**
   * Rails: `Model.unscoped { ... }` — optional escape hatch
   * `UnscopedLocator` uses. Block may be sync or async; return matches.
   * Shape is permissive so AR's `unscoped(block)`
   * (`(block: () => R | Promise<R>) => Promise<R>`) is assignable
   * without casts, and a synchronous duck-typed `unscoped(block) => R`
   * also works.
   */
  unscoped?<R>(block: () => R | Promise<R>): R | Promise<R>;
}

export interface LocateOptions {
  only?: LocatorModel | LocatorModel[];
  /**
   * Use `where(pk: ids)` instead of `find(ids)` so missing records are
   * silently skipped (the result array is shorter than the input). Without
   * this option, a missing record causes `klass.find` to throw (Rails
   * raises `RecordNotFound`). Use `ignoreMissing: true` for graceful
   * missing-record handling.
   */
  ignoreMissing?: boolean;
}

export interface LocateSignedOptions extends LocateOptions {
  /** Purpose to verify against (Rails: `for:`). */
  for?: string;
  /** Alias of `for` kept consistent with SignedGlobalIDOptions/ParseOptions. */
  purpose?: string;
  /** Verifier to validate the SGID signature. */
  verifier: MessageVerifier;
}

export type ModelFinder = (name: string) => LocatorModel | undefined;

let _modelFinder: ModelFinder | undefined;

export function setModelFinder(finder: ModelFinder): void {
  _modelFinder = finder;
}

/** @internal — test use only */
export function _resetModelFinder(): void {
  _modelFinder = undefined;
}

// ─── BaseLocator / UnscopedLocator / BlockLocator ──────────────────────────

/** Block-form locator function — accepts a parsed GlobalID + options. */
export type LocatorBlock = (gid: GlobalID, options?: LocateOptions) => Promise<unknown> | unknown;

/**
 * Anything that can be plugged in as a locator — `BaseLocator`,
 * `UnscopedLocator`, `BlockLocator`, or a custom class that implements
 * the same `locate` / `locateMany` shape. Used as the public type for
 * `Locator.defaultLocator` and `Locator.use` so callers don't have to
 * cast between class hierarchies.
 */
export interface LocatorLike {
  locate(gid: GlobalID, options?: LocateOptions): Promise<unknown | null>;
  locateMany(gids: GlobalID[], options?: LocateOptions): Promise<unknown[]>;
}

/**
 * Mirrors: GlobalID::Locator::BaseLocator. Resolves GlobalIDs by looking up
 * the model class via the registered ModelFinder and delegating to
 * `klass.find(id)` (or `klass.where({pk: ids})` for the batch + ignoreMissing
 * path).
 */
export class BaseLocator {
  /** Mirrors: BaseLocator#locate */
  async locate(gid: GlobalID, _options: LocateOptions = {}): Promise<unknown | null> {
    if (!this.modelIdIsValid(gid)) return null;
    const klass = lookupClass(gid.modelName);
    if (!klass) return null;
    const record = await klass.find(gid.modelId);
    return record ?? null;
  }

  /** Mirrors: BaseLocator#locate_many */
  async locateMany(gids: GlobalID[], options: LocateOptions = {}): Promise<unknown[]> {
    const idsByClass = new Map<LocatorModel, unknown[]>();
    const allowed: Array<{ gid: GlobalID; klass: LocatorModel }> = [];
    for (const gid of gids) {
      if (!this.modelIdIsValid(gid)) continue;
      const klass = lookupClass(gid.modelName)!;
      allowed.push({ gid, klass });
      const ids = idsByClass.get(klass) ?? [];
      ids.push(gid.modelId);
      idsByClass.set(klass, ids);
    }

    const byClassAndId = new Map<string, Map<string, unknown>>();
    for (const [klass, ids] of idsByClass) {
      const records = await this.findRecords(klass, ids, options);
      const byId = new Map<string, unknown>();
      // Read the record's PK property from the same source of truth as
      // findRecords/modelIdIsValid — this.primaryKey(klass) — so a
      // subclass that overrides primaryKey() indexes consistently.
      const pkProp = recordIdProp(this.primaryKey(klass));
      for (const rec of records) {
        byId.set(idKey((rec as Record<string, unknown>)[pkProp]), rec);
      }
      byClassAndId.set(klass.name, byId);
    }

    const result: unknown[] = [];
    for (const { gid, klass } of allowed) {
      const rec = byClassAndId.get(klass.name)?.get(idKey(gid.modelId));
      if (rec !== undefined) result.push(rec);
    }
    return result;
  }

  /** @internal Mirrors: BaseLocator#find_records — batch find or where(pk: ids). */
  protected async findRecords(
    klass: LocatorModel,
    ids: unknown[],
    options: LocateOptions,
  ): Promise<unknown[]> {
    // Composite primary keys would need where(cols, tuples); Rails relation
    // form not yet supported by our AR layer. CPK + ignoreMissing falls
    // through to find(ids) (raises on missing) as a known limitation.
    //
    // Use this.primaryKey(klass) as the single source of truth for the PK
    // shape — a subclass overriding primaryKey() must affect both the
    // composite-key gate AND the where() key consistently.
    const pk = this.primaryKey(klass);
    if (options.ignoreMissing && klass.where && !Array.isArray(pk)) {
      const rel = klass.where({ [pk]: ids });
      if (!rel.toArray) {
        throw new Error(
          "LocatorModel.where() returned a relation without .toArray() — required for ignoreMissing.",
        );
      }
      const records = await rel.toArray();
      return Array.isArray(records) ? records : [];
    }
    const result = await klass.find(ids);
    return Array.isArray(result) ? result : [result];
  }

  /** @internal Mirrors: BaseLocator#model_id_is_valid? — modelId arity matches PK arity. */
  protected modelIdIsValid(gid: GlobalID): boolean {
    const klass = lookupClass(gid.modelName);
    if (!klass) return false;
    return modelIdArityMatches(klass, gid.modelId, this.primaryKey(klass));
  }

  /** @internal Mirrors: BaseLocator#primary_key. */
  protected primaryKey(klass: LocatorModel): string | string[] {
    return klass.primaryKey ?? "id";
  }
}

/**
 * Mirrors: GlobalID::Locator::UnscopedLocator. Wraps lookups in
 * `Model.unscoped { ... }` when the model supports it; otherwise yields
 * (most TS models don't have an unscoped escape hatch).
 */
export class UnscopedLocator extends BaseLocator {
  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    const klass = lookupClass(gid.modelName);
    return this.unscoped(klass, () => super.locate(gid, options));
  }

  /** @internal */
  protected async findRecords(
    klass: LocatorModel,
    ids: unknown[],
    options: LocateOptions,
  ): Promise<unknown[]> {
    return this.unscoped(klass, () => super.findRecords(klass, ids, options));
  }

  /** @internal Mirrors: UnscopedLocator#unscoped. */
  protected unscoped<R>(
    klass: LocatorModel | undefined,
    block: () => R | Promise<R>,
  ): R | Promise<R> {
    return klass?.unscoped ? klass.unscoped(block) : block();
  }
}

/**
 * Mirrors: GlobalID::Locator::BlockLocator. Wraps a `(gid, options) → record`
 * function as a locator. Created by `Locator.use(app, block)`.
 */
export class BlockLocator {
  private readonly _locator: LocatorBlock;

  constructor(block: LocatorBlock) {
    this._locator = block;
  }

  async locate(gid: GlobalID, options: LocateOptions = {}): Promise<unknown | null> {
    const result = await this._locator(gid, options);
    return result ?? null;
  }

  /**
   * Locate each GID via the block sequentially (Rails parity — Ruby's
   * `gids.map { |gid| locate(gid, options) }` runs single-threaded).
   * Sequential ordering matters here: a block that touches global state
   * or external resources would behave unpredictably under `Promise.all`.
   *
   * Divergence from Rails: Rails' `BlockLocator#locate_many` returns the
   * block results including nils (preserving input order with gaps). We
   * filter nulls to stay consistent with `BaseLocator#locateMany` (which
   * uses `filter_map` in Rails). If positional alignment with the input
   * matters, callers should call `locate` per GID directly.
   */
  async locateMany(gids: GlobalID[], options: LocateOptions = {}): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const gid of gids) {
      const r = await this.locate(gid, options);
      if (r !== null) results.push(r);
    }
    return results;
  }
}

// ─── Locator (top-level facade — dispatches to per-app or default locator) ─

const _appLocators = new Map<string, LocatorLike>();
let _defaultLocator: LocatorLike = new UnscopedLocator();

/** Mirrors: GlobalID::Locator */
export class Locator {
  /** Mirrors: Locator.locate */
  static async locate(
    gid: string | GlobalID,
    options: LocateOptions = {},
  ): Promise<unknown | null> {
    const parsed = GlobalID.parse(gid);
    if (!parsed) return null;
    const klass = lookupClass(parsed.modelName);
    if (!klass) return null;
    if (!Locator.findAllowed(klass, options.only)) return null;
    // Arity-check at the facade so BlockLocator / custom LocatorLike dispatch
    // doesn't run on a GID that BaseLocator would reject. Matches the
    // mismatched-modelId-returns-null behavior across all locator kinds.
    if (!modelIdArityMatches(klass, parsed.modelId)) return null;
    const locator = Locator.locatorFor(parsed);
    // Rails: options.except(:only) — the only: filter is the facade's
    // concern, not the per-locator one.
    const { only: _, ...rest } = options;
    return locator.locate(parsed, rest);
  }

  /**
   * Mirrors: Locator.locate_many. Rails' contract: "All GlobalIDs must
   * belong to the same app, as they will be located using the same
   * locator." Rails relies on the caller and silently misroutes
   * mismatched-app GIDs through the first GID's locator — which is unsafe
   * with BlockLocators that only know one app's models. We make this
   * explicit: only GIDs matching the first allowed GID's app are passed
   * to the locator; the rest are dropped. (Rails-faithful for the
   * single-app happy path; safer for the mixed-app misuse case.)
   */
  static async locateMany(
    gids: Array<string | GlobalID>,
    options: LocateOptions = {},
  ): Promise<unknown[]> {
    const allowed = Locator.parseAllowed(gids, options.only);
    if (allowed.length === 0) return [];
    const app = Locator.normalizeApp(allowed[0].app);
    const sameApp = allowed.filter((g) => Locator.normalizeApp(g.app) === app);
    const locator = Locator.locatorFor(allowed[0]);
    // Same as locate: strip the only: option before delegating.
    const { only: _, ...rest } = options;
    return locator.locateMany(sameApp, rest);
  }

  /** Mirrors: Locator.locate_signed */
  static async locateSigned(
    sgid: string | SignedGlobalID,
    options: LocateSignedOptions,
  ): Promise<unknown | null> {
    const purpose = options.for ?? options.purpose;
    const parsed = SignedGlobalID.parse(String(sgid), { for: purpose, verifier: options.verifier });
    if (!parsed) return null;
    return Locator.locate(parsed.uri, options);
  }

  /** Mirrors: Locator.locate_many_signed */
  static async locateManySigned(
    sgids: Array<string | SignedGlobalID>,
    options: LocateSignedOptions,
  ): Promise<unknown[]> {
    const purpose = options.for ?? options.purpose;
    const uris: string[] = [];
    for (const s of sgids) {
      const parsed = SignedGlobalID.parse(String(s), { for: purpose, verifier: options.verifier });
      if (parsed) uris.push(parsed.uri);
    }
    return Locator.locateMany(uris, options);
  }

  // ─── Class-level config (Rails: attr_accessor :default_locator) ───────────

  /** Mirrors: Locator.default_locator */
  static get defaultLocator(): LocatorLike {
    return _defaultLocator;
  }
  /** Mirrors: Locator.default_locator= */
  static set defaultLocator(locator: LocatorLike) {
    _defaultLocator = locator;
  }

  /**
   * Mirrors: Locator.use(app, locator | &block) — register a per-app locator.
   * Accepts any locator-like object or a plain block function (wrapped
   * automatically as a BlockLocator).
   */
  static use(app: string, locator: LocatorLike | LocatorBlock): void {
    validateApp(app);
    const wrapped = typeof locator === "function" ? new BlockLocator(locator) : locator;
    _appLocators.set(Locator.normalizeApp(app), wrapped);
  }

  // ─── Private helpers (Rails class << self private) ───────────────────────

  /** @internal Mirrors: Locator.locator_for. */
  static locatorFor(gid: GlobalID): LocatorLike {
    return _appLocators.get(Locator.normalizeApp(gid.app)) ?? _defaultLocator;
  }

  /** @internal Mirrors: Locator.find_allowed?. */
  static findAllowed(klass: LocatorModel, only?: LocateOptions["only"]): boolean {
    if (!only) return true;
    const list = Array.isArray(only) ? only : [only];
    const fn = klass as unknown as Ctor;
    return list.some((c) => {
      const cFn = c as unknown as Ctor;
      return fn === cFn || fn.prototype instanceof cFn;
    });
  }

  /**
   * @internal Mirrors: Locator.parse_allowed. Extends Rails behavior by also
   * filtering modelId-arity mismatches here (Rails defers that to
   * BaseLocator#model_id_is_valid? at dispatch time). We filter early so the
   * locateMany first-GID-app selection isn't anchored on a doomed entry,
   * which would drop otherwise-valid same-app GIDs.
   */
  static parseAllowed(gids: Array<string | GlobalID>, only?: LocateOptions["only"]): GlobalID[] {
    const result: GlobalID[] = [];
    for (const g of gids) {
      const parsed = GlobalID.parse(g);
      if (!parsed) continue;
      const klass = lookupClass(parsed.modelName);
      if (!klass) continue;
      if (!Locator.findAllowed(klass, only)) continue;
      if (!modelIdArityMatches(klass, parsed.modelId)) continue;
      result.push(parsed);
    }
    return result;
  }

  /** @internal Mirrors: Locator.normalize_app — case-insensitive app keying. */
  static normalizeApp(app: string): string {
    return String(app).toLowerCase();
  }
}

/** @internal — test use only: clear app-scoped locators between tests. */
export function _resetLocators(): void {
  _appLocators.clear();
  _defaultLocator = new UnscopedLocator();
}

// ─── Module-private helpers ────────────────────────────────────────────────

function lookupClass(name: string): LocatorModel | undefined {
  return _modelFinder?.(name);
}

type Ctor = new (...args: never[]) => unknown;

/** Property name to read the PK value from a record. Takes the PK shape
 *  (string for scalar, array for composite). Composite PKs read through
 *  AR's `.id` aggregate accessor; scalars use the PK column name. */
function recordIdProp(pk: string | string[]): string {
  return Array.isArray(pk) ? "id" : pk;
}

/** True iff `modelId`'s arity matches `klass.primaryKey`'s arity. @internal */
function modelIdArityMatches(
  klass: LocatorModel,
  modelId: unknown,
  pk: string | string[] = klass.primaryKey ?? "id",
): boolean {
  const pkArity = Array.isArray(pk) ? pk.length : 1;
  const idArity = Array.isArray(modelId) ? modelId.length : 1;
  return idArity === pkArity;
}

function idKey(id: unknown): string {
  return Array.isArray(id) ? JSON.stringify(id.map(String)) : String(id);
}
