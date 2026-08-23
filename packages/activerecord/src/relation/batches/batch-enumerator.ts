/**
 * BatchEnumerator — wraps in_batches to provide batch-level operations.
 *
 * Returned by Relation#inBatches(). Each yielded item is a scoped
 * Relation for that batch, enabling operations like deleteAll/updateAll
 * per batch without loading records.
 *
 * Mirrors: ActiveRecord::Batches::BatchEnumerator
 */

import { applyThenable } from "../thenable.js";
import type { TouchAllArgs } from "../../timestamp.js";

interface BatchRelation {
  toArray(): Promise<any[]>;
  deleteAll(): Promise<number>;
  updateAll(updates: Record<string, unknown>): Promise<number>;
  destroyAll(): Promise<any[]>;
  touchAll?(...args: TouchAllArgs): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BatchEnumerator<T extends BatchRelation> {
  private _of: number;
  readonly start: unknown;
  readonly finish: unknown;
  readonly relation: any;
  private _cursor: string[];
  private _order: "asc" | "desc" | ("asc" | "desc")[];
  private _useRanges: boolean | null;
  /**
   * @internal The async generator that drives this enumerator's batches.
   * Ruby re-derives them with `@relation.to_enum(:in_batches, ...)`, which
   * calls `in_batches` with a block; TS has no block-to-enumerator protocol,
   * so `Relation#inBatches` builds the generator and stows it here. Every
   * re-enumeration below goes through `relation.inBatches(...)` exactly as
   * Rails does, and reads the fresh generator off the enumerator it returns.
   */
  _generator!: () => AsyncGenerator<T>;

  constructor({
    of = 1000,
    start = null,
    finish = null,
    relation,
    cursor,
    order = "asc",
    useRanges = null,
  }: {
    of?: number;
    start?: unknown;
    finish?: unknown;
    relation: any;
    cursor: string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    useRanges?: boolean | null;
  }) {
    this._of = of;
    this.relation = relation;
    this.start = start;
    this.finish = finish;
    this._cursor = cursor;
    this._order = order;
    this._useRanges = useRanges;
  }

  get batchSize(): number {
    return this._of;
  }

  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/batches/batch_enumerator.rb:6, :108` —
   *   `include Enumerable` plus a synchronous `def each`).
   * JS async-iteration protocol — Ruby's Enumerable#each is synchronous
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    yield* this.each();
  }

  eachRecord(): AsyncGenerator<any>;
  eachRecord(fn: (record: any) => void | Promise<void>): Promise<void>;
  eachRecord(fn?: (record: any) => void | Promise<void>): AsyncGenerator<any> | Promise<void> {
    const self = this;
    const records = async function* (): AsyncGenerator<any> {
      const enumerator = self.relation.inBatches({
        of: self._of,
        start: self.start,
        finish: self.finish,
        load: true,
        cursor: self._cursor,
        order: self._order,
      });
      for await (const relation of enumerator._generator()) {
        yield* await relation.toArray();
      }
    };
    if (!fn) return records();
    return (async () => {
      for await (const record of records()) {
        await fn(record);
      }
    })();
  }

  /**
   * @missingRailsCall sum — PERMANENT. Verified per-site (RFC 0106): `sum(&:delete_all)`
   *   (batch_enumerator.rb:66) — Enumerable#sum over the enumerator `include
   *   Enumerable` supplies. trails' batches are an async iterator with no
   *   Enumerable mixin, so the identical accumulation is the `for await` running
   *   total (batch-enumerator.ts:106-112); adding a `sum` helper would be
   *   surface Rails gets from a core module.
   */
  async deleteAll(): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.deleteAll();
    }
    return total;
  }

  /**
   * @missingRailsCall sum — PERMANENT. Verified per-site (RFC 0106): `sum { |relation|
   *   relation.update_all(updates) }` (batch_enumerator.rb:74-76) — same
   *   Enumerable#sum-over-an-async-iterator case as the `delete_all` row.
   */
  async updateAll(updates: Record<string, unknown>): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.updateAll(updates);
    }
    return total;
  }

  /**
   * @missingRailsCall sum — PERMANENT. Verified per-site (RFC 0106): `sum { |relation|
   *   relation.touch_all(...) }` (batch_enumerator.rb:84-86) — same
   *   Enumerable#sum-over-an-async-iterator case as the `delete_all` row.
   */
  async touchAll(...args: TouchAllArgs): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      if (typeof batchRelation.touchAll === "function") {
        total += await batchRelation.touchAll(...args);
      }
    }
    return total;
  }

  /**
   * @missingRailsCall count — PERMANENT. Verified per-site (RFC 0106):
   *   `relation.destroy_all.count(&:destroyed?)` (batch_enumerator.rb:97) —
   *   Enumerable#count WITH A BLOCK over the destroyed records Array, spelled
   *   `.filter(...).length` in TS (batch-enumerator.ts:135-136). The homonymous
   *   `Relation#count` is a different method and is not what this line calls.
   * @missingRailsCall sum — PERMANENT. Verified per-site (RFC 0106): `sum { |relation| ...
   *   }` (batch_enumerator.rb:96-98) — same
   *   Enumerable#sum-over-an-async-iterator case as the `delete_all` row.
   */
  async destroyAll(): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      const records = await batchRelation.destroyAll();
      total += records.filter((r) => r.isDestroyed?.()).length;
    }
    return total;
  }

  each(): AsyncGenerator<T>;
  each(fn: (batch: T) => void | Promise<void>): Promise<void>;
  each(fn?: (batch: T) => void | Promise<void>): AsyncGenerator<T> | Promise<void> {
    const enumerator = this.relation.inBatches({
      of: this._of,
      start: this.start,
      finish: this.finish,
      load: false,
      cursor: this._cursor,
      order: this._order,
      useRanges: this._useRanges,
    });
    if (!fn) return enumerator._generator();
    return (async () => {
      for await (const batch of enumerator._generator()) {
        await fn(batch);
      }
    })();
  }

  eachBatch(): AsyncGenerator<T>;
  eachBatch(fn: (batch: T) => void | Promise<void>): Promise<void>;
  eachBatch(fn?: (batch: T) => void | Promise<void>): AsyncGenerator<T> | Promise<void> {
    return this.each(fn as any);
  }

  async toArray(): Promise<T[]> {
    const batches: T[] = [];
    for await (const batch of this) {
      batches.push(batch);
    }
    return batches;
  }
}

export interface BatchEnumerator<T extends BatchRelation> {
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/batches/batch_enumerator.rb:108` —
   *   `def each` is synchronous; Ruby has no thenable to mirror).
   * JS Promise protocol — Ruby has no thenable
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/relation/batches/batch_enumerator.rb:108` —
   *   `def each` is synchronous; Ruby has no thenable to mirror).
   * JS Promise protocol — Ruby has no thenable
   */
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

applyThenable(BatchEnumerator.prototype);
