import { Relation } from "./relation.js";
import type { Base } from "./base.js";

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
export class DisableJoinsAssociationRelation<T extends Base> extends Relation<T> {
  readonly key: string;
  /** Stored IDs (uniq'd at construction). Exposed as `ids()` to match
   * Rails' `attr_reader :ids` which shadows `Relation#ids` here. */
  private readonly _storedIds: unknown[];
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

  constructor(
    klass: typeof Base,
    key: string,
    ids: unknown[],
    chainWalker?: () => Promise<{ relation: Relation<T> }>,
  ) {
    super(klass);
    this.key = key;
    this._storedIds = Array.from(new Set(ids));
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
   * additively here. `_isNone` (used by `.none()`) is copied
   * explicitly since `Relation#merge` doesn't propagate it today.
   */
  private _composeChainedState(walkerResult: Relation<T>): Relation<T> {
    type ComposeFields = {
      _orderClauses?: unknown[];
      _rawOrderClauses?: unknown[];
      _selectColumns?: unknown[];
      _isNone?: boolean;
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

    if (overlay._isNone) target._isNone = true;
    return merged;
  }

  override async ids(): Promise<unknown[]> {
    if (this._chainWalker) {
      // Deferred mode — delegate to the composed walker result's
      // ids(), which can pluck instead of materializing full records.
      // Routes through the shared `_walkOnce()` so the chain walk
      // (including intermediate plucks) runs at most once per DJAR
      // instance, even if a caller invokes ids() and then toArray()
      // (or ids() multiple times).
      const { relation } = await this._walkOnce();
      const merged = this._composeChainedState(relation);
      return (merged as unknown as { ids: () => Promise<unknown[]> }).ids();
    }
    return this._storedIds;
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
    return new DisableJoinsAssociationRelation<T>(
      this.model,
      this.key,
      this._storedIds,
      this._chainWalker,
    ) as unknown as Relation<T>;
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
    for (const r of records) {
      const k = r.readAttribute(this.key);
      const bucket = byKey.get(k);
      if (bucket) bucket.push(r);
      else byKey.set(k, [r]);
    }
    const ordered: T[] = [];
    for (const id of this._storedIds) {
      const bucket = byKey.get(id);
      if (bucket) ordered.push(...bucket);
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
