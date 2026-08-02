/**
 * Batch processing methods: findEach, findInBatches, inBatches.
 *
 * Mirrors: ActiveRecord::Batches
 */
import { ActiveRecord } from "../ar-config.js";

export class Batches {
  static readonly ORDER_IGNORE_MESSAGE =
    "Scoped order is ignored, use :cursor with :order to configure custom order." as const;

  static readonly DEFAULT_BATCH_SIZE = 1000;
}

/** @internal */
export async function ensureValidOptionsForBatchingBang(
  relation: any,
  cursor: string | string[],
  start: unknown,
  finish: unknown,
  order: "asc" | "desc" | ("asc" | "desc")[],
): Promise<void> {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  if (start !== undefined && start !== null) {
    const startArr = Array.isArray(start) ? start : [start];
    if (startArr.length !== cursorArr.length) {
      throw new Error(":start must contain one value per cursor column");
    }
  }
  if (finish !== undefined && finish !== null) {
    const finishArr = Array.isArray(finish) ? finish : [finish];
    if (finishArr.length !== cursorArr.length) {
      throw new Error(":finish must contain one value per cursor column");
    }
  }

  // Rails batches.rb:316-324: when the cursor omits any primary-key column the
  // batch order is only stable if some other full, non-partial unique index
  // covers the cursor. `schema_cache.indexes` is async here, which is why the
  // whole check (and so this method) is a promise.
  const primaryKey = relation.primaryKey;
  // Ruby `Array(nil)` is `[]`, so a model with no primary key subtracts to an
  // empty set and skips the check entirely (batches.rb:314).
  const pkArr =
    primaryKey == null
      ? []
      : Array.isArray(primaryKey)
        ? primaryKey.filter((k) => k != null)
        : [primaryKey];
  if (pkArr.some((key) => !cursorArr.includes(key))) {
    const model = relation.model;
    const indexes = (await model.schemaCache().indexes(relation.tableName)) as Array<{
      unique: boolean;
      where?: string | null;
      columns: string[];
    }>;
    const uniqueIndex = indexes.find(
      (index) => index.unique && !index.where && index.columns.every((c) => cursorArr.includes(c)),
    );
    if (!uniqueIndex) {
      throw new Error(":cursor must include a primary key or other unique column(s)");
    }
  }

  const orderArr = Array.isArray(order) ? order : [order];
  for (const o of orderArr) {
    if (o !== "asc" && o !== "desc") {
      throw new Error(`:order must be :asc or :desc, got ${String(o)}`);
    }
  }
}

/** @internal */
export function applyLimits(
  relation: any,
  cursor: string | string[],
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
  cursor: string | string[],
  start: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "lteq" : "gteq"));
  return batchCondition(relation, cursor, start, operators);
}

/** @internal */
export function applyFinishLimit(
  relation: any,
  cursor: string | string[],
  finish: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "gteq" : "lteq"));
  return batchCondition(relation, cursor, finish, operators);
}

/** @internal */
export function batchCondition(
  relation: any,
  cursor: string | string[],
  values: unknown,
  operators: string[],
): any {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const valArr = Array.isArray(values) ? values : [values];
  const table = relation._modelClass.arelTable;

  // Build lexicographic WHERE matching Rails' cursor_positions.reverse_each logic:
  // Single column: col OP val
  // Multi-column: (col1 STRICT_OP val1) OR (col1 = val1 AND <rest>)
  // where STRICT_OP is the strict variant of OP (lteq→lt, gteq→gt).
  const positions = cursorArr.map((col, i) => [col, valArr[i], operators[i]] as const);
  const [firstCol, firstVal, firstOp] = positions[positions.length - 1];
  let clause: any = table.get(firstCol)[firstOp](firstVal);

  for (let i = positions.length - 2; i >= 0; i--) {
    const [col, val, op] = positions[i];
    const attr = table.get(col);
    const strictOp = op === "lteq" ? "lt" : op === "gteq" ? "gt" : op;
    clause = attr[strictOp](val).or(attr.eq(val).and(clause));
  }

  return relation.where(clause);
}

