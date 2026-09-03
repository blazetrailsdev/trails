import { ArgumentError } from "@blazetrails/activemodel";
import { kernelArray as Array } from "@blazetrails/activesupport";
import { isEmpty } from "@blazetrails/ruby-compat";
import { WhereClause } from "./where-clause.js";
import { ActiveRecord } from "../ar-config.js";
import { stripThenable } from "./thenable.js";
import { BatchEnumerator } from "./batches/batch-enumerator.js";
import type { Base } from "../base.js";
import type { InBatchesOptions, LoadedRelation, Relation } from "../relation.js";

export class Batches {
  static readonly ORDER_IGNORE_MESSAGE =
    "Scoped order is ignored, use :cursor with :order to configure custom order." as const;

  findEach<T extends Base>(
    this: any,
    {
      batchSize = 1000,
      start,
      finish,
      order,
      cursor = this.primaryKey,
      errorOnIgnore,
    }: {
      batchSize?: number;
      start?: unknown;
      finish?: unknown;
      order?: "asc" | "desc" | ("asc" | "desc")[];
      cursor?: string | string[];
      errorOnIgnore?: boolean;
    } = {},
  ): AsyncGenerator<T> & { size(): Promise<number> } {
    const relation = this;
    const enumerator = (async function* () {
      for await (const batch of relation.findInBatches({
        batchSize,
        start,
        finish,
        order,
        cursor,
        errorOnIgnore,
      })) {
        for (const record of batch as T[]) {
          yield record;
        }
      }
    })() as AsyncGenerator<T> & { size(): Promise<number> };
    enumerator.size = async (): Promise<number> => {
      cursor = Array(cursor);
      return applyLimits(relation, cursor, start, finish, buildBatchOrders(cursor, order)).size();
    };
    return enumerator;
  }

  findInBatches<T extends Base>(
    this: any,
    {
      batchSize = 1000,
      start,
      finish,
      order,
      cursor = this.primaryKey,
      errorOnIgnore,
    }: {
      batchSize?: number;
      start?: unknown;
      finish?: unknown;
      order?: "asc" | "desc" | ("asc" | "desc")[];
      cursor?: string | string[];
      errorOnIgnore?: boolean;
    } = {},
  ): AsyncGenerator<T[]> & { size(): Promise<number> } {
    const relation = this;
    const size = async (): Promise<number> => {
      cursor = Array(cursor);
      const total = await applyLimits(
        relation,
        cursor,
        start,
        finish,
        buildBatchOrders(cursor, order),
      ).size();
      return Math.floor((total - 1) / batchSize) + 1;
    };
    const enumerator = (async function* () {
      const enumerator = relation.inBatches({
        of: batchSize,
        start,
        finish,
        load: true,
        errorOnIgnore,
        cursor,
        order,
      });
      for await (const batchRel of enumerator._generator()) {
        yield (batchRel._records ?? []) as T[];
      }
    })() as AsyncGenerator<T[]> & { size(): Promise<number> };
    enumerator.size = size;
    return enumerator;
  }

