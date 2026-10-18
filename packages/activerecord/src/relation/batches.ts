import { ArgumentError } from "@blazetrails/activemodel";
import { defineModule, eachSlice, kernelArray as Array, pluck } from "@blazetrails/activesupport";
import { cmp, isEmpty, rbCmpint, rbInspect, rtest, slice } from "@blazetrails/ruby-compat";
import { stripThenable } from "@blazetrails/activesupport";
import { BatchEnumerator } from "./batches/batch-enumerator.js";
import type { Base } from "../base.js";
import type { FindEachOptions, InBatchesOptions, LoadedRelation, Relation } from "../relation.js";
import { errorOnIgnoredOrder } from "../active-record.js";

export const ORDER_IGNORE_MESSAGE =
  "Scoped order is ignored, use :cursor with :order to configure custom order.";
export const DEFAULT_ORDER = ":asc" as const;

export function findEach<T extends Base>(
  this: any,
  opts: FindEachOptions,
  block: (record: T) => void | Promise<void>,
): Promise<null>;
export function findEach<T extends Base>(
  this: any,
  opts?: FindEachOptions,
): AsyncGenerator<T> & { size(): Promise<number> };
/** @inventedArm loop — PERMANENT */
export function findEach<T extends Base>(
  this: any,
  {
    start,
    finish,
    batchSize = 1000,
    errorOnIgnore,
    cursor = this.primaryKey,
    order = DEFAULT_ORDER,
  }: FindEachOptions = {},
  block?: (record: T) => void | Promise<void>,
): (AsyncGenerator<T> & { size(): Promise<number> }) | Promise<null> {
  if (block) {
    return this.findInBatches(
      { start, finish, batchSize, errorOnIgnore, cursor, order },
      async (records: T[]) => {
        for (const record of records) await block(record);
      },
    );
  } else {
    const relation = this;
    const enumerator = (async function* () {
      for await (const records of relation.findInBatches({
        start,
        finish,
        batchSize,
        errorOnIgnore,
        cursor,
        order,
      })) {
        yield* records as T[];
      }
    })() as AsyncGenerator<T> & { size(): Promise<number> };
    enumerator.size = async (): Promise<number> => {
      cursor = Array(cursor);
      return applyLimits
        .call(this, relation, cursor, start, finish, buildBatchOrders.call(this, cursor, order))
        .size();
    };
    return enumerator;
  }
}

export function findInBatches<T extends Base>(
  this: any,
  opts: FindEachOptions,
  block: (batch: T[]) => void | Promise<void>,
): Promise<null>;
export function findInBatches<T extends Base>(
  this: any,
  opts?: FindEachOptions,
): AsyncGenerator<T[]> & { size(): Promise<number> };
/** @inventedArm loop — PERMANENT */
export function findInBatches<T extends Base>(
  this: any,
  {
    start,
    finish,
    batchSize = 1000,
    errorOnIgnore,
    cursor = this.primaryKey,
    order = DEFAULT_ORDER,
  }: FindEachOptions = {},
  block?: (batch: T[]) => void | Promise<void>,
): (AsyncGenerator<T[]> & { size(): Promise<number> }) | Promise<null> {
  const relation = this;
  if (!block) {
    const size = async (): Promise<number> => {
      cursor = Array(cursor);
      const total = await applyLimits
        .call(this, relation, cursor, start, finish, buildBatchOrders.call(this, cursor, order))
        .size();
      return Math.floor((total - 1) / batchSize) + 1;
    };
    const enumerator = (async function* () {
      for await (const batch of relation
        .inBatches({ of: batchSize, start, finish, load: true, errorOnIgnore, cursor, order })
        ._generator()) {
        yield (await batch.toArray()) as T[];
      }
    })() as AsyncGenerator<T[]> & { size(): Promise<number> };
    enumerator.size = size;
    return enumerator;
  }

  return relation.inBatches(
    { of: batchSize, start, finish, load: true, errorOnIgnore, cursor, order },
    async (batch: LoadedRelation<Relation<T>>) => {
      await block(await batch.toArray());
    },
  );
}

export function inBatches<T extends Base>(
  this: any,
  opts: InBatchesOptions,
  block: (relation: LoadedRelation<Relation<T>>) => void | Promise<void>,
): Promise<null>;
export function inBatches<T extends Base>(
  this: any,
  opts?: InBatchesOptions,
): BatchEnumerator<LoadedRelation<Relation<T>>>;
/**
 * @inventedArm loop — PERMANENT
 * @inventedArm indexes — CONVERGEABLE in-batches-unique-index-check-skips-on-a-cold-index-cache
 */
