import { aryCount } from "@blazetrails/ruby-compat";
import { applyThenable } from "../thenable.js";
import type { TouchAllArgs } from "../../timestamp.js";

interface BatchRelation {
  toArray(): Promise<any[]>;
  deleteAll(): Promise<number>;
  updateAll(updates: Record<string, unknown>): Promise<number>;
  destroyAll(): Promise<any[]>;
  touchAll(...args: TouchAllArgs): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BatchEnumerator<T extends BatchRelation> {
  private _of: number;
  readonly start: unknown;
  readonly finish: unknown;
  readonly relation: any;
  private _cursor: string[];
  private _order: ":asc" | ":desc" | (":asc" | ":desc")[];
  private _useRanges: boolean | null;
  /** @internal */
  _generator!: () => AsyncGenerator<T>;

  constructor({
    of = 1000,
    start = null,
    finish = null,
    relation,
    cursor,
    order = ":asc",
    useRanges = null,
  }: {
    of?: number;
    start?: unknown;
    finish?: unknown;
    relation: any;
    cursor: string[];
    order?: ":asc" | ":desc" | (":asc" | ":desc")[];
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

  /** @noRailsEquivalent CONVERGEABLE batch-enumerator-enumerable-over-an-async-each */
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
   * @missingRailsCall sum — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   * @inventedArm loop — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   */
  async deleteAll(): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.deleteAll();
    }
    return total;
  }

  /**
   * @missingRailsCall sum — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   * @inventedArm loop — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   */
  async updateAll(updates: Record<string, unknown>): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.updateAll(updates);
    }
    return total;
  }

  /**
   * @missingRailsCall sum — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   * @inventedArm loop — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   */
  async touchAll(...args: TouchAllArgs): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.touchAll(...args);
    }
    return total;
  }

  /**
   * @missingRailsCall sum — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   * @inventedArm loop — CONVERGEABLE batch-enumerator-enumerable-over-an-async-each
   */
  async destroyAll(): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += aryCount(await batchRelation.destroyAll(), (r) => r.isDestroyed());
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

  async toArray(): Promise<T[]> {
    const batches: T[] = [];
    for await (const batch of this) {
      batches.push(batch);
    }
    return batches;
  }
}

export interface BatchEnumerator<T extends BatchRelation> {
  /** @noRailsEquivalent CONVERGEABLE batch-enumerator-enumerable-over-an-async-each */
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /** @noRailsEquivalent CONVERGEABLE batch-enumerator-enumerable-over-an-async-each */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  /** @noRailsEquivalent CONVERGEABLE batch-enumerator-enumerable-over-an-async-each */
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

applyThenable(BatchEnumerator.prototype);
