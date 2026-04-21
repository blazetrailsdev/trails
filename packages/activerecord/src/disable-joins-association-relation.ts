import { Relation } from "./relation.js";
import { argumentError } from "./relation/query-methods.js";
import type { Base } from "./base.js";

/**
 * Module-private token for the DJAR fast-clone path. Unexported — only
 * `_newRelation` inside this module can forge a payload carrying it,
 * so external callers can't reach the trusted constructor branch even
 * via `any`/`unknown` erasure (they have no reference to the symbol).
 */
const TRUSTED_CLONE = Symbol("DisableJoinsAssociationRelation.trustedClone");

interface TrustedClonePayload<T extends Base> {
  [TRUSTED_CLONE]: {
    storedIds: DjarIds;
    storedKeyStrings: string[] | null;
    composite: boolean;
    chainWalker?: () => Promise<{ relation: Relation<T> }>;
  };
}

/**
 * Specialized Relation returned by `DisableJoinsAssociationScope`.
 * Operates in one of two modes:
 *
 *   1. **Loaded-chain mode** (Rails' `DisableJoinsAssociationRelation`,
 *      `activerecord/lib/active_record/disable_joins_association_relation.rb`):
 *      constructed with `(klass, key, ids)` after the chain walk is
 *      complete. `toArray()` loads via Relation, then groups by `key`
 *      and re-emits in `ids` order so callers see join-table ordering
 *      (SQL `IN(...)` doesn't preserve list order). `limit` / `first`
 *      slice the loaded array in-memory rather than appending SQL
 *      LIMIT (matches Rails' deliberate deviation).
 *
 *   2. **Deferred-chain mode**: constructed with a `chainWalker`
 *      callback that performs the async chain walk on first `toArray()`
 *      and returns the final scope (which itself may be a loaded-chain
 *      DJAR for the ordered-upstream wrap case). Lets `DJAS.scope()`
 *      return a `Relation` synchronously instead of `Promise<{ relation }>` —
 *      matches Rails' `DisableJoinsAssociationScope#scope` returning
 *      a Relation directly.
 */
/**
 * Join-key shape for the loaded-chain reorder. A plain string names a
 * single column (`"id"`); a string[] names a composite key's columns
 * in order (`["shop_id", "order_number"]`). The id list's shape
 * matches: scalars for single-column, tuples for composite.
 */
export type DjarKey = string | string[];
export type DjarIds = unknown[] | unknown[][];

/**
 * Stable Map key for both scalar and tuple join keys. Scalars are used
 * as-is (Map identity already works); tuples are serialized so
 * `[1, 100]` from two independent reads collides in the bucket.
 *
 * JSON covers the primitive shapes pluck returns (number/string/
 * null/bool), but `bigint` throws in `JSON.stringify` — the `big_integer`
 * cast type produces bigints, and composite PKs on large tables are
 * the exact case that hits them. Normalize bigints via a replacer
 * that emits `"\u0000B<decimal>"` (a NUL-prefixed string), so a
 * `123n` component serializes distinctly from the plain string
 * `"123"`. The outer tuple key also carries a leading `\u0000T`
 * marker so tuple keys are non-collidable with any plausible scalar
 * passed through this helper.
 */
function serializeKey(v: unknown, composite: boolean): unknown {
  if (!composite) return v;
  return (
    "\u0000T" +
    JSON.stringify(v, (_k, value) =>
      typeof value === "bigint" ? `\u0000B${value.toString()}` : value,
    )
  );
}

export class DisableJoinsAssociationRelation<T extends Base> extends Relation<T> {
  readonly key: DjarKey;
  /** Stored IDs (uniq'd at construction). Exposed as `ids()` to match
   * Rails' `attr_reader :ids` which shadows `Relation#ids` here. For
   * composite keys this is a list of tuples (`unknown[][]`); dedup is
   * by serialized tuple so two independently-read `[1, 100]`s
   * collapse. */
  private readonly _storedIds: DjarIds;
  /** Serialized form of `_storedIds` for the composite path — computed
   * once during constructor dedup so the load-time reorder loop can
   * reuse it instead of re-running `JSON.stringify` on every tuple
   * per `toArray()`. `null` for single-column keys (Map identity works
   * directly on scalars). */
  private readonly _storedKeyStrings: string[] | null;
  /** Whether `key` is composite (string[] with arity > 1). Derived at
   * construction; controls tuple-vs-scalar behavior in read/dedup/group. */
  private readonly _composite: boolean;
  /** Deferred chain walker. Boxed return ({ relation }) defeats
   * `Relation.then` — without the box, `await Promise<Relation>`
   * would unwrap to `T[]` (records array) instead of the Relation
   * itself. The box stays internal; callers see only the public
   * `toArray()` interface. */
  private readonly _chainWalker?: () => Promise<{ relation: Relation<T> }>;
  /**
   * Memoized walker invocation. Both `toArray()` and `ids()` (and any
   * future deferred-mode consumer) share this so the async chain walk
   * — including intermediate `pluck`s, which are the expensive part —
   * runs at most once per DJAR instance.
   */
  private _walkPromise?: Promise<{ relation: Relation<T> }>;