  inBatches<T extends Base>(
    this: any,
    opts: InBatchesOptions,
    block: (relation: LoadedRelation<Relation<T>>) => void | Promise<void>,
  ): Promise<void>;
  inBatches<T extends Base>(
    this: any,
    opts?: InBatchesOptions,
  ): BatchEnumerator<LoadedRelation<Relation<T>>>;
  inBatches<T extends Base>(
    this: any,
    {
      of = 1000,
      start,
      finish,
      order,
      cursor: cursorOption,
      errorOnIgnore,
      load = false,
      useRanges,
    }: InBatchesOptions = {},
    block?: (relation: LoadedRelation<Relation<T>>) => void | Promise<void>,
  ): BatchEnumerator<LoadedRelation<Relation<T>>> | Promise<void> {
    const self = this;
    const cursor = Array(cursorOption ?? this.primaryKey).map(String);
    const ensureValidOptions = () =>
      ensureValidOptionsForBatchingBang(self, cursor, start, finish, (order ?? "asc") as any);

    if (this.arel().orders.length > 0) {
      this.actOnIgnoredOrder(errorOnIgnore);
    }

    const batchOrders = buildBatchOrders(cursor, order as any);

    const enumerator = block
      ? null
      : new BatchEnumerator<LoadedRelation<Relation<T>>>({
          of,
          start,
          finish,
          relation: self,
          cursor,
          order,
          useRanges,
        });

    let remaining: number | null = null;
    let batchLimit = of;
    if (this.limitValue !== null) {
      const limitValue = this.limitValue;
      if (typeof limitValue !== "number") {
        throw new ArgumentError(`comparison of String with ${batchLimit} failed`);
      }
      remaining = limitValue;
      if (remaining < batchLimit) batchLimit = remaining;
    }

    let generator: () => AsyncGenerator<LoadedRelation<Relation<T>>>;
    if (remaining === 0) {
      generator = async function* () {};
    } else if (this.loaded) {
      generator = async function* () {
        await ensureValidOptions();
        const loadedBatches = await batchOnLoadedRelation({
          relation: self,
          start,
          finish,
          cursor,
          order: (order ?? "asc") as any,
          batchLimit,
        });
        for (const batchRows of loadedBatches) {
          const batchRel = self.clone();
          batchRel.orderValues = batchOrders.map(([col, dir]) =>
            dir === "desc" ? self.table.get(col).desc() : self.table.get(col).asc(),
          );
          batchRel._records = batchRows;
          batchRel._loaded = true;
          yield stripThenable(batchRel) as LoadedRelation<Relation<T>>;
        }
      };
    } else {
      generator = async function* () {
        await ensureValidOptions();
        for await (const { rows: batchRows, useRanges: batchUseRanges } of batchOnUnloadedRelation({
          relation: self,
          start,
          finish,
          cursor,
          order: (order ?? "asc") as any,
          batchLimit,
          load,
          remaining,
          useRanges,
        })) {
          const batchRel = self.clone();
          batchRel.orderValues = batchOrders.map(([col, dir]) =>
            dir === "desc" ? self.table.get(col).desc() : self.table.get(col).asc(),
          );
          const tuples = batchRows.map((r) => cursor.map((c) => r.readAttribute(c)));
          if (batchUseRanges && !load && cursor.length === 1 && tuples.length > 0) {
            const col = cursor[0];
            const dir = batchOrders[0][1];
            const first = tuples[0][0];
            const last = tuples[tuples.length - 1][0];
            const attr = self.table.get(col);
            const lo = dir === "desc" ? last : first;
            const hi = dir === "desc" ? first : last;
            batchRel.whereClause = batchRel.whereClause.plus(
              new WhereClause([attr.gteq(lo).and(attr.lteq(hi))]),
            );
          } else if (cursor.length === 1) {
            const ids = tuples.map((t: unknown[]) => t[0]);
            batchRel.whereClause = batchRel.whereClause.plus(
              new WhereClause([...self.predicateBuilder.buildFromHash({ [cursor[0]]: ids })]),
            );
          } else {
            batchRel.whereClause = batchRel.whereClause.plus(
              new WhereClause([...self.predicateBuilder.buildComposite(cursor, tuples)]),
            );
          }
          if (load) {
            batchRel._records = batchRows;
            batchRel._loaded = true;
          }
          yield stripThenable(batchRel);
        }
      } as () => AsyncGenerator<LoadedRelation<Relation<T>>>;
    }

    if (block) {
      return (async () => {
        for await (const batchRelation of generator()) {
          await block(batchRelation);
        }
      })();
    }

    enumerator!._generator = generator;
    return enumerator!;
  }

