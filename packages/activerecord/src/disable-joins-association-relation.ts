import { Relation } from "./relation.js";
import type { Base } from "./base.js";

/**
 * Specialized Relation returned by DisableJoinsAssociationScope when the
 * source scope has no explicit ORDER but an upstream chain entry was
 * ordered. Rails uses this to:
 *
 *   - preserve the through-IDs order when IN(...) is used on the final
 *     query (SQL IN doesn't preserve list order, but Rails' ORM contract
 *     for an ordered `through` association expects the records back in
 *     the join-table order),
 *   - and short-circuit `limit` / `first` so they slice the loaded
 *     in-memory array rather than appending SQL LIMIT (which would
 *     interact badly with IN-list reordering).
 *
 * Mirrors: ActiveRecord::DisableJoinsAssociationRelation
 * (activerecord/lib/active_record/disable_joins_association_relation.rb).
 */
export class DisableJoinsAssociationRelation<T extends Base> extends Relation<T> {
  readonly key: string;
  /** Stored IDs (uniq'd at construction). Exposed as `ids()` to match
   * Rails' `attr_reader :ids` which shadows `Relation#ids` here. */
  private readonly _storedIds: unknown[];

  constructor(klass: typeof Base, key: string, ids: unknown[]) {
    super(klass);
    this.key = key;
    this._storedIds = Array.from(new Set(ids));
  }

  override async ids(): Promise<unknown[]> {
    return this._storedIds;
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
    ) as unknown as Relation<T>;
  }

  /**
   * Load via Relation, then group by `key` and re-emit in `ids` order so
   * the caller sees join-table ordering (Rails' `load` override).
   */
  override async toArray(): Promise<T[]> {
    const records = await super.toArray();
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
    return ordered;
  }

  /**
   * Rails: `def limit(value); records.take(value); end` — load everything
   * then slice in memory. Returns an array, breaking the Relation chain
   * (matching Rails' deliberate deviation here).
   */
  // @ts-expect-error — deliberate Rails-fidelity deviation: returns Array, not Relation
  override async limit(value: number): Promise<T[]> {
    const records = await this.toArray();
    return records.slice(0, value);
  }

  /**
   * Rails: load everything then take the first (or first n) in memory,
   * for the same reason as `limit` above.
   */
  // @ts-expect-error — deliberate Rails-fidelity deviation: async, not sync
  override async first(limit?: number): Promise<T | T[] | null> {
    const records = await this.toArray();
    if (limit === undefined) return records[0] ?? null;
    return records.slice(0, limit);
  }
}
