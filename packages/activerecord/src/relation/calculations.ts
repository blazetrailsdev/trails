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
import type { AdapterName } from "../adapter.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { columnType, type ColumnType, type Result } from "../result.js";
import { buildCteSql, buildJoinDependencies, QueryMethodBangs } from "./query-methods.js";

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
    typeForAttribute?(name: string): ColumnType;
    _attributeDefinitions?: { has(name: string): boolean };
    _serializedAttributes?: { get(name: string): { load(raw: unknown): unknown } | undefined };
    connection: {
      adapterName: AdapterName;
      visitor?: { compile(node: any): string; compileWithBinds?(node: any): [string, unknown[]] };
      toSql(arel: unknown): string;
      quoteTableName(name: string): string;
      execute(sql: string): Promise<Record<string, unknown>[]>;
      selectAll(
        sql: string,
        name?: string | null,
        binds?: unknown[],
      ): Promise<import("../result.js").Result>;
    };
  };
  _limitValue: number | null;
  _offsetValue: number | null;
  _optimizerHints: string[];
  _isNone: boolean;
  _isDistinct: boolean;
  _groupColumns: string[];
  _ctes: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  _fromClause: { isEmpty(): boolean; value: any; name: string | null };
  _applyJoinsToManager(manager: any): void;
  _applyWheresToManager(manager: any, table: any): void;
  _applyOrderToManager(manager: any, table: any): void;
  _checkEagerLoadable(): void;
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

  // Mirrors Rails ActiveRecord::Calculations#type_cast_calculated_value:
  //   when "average"
  //     case type.type
  //     when :integer, :decimal then value&.to_d   # Rails: BigDecimal
  //     else                          type.deserialize(value)
  //     end
  // We coerce integer/decimal averages to a JS number (documented Rails-→JS
  // limitation). For other types — interval, time, money — route through
  // the column type's deserialize so callers get a domain object (Duration,
  // Time, …) rather than the raw driver string.
  if (fn === "average" && colType != null) {
    const typeName = (colType as { type?(): string }).type?.();
    if (!isCoerceNumericTypeName(typeName)) {
      const ct = colType as { deserialize?(v: unknown): unknown };
      if (typeof ct.deserialize === "function") return ct.deserialize(val);
    }
  }
  // count / average over numeric columns: JS number.
  return Number(val);
}

function isCoerceNumericTypeName(name: string | undefined): boolean {
  if (!name) return true;
  // Rails maps :integer + :decimal to value&.to_d. BigInteger inherits
  // Integer.type → :integer in Rails; our BigIntegerType.name === "big_integer"
  // so list it explicitly. UnsignedInteger / Float are also numeric-coerce.
  return (
    name === "integer" ||
    name === "big_integer" ||
    name === "decimal" ||
    name === "float" ||
    name === "unsigned_integer" ||
    name === "boolean"
  );
}