export function inBatches<T extends Base>(
  this: any,
  {
    of = 1000,
    start,
    finish,
    order = DEFAULT_ORDER,
    cursor: cursorOption,
    errorOnIgnore,
    load = false,
    useRanges,
  }: InBatchesOptions = {},
  block?: (relation: LoadedRelation<Relation<T>>) => void | Promise<void>,
): BatchEnumerator<LoadedRelation<Relation<T>>> | Promise<null> {
  const self = this;
  const cursor = Array(cursorOption ?? this.primaryKey).map(String);
  ensureValidOptionsForBatchingBang.call(this, cursor, start, finish, order);

  if (this.arel().orders.length > 0) {
    actOnIgnoredOrder.call(this, errorOnIgnore);
  }

  const run = async (block: (relation: any) => unknown): Promise<null> => {
    await self.model.schemaCache().indexes(self.tableName);
    ensureValidOptionsForBatchingBang.call(self, cursor, start, finish, order);

    let batchLimit = of;
    let remaining: number | null = null;

    if (self.limitValue !== null) {
      remaining = self.limitValue as number;
      if (rbCmpint(cmp(remaining, batchLimit), remaining, batchLimit) < 0) batchLimit = remaining;
    }

    if (self.loaded) {
      return batchOnLoadedRelation.call(
        this,
        {
          relation: self,
          start,
          finish,
          cursor,
          order,
          batchLimit,
        },
        block,
      );
    } else {
      return batchOnUnloadedRelation.call(
        self,
        {
          relation: self,
          start,
          finish,
          load,
          cursor,
          order,
          useRanges,
          remaining,
          batchLimit,
        },
        block,
      );
    }
  };

  const generator = async function* (): AsyncGenerator<LoadedRelation<Relation<T>>> {
    type Batch = { relation: any; resume: () => void; stop: (reason: unknown) => void };
    const stopped = {};
    const state: { pending: Batch | null; finished: boolean; failure: unknown[] } = {
      pending: null,
      finished: false,
      failure: [],
    };
    let wake = (): void => {};
    let batch: Batch | null = null;
    void run(
      (relation) =>
        new Promise<void>((resume, stop) => {
          state.pending = { relation, resume, stop };
          wake();
        }),
    )
      .catch((error: unknown) => {
        if (error !== stopped) state.failure.push(error);
      })
      .then(() => {
        state.finished = true;
        wake();
      });
    try {
      while (true) {
        if (!state.pending && !state.finished) {
          await new Promise<void>((resolve) => (wake = resolve));
        }
        batch = state.pending;
        if (!batch) break;
        state.pending = null;
        yield batch.relation;
        batch.resume();
        batch = null;
      }
    } finally {
      batch?.stop(stopped);
    }
    if (state.failure.length > 0) throw state.failure[0];
  };

  if (!block) {
    const enumerator = new BatchEnumerator<LoadedRelation<Relation<T>>>({
      of,
      start,
      finish,
      relation: self,
      cursor,
      order,
      useRanges,
    });
    enumerator._generator = generator;
    return enumerator;
  }

  return run(block);
}

/** @internal */
export const BatchesPublicInstanceMethods = {
  findEach,
  findInBatches,
  inBatches,
} as const;

/** @internal */
export const BatchesPrivateInstanceMethods = {
  ensureValidOptionsForBatchingBang,
  applyLimits,
  applyStartLimit,
  applyFinishLimit,
  batchCondition,
  buildBatchOrders,
  actOnIgnoredOrder,
  batchOnLoadedRelation,
  recordCursorValues,
  compareValuesForOrder,
  batchOnUnloadedRelation,
} as const;

export const Batches = defineModule(
  BatchesPublicInstanceMethods,
  undefined,
  BatchesPrivateInstanceMethods,
);

/**
 * @internal
 * @missingRailsCall indexes — CONVERGEABLE in-batches-unique-index-check-skips-on-a-cold-index-cache
 * @inventedArm if — CONVERGEABLE in-batches-unique-index-check-skips-on-a-cold-index-cache
 */
