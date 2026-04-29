/**
 * Calculation methods: count, sum, average, minimum, maximum, pluck, pick, ids.
 *
 * These are the real implementations behind Relation's calculation methods.
 * Each function uses this-typing so it can be assigned to Relation.prototype
 * directly, accessing internal state through `this`.
 *
 * Mirrors: ActiveRecord::Calculations
 */

import { Nodes, Table } from "@blazetrails/arel";
import { BigIntegerType } from "@blazetrails/activemodel";
import { detectAdapterName } from "../adapter-name.js";

/**
 * Qualify a GROUP BY column string as an Arel attribute node when it is a
 * plain SQL identifier (letters, digits, underscores), mirroring Rails'
 * `arel_columns` / `build_group` behaviour. Positional args ("1"), cast
 * expressions ("created_at::date"), and SQL expressions pass through as
 * SqlLiteral.
 *
 * @internal exported so Relation can share the implementation.
 */
export function groupColumnToArel(col: string, table: Table): Nodes.Node {
  const trimmed = col.trim();
  // Plain identifier → qualify via model table (e.g. "created_at" → "orders"."created_at").
  if (/^[A-Za-z_]\w*$/.test(trimmed)) return table.get(trimmed);
  // Simple table.column → create a cross-table Attribute (e.g. "authors.name" → "authors"."name").
  // Mirrors Rails' arel_columns which calls table[column] on the referenced table.
  const dotMatch = trimmed.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
  if (dotMatch) return new Table(dotMatch[1]).get(dotMatch[2]);
  // SQL expressions, casts, positional args, etc. pass through as raw SQL.
  return new Nodes.SqlLiteral(trimmed);
}

interface CalculationRelation {
  _modelClass: {
    arelTable: any;
    primaryKey: string | string[];
    name: string;
    adapter: {
      execute(sql: string): Promise<Record<string, unknown>[]>;
      selectAll(sql: string, name?: string | null): Promise<import("../result.js").Result>;
    };
  };
  _limitValue: number | null;
  _offsetValue: number | null;
  _isNone: boolean;
  _isDistinct: boolean;
  _groupColumns: string[];
  _applyJoinsToManager(manager: any): void;
  _applyWheresToManager(manager: any, table: any): void;
  _applyOrderToManager(manager: any, table: any): void;
  toArray(): Promise<any[]>;
}

type AggFn = "count" | "sum" | "average" | "minimum" | "maximum";

const SQL_FN_NAMES: Record<AggFn, string> = {
  count: "COUNT",
  sum: "SUM",
  average: "AVG",
  minimum: "MIN",
  maximum: "MAX",
};

/**
 * Cast an aggregate result value. Partially mirrors Rails'
 * `type_cast_calculated_value` (calculations.rb:627).
 *
 *   - count   → JS number via Number(val). SQL COUNT() > 2^53-1 loses
 *               precision (Rails returns arbitrary-precision Integer).
 *   - sum     → for BigIntegerType: type.deserialize(val ?? 0) → bigint;
 *               otherwise Number(val ?? 0) → number.
 *   - min/max → for BigIntegerType: type.deserialize(val) → bigint;
 *               otherwise returns raw driver value.
 *   - average → JS number via Number(val). Rails returns BigDecimal for
 *               integer/decimal columns — documented limitation.
 *
 * Only BigIntegerType is dispatched through the column type today.
 * Other types fall back to Number() or raw value. Extend castAggValue
 * when additional types need precision-preserving deserialize dispatch.
 */
function resolveColType(rel: CalculationRelation, column: string): unknown {
  if (column === "*") return null;
  const table = rel._modelClass.arelTable as { typeForAttribute?(c: string): unknown };
  return table.typeForAttribute?.(column) ?? null;
}

function castAggValue(val: unknown, fn: AggFn, colType: unknown, coerceNumeric: boolean): unknown {
  if (!coerceNumeric) {
    // minimum/maximum: route through column type so big_integer columns
    // return bigint rather than the raw driver string/number.
    if (val === null || val === undefined) return null;
    if (colType instanceof BigIntegerType) return colType.deserialize(val);
    return val;
  }

  if (fn === "sum") {
    // Default for empty result set: 0 or 0n depending on column type.
    if (colType instanceof BigIntegerType) return colType.deserialize(val ?? 0) ?? 0n;
    return Number(val ?? 0);
  }

  // count / average: always a JS number.
  return Number(val);
}