/** @internal */
export function buildBatchOrders(
  cursor: string | string[],
  order: "asc" | "desc" | ("asc" | "desc")[] | undefined,
): [string, "asc" | "desc"][] {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const orderArr = Array.isArray(order) ? order : Array(cursorArr.length).fill(order ?? "asc");
  return cursorArr.map((col, i) => [col, orderArr[i] ?? "asc"]);
}

/** @internal */
export function actOnIgnoredOrder(errorOnIgnore: boolean | undefined): void {
  const raise = errorOnIgnore !== undefined ? errorOnIgnore : ActiveRecord.errorOnIgnoredOrder;
  if (raise) {
    throw new Error(Batches.ORDER_IGNORE_MESSAGE);
  }
}

/** @internal */
export function batchOnLoadedRelation(opts: {
  relation: any;
  start: unknown;
  finish: unknown;
  cursor: string | string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  batchLimit: number;
}): any[] {
  const { relation, cursor, batchLimit } = opts;
  // relation.records() is async in this codebase; loaded records live on _records.
  let records: any[] = Array.isArray(relation._records) ? relation._records : [];
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  const orderDirs = batchOrders.map(([, dir]) => dir);

  if (opts.start != null || opts.finish != null) {
    const startArr =
      opts.start != null ? (Array.isArray(opts.start) ? opts.start : [opts.start]) : null;
    const finishArr =
      opts.finish != null ? (Array.isArray(opts.finish) ? opts.finish : [opts.finish]) : null;
    records = records.filter((record) => {
      const values = recordCursorValues(record, cursor);
      if (startArr != null && compareValuesForOrder(values, startArr, orderDirs) < 0) return false;
      if (finishArr != null && compareValuesForOrder(values, finishArr, orderDirs) > 0)
        return false;
      return true;
    });
  }

  const sorted = [...records].sort((a, b) => {
    const v1 = recordCursorValues(a, cursor);
    const v2 = recordCursorValues(b, cursor);
    return compareValuesForOrder(v1, v2, orderDirs);
  });
  const result: any[][] = [];
  for (let i = 0; i < sorted.length; i += batchLimit) {
    result.push(sorted.slice(i, i + batchLimit));
  }
  return result;
}

/** @internal */
export function recordCursorValues(record: any, cursor: string | string[]): unknown[] {
  const cols = Array.isArray(cursor) ? cursor : [cursor];
  return cols.map((c) => record.readAttribute?.(c) ?? record[c]);
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
  cursor: string | string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  batchLimit: number;
  load?: boolean;
  remaining?: number | null;
  useRanges?: boolean | null;
}): AsyncGenerator<{ rows: any[]; useRanges: boolean }> {
  const { relation, cursor } = opts;
  let { batchLimit } = opts;
  let remaining: number | null | undefined = opts.remaining;
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  const emptyScope = relation.toSql() === relation.model.unscoped().all().toSql();
  const useRanges = (emptyScope && opts.useRanges !== false) || opts.useRanges === true;
  const ordered = relation._clone();
  ordered._orderClauses = batchOrders.map(([col, dir]) => [col, dir] as [string, "asc" | "desc"]);
  // Apply start/finish limits once on the base relation; advance cursor per
  // iteration — matching Rails' batch_condition(relation, ...) pattern where
  // `relation` is always the original scoped relation, not the previous batch.
  let baseRelation = applyLimits(ordered, cursor, opts.start, opts.finish, batchOrders).limit(
    batchLimit,
  );
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  let lastValues: unknown[] | null = null;
  while (true) {
    const batchRelation =
      lastValues === null
        ? baseRelation
        : batchCondition(
            baseRelation,
            cursorArr,
            lastValues,
            batchOrders.map(([, ord]) => (ord === "desc" ? "lt" : "gt")),
          );
    const rows = await (opts.load ? batchRelation : batchRelation.select(...cursorArr)).toArray();
    if (rows.length === 0) break;
    yield { rows, useRanges };
    if (rows.length < batchLimit) break;
    if (remaining != null) {
      remaining -= rows.length;
      if (remaining === 0) break;
      if (remaining < batchLimit) {
        batchLimit = remaining;
        baseRelation = baseRelation.limit(batchLimit);
      }
    }
    lastValues = recordCursorValues(rows[rows.length - 1], cursor);
  }
}
