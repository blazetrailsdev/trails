import { AsyncEnumerable, aryCount, include } from "@blazetrails/ruby-compat";
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

  deleteAll(): Promise<number> {
    return this.sum((relation) => relation.deleteAll());
  }

  updateAll(updates: Record<string, unknown>): Promise<number> {
    return this.sum((relation) => {
      return relation.updateAll(updates);
    });
  }

  touchAll(...args: TouchAllArgs): Promise<number> {
    return this.sum((relation) => {
      return relation.touchAll(...args);
    });
  }

  destroyAll(): Promise<number> {
    return this.sum(async (relation) => {
      return aryCount(await relation.destroyAll(), (r) => r.isDestroyed());
    });
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
}

export interface BatchEnumerator<T extends BatchRelation> {
  sum(block: (relation: T) => number | Promise<number>): Promise<number>;
  toA(): Promise<T[]>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

include(BatchEnumerator, AsyncEnumerable);