function buildAggNode(table: any, fn: AggFn, column: string, distinct: boolean): any {
  const sqlName = SQL_FN_NAMES[fn];
  if (column === "*") {
    return new Nodes.NamedFunction(sqlName, [new Nodes.SqlLiteral("*")], undefined, distinct);
  }
  const attr = table.get(column);
  if (distinct) {
    return new Nodes.NamedFunction(sqlName, [attr], undefined, true);
  }
  switch (fn) {
    case "count":
      return attr.count(false);
    case "sum":
      return attr.sum();
    case "average":
      return attr.average();
    case "minimum":
      return attr.minimum();
    case "maximum":
      return attr.maximum();
  }
}

/**
 * Whether this adapter needs a CAST-to-TEXT subquery to get a bigint
 * aggregate value back as a string rather than a lossy JS number.
 *
 * SQLite's SUM/MIN/MAX on computed columns has no declared type, so
 * `_maybeEnableSafeIntegers` doesn't trigger. The driver returns a lossy
 * JS number for values above Number.MAX_SAFE_INTEGER.
 *
 * PG: pg-types returns int8 aggregate as a string natively.
 * MySQL: supportBigNumbers:true returns large sums as strings.
 * Both are handled by BigIntegerType.cast without any SQL wrapping.
 */
function needsBigintCast(rel: CalculationRelation): boolean {
  return detectAdapterName(rel._modelClass.adapter as any) === "sqlite";
}

/**
 * Wrap a bigint aggregate SQL in CAST(... AS TEXT) so SQLite returns
 * a decimal string instead of a lossy number. Only used when
 * needsBigintCast() is true. Aliases are quoted to match SQLite's
 * identifier quoting convention.
 */
function wrapBigintAgg(innerSql: string, grouped = false): string {
  if (grouped) {
    return `SELECT "group_key", CAST("val" AS TEXT) AS "val" FROM (${innerSql}) AS "_bigint_agg"`;
  }
  return `SELECT CAST("val" AS TEXT) AS "val" FROM (${innerSql}) AS "_bigint_agg"`;
}

function isBigintColumn(rel: CalculationRelation, fn: AggFn, column: string): boolean {
  if (fn === "count" || fn === "average" || column === "*") return false;
  const table = rel._modelClass.arelTable as {
    typeForAttribute?(col: string): unknown;
  };
  return table.typeForAttribute?.(column) instanceof BigIntegerType;
}

async function singleAggregate(
  rel: CalculationRelation,
  fn: AggFn,
  column: string,
  coerceNumeric: boolean = true,
): Promise<unknown | null> {
  const table = rel._modelClass.arelTable;
  const aggNode = buildAggNode(table, fn, column, rel._isDistinct);
  const projection = aggNode.as("val");
  const manager = table.project(projection);
  rel._applyJoinsToManager(manager);
  rel._applyWheresToManager(manager, table);

  const colType = resolveColType(rel, column);
  const innerSql = manager.toSql();
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel) ? wrapBigintAgg(innerSql) : innerSql;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const result = await rel._modelClass.adapter.selectAll(sql, `${rel._modelClass.name} ${opName}`);
  const rows = result.toArray() as Record<string, unknown>[];
  const val = rows[0]?.val;
  if (val === undefined || val === null) {
    return fn === "sum" ? castAggValue(null, fn, colType, coerceNumeric) : null;
  }
  return castAggValue(val, fn, colType, coerceNumeric);
}

