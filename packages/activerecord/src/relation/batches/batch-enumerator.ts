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

interface BatchRelation {
  toArray(): Promise<any[]>;
  deleteAll(): Promise<number>;
  updateAll(updates: Record<string, unknown>): Promise<number>;
  destroyAll(): Promise<any[]>;
  touchAll?(...names: string[]): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BatchEnumerator<T extends BatchRelation> {
  private _generator: () => AsyncGenerator<T>;
  readonly ofSize: number;
  readonly start: unknown;
  readonly finish: unknown;
  readonly relation: any;
  readonly batchSize: number;

  constructor(
    generator: () => AsyncGenerator<T>,
    ofSize: number,
    options?: { start?: unknown; finish?: unknown; relation?: any },
  ) {
    if (!Number.isInteger(ofSize) || ofSize < 1) {
      throw new Error("Batch size must be a positive integer");
    }
    this._generator = generator;
    this.ofSize = ofSize;
    this.batchSize = ofSize;
    this.start = options?.start ?? null;
    this.finish = options?.finish ?? null;
    this.relation = options?.relation ?? null;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    yield* this._generator();
  }

  eachBatch(): AsyncGenerator<T>;
  eachBatch(fn: (batch: T) => void | Promise<void>): Promise<void>;
  eachBatch(fn?: (batch: T) => void | Promise<void>): AsyncGenerator<T> | Promise<void> {
    if (!fn) {
      return this._generator();
    }
    return (async () => {
      for await (const batch of this) {
        await fn(batch);
      }
    })();
  }

  eachRecord(): AsyncGenerator<any>;
  eachRecord(fn: (record: any) => void | Promise<void>): Promise<void>;
  eachRecord(fn?: (record: any) => void | Promise<void>): AsyncGenerator<any> | Promise<void> {
    const self = this;
    if (!fn) {
      return (async function* () {
        for await (const batchRelation of self) {
          const records = await batchRelation.toArray();
          for (const record of records) {
            yield record;
          }
        }
      })();
    }
    return (async () => {
      for await (const batchRelation of self) {
        const records = await batchRelation.toArray();
        for (const record of records) {
          await fn(record);
        }
      }
    })();
  }

  async deleteAll(): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.deleteAll();
    }
    return total;
  }

  async updateAll(updates: Record<string, unknown>): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      total += await batchRelation.updateAll(updates);
    }
    return total;
  }

  async destroyAll(): Promise<any[]> {
    const destroyed: any[] = [];
    for await (const batchRelation of this) {
      const records = await batchRelation.destroyAll();
      destroyed.push(...records);
    }
    return destroyed;
  }

  async touchAll(...names: string[]): Promise<number> {
    let total = 0;
    for await (const batchRelation of this) {
      if (typeof batchRelation.touchAll === "function") {
        total += await batchRelation.touchAll(...names);
      }
    }
    return total;
  }

  each(): AsyncGenerator<T>;
  each(fn: (batch: T) => void | Promise<void>): Promise<void>;
  each(fn?: (batch: T) => void | Promise<void>): AsyncGenerator<T> | Promise<void> {
    return this.eachBatch(fn as any);
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
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

applyThenable(BatchEnumerator.prototype);
