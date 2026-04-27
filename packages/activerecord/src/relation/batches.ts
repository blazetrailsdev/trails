import { Nodes } from "@blazetrails/arel";

/**
 * Batch processing methods: findEach, findInBatches, inBatches.
 *
 * Mirrors: ActiveRecord::Batches
 */
export class Batches {
  static readonly ORDER_IGNORE_MESSAGE =
    "Scoped order is ignored, it's forced to be batch order." as const;

  static readonly DEFAULT_BATCH_SIZE = 1000;
}

function ensureValidOptionsForBatchingBang(
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

function applyLimits(
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

function applyStartLimit(
  relation: any,
  cursor: string | string[],
  start: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "lteq" : "gteq"));
  return batchCondition(relation, cursor, start, operators);
}

function applyFinishLimit(
  relation: any,
  cursor: string | string[],
  finish: unknown,
  batchOrders: [string, "asc" | "desc"][],
): any {
  const operators = batchOrders.map(([, order]) => (order === "desc" ? "gteq" : "lteq"));
  return batchCondition(relation, cursor, finish, operators);
}

function batchCondition(
  relation: any,
  cursor: string | string[],
  values: unknown,
  operators: string[],
): any {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const valArr = Array.isArray(values) ? values : [values];
  const table = relation._modelClass.arelTable;
  const conditions = cursorArr.map((col, i) => {
    const attr = table.get(col);
    const val = valArr[i];
    const op = operators[i];
    return (attr as any)[op](val);
  });
  if (conditions.length === 1) return relation.where(conditions[0]);
  return relation.where(new Nodes.Grouping(new Nodes.And(conditions)));
}

function buildBatchOrders(
  cursor: string | string[],
  order: "asc" | "desc" | ("asc" | "desc")[] | undefined,
): [string, "asc" | "desc"][] {
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const orderArr = Array.isArray(order) ? order : Array(cursorArr.length).fill(order ?? "asc");
  return cursorArr.map((col, i) => [col, orderArr[i] ?? "asc"]);
}

function actOnIgnoredOrder(errorOnIgnore: boolean | undefined): void {
  if (errorOnIgnore) {
    throw new Error(Batches.ORDER_IGNORE_MESSAGE);
  }
}

function batchOnLoadedRelation(opts: {
  relation: any;
  start: unknown;
  finish: unknown;
  cursor: string | string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  batchLimit: number;
}): any[] {
  const { relation, cursor, batchLimit } = opts;
  // relation.records() is async in this codebase; loaded records live on _records.
  const records: any[] = Array.isArray((relation as any)._records)
    ? (relation as any)._records
    : [];
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  const orderDirs = batchOrders.map(([, dir]) => dir);
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

function recordCursorValues(record: any, cursor: string | string[]): unknown[] {
  const cols = Array.isArray(cursor) ? cursor : [cursor];
  return cols.map((c) => record.readAttribute?.(c) ?? record[c]);
}

function compareValuesForOrder(
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

async function batchOnUnloadedRelation(opts: {
  relation: any;
  start: unknown;
  finish: unknown;
  load: boolean;
  cursor: string | string[];
  order: "asc" | "desc" | ("asc" | "desc")[];
  useRanges: boolean | undefined;
  remaining: number;
  batchLimit: number;
}): Promise<any[]> {
  const { relation, cursor, batchLimit } = opts;
  const batchOrders = buildBatchOrders(cursor, opts.order as any);
  // Base relation: apply start/finish limits once. Per iteration, derive from this
  // base plus only the single cursor-advance condition — matching Rails' approach
  // of calling batch_condition(relation, ...) where `relation` is the original
  // scoped relation, not the previous iteration's batch_relation.
  const baseRelation = applyLimits(relation, cursor, opts.start, opts.finish, batchOrders).limit(
    batchLimit,
  );
  const cursorArr = Array.isArray(cursor) ? cursor : [cursor];
  const results: any[] = [];
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
    const rows = await batchRelation.toArray();
    if (rows.length === 0) break;
    results.push(rows);
    if (rows.length < batchLimit) break;
    lastValues = recordCursorValues(rows[rows.length - 1], cursor);
  }
  return results;
}