  /** @internal */
  actOnIgnoredOrder(this: any, errorOnIgnore: boolean | undefined): void {
    const raise = errorOnIgnore !== undefined ? errorOnIgnore : ActiveRecord.errorOnIgnoredOrder;
    if (raise) {
      throw new Error(Batches.ORDER_IGNORE_MESSAGE);
    } else if (this.model.logger) {
      this.model.logger.warn(Batches.ORDER_IGNORE_MESSAGE);
    }
  }
}

/**
 * @internal
 * @missingRailsCall size — PERMANENT
 */
export async function ensureValidOptionsForBatchingBang(
  relation: any,
  cursor: string[],
  start: unknown,
  finish: unknown,
  order: "asc" | "desc" | ("asc" | "desc")[],
): Promise<void> {
  if (start !== undefined && start !== null) {
    if (Array(start).length !== cursor.length) {
      throw new Error(":start must contain one value per cursor column");
    }
  }
  if (finish !== undefined && finish !== null) {
    if (Array(finish).length !== cursor.length) {
      throw new Error(":finish must contain one value per cursor column");
    }
  }

  if (Array<string>(relation.primaryKey).some((key) => !cursor.includes(key))) {
    const model = relation.model;
    const indexes = (await model.schemaCache().indexes(relation.tableName)) as {
      unique: boolean;
      where?: string | null;
      columns: string[];
    }[];
    const uniqueIndex = indexes.find(
      (index) =>
        index.unique &&
        !index.where &&
        isEmpty(Array(index.columns).filter((c) => !cursor.includes(c))),
    );
    if (!uniqueIndex) {
      throw new Error(":cursor must include a primary key or other unique column(s)");
    }
  }

  if (Array(order).filter((o) => !["asc", "desc"].includes(o)).length > 0) {
    const inspected = globalThis.Array.isArray(order)
      ? `[${order.map((o) => `:${o}`).join(", ")}]`
      : `:${order}`;
    throw new ArgumentError(
      `:order must be :asc or :desc or an array consisting of :asc or :desc, got ${inspected}`,
    );
  }
}

/** @internal */
export function applyLimits(
  relation: any,
  cursor: string[],
  start: unknown,
  finish: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  if (start !== undefined && start !== null) {
    relation = applyStartLimit(relation, cursor, start, batchOrders);
  }
  if (finish !== undefined && finish !== null) {
    relation = applyFinishLimit(relation, cursor, finish, batchOrders);
  }
  return relation;
}

/** @internal */
export function applyStartLimit(
  relation: any,
  cursor: string[],
  start: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "lteq" : "gteq"));
  return batchCondition(relation, cursor, start, operators);
}

/** @internal */
export function applyFinishLimit(
  relation: any,
  cursor: string[],
  finish: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "gteq" : "lteq"));
  return batchCondition(relation, cursor, finish, operators);
}

/** @internal */
export function batchCondition(
  relation: any,
  cursor: string[],
  values: unknown,
  operators: string[],
): any {
  const table = relation._model.arelTable;

  const cursorPositions = cursor.map(
    (column, i) => [column, Array(values)[i], operators[i]] as const,
  );
  const [firstCol, firstVal, firstOp] = cursorPositions[cursorPositions.length - 1];
  let whereClause: any = table.get(firstCol)[firstOp](firstVal);

  for (let i = cursorPositions.length - 2; i >= 0; i--) {
    const [col, val, op] = cursorPositions[i];
    const attr = table.get(col);
    const strictOp = op === "lteq" ? "lt" : op === "gteq" ? "gt" : op;
    whereClause = attr[strictOp](val).or(attr.eq(val).and(whereClause));
  }

  return relation.where(whereClause);
}

/** @internal */
export function buildBatchOrders(
  cursor: string[],
  order: "asc" | "desc" | ("asc" | "desc")[] | undefined,
): [string, "asc" | "desc"][] {
  return cursor.map((column, i) => [column, Array(order)[i] ?? "asc"]);
}

