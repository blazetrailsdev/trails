/**
 * Batch processing methods: findEach, findInBatches, inBatches.
 *
 * Mirrors: ActiveRecord::Batches
 */
export class Batches {
  static readonly ORDER_IGNORE_MESSAGE =
    "Scoped order is ignored, use :cursor with :order to configure custom order." as const;

  static readonly DEFAULT_BATCH_SIZE = 1000;
}

/** @internal */
export function ensureValidOptionsForBatchingBang(
  cursor: string | string[],
  start: unknown,
  finish: unknown,
  order: "asc" | "desc" | ("asc" | "desc")[],
): void {
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
  let clause: any = (table.get(firstCol) as any)[firstOp](firstVal);

  for (let i = positions.length - 2; i >= 0; i--) {
    const [col, val, op] = positions[i];
    const attr = table.get(col) as any;
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
  const raise =
    errorOnIgnore !== undefined ? errorOnIgnore : activeRecordConfig.errorOnIgnoredOrder;
  if (raise) {
    throw new Error(Batches.ORDER_IGNORE_MESSAGE);
  }
}

export const activeRecordConfig = {
  errorOnIgnoredOrder: false,
};

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
  let records: any[] = Array.isArray((relation as any)._records) ? (relation as any)._records : [];
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
}): AsyncGenerator<any[]> {
  const { relation, cursor } = opts;
  let { batchLimit } = opts;
  let remaining: number | null | undefined = opts.remaining;
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  // Apply start/finish limits once on the base relation; advance cursor per
  // iteration — matching Rails' batch_condition(relation, ...) pattern where
  // `relation` is always the original scoped relation, not the previous batch.
  let baseRelation = applyLimits(relation, cursor, opts.start, opts.finish, batchOrders).limit(
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
    yield rows;
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