export function ensureValidOptionsForBatchingBang(
  this: any,
  cursor: string[],
  start: unknown,
  finish: unknown,
  order: ":asc" | ":desc" | (":asc" | ":desc")[],
): void {
  if (rtest(start) && Array(start).length !== cursor.length) {
    throw new ArgumentError(":start must contain one value per cursor column");
  }

  if (rtest(finish) && Array(finish).length !== cursor.length) {
    throw new ArgumentError(":finish must contain one value per cursor column");
  }

  if (Array<string>(this.primaryKey).some((key) => !cursor.includes(key))) {
    const indexes = this.model.schemaCache().getCachedIndexes(this.tableName) as
      | { unique: boolean; where?: string | null; columns: string[] }[]
      | undefined;
    if (indexes !== undefined) {
      const uniqueIndex = indexes.find(
        (index) =>
          index.unique &&
          !index.where &&
          isEmpty(Array(index.columns).filter((c) => !cursor.includes(c))),
      );

      if (!uniqueIndex) {
        throw new ArgumentError(":cursor must include a primary key or other unique column(s)");
      }
    }
  }

  if (Array(order).filter((o) => ![":asc", ":desc"].includes(o)).length > 0) {
    throw new ArgumentError(
      `:order must be :asc or :desc or an array consisting of :asc or :desc, got ${rbInspect(order)}`,
    );
  }
}

/** @internal */
export function applyLimits(
  this: any,
  relation: any,
  cursor: string[],
  start: unknown,
  finish: unknown,
  batchOrders: [string, ":asc" | ":desc"][],
): any {
  if (start !== undefined && start !== null) {
    relation = applyStartLimit.call(this, relation, cursor, start, batchOrders);
  }
  if (finish !== undefined && finish !== null) {
    relation = applyFinishLimit.call(this, relation, cursor, finish, batchOrders);
  }
  return relation;
}