function buildAggNode(
  rel: CalculationRelation,
  table: any,
  fn: AggFn,
  column: string,
  distinct: boolean,
): any {
  const sqlName = SQL_FN_NAMES[fn];
  if (column === "*") {
    return new Nodes.NamedFunction(sqlName, [new Nodes.SqlLiteral("*")], undefined, distinct);
  }
  // Mirrors Rails' arel_column (query_methods.rb): the column-vs-expression
  // decision is columns-first — a known column (after attribute-alias
  // resolution) is always a column reference, so an unusual-but-valid name
  // like "first name" is still quoted, never emitted as raw SQL. Only when
  // the model has no such column do we fall through: a bare or table-qualified
  // identifier stays a quoted reference (preserving prior behaviour), and any
  // other string (e.g. "id * wealth") passes through as raw SQL so
  // SUM(id * wealth) is emitted, not a quoted pseudo-column.
  //
  // APPROXIMATION: a qualified "table.column" resolves against the model's own
  // table (not through join dependencies, unlike Rails' arel_column_with_table)
  // and a schema-qualified "schema.table.column" falls through to raw SQL.
  // Neither is exercised by current callers.
  const aliases = (rel._modelClass as { _attributeAliases?: Record<string, string> })
    ._attributeAliases;
  const isColumn = isAllAttributes(rel, [column]);
  if (!isColumn && !/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/.test(column)) {
    return new Nodes.NamedFunction(sqlName, [new Nodes.SqlLiteral(column)], undefined, distinct);
  }
  const attr = table.get(isColumn ? (aliases?.[column] ?? column) : column);
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
  return rel._modelClass.connection.adapterName === "sqlite";
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

function prependCtes(rel: CalculationRelation, sql: string): string {
  if (rel._ctes.length === 0) return sql;
  const connection = rel._modelClass.connection;
  const compile = (node: Nodes.Node): string =>
    connection.visitor ? connection.visitor.compile(node) : connection.toSql(node);
  return `${buildCteSql(rel._ctes, compile, (name) => connection.quoteTableName(name))} ${sql}`;
}

// Mirrors relation.ts _safeAlias: quote alias if it contains non-identifier chars.
function _safeAlias(alias: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : `"${alias.replace(/"/g, '""')}"`;
}

function typeCastCalcBind(b: unknown): unknown {
  if (b !== null && typeof b === "object" && "valueForDatabase" in b) {
    return (b as { valueForDatabase: unknown }).valueForDatabase;
  }
  return b;
}

function compileManagerWithBinds(rel: CalculationRelation, manager: any): [string, unknown[]] {
  const visitor = rel._modelClass.connection.visitor;
  if (visitor?.compileWithBinds) {
    const [sql, rawBinds] = visitor.compileWithBinds(manager.ast) as [string, unknown[]];
    return [sql, rawBinds.map(typeCastCalcBind)];
  }
  return [rel._modelClass.connection.toSql(manager), []];
}

function applyFromClause(rel: CalculationRelation, sql: string): [string, unknown[]] {
  if (rel._fromClause.isEmpty()) return [sql, []];
  const raw = rel._fromClause.value;
  const alias = rel._fromClause.name;
  // Mirror Relation#toSql's FROM-clause handling (relation.ts ~3550):
  //   Nodes.Node  → compile via toSql(), no parens (e.g. SqlLiteral '"archived_topics"')
  //   Relation    → wrap compiled SQL in parens as subquery + alias
  //   string      → use as-is
  let fromExpr: string;
  let fromBinds: unknown[] = [];
  if (typeof raw === "string") {
    fromExpr = alias ? `${raw} ${_safeAlias(alias)}` : raw;
  } else if (raw instanceof Nodes.Node) {
    // Alias is ignored — callers bake the alias into the node itself (mirrors relation.ts:3561-3565).
    const visitor = rel._modelClass.connection.visitor;
    if (visitor?.compileWithBinds) {
      const [nodeSql, nodeRawBinds] = visitor.compileWithBinds(raw) as [string, unknown[]];
      fromExpr = nodeSql;
      fromBinds = nodeRawBinds.map(typeCastCalcBind);
    } else {
      fromExpr = visitor?.compile(raw) ?? (raw as any).toSql();
    }
  } else if (raw !== null && typeof (raw as any).toSql === "function") {
    // Relation or other object with toSql() — treat as subquery.
    const rawRelation = raw as any;
    const subSql: string = rawRelation._toSql?.() ?? rawRelation.toSql();
    fromBinds = (rawRelation._lastSelectBinds ?? []) as unknown[];
    const safeName = alias ? _safeAlias(alias) : "subquery";
    fromExpr = `(${subSql}) ${safeName}`;
  } else {
    return [sql, []];
  }
  return [
    sql.replace(
      /FROM\s+(?:"[^"]+"|[`][^`]+[`])(?:\.(?:"[^"]+"|[`][^`]+[`]))*/,
      () => `FROM ${fromExpr}`,
    ),
    fromBinds,
  ];
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
  // Rails routes aggregates through apply_join_dependency when eager loading,
  // raising EagerLoadPolymorphicError for polymorphic specs (calculations.rb).
  rel._checkEagerLoadable();
  const table = rel._modelClass.arelTable;
  const aggNode = buildAggNode(rel, table, fn, column, rel._isDistinct);
  const projection = aggNode.as("val");
  const manager = table.project(projection);
  rel._applyJoinsToManager(manager);
  rel._applyWheresToManager(manager, table);

  const colType = resolveColType(rel, column);
  const [rawSql, managerBinds] = compileManagerWithBinds(rel, manager);
  const [withFrom, fromBinds] = applyFromClause(rel, rawSql);
  const withCtes = prependCtes(rel, withFrom);
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel) ? wrapBigintAgg(withCtes) : withCtes;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const result = await rel._modelClass.connection.selectAll(
    sql,
    `${rel._modelClass.name} ${opName}`,
    [...fromBinds, ...managerBinds],
  );
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
  rel._checkEagerLoadable();
  const table = rel._modelClass.arelTable;
  const groupCol = rel._groupColumns[0];
  const groupNode = groupColumnToArel(groupCol, table);
  const aggNode = buildAggNode(rel, table, fn, column, rel._isDistinct);
  const groupKeyAlias = new Nodes.As(groupNode, new Nodes.SqlLiteral("group_key"));
  const manager = table.project(groupKeyAlias, aggNode.as("val"));
  rel._applyJoinsToManager(manager);
  rel._applyWheresToManager(manager, table);
  manager.group(groupNode);

  if (rel._limitValue !== null) manager.take(rel._limitValue);
  if (rel._offsetValue !== null) manager.skip(rel._offsetValue);

  const colType = resolveColType(rel, column);
  const [rawSql, managerBinds] = compileManagerWithBinds(rel, manager);
  const [withFrom, fromBinds] = applyFromClause(rel, rawSql);
  const withCtes = prependCtes(rel, withFrom);
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? wrapBigintAgg(withCtes, true)
      : withCtes;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel._modelClass.connection.selectAll(
    sql,
    `${rel._modelClass.name} ${opName}`,
    [...fromBinds, ...managerBinds],
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

  // Mirrors calculations.rb:231: has_include? check precedes the grouped branch.
  // When eager-loading with a group, Rails recurses into the grouped calculation on the
  // joined relation (calculations.rb:454) — groupedAggregate has no hasInclude guard.
  if (this._groupColumns.length > 0 && hasInclude(this, column ?? null)) {
    const anyRel = this as any;
    const eagerSpecs: string[] = (anyRel._eagerLoadAssociations as string[] | undefined) ?? [];
    const includesSpecs: string[] = (anyRel._includesAssociations as string[] | undefined) ?? [];
    const promoted: string[] =
      (anyRel._includesToPromoteFromReferences?.() as string[] | undefined) ?? [];
    const allEager = [...new Set([...eagerSpecs, ...includesSpecs, ...promoted])];
    // CPK + grouped eagerLoad not yet supported; fall through to plain groupedAggregate.
    if (!Array.isArray(this._modelClass.primaryKey)) {
      const pk = this._modelClass.primaryKey as string;
      const jd = QueryMethodBangs.constructJoinDependency.call(anyRel, allEager, Nodes.OuterJoin);
      const jdNodes: Nodes.Join[] = jd.joinConstraints([]);
      // Mirror calculations.rb:235: only set distinct when the relation isn't already distinct.
      const joinedRel = (
        this._isDistinct
          ? (this as any).joins(...jdNodes)
          : (this as any).joins(...jdNodes).distinct()
      ) as CalculationRelation;
      // count("*") → pk: COUNT(DISTINCT *) is invalid SQL.
      return groupedAggregate(
        joinedRel,
        "count",
        column != null && column !== "*" ? column : pk,
        true,
      ) as Promise<Record<string, number>>;
    }
  }

  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "count", column ?? "*", true) as Promise<Record<string, number>>;
  }
  this._checkEagerLoadable();

  // Mirrors Rails calculations.rb: when has_include? is true, apply_join_dependency
  // converts eager_load associations to LEFT OUTER JOINs and uses DISTINCT on PK to
  // prevent fan-out. Without this, the INNER JOIN alone would fan-out multiple rows
  // per record when a record has multiple associated records.
  if (hasInclude(this, column ?? null)) {
    const anyRel = this as any;
    const eagerSpecs: string[] = (anyRel._eagerLoadAssociations as string[] | undefined) ?? [];
    // Rails apply_join_dependency builds from eager_load_values | includes_values (finder_methods.rb:458)
    const includesSpecs: string[] = (anyRel._includesAssociations as string[] | undefined) ?? [];
    const promoted: string[] =
      (anyRel._includesToPromoteFromReferences?.() as string[] | undefined) ?? [];
    const allEager = [...new Set([...eagerSpecs, ...includesSpecs, ...promoted])];
    if (allEager.length > 0) {
      const pk = this._modelClass.primaryKey;
      if (!Array.isArray(pk)) {
        // Collect tables already covered by explicit _joinValues. For those,
        // skip the JD LEFT OUTER JOIN (the explicit join already links the table)
        // to avoid duplicate table references that cause "ambiguous column name".
        const explicitJoinTables = new Set<string>();
        for (const v of (anyRel._joinValues as (string | any)[] | undefined) ?? []) {
          if (typeof v === "string") {
            const m = v.match(/JOIN\s+(?:"([^"]+)"|`([^`]+)`|(\w+))/i);
            if (m) explicitJoinTables.add(m[1] ?? m[2] ?? m[3] ?? "");
          } else if (v?.left) {
            const n: string | undefined = typeof v.left.name === "string" ? v.left.name : undefined;
            if (n) explicitJoinTables.add(n);
          }
        }
        // Only build JD for specs whose target table is NOT already in explicit joins.
        // Specs already explicitly joined only need DISTINCT (not an extra LEFT JOIN).
        const specsForJd: string[] = [];
        for (const spec of allEager) {
          if (typeof spec !== "string") {
            specsForJd.push(spec as string);
            continue;
          }
          let tname: string | undefined;
          try {
            tname = (this._modelClass as any)._reflectOnAssociation?.(spec)?.tableName;
          } catch {
            // reflection.klass may throw when model not yet registered
          }
          if (!tname || !explicitJoinTables.has(tname)) specsForJd.push(spec);
        }
        const table = this._modelClass.arelTable;
        if (this._limitValue !== null || this._offsetValue !== null) {
          // Rails finder_methods.rb:463-478: with limit/offset, apply_join_dependency
          // wraps via distinct_relation_for_primary_key — a DISTINCT pk subquery that
          // captures limit/offset, then counts distinct parent IDs outside the subquery.
          const idSubquery = table.project(table.get(pk));
          idSubquery.distinct();
          if (specsForJd.length > 0) {
            const jd = QueryMethodBangs.constructJoinDependency.call(
              anyRel,
              specsForJd,
              Nodes.OuterJoin,
            );
            for (const node of jd.joinConstraints([])) idSubquery.appendJoinNode(node);
          }
          this._applyJoinsToManager(idSubquery);
          this._applyWheresToManager(idSubquery, table);
          if (this._limitValue !== null) idSubquery.take(this._limitValue);
          if (this._offsetValue !== null) idSubquery.skip(this._offsetValue);
          const [rawIdSql, idSubqueryBinds] = compileManagerWithBinds(this, idSubquery);
          const [innerSql, idFromBinds] = applyFromClause(this, rawIdSql);
          const allIdBinds = [...idFromBinds, ...idSubqueryBinds];
          // Outer count mirrors Rails recursive calculate() call: COUNT(DISTINCT requested_col).
          // JD joins are re-applied so a cross-table column (e.g. "comments.id") is reachable.
          // count("*") routes through JD and uses PK — COUNT(DISTINCT *) is invalid.
          const colForCount = column != null && column !== "*" ? column : pk;
          const countManager = table.project(
            (aggregateColumn(this, colForCount) as any).count(true).as("count"),
          );
          if (specsForJd.length > 0) {
            const jdOuter = QueryMethodBangs.constructJoinDependency.call(
              anyRel,
              specsForJd,
              Nodes.OuterJoin,
            );
            for (const node of jdOuter.joinConstraints([])) countManager.appendJoinNode(node);
          }
          this._applyJoinsToManager(countManager);
          countManager.where(table.get(pk).in(new Nodes.SqlLiteral(innerSql)));
          const [countSql, countOwnBinds] = compileManagerWithBinds(this, countManager);
          const limitedResult = await this._modelClass.connection.selectAll(
            prependCtes(this, countSql),
            `${this._modelClass.name} Count`,
            [...allIdBinds, ...countOwnBinds],
          );
          const limitedRows = limitedResult.toArray() as Record<string, unknown>[];
          return Number(limitedRows[0]?.count ?? 0);
        }
        // Mirrors Rails recursive calculate() on the JD relation: COUNT(DISTINCT requested_col).
        // count("*") routes through JD and uses PK — COUNT(DISTINCT *) is invalid.
        const colForCount = column != null && column !== "*" ? column : pk;
        const manager = table.project(
          (aggregateColumn(this, colForCount) as any).count(true).as("count"),
        );
        if (specsForJd.length > 0) {
          const jd = QueryMethodBangs.constructJoinDependency.call(
            anyRel,
            specsForJd,
            Nodes.OuterJoin,
          );
          for (const node of jd.joinConstraints([])) manager.appendJoinNode(node);
        }
        this._applyJoinsToManager(manager);
        this._applyWheresToManager(manager, table);
        const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
        const [withFrom, fromBinds] = applyFromClause(this, rawSql);
        const result = await this._modelClass.connection.selectAll(
          prependCtes(this, withFrom),
          `${this._modelClass.name} Count`,
          [...fromBinds, ...managerBinds],
        );
        const rows = result.toArray() as Record<string, unknown>[];
        return Number(rows[0]?.count ?? 0);
      }
    }
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
    // Apply FROM override at SQL level before wrapping — innerManager builds from
    // the base table but a from() override must redirect it to the CTE/subquery.
    const [rawInnerSql, innerManagerBinds] = compileManagerWithBinds(this, innerManager);
    const [innerSql, innerFromBinds] = applyFromClause(this, rawInnerSql);
    const allInnerBinds = [...innerFromBinds, ...innerManagerBinds];
    const subqueryNode = new Nodes.TableAlias(
      new Nodes.Grouping(new Nodes.SqlLiteral(innerSql)),
      "subquery_for_count",
    );
    const countNode = new Nodes.NamedFunction("COUNT", [columnAlias]);
    const outerManager = innerTable.project(countNode.as("count"));
    outerManager.from(subqueryNode);
    // Rails' build_subquery strips optimizer hints from the inner relation
    // (except(:optimizer_hints)) and re-applies them to the outer COUNT
    // SelectManager — keeping the hint at the front of the emitted query.
    if (this._optimizerHints.length > 0) outerManager.optimizerHints(...this._optimizerHints);
    const [outerSql, outerBinds] = compileManagerWithBinds(this, outerManager);
    const result = await this._modelClass.connection.selectAll(
      prependCtes(this, outerSql),
      `${this._modelClass.name} Count`,
      [...allInnerBinds, ...outerBinds],
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
    const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
    const [withFrom, fromBinds] = applyFromClause(this, rawSql);
    const result = await this._modelClass.connection.selectAll(
      prependCtes(this, withFrom),
      `${this._modelClass.name} Count`,
      [...fromBinds, ...managerBinds],
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
      const [rawInnerSql, innerManagerBinds] = compileManagerWithBinds(this, innerManager);
      const [innerSqlWithFrom, innerFromBinds] = applyFromClause(this, rawInnerSql);
      const allInnerBinds = [...innerFromBinds, ...innerManagerBinds];
      const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const outerManager = table.project(countAll.as("count"));
      outerManager.from(new Nodes.SqlLiteral(`(${innerSqlWithFrom}) AS subquery`));
      const [outerSql, outerBinds] = compileManagerWithBinds(this, outerManager);
      const result = await this._modelClass.connection.selectAll(
        prependCtes(this, outerSql),
        `${this._modelClass.name} Count`,
        [...allInnerBinds, ...outerBinds],
      );
      const rows = result.toArray() as Record<string, unknown>[];
      return Number(rows[0]?.count ?? 0);
    }
    const countNode = table.get(pk).count(true);
    const manager = table.project(countNode.as("count"));
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
    const [withFrom, fromBinds] = applyFromClause(this, rawSql);
    const result = await this._modelClass.connection.selectAll(
      prependCtes(this, withFrom),
      `${this._modelClass.name} Count`,
      [...fromBinds, ...managerBinds],
    );
    const rows = result.toArray() as Record<string, unknown>[];
    return Number(rows[0]?.count ?? 0);
  }

  const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
  const manager = table.project(countAll.as("count"));
  this._applyJoinsToManager(manager);
  this._applyWheresToManager(manager, table);
  const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
  const [withFrom, fromBinds] = applyFromClause(this, rawSql);
  const result = await this._modelClass.connection.selectAll(
    prependCtes(this, withFrom),
    `${this._modelClass.name} Count`,
    [...fromBinds, ...managerBinds],
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
): Promise<unknown | null | Record<string, unknown>> {
  // Returns `unknown` (not just number) because non-numeric column types
  // — interval (Duration), money, time — route through the column type's
  // deserialize and yield a domain object. Rails' AVG return type is
  // similarly polymorphic (BigDecimal for integer/decimal, Duration for
  // interval, etc.). Numeric averages still narrow to JS number at the
  // call site.
  if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "average", column, true);
  }
  return singleAggregate(this, "average", column, true);
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
 * Interface for the calculation methods mixed into Relation. Declared as
 * **method-syntax** (not property-syntax) so subclasses — CollectionProxy,
 * AssociationRelation, DisableJoinsAssociationRelation — can override
 * `count` / `sum` / `average` / `minimum` / `maximum` with narrower
 * signatures and added behavior (loaded-target fast path, strict-loading
 * gating, DJAR chain-walker). Do NOT replace this with
 * `Included<typeof Calculations>` on the `Relation` interface:
 * `Included<>` emits property-syntax members, and TS's strict variance
 * rules then reject every subclass override.
 */
export interface CalculationMethods {
  count(column?: string): Promise<number | Record<string, number>>;
  sum(column?: string): Promise<number | bigint | Record<string, number | bigint>>;
  average(column: string): Promise<unknown | null | Record<string, unknown>>;
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
export function aggregateColumn(rel: CalculationRelation, columnName: string): unknown {
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
export function isAllAttributes(rel: CalculationRelation, columnNames: string[]): boolean {
  const model = rel._modelClass as any;
  const known = new Set<string>([
    ...(typeof model.attributeNames === "function" ? (model.attributeNames() as string[]) : []),
    ...Object.keys(model._attributeAliases ?? {}),
  ]);
  return columnNames.map(String).every((c) => known.has(c));
}

/** @internal */
export function hasInclude(rel: CalculationRelation, columnName: string | null): boolean {
  const anyRel = rel as any;
  // eager_load_values.any? → always triggers (part of eager_loading?)
  if (anyRel._eagerLoadAssociations?.length > 0) return true;
  // includes_values with references → triggers via references_eager_loaded_tables?
  const promoted = anyRel._includesToPromoteFromReferences?.() as string[] | undefined;
  if (promoted && promoted.length > 0) return true;
  // Plain includes: triggers when a non-:all column is specified.
  // Rails excludes only the :all symbol (calculations.rb:94); explicit "*" is not excluded.
  if (anyRel._includesAssociations?.length > 0) {
    return columnName != null && columnName !== "all";
  }
  return false;
}

/** @internal */
export function performCalculation(
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
export function isDistinctSelect(_rel: CalculationRelation, columnName: string): boolean {
  return typeof columnName === "string" && /\bDISTINCT[\s(]/i.test(columnName);
}

/** @internal */
export function operationOverAggregateColumn(
  column: any,
  operation: string,
  distinct: boolean,
): unknown {
  if (operation === "count") return column.count(distinct);
  return typeof column[operation] === "function" ? column[operation]() : column;
}

/** @internal */
export async function executeSimpleCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string,
  distinct: boolean,
): Promise<unknown> {
  const fn = operation.toLowerCase() as AggFn;
  return singleAggregate(rel, fn, columnName, true);
}

/** @internal */
export async function executeGroupedCalculation(
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
export function typeFor(rel: CalculationRelation, field: string): unknown {
  return resolveColType(rel, field);
}

/** @internal */
export function lookupCastTypeFromJoinDependencies(
  rel: CalculationRelation,
  name: string,
  joinDependencies?: JoinDependency[],
): unknown {
  const deps = joinDependencies ?? buildJoinDependencies.call(rel as any);
  for (const jd of deps) {
    for (const node of jd) {
      const klass = node.baseKlass;
      if (!klass) continue;
      const rawTypes: unknown =
        typeof klass.attributeTypes === "function" ? klass.attributeTypes() : klass.attributeTypes;
      if (!rawTypes) continue;
      const type =
        rawTypes instanceof Map ? rawTypes.get(name) : (rawTypes as Record<string, unknown>)[name];
      if (type) return type;
    }
  }
  return null;
}

/**
 * Cast each plucked value through the type of its result column, mirroring
 * Rails `Calculations#type_cast_pluck_values`. The cast type for column `i`
 * resolves in Rails' priority order: the model's own attribute type, then a
 * type discovered through the join dependencies, then the driver's OID-based
 * `Result#column_types`, then identity. `Result#castValues` returns a flat
 * array for a single column and an array-of-rows for several, matching
 * `pluck`'s contract.
 *
 * APPROXIMATION: Arel attribute `type_caster`s are not consulted — our
 * projection nodes don't carry one, and the model-attribute-type path covers
 * the same columns.
 *
 * @internal
 */
export function typeCastPluckValues(
  result: Result,
  columns: Array<string | Nodes.Node | unknown>,
  rel: CalculationRelation,
): unknown[] {
  if (result.columns.length !== columns.length) {
    // Column/projection count mismatch (Rails falls back to attribute_types):
    // cast by name through the model's attribute types where known.
    const overrides: Record<string, ColumnType> = {};
    for (const name of result.columns) {
      const type = pluckCastTypeForKnownColumn(rel, name);
      if (type) overrides[name] = type;
    }
    return result.castValues(overrides);
  }
  const castTypes = result.columns.map((name, i) => pluckCastType(rel, name, i, result));
  return result.castValues(castTypes);
}

function pluckCastType(
  rel: CalculationRelation,
  name: string,
  index: number,
  result: Result,
): ColumnType {
  const known = pluckCastTypeForKnownColumn(rel, name);
  if (known) return known;
  const joinType = lookupCastTypeFromJoinDependencies(rel, name) as ColumnType | null;
  if (joinType) return joinType;
  // Driver OID type (e.g. PostgreSQL) or identity fallback.
  return columnType(name, index, {}, result.columnTypes);
}

/**
 * The cast type for a column the model owns: a serialized attribute's coder
 * (Rails wraps these in a Serialized type) or the declared attribute type.
 * Returns null when the model has no such attribute.
 */
function pluckCastTypeForKnownColumn(rel: CalculationRelation, name: string): ColumnType | null {
  const model = rel._modelClass;
  if (!model._attributeDefinitions?.has(name)) return null;
  const coder = model._serializedAttributes?.get(name);
  if (coder) return { deserialize: (value) => coder.load(value) };
  return model.typeForAttribute?.(name) ?? null;
}

/** @internal */
export function typeCastCalculatedValue(value: unknown, operation: string, type: unknown): unknown {
  if (operation === "count") return Number(value ?? 0);
  if (operation === "sum") return Number(value ?? 0);
  if (operation === "average") return value === null ? null : Number(value);
  return value;
}

/** @internal */
export function selectForCount(rel: CalculationRelation): string {
  const sel = (rel as any)._selectColumns;
  if (!sel || sel.length === 0) return "*";
  return sel.map((s: unknown) => String(s)).join(", ");
}

/** @internal */
export function isBuildCountSubquery(
  operation: string,
  columnName: string,
  distinct: boolean,
): boolean {
  return operation === "count" && distinct && columnName !== "*";
}

/** @internal */
export function buildCountSubquery(
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
  return rel._modelClass.connection.toSql(manager);
}