  // Typed overloads keep `key`/`ids` correlated at the call site so
  // `new DJAR(..., "id", [[1, 2]])` (string key + tuple ids) or
  // `new DJAR(..., ["a", "b"], [1, 2])` (tuple key + scalar ids) are
  // rejected at compile time. Only the two correlated overloads are
  // public — the broad `DjarKey`/`DjarIds` union stays on the
  // implementation signature alone. Runtime guards in the body still
  // cover dynamic callers that erase through `unknown` / `any`.
  constructor(
    klass: typeof Base,
    key: string,
    ids: unknown[],
    chainWalker?: () => Promise<{ relation: Relation<T> }>,
  );
  constructor(
    klass: typeof Base,
    key: string[],
    ids: unknown[][],
    chainWalker?: () => Promise<{ relation: Relation<T> }>,
  );
  // The implementation signature accepts an internal
  // `TrustedClonePayload<T>` (gated by the unexported `TRUSTED_CLONE`
  // symbol) as the fourth argument so `_newRelation` can take the
  // fast-clone path. It is intentionally NOT declared as a public
  // overload — external callers only see the two correlated forms
  // above, and they can't construct a valid trusted payload without
  // a reference to the module-private symbol.
  constructor(
    klass: typeof Base,
    key: DjarKey,
    ids: DjarIds,
    chainWalkerOrTrusted?: (() => Promise<{ relation: Relation<T> }>) | TrustedClonePayload<T>,
  ) {
    super(klass);
    // Fast clone path: `_newRelation` hands us already-normalized
    // state from another DJAR. Skip dedup / arity checks / per-tuple
    // JSON.stringify and just adopt the frozen outputs.
    if (
      chainWalkerOrTrusted &&
      typeof chainWalkerOrTrusted === "object" &&
      TRUSTED_CLONE in chainWalkerOrTrusted
    ) {
      const t = (chainWalkerOrTrusted as TrustedClonePayload<T>)[TRUSTED_CLONE];
      this.key = key;
      this._composite = t.composite;
      this._storedIds = t.storedIds;
      this._storedKeyStrings = t.storedKeyStrings;
      this._chainWalker = t.chainWalker;
      return;
    }
    const chainWalker = chainWalkerOrTrusted;
    // Normalize array-key shapes: length 0 is always a bug; length 1
    // collapses to the string form so `this.key` / `_composite`
    // stay consistent with the scalar path (and `readAttribute`
    // never gets `undefined`). When we collapse a length-1 key, we
    // also flatten singleton-tuple ids (`[[1], [2]]` → `[1, 2]`) so
    // the caller's shape isn't silently incompatible with the scalar
    // path they now route through — a tuple-typed overload call like
    // `new DJAR(..., ["col"], [[1], [2]])` keeps working.
    // Guard against non-array `ids` up front. Dynamic callers using
    // `any`/`unknown` could pass a Set, null, undefined, or an
    // arbitrary object — `.map` / `.length` below would otherwise
    // throw a generic TypeError or silently store zero ids.
    if (!Array.isArray(ids)) {
      throw argumentError(
        `DisableJoinsAssociationRelation: ids must be an array (got ${ids === null ? "null" : typeof ids})`,
      );
    }
    let normalizedKey: DjarKey = key;
    let normalizedIds: DjarIds = ids;
    if (Array.isArray(key)) {
      if (key.length === 0) {
        throw argumentError("DisableJoinsAssociationRelation: key must have at least one column");
      }
      if (key.length === 1) {
        normalizedKey = key[0];
        normalizedIds = (ids as unknown[]).map((id, i) => {
          if (!Array.isArray(id)) return id;
          if (id.length !== 1) {
            throw argumentError(
              `DisableJoinsAssociationRelation: single-column ids[${i}] must be a scalar or single-element array (got arity ${id.length})`,
            );
          }
          return id[0];
        });
      }
    }
    // Guard against empty-string key in loaded-chain mode — it would
    // make `readAttribute("")` return null for every record and the
    // reorder Map would silently produce an empty result. The
    // `deferred()` static intentionally passes "" as a placeholder
    // because the walker's returned relation owns the real key, so
    // allow it when a chain walker is present.
    if (normalizedKey === "" && !chainWalker) {
      throw argumentError("DisableJoinsAssociationRelation: key must not be empty");
    }
    this.key = normalizedKey;
    this._composite = Array.isArray(normalizedKey);
    // Scalar case: Set identity dedup matches Rails' `ids.uniq`.
    // Composite case: dedupe by serialized tuple so `[1, 100]` from
    // two owner rows collapses to one entry (Set-of-arrays would keep
    // both by reference). Cache the serialized forms so the load-time
    // reorder doesn't re-run JSON.stringify.
    if (this._composite) {
      const cols = normalizedKey as string[];
      const arity = cols.length;
      const seen = new Set<string>();
      const out: unknown[][] = [];
      const keyStrings: string[] = [];
      for (let i = 0; i < (normalizedIds as unknown[]).length; i++) {
        const t = (normalizedIds as unknown[])[i];
        // Fail fast on shape/arity mismatch. Without this, a flat
        // `unknown[]` slipping through as composite `ids` would
        // silently dedupe to "one bucket per scalar" and reorder to
        // nothing, instead of pointing at the caller.
        if (!Array.isArray(t)) {
          throw argumentError(
            `DisableJoinsAssociationRelation: composite ids[${i}] must be an array (got ${typeof t})`,
          );
        }
        if (t.length !== arity) {
          throw argumentError(
            `DisableJoinsAssociationRelation: composite ids[${i}] arity ${t.length} does not match key [${cols.join(", ")}] (arity ${arity})`,
          );
        }
        // Copy the tuple before storing so later caller mutation
        // of the outer array doesn't desync `_storedKeyStrings`
        // (cached serialization) from `_storedIds` (returned by
        // `ids()`). Cheap — tuples are tiny — and matches Rails'
        // `ids.uniq` producing a fresh array.
        const tuple = Array.from(t);
        const k = serializeKey(tuple, true) as string;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(tuple);
          keyStrings.push(k);
        }
      }
      this._storedIds = out;
      this._storedKeyStrings = keyStrings;
    } else {
      // Symmetric guard for the scalar path: a dynamic caller
      // passing tuple ids (via `any`/`unknown` erasure) with a
      // string key would dedupe by array reference and silently
      // produce an empty reorder result. Fail fast instead.
      const scalarIds = normalizedIds as unknown[];
      for (let i = 0; i < scalarIds.length; i++) {
        if (Array.isArray(scalarIds[i])) {
          throw argumentError(
            `DisableJoinsAssociationRelation: scalar ids[${i}] must not be an array when key is "${String(normalizedKey)}"`,
          );
        }
      }
      this._storedIds = Array.from(new Set(scalarIds));
      this._storedKeyStrings = null;
    }
    this._chainWalker = chainWalker;
  }

  /**
   * Construct a deferred-chain DJAR. Used by `DJAS.scope()` to return
   * a sync Relation while letting the async chain walk happen at
   * `toArray()` time. `key` and `ids` are placeholders here — the
   * walker's returned Relation owns the real reorder semantics (it
   * may itself be a loaded-chain DJAR if upstream was ordered).
   *
   * The walker MUST return a boxed `{ relation }`, not a bare
   * `Promise<Relation>` — bare Relations get unwrapped to `T[]` by
   * Promise's thenable chaining (since `Relation.then` is the
   * `toArray` shortcut). Callers construct the box at the source so
   * the bare Relation never crosses an `await` boundary.
   */
  static deferred<T extends Base>(
    klass: typeof Base,
    chainWalker: () => Promise<{ relation: Relation<T> }>,
  ): DisableJoinsAssociationRelation<T> {
    return new DisableJoinsAssociationRelation<T>(klass, "", [], chainWalker);
  }

  /**
   * Compose any query state chained onto this deferred DJAR onto the
   * walker's result relation. Without this,
   * `DJAS.scope(...).where(...)` and other chained modifiers would
   * be silently dropped — the walker builds a fresh relation that
   * doesn't see anything stored on `this`.
   *
   * Implementation: use `Relation#merge` for state where overlay
   * REPLACES walker (limit / offset / wheres get the standard merger
   * semantics), then selectively recompose fields whose normal chain
   * behavior is additive (`_orderClauses`, `_rawOrderClauses`,
   * `_selectColumns`). `Relation#merge` replaces orders/select
   * outright (relation/merger.ts:21-32), but `.order(...)` /
   * `.select(...)` chains conventionally APPEND elsewhere — so a
   * blanket merge would drop the walker's existing orders/projection
   * when the user chains `.order(...)`. Recompose those fields
   * additively here.
   */
  private _composeChainedState(walkerResult: Relation<T>): Relation<T> {
    type ComposeFields = {
      _orderClauses?: unknown[];
      _rawOrderClauses?: unknown[];
      _selectColumns?: unknown[];
    };
    // Snapshot walker's pre-merge order/select state — the merge
    // would otherwise replace these.
    const source = walkerResult as unknown as ComposeFields;
    const sourceOrders = [...(source._orderClauses ?? [])];
    const sourceRawOrders = [...(source._rawOrderClauses ?? [])];
    const sourceSelects = source._selectColumns ? [...source._selectColumns] : null;

    const merged = (walkerResult as unknown as { merge: (o: unknown) => Relation<T> }).merge(this);
    const target = merged as unknown as ComposeFields;
    const overlay = this as unknown as ComposeFields;
    const overlayOrders = overlay._orderClauses ?? [];
    const overlayRawOrders = overlay._rawOrderClauses ?? [];
    const overlaySelects = overlay._selectColumns ?? [];

    if (overlayRawOrders.length > 0 && overlayOrders.length === 0) {
      // `inOrderOf(column, values)` is the only `_rawOrderClauses`
      // producer today; it CLEARS `_orderClauses` to express
      // "replace existing order with this CASE order"
      // (relation.ts:610). Honor that reset: drop BOTH walker's
      // parsed orders AND any pre-existing raw orders so the
      // overlay's CASE order wins outright (not as a tiebreaker).
      target._orderClauses = [];
      target._rawOrderClauses = [...overlayRawOrders];
    } else {
      target._orderClauses = [...sourceOrders, ...overlayOrders];
      target._rawOrderClauses = [...sourceRawOrders, ...overlayRawOrders];
    }

    // Selects: append-and-dedupe so the walker's projection survives
    // when the overlay extends it. Dedupe is structural via Set
    // identity for primitive entries; complex AST nodes will dedupe
    // by reference (matches Relation#select chain behavior).
    if (sourceSelects && sourceSelects.length > 0) {
      target._selectColumns = Array.from(new Set([...sourceSelects, ...overlaySelects]));
    }

    return merged;
  }

  /**
   * Return the stored id list. The shape is correlated with `this.key`:
   * a `string` key yields a flat `unknown[]` of scalars, a `string[]`
   * composite key yields `unknown[][]` of tuples. Narrow with
   * `Array.isArray(this.key)` at the call site when the key shape isn't
   * statically known. In deferred-chain mode the walker's loaded-chain
   * DJAR carries the authoritative shape.
   *
   * Returns a defensive shallow copy (and cloned tuples in the
   * composite case) so caller mutation can't desync the internal
   * `_storedKeyStrings` cache used by the load-time reorder.
   */
  override async ids(): Promise<DjarIds> {
    if (this._chainWalker) {
      // Deferred mode — delegate to the composed walker result's
      // ids(), which can pluck instead of materializing full records.
      // Routes through the shared `_walkOnce()` so the chain walk
      // (including intermediate plucks) runs at most once per DJAR
      // instance, even if a caller invokes ids() and then toArray()
      // (or ids() multiple times).
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return (merged as unknown as { ids: () => Promise<DjarIds> }).ids();
    }
    if (this._composite) {
      return (this._storedIds as unknown[][]).map((t) => Array.from(t));
    }
    return (this._storedIds as unknown[]).slice();
  }

  /**
   * Count via the deferred chain walk without materializing the
   * target rows. Runs the intermediate plucks (cheap; they happen
   * anyway for this shape) then emits a single `SELECT COUNT(*)`
   * (or `COUNT(<column>)` when a column is provided) on the final-
   * step Relation. Loaded-chain mode delegates to
   * `Relation.prototype.count` against the current relation state
   * so any composed limit/offset/where on the loaded-chain DJAR
   * counts correctly — `_storedIds.length` would over-count if
   * additional WHEREs narrowed the load below the seed-id list.
   *
   * Mirrors Rails' `CollectionAssociation#count` on disable_joins
   * (which goes through `scope.count` → `records.size` after
   * loading) — except we skip the materialization since count
   * doesn't need it. Net: same result, fewer rows hydrated.
   */
  // @ts-expect-error Relation defines `count` as a property (from
  //   the calculations mixin); DJAR overrides as an async method
  //   that runs the deferred chain walk before counting.
  async count(column?: string): Promise<number | Record<string, number>> {
    if (this._chainWalker) {
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return (
        merged as unknown as {
          count: (col?: string) => Promise<number | Record<string, number>>;
        }
      ).count(column);
    }
    // Loaded-chain mode: route through Relation.prototype.count so
    // any composed limit/offset/where applies. Direct `.count.call`
    // — not `this.count(column)` — to avoid re-entering this
    // override.
    const baseCount = (
      Relation.prototype as unknown as {
        count: (this: unknown, col?: string) => Promise<number | Record<string, number>>;
      }
    ).count;
    return baseCount.call(this, column);
  }

  /**
   * Memoize the walker invocation so the async chain walk runs at
   * most once per DJAR instance. Shared by `toArray()` and `ids()`.
   */
  private _walkOnce(): Promise<{ relation: Relation<T> }> {
    if (!this._walkPromise) {
      this._walkPromise = this._chainWalker!();
    }
    return this._walkPromise;
  }

  /**
   * Preserve the subclass on `_clone()` (and any chained `where`/`order`
   * /`merge`) so the custom `toArray` reordering and `limit`/`first`
   * overrides survive chaining. Without this, Relation#_clone() would
   * spawn a plain Relation and silently drop the wrapping behavior.
   */
  protected override _newRelation(): Relation<T> {
    // `_newRelation` runs on every `_clone()` — including the
    // limit/offset-free load clone inside `toArray()`, and every
    // chained `.where(...)` / `.order(...)` — so re-running the
    // full constructor (dedup + per-tuple JSON.stringify) on every
    // chain link would repeat quadratic-ish work for large
    // composite-id lists. Route through the internal trusted
    // constructor overload that copies already-normalized state.
    const payload: TrustedClonePayload<T> = {
      [TRUSTED_CLONE]: {
        storedIds: this._storedIds,
        storedKeyStrings: this._storedKeyStrings,
        composite: this._composite,
        chainWalker: this._chainWalker,
      },
    };
    // Branch on `_composite` so we hit one of the public correlated
    // overloads. The trusted payload is not in the public signature
    // list (it only lives on the implementation signature, gated by
    // the module-private TRUSTED_CLONE symbol), so cast it through
    // the public `chainWalker?` slot — same runtime position, same
    // module.
    const trusted = payload as unknown as () => Promise<{ relation: Relation<T> }>;
    const clone = this._composite
      ? new DisableJoinsAssociationRelation<T>(
          this.model,
          this.key as string[],
          this._storedIds as unknown[][],
          trusted,
        )
      : new DisableJoinsAssociationRelation<T>(
          this.model,
          this.key as string,
          this._storedIds as unknown[],
          trusted,
        );
    return clone as unknown as Relation<T>;
  }

  override async toArray(): Promise<T[]> {
    if (this._chainWalker) {
      // Routes through `_walkOnce()` so the chain walk (including
      // intermediate plucks) is shared with any earlier `ids()` call.
      // The chained query state on `this` (wheres / orders / limit /
      // etc.) composes via `_composeChainedState` so chains like
      // `DJAS.scope(...).where({title: 'foo'})` actually filter the
      // walker's result.
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return merged.toArray();
    }
    // Loaded-chain mode: load via Relation, then group by `key` and
    // re-emit in `ids` order so the caller sees join-table ordering
    // (Rails' `load` override).
    //
    // Build a clone with `_limitValue` / `_offsetValue` cleared and
    // load through that — never mutate `this`. Reason: deferred-mode
    // composition (via `_composeChainedState`'s `merge`) can copy a
    // chained `.limit(n)` / offset onto this loaded-chain DJAR.
    // Letting the SQL path apply LIMIT before the IN-list reorder
    // would slice the WRONG rows. Rails matches by overriding
    // `limit`/`first` to load + take in memory; we do the same.
    // Cloning (rather than mutating `this` across the await) keeps
    // concurrent `toSql()` / `ids()` / second `toArray()` calls
    // observing the original configured state.
    type LimitOffset = { _limitValue?: number | null; _offsetValue?: number | null };
    const self = this as unknown as LimitOffset & {
      _clone: () => DisableJoinsAssociationRelation<T>;
    };
    const limitVal = self._limitValue ?? null;
    const offsetVal = self._offsetValue ?? null;
    const loadClone = self._clone() as unknown as LimitOffset;
    loadClone._limitValue = null;
    loadClone._offsetValue = null;
    // Call Relation's toArray directly on the clone — going through
    // DJAR.toArray would re-enter the deferred/loaded branching and
    // recurse forever for the loaded-chain mode.
    const records = (await Relation.prototype.toArray.call(loadClone)) as T[];
    const byKey = new Map<unknown, T[]>();
    const keyCols = Array.isArray(this.key) ? this.key : [this.key];
    const composite = this._composite;
    for (const r of records) {
      const raw = composite ? keyCols.map((c) => r.readAttribute(c)) : r.readAttribute(keyCols[0]);
      const k = serializeKey(raw, composite);
      const bucket = byKey.get(k);
      if (bucket) bucket.push(r);
      else byKey.set(k, [r]);
    }
    const ordered: T[] = [];
    if (composite) {
      // Walk `_storedKeyStrings` directly — the serialized forms were
      // computed once at construction, so the reorder avoids re-running
      // JSON.stringify per tuple on every `toArray()` call.
      const keyStrings = this._storedKeyStrings!;
      for (const k of keyStrings) {
        const bucket = byKey.get(k);
        if (bucket) ordered.push(...bucket);
      }
    } else {
      for (const id of this._storedIds) {
        const bucket = byKey.get(id);
        if (bucket) ordered.push(...bucket);
      }
    }
    const start = offsetVal ?? 0;
    const end = limitVal == null ? undefined : start + limitVal;
    return start === 0 && end === undefined ? ordered : ordered.slice(start, end);
  }

  /**
   * Loaded-chain mode (Rails fidelity): `def limit(value);
   * records.take(value); end` — load everything then slice in
   * memory. Deferred-chain mode: chain like a normal Relation. The
   * walker result composes the limit via `_composeChainedState` and
   * the underlying relation handles SQL LIMIT (or, if the walker
   * produced a loaded-chain DJAR, that DJAR's own override slices
   * in-memory).
   */
  // @ts-expect-error — deliberate Rails-fidelity deviation in loaded-chain mode: returns Array, not Relation
  override limit(value: number | null): Relation<T> | Promise<T[]> {
    if (this._chainWalker) return Relation.prototype.limit.call(this, value) as Relation<T>;
    return (async () => {
      const records = await this.toArray();
      // null = "clear the limit" (matches Relation#limit). Without
      // this guard, `records.slice(0, null)` returns an empty array.
      return value === null ? records : records.slice(0, value);
    })();
  }

  /**
   * Loaded-chain mode: load + take. Deferred-chain mode: chain like
   * a normal Relation (limit applied via Relation.prototype.limit
   * → walker result → SQL LIMIT or loaded-DJAR slice).
   *
   * Overload signatures match Relation's: `first()` →
   * `Promise<T | null>`, `first(n)` → `Promise<T[]>`. The
   * implementation returns the union and dispatches by argument
   * presence, so callers keep correct typing without a cast or
   * `@ts-expect-error`.
   */
  override first(): Promise<T | null>;
  override first(n: number): Promise<T[]>;
  override async first(limit?: number): Promise<T | T[] | null> {
    if (this._chainWalker) {
      const limitVal = limit ?? 1;
      const limited = Relation.prototype.limit.call(this, limitVal) as Relation<T>;
      const records = await limited.toArray();
      return limit === undefined ? (records[0] ?? null) : records;
    }
    const records = await this.toArray();
    return limit === undefined ? (records[0] ?? null) : records.slice(0, limit);
  }
}