/** @internal */
export function applyStartLimit(
  this: any,
  relation: any,
  cursor: string[],
  start: unknown,
  batchOrders: [string, ":asc" | ":desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === ":desc" ? "lteq" : "gteq"));
  return batchCondition.call(this, relation, cursor, start, operators);
}

/** @internal */
export function applyFinishLimit(
  this: any,
  relation: any,
  cursor: string[],
  finish: unknown,
  batchOrders: [string, ":asc" | ":desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === ":desc" ? "gteq" : "lteq"));
  return batchCondition.call(this, relation, cursor, finish, operators);
}

/** @internal */
export function batchCondition(
  this: any,
  relation: any,
  cursor: string[],
  values: unknown,
  operators: string[],
): any {
  const predicateBuilder = relation.predicateBuilder;
  const cursorPositions = cursor.map((column, i) => [column, Array(values)[i], operators[i]]);

  const [firstClauseColumn, firstClauseValue, operator] = cursorPositions.pop()!;
  let whereClause: any = predicateBuilder.get(firstClauseColumn, firstClauseValue, operator);

  for (const [columnName, value, operator] of cursorPositions.reverse()) {
    whereClause = predicateBuilder
      .get(columnName, value, operator === "lteq" ? "lt" : "gt")
      .or(predicateBuilder.get(columnName, value, "eq").and(whereClause));
  }

  return relation.where(whereClause);
}

/** @internal */
export function buildBatchOrders(
  this: any,
  cursor: string[],
  order: ":asc" | ":desc" | (":asc" | ":desc")[],
): [string, ":asc" | ":desc"][] {
  return cursor.map((column, i) => [column, Array(order)[i] ?? DEFAULT_ORDER]);
}

/** @internal */
export function actOnIgnoredOrder(this: any, errorOnIgnore: boolean | undefined): void {
  const raise = errorOnIgnore !== undefined ? errorOnIgnore : errorOnIgnoredOrder();
  if (raise) {
    throw new ArgumentError(ORDER_IGNORE_MESSAGE);
  } else if (this.model.logger) {
    this.model.logger.warn(ORDER_IGNORE_MESSAGE);
  }
}

/** @internal */
export async function batchOnLoadedRelation(
  this: any,
  {
    relation,
    start,
    finish,
    cursor,
    order,
    batchLimit,
  }: {
    relation: any;
    start: unknown;
    finish: unknown;
    cursor: string[];
    order: ":asc" | ":desc" | (":asc" | ":desc")[];
    batchLimit: number;
  },
  block: (subrelation: any) => unknown,
): Promise<null> {
  let records: any[] = await relation.toArray();
  order = buildBatchOrders.call(this, cursor, order).map(([, second]) => second);

  if (rtest(start) || rtest(finish)) {
    records = records.filter((record) => {
      const values = recordCursorValues.call(this, record, cursor);

      return (
        (start == null || compareValuesForOrder.call(this, values, Array(start), order) >= 0) &&
        (finish == null || compareValuesForOrder.call(this, values, Array(finish), order) <= 0)
      );
    });
  }

  records.sort((record1, record2) => {
    const values1 = recordCursorValues.call(this, record1, cursor);
    const values2 = recordCursorValues.call(this, record2, cursor);
    return compareValuesForOrder.call(this, values1, values2, order);
  });

  for (const subrecords of eachSlice(records, batchLimit)) {
    const subrelation = relation.spawn();
    subrelation.loadRecords(subrecords);

    await block(stripThenable(subrelation));
  }

  return null;
}

/** @internal */
export function recordCursorValues(this: any, record: any, cursor: string[]): unknown[] {
  return Object.values(slice(record.attributes, ...cursor));
}

/** @internal */
export function compareValuesForOrder(
  this: any,
  values1: unknown[],
  values2: unknown[],
  order: (":asc" | ":desc")[],
): number {
  for (const [index, element1] of values1.entries()) {
    const element2 = values2[index];
    const direction = order[index];
    let comparison = cmp(element1, element2) as number;
    if (direction === ":desc") comparison = -comparison;
    if (comparison !== 0) return comparison;
  }

  return 0;
}

/** @internal */
export async function batchOnUnloadedRelation(
  this: any,
  opts: {
    relation: any;
    start: unknown;
    finish: unknown;
    load: boolean;
    cursor: string[];
    order: ":asc" | ":desc" | (":asc" | ":desc")[];
    useRanges: boolean | null | undefined;
    remaining: number | null;
    batchLimit: number;
  },
  block: (yieldedRelation: any) => unknown,
): Promise<null> {
  const { start, load, cursor, order, useRanges, batchLimit } = opts;
  let { relation, finish, remaining } = opts;
  const batchOrders = buildBatchOrders.call(this, cursor, order);
  relation = relation.reorder(Object.fromEntries(batchOrders)).limit(batchLimit);
  relation = applyLimits.call(this, relation, cursor, start, finish, batchOrders);
  relation.skipQueryCacheBang();
  let batchRelation = relation;
  const emptyScope = this.toSql() === this.model.unscoped().all().toSql();

  while (true) {
    let values: unknown[];
    let yieldedRelation: any;
    if (load) {
      const records = await batchRelation.records();
      values = pluck<any, any>(records, ...cursor);
      yieldedRelation = this.where(new Map([[cursor, values]]));
      yieldedRelation.loadRecords(records);
    } else if ((emptyScope && useRanges !== false) || useRanges) {
      values = await batchRelation.pluck(...cursor);

      finish = values[values.length - 1];
      if (rtest(finish)) {
        yieldedRelation = applyFinishLimit.call(this, batchRelation, cursor, finish, batchOrders);
        yieldedRelation = yieldedRelation.except("limit", "order");
        yieldedRelation.skipQueryCacheBang(false);
      }
    } else {
      values = await batchRelation.pluck(...cursor);
      yieldedRelation = this.where(new Map([[cursor, values]]));
    }

    if (values.length === 0) break;

    if (values.flat(Infinity).some((value) => value == null)) {
      throw new ArgumentError(
        "Not all of the batch cursor columns were included in the custom select clause " +
          "or some columns contain nil.",
      );
    }

    await block(stripThenable(yieldedRelation));

    if (values.length < batchLimit) break;

    if (this.limitValue != null) {
      remaining! -= values.length;

      if (remaining === 0) {
        break;
      } else if (remaining! < batchLimit) {
        relation = relation.limit(remaining);
      }
    }

    const batchOrdersCopy = [...batchOrders];
    const [, lastOrder] = batchOrdersCopy.pop()!;
    const operators: string[] = batchOrdersCopy.map(([, order]) =>
      order === ":desc" ? "lteq" : "gteq",
    );
    operators.push(lastOrder === ":desc" ? "lt" : "gt");

    const cursorValue = values[values.length - 1];
    batchRelation = batchCondition.call(this, relation, cursor, cursorValue, operators);
  }

  return null;
}