/** @internal */
export async function batchOnLoadedRelation(opts: {
  relation: any;
  start: unknown;
  finish: unknown;
  cursor: string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  batchLimit: number;
}): Promise<any[]> {
  const { relation, cursor, batchLimit } = opts;
  const loaded = await relation.records();
  let records: any[] = globalThis.Array.isArray(loaded) ? loaded : [];
  const order = buildBatchOrders(cursor, opts.order as any).map(([, second]) => second);

  if (opts.start != null || opts.finish != null) {
    records = records.filter((record) => {
      const values = recordCursorValues(record, cursor);
      return (
        (opts.start == null || compareValuesForOrder(values, Array(opts.start), order) >= 0) &&
        (opts.finish == null || compareValuesForOrder(values, Array(opts.finish), order) <= 0)
      );
    });
  }

  const sorted = [...records].sort((record1, record2) => {
    const values1 = recordCursorValues(record1, cursor);
    const values2 = recordCursorValues(record2, cursor);
    return compareValuesForOrder(values1, values2, order);
  });
  const result: any[][] = [];
  for (let i = 0; i < sorted.length; i += batchLimit) {
    result.push(sorted.slice(i, i + batchLimit));
  }
  return result;
}

/**
 * @internal
 * @missingRailsCall slice — PERMANENT
 */
export function recordCursorValues(record: any, cursor: string[]): unknown[] {
  const attributes = record.attributes;
  return cursor.filter((column) => column in attributes).map((column) => attributes[column]);
}

/** @internal */
export function compareValuesForOrder(
  values1: unknown[],
  values2: unknown[],
  order: ("asc" | "desc")[],
): number {
  for (let i = 0; i < values1.length; i++) {
    const a = values1[i] as any;
    const b = values2[i] as any;
    const dir = order[i] ?? "asc";
    if (a < b) return dir === "asc" ? -1 : 1;
    if (a > b) return dir === "asc" ? 1 : -1;
  }
  return 0;
}

/** @internal */
export async function* batchOnUnloadedRelation(opts: {
  relation: any;
  start: unknown;
  finish: unknown;
  cursor: string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  batchLimit: number;
  load?: boolean;
  remaining?: number | null;
  useRanges?: boolean | null;
}): AsyncGenerator<{ rows: any[]; useRanges: boolean }> {
  const { cursor } = opts;
  let { batchLimit } = opts;
  let remaining: number | null | undefined = opts.remaining;
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  let relation = opts.relation.reorder(Object.fromEntries(batchOrders)).limit(batchLimit);
  relation = applyLimits(relation, cursor, opts.start, opts.finish, batchOrders);
  const emptyScope = opts.relation.toSql() === opts.relation.model.unscoped().all().toSql();
  const useRanges = (emptyScope && opts.useRanges !== false) || opts.useRanges === true;
  let batchRelation = relation;
  while (true) {
    const rows = await (opts.load ? batchRelation : batchRelation.select(...cursor)).toArray();
    if (rows.length === 0) break;

    if (rows.some((record: any) => cursor.some((column) => record.attributes[column] == null))) {
      throw new ArgumentError(
        "Not all of the batch cursor columns were included in the custom select clause " +
          "or some columns contain nil.",
      );
    }

    yield { rows, useRanges };
    if (rows.length < batchLimit) break;
    if (remaining != null) {
      remaining -= rows.length;
      if (remaining === 0) break;
      if (remaining < batchLimit) {
        batchLimit = remaining;
        relation = relation.limit(batchLimit);
      }
    }
    const batchOrdersCopy = [...batchOrders];
    const [, lastOrder] = batchOrdersCopy.pop() as [string, "asc" | "desc"];
    const operators: string[] = batchOrdersCopy.map(([, order]) =>
      order === "desc" ? "lteq" : "gteq",
    );
    operators.push(lastOrder === "desc" ? "lt" : "gt");

    const cursorValue = recordCursorValues(rows[rows.length - 1], cursor);
    batchRelation = batchCondition(relation, cursor, cursorValue, operators);
  }
}