async function groupedAggregate(
  rel: CalculationRelation,
  fn: AggFn,
  column: string,
  coerceNumeric: boolean = true,
): Promise<Record<string, unknown>> {
  const table = rel._modelClass.arelTable;
  const groupCol = rel._groupColumns[0];
  const groupNode = groupColumnToArel(groupCol, table);
  const aggNode = buildAggNode(table, fn, column, rel._isDistinct);
  const groupKeyAlias = new Nodes.As(groupNode, new Nodes.SqlLiteral("group_key"));
  const manager = table.project(groupKeyAlias, aggNode.as("val"));
  rel._applyJoinsToManager(manager);
  rel._applyWheresToManager(manager, table);
  manager.group(groupNode);

  if (rel._limitValue !== null) manager.take(rel._limitValue);
  if (rel._offsetValue !== null) manager.skip(rel._offsetValue);

  const colType = resolveColType(rel, column);
  const innerSql = manager.toSql();
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? wrapBigintAgg(innerSql, true)
      : innerSql;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel._modelClass.adapter.selectAll(
    sql,
    `${rel._modelClass.name} ${opName}`,
  );
  const rows = queryResult.toArray() as Record<string, unknown>[];

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const key = String(row.group_key ?? "null");
    const val = row.val;
    if (val === undefined || val === null) {
      result[key] = fn === "sum" ? castAggValue(null, fn, colType, coerceNumeric) : null;
    } else {
      result[key] = castAggValue(val, fn, colType, coerceNumeric);
    }
  }
  return result;
}

export async function performCount(
  this: CalculationRelation,
  column?: string,
): Promise<number | Record<string, number>> {
  if (this._limitValue === 0) return 0;
  if (this._isNone) return this._groupColumns.length > 0 ? {} : 0;

  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "count", column ?? "*", true) as Promise<Record<string, number>>;
  }

  if (this._limitValue !== null || this._offsetValue !== null) {
    // Rails: build_count_subquery — wraps the limited relation as a subquery
    // and counts its rows without instantiating records.
    // Mirrors: ActiveRecord::Calculations#build_count_subquery
    const innerTable = this._modelClass.arelTable;
    let innerManager: ReturnType<typeof innerTable.project>;
    // columnAlias: what the outer COUNT targets. Mirrors Rails:
    //   column_name == :all → Arel.star   (outer: COUNT(*))
    //   else                → "count_column" (outer: COUNT(count_column))
    const effectiveCol = column === "*" ? undefined : column;
    let columnAlias: Nodes.Node;
    if (this._isDistinct && effectiveCol) {
      // DISTINCT + specific column: project that column aliased as count_column
      // with DISTINCT applied so the inner query counts distinct non-NULL values
      // of the requested column (matches COUNT(DISTINCT col) semantics).
      innerManager = innerTable.project(innerTable.get(effectiveCol).as("count_column"));
      innerManager.distinct();
      columnAlias = new Nodes.SqlLiteral("count_column");
    } else if (this._isDistinct) {
      // DISTINCT + count(*): project PK with DISTINCT to deduplicate rows.
      // Use table.get(c) so PK refs are qualified (unambiguous with joins).
      const pk = (this._modelClass as any).primaryKey ?? "id";
      if (Array.isArray(pk)) {
        innerManager = innerTable.project(...pk.map((c: string) => innerTable.get(c)));
      } else {
        innerManager = innerTable.project(innerTable.get(pk));
      }
      innerManager.distinct();
      columnAlias = new Nodes.SqlLiteral("*");
    } else if (effectiveCol) {
      // Specific column requested: project it aliased as count_column so the
      // outer COUNT(count_column) excludes NULLs, matching non-limited semantics.
      const colNode = innerTable.get(effectiveCol);
      innerManager = innerTable.project(colNode.as("count_column"));
      columnAlias = new Nodes.SqlLiteral("count_column");
    } else {
      innerManager = innerTable.project(new Nodes.SqlLiteral("1 AS one"));
      columnAlias = new Nodes.SqlLiteral("*");
    }
    this._applyJoinsToManager(innerManager);
    this._applyWheresToManager(innerManager, innerTable);
    if (this._limitValue !== null) innerManager.take(this._limitValue);
    if (this._offsetValue !== null) innerManager.skip(this._offsetValue);
    // Wrap inner query as Arel AST: Grouping (parens) + TableAlias.
    // Mirrors Rails: Arel::Nodes::TableAlias.new(Arel::Nodes::Grouping.new(inner), alias)
    const subqueryNode = new Nodes.TableAlias(
      new Nodes.Grouping(innerManager.ast),
      "subquery_for_count",
    );
    const countNode = new Nodes.NamedFunction("COUNT", [columnAlias]);
    const outerManager = innerTable.project(countNode.as("count"));
    outerManager.from(subqueryNode);
    const result = await this._modelClass.adapter.selectAll(
      outerManager.toSql(),
      `${this._modelClass.name} Count`,
    );
    const rows = result.toArray() as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  const table = this._modelClass.arelTable;
  const effectiveColumn = column === "*" ? undefined : column;

  if (effectiveColumn) {
    const countNode = table.get(effectiveColumn).count(this._isDistinct);
    const manager = table.project(countNode.as("count"));
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    const result = await this._modelClass.adapter.selectAll(
      manager.toSql(),
      `${this._modelClass.name} Count`,
    );
    const rows = result.toArray() as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  if (this._isDistinct) {
    const pk = this._modelClass.primaryKey;
    if (Array.isArray(pk)) {
      // Multi-column DISTINCT COUNT requires a subquery since
      // COUNT(DISTINCT col1, col2) isn't valid on SQLite/PG
      const innerManager = table.project(...pk.map((c: string) => table.get(c)));
      innerManager.distinct();
      this._applyJoinsToManager(innerManager);
      this._applyWheresToManager(innerManager, table);
      const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const outerManager = table.project(countAll.as("count"));
      outerManager.from(new Nodes.SqlLiteral(`(${innerManager.toSql()}) AS subquery`));
      const result = await this._modelClass.adapter.selectAll(
        outerManager.toSql(),
        `${this._modelClass.name} Count`,
      );
      const rows = result.toArray() as Record<string, unknown>[];
      return Number(rows[0]?.count ?? 0);
    }
    const countNode = table.get(pk).count(true);
    const manager = table.project(countNode.as("count"));
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    const result = await this._modelClass.adapter.selectAll(
      manager.toSql(),
      `${this._modelClass.name} Count`,
    );
    const rows = result.toArray() as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
  const manager = table.project(countAll.as("count"));
  this._applyJoinsToManager(manager);
  this._applyWheresToManager(manager, table);
  const result = await this._modelClass.adapter.selectAll(
    manager.toSql(),
    `${this._modelClass.name} Count`,
  );
  const rows = result.toArray() as Record<string, unknown>[];
  return Number(rows[0]?.count ?? 0);
}

export async function performSum(
  this: CalculationRelation,
  column?: string,
): Promise<number | bigint | Record<string, number | bigint>> {
  if (this._isNone) {
    if (this._groupColumns.length > 0) return {};
    return column && resolveColType(this, column) instanceof BigIntegerType ? 0n : 0;
  }
  if (!column) return 0;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "sum", column, true) as Promise<Record<string, number | bigint>>;
  }
  return ((await singleAggregate(this, "sum", column, true)) as number | bigint) ?? 0;
}

export async function performAverage(
  this: CalculationRelation,
  column: string,
): Promise<number | null | Record<string, number>> {
  if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "average", column, true) as Promise<Record<string, number>>;
  }
  return singleAggregate(this, "average", column, true) as Promise<number | null>;
}

export async function performMinimum(
  this: CalculationRelation,
  column: string,
): Promise<unknown | null | Record<string, unknown>> {
  if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "minimum", column, false);
  }
  return singleAggregate(this, "minimum", column, false);
}

export async function performMaximum(
  this: CalculationRelation,
  column: string,
): Promise<unknown | null | Record<string, unknown>> {
  if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "maximum", column, false);
  }
  return singleAggregate(this, "maximum", column, false);
}

/**
 * Interface for the calculation methods mixed into Relation.
 * Used with interface merging so the methods appear as proper
 * method signatures in .d.ts output.
 */
export interface CalculationMethods {
  count(column?: string): Promise<number | Record<string, number>>;
  sum(column?: string): Promise<number | bigint | Record<string, number | bigint>>;
  average(column: string): Promise<number | null | Record<string, number>>;
  minimum(column: string): Promise<unknown | null | Record<string, unknown>>;
  maximum(column: string): Promise<unknown | null | Record<string, unknown>>;
}

/**
 * Tracks column aliases during calculation queries to avoid
 * conflicts when multiple aggregates are computed.
 *
 * Mirrors: ActiveRecord::Calculations::ColumnAliasTracker
 */
export const Calculations = {
  count: performCount,
  sum: performSum,
  average: performAverage,
  minimum: performMinimum,
  maximum: performMaximum,
} as const;

export class ColumnAliasTracker {
  private _aliases: Map<string, number> = new Map();

  aliasFor(column: string): string {
    const count = this._aliases.get(column) ?? 0;
    this._aliases.set(column, count + 1);
    if (count === 0) return column;
    return `${column}_${count}`;
  }
}

// ---------------------------------------------------------------------------
// Private helpers (mirrors Rails' ActiveRecord::Calculations private methods)
// ---------------------------------------------------------------------------

/** @internal */
function columnAliasFor(field: string): string {
  return field
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 255);
}

/** @internal */
function truncate(name: string): string {
  return name.slice(0, 255);
}

/** @internal */
function aggregateColumn(rel: CalculationRelation, columnName: string): unknown {
  const table = rel._modelClass.arelTable;
  if (columnName === "*" || columnName === "1") {
    return (table as any).sql ? (table as any).sql(columnName) : columnName;
  }
  if (columnName.includes(".")) {
    const parts = columnName.split(".");
    return new Table(parts[0]).get(parts[1]);
  }
  return table.get(columnName);
}

/** @internal */
function isAllAttributes(columnNames: string[]): boolean {
  return columnNames.every((c) => c === "*" || !c.includes("("));
}

/** @internal */
function hasInclude(rel: CalculationRelation, columnName: string | null): boolean {
  return (rel as any)._includesValues?.length > 0 || (rel as any)._eagerLoadValues?.length > 0;
}

/** @internal */
function performCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string,
): Promise<unknown> {
  if ((rel as any)._groupColumns?.length > 0) {
    return executeGroupedCalculation(rel, operation, columnName, false);
  }
  return executeSimpleCalculation(rel, operation, columnName, false);
}

/** @internal */
function isDistinctSelect(rel: CalculationRelation, columnName: string): boolean {
  return rel._isDistinct || columnName !== "*";
}

/** @internal */
function operationOverAggregateColumn(
  column: unknown,
  operation: string,
  distinct: boolean,
): unknown {
  return column;
}

/** @internal */
async function executeSimpleCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string,
  distinct: boolean,
): Promise<unknown> {
  const fn = operation.toLowerCase() as AggFn;
  return singleAggregate(rel, fn, columnName, true);
}

/** @internal */
async function executeGroupedCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string,
  distinct: boolean,
): Promise<Record<string, unknown>> {
  const fn = operation.toLowerCase() as AggFn;
  // Build a GROUP BY aggregate query via Arel (delegates to the shared groupedAggregate helper).
  const table = rel._modelClass.arelTable as Nodes.Node;
  void table;
  return groupedAggregate(rel, fn, columnName, false);
}

/** @internal */
function typeFor(rel: CalculationRelation, field: string): unknown {
  return resolveColType(rel, field);
}

/** @internal */
function lookupCastTypeFromJoinDependencies(_rel: CalculationRelation, _name: string): unknown {
  return null;
}

/** @internal */
function typeCastPluckValues(
  result: unknown[][],
  columns: string[],
  rel?: CalculationRelation,
): unknown[][] {
  return result.map((row) =>
    row.map((val, i) =>
      castAggValue(val, "sum" as any, rel ? resolveColType(rel, columns[i] ?? "") : null, false),
    ),
  );
}

/** @internal */
function typeCastCalculatedValue(value: unknown, operation: string, type: unknown): unknown {
  if (operation === "count") return Number(value ?? 0);
  if (operation === "sum") return Number(value ?? 0);
  if (operation === "average") return value === null ? null : Number(value);
  return value;
}

/** @internal */
function selectForCount(rel: CalculationRelation): string {
  const sel = (rel as any)._selectColumns;
  if (!sel || sel.length === 0) return "*";
  return sel.map((s: unknown) => String(s)).join(", ");
}

/** @internal */
function isBuildCountSubquery(operation: string, columnName: string, distinct: boolean): boolean {
  return operation === "count" && distinct && columnName !== "*";
}

/** @internal */
function buildCountSubquery(
  rel: CalculationRelation,
  columnName: string,
  distinct: boolean,
): string {
  const table = rel._modelClass.arelTable;
  const col = columnName === "*" ? new Nodes.SqlLiteral("*") : table.get(columnName);
  const countNode = distinct
    ? new Nodes.NamedFunction("COUNT", [col], undefined, true)
    : new Nodes.NamedFunction("COUNT", [col]);
  const manager = table.project(countNode.as("count_column"));
  rel._applyWheresToManager(manager, table);
  return manager.toSql();
}
