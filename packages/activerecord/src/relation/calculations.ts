/**
 * Calculation methods: count, sum, average, minimum, maximum, pluck, pick, ids.
 *
 * These are the real implementations behind Relation's calculation methods.
 * Each function uses this-typing so it can be assigned to Relation.prototype
 * directly, accessing internal state through `this`.
 *
 * Mirrors: ActiveRecord::Calculations
 */

import { Nodes, Table, SelectManager } from "@blazetrails/arel";
import { BigIntegerType } from "@blazetrails/activemodel";
import type { AdapterName } from "../connection-adapters/abstract-adapter.js";
import type { Base } from "../base.js";
import { withQueryConnection } from "../connection-handling.js";
import { exceedsBindParamsLimit } from "../connection-adapters/abstract/database-limits.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { columnType, type ColumnType, type Result } from "../result.js";
import { EnumType } from "../enum.js";
import {
  arelColumn,
  arelColumns,
  buildCteSql,
  buildJoinDependencies,
  QueryMethodBangs,
} from "./query-methods.js";

/**
 * Qualify a GROUP BY column string as an Arel attribute node when it is a
 * plain SQL identifier (letters, digits, underscores), mirroring Rails'
 * `arel_columns` / `build_group` behaviour. Positional args ("1"), cast
 * expressions ("created_at::date"), and SQL expressions pass through as
 * SqlLiteral.
 *
 * @internal exported so Relation can share the implementation.
 */
export function groupColumnToArel(col: string | Nodes.Node, table: Table): Nodes.Node {
  if (col instanceof Nodes.Node) return col;
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

interface CalculationConnection {
  adapterName: AdapterName;
  visitor?: { compile(node: any): string; compileWithBinds?(node: any): [string, unknown[]] };
  toSql(arel: unknown): string;
  quote(value: unknown): string;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
  columnsForDistinct(
    columns: string | string[],
    orders?: (string | Nodes.Node)[],
  ): string | string[];
  execute(sql: string): Promise<Record<string, unknown>[]>;
  selectAll(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<import("../result.js").Result>;
}

interface CalculationRelation {
  _modelClass: {
    arelTable: any;
    primaryKey: string | string[];
    name: string;
    typeForAttribute?(name: string): ColumnType;
    _attributeDefinitions?: { has(name: string): boolean };
    _serializedAttributes?: { get(name: string): { load(raw: unknown): unknown } | undefined };
    connection: CalculationConnection;
  };
  /**
   * The connection threaded by the enclosing `withQueryConnection` wrap, else
   * the model's `.connection`. Mirrors `Relation#_conn`; reading it instead of
   * `_modelClass.connection` keeps internal reads off the deprecated getter.
   * @internal
   */
  _conn(): CalculationConnection;
  _limitValue: number | null;
  _offsetValue: number | null;
  _optimizerHints: string[];
  _isNone: boolean;
  /** @internal Rebase-then-report none short-circuit; see Relation. */
  _isEmptyRelation(): boolean;
  _isDistinct: boolean;
  _groupColumns: string[];
  _whereClause: { isContradiction(): boolean };
  _ctes: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  _applyJoinsToManager(manager: any, eagerJd?: JoinDependency): void;
  _applyWheresToManager(manager: any, table: any): void;
  _applyOrderToManager(manager: any, table: any): void;
  _buildFromNode(): Nodes.Node | string | undefined;
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
 * Resolve the cast type for an aggregate target column, mirroring Rails'
 * `type_for` (calculations.rb): the model's own attribute type, then a type
 * discovered through the join dependencies (which, for a `.joins(:assoc)`,
 * include the target klass retained on the pre-resolved SQL join clause).
 */
function resolveColType(rel: CalculationRelation, column: string | Nodes.Node): unknown {
  if (column === "*") return null;
  // Arel attribute node: extract column name from the node.
  const colStr =
    column instanceof Nodes.Node ? ((column as unknown as { name?: string }).name ?? "") : column;
  if (!colStr) return null;
  // A "table.column" aggregate target resolves through joins; the cast type
  // lives on the joined model, keyed by the bare column name.
  const dot = colStr.lastIndexOf(".");
  const bare = dot >= 0 ? colStr.slice(dot + 1) : colStr;
  const resolved =
    pluckCastTypeForKnownColumn(rel, bare) ??
    (lookupCastTypeFromJoinDependencies(rel, bare) as ColumnType | null);
  // Rails unwraps an EnumType to its subtype before casting an aggregate value
  // (`type = type.subtype if Enum::EnumType === type`), so min/max/sum return
  // the raw integer, not the enum label.
  return resolved instanceof EnumType ? resolved.subtypeType() : resolved;
}

/**
 * Cast an aggregate result value. Partially mirrors Rails'
 * `type_cast_calculated_value` (calculations.rb:627).
 *
 *   - count   → JS number via Number(val). SQL COUNT() > 2^53-1 loses
 *               precision (Rails returns arbitrary-precision Integer).
 *   - sum     → for BigIntegerType: type.deserialize(val ?? 0) → bigint;
 *               otherwise Number(val ?? 0) → number.
 *   - min/max → type.deserialize(val) for any column type with a deserialize
 *               (Rails' else-branch, calculations.rb:638): big_integer → bigint,
 *               datetime → Temporal instant, etc.; raw value when none.
 *   - average → JS number via Number(val). Rails returns BigDecimal for
 *               integer/decimal columns — documented limitation.
 *
 * sum and average still coerce integer/decimal columns to a JS number (a
 * documented Rails-→JS limitation); min/max and other non-numeric types route
 * through the column type's deserialize so callers get the domain object.
 */
function castAggValue(val: unknown, fn: AggFn, colType: unknown, coerceNumeric: boolean): unknown {
  if (!coerceNumeric) {
    // minimum/maximum: Rails' type_cast_calculated_value else-branch is
    // `type.deserialize(value)`, so route through the column type — big_integer
    // columns return bigint, datetime columns return a Temporal instant, etc.
    if (val === null || val === undefined) return null;
    const ct = colType as { deserialize?(v: unknown): unknown } | null;
    if (typeof ct?.deserialize === "function") return ct.deserialize(val);
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
  fn: AggFn,
  column: string | Nodes.Node,
  distinct: boolean,
): any {
  const sqlName = SQL_FN_NAMES[fn];
  // "all" is the JS analogue of Rails' :all symbol — aggregate_column maps it
  // to Arel.star (calculations.rb:414-423), i.e. COUNT(*), not a column ref.
  if (column === "*" || column === "all" || column instanceof Nodes.SqlLiteral) {
    const lit = column instanceof Nodes.SqlLiteral ? column : new Nodes.SqlLiteral("*");
    return new Nodes.NamedFunction(sqlName, [lit], undefined, distinct);
  }
  // Arel node (e.g. arelTable.get("col")) — use it directly without string resolution.
  // Mirrors Rails: calculate() passes Arel::Attribute through aggregate_column unchanged.
  if (column instanceof Nodes.Node) {
    const node = column as Nodes.Node & {
      count(distinct: boolean): Nodes.Node;
      sum(): Nodes.Node;
      average(): Nodes.Node;
      minimum(): Nodes.Node;
      maximum(): Nodes.Node;
    };
    if (distinct) return new Nodes.NamedFunction(sqlName, [node], undefined, true);
    switch (fn) {
      case "count":
        return node.count(false);
      case "sum":
        return node.sum();
      case "average":
        return node.average();
      case "minimum":
        return node.minimum();
      case "maximum":
        return node.maximum();
    }
  }
  // Mirrors Rails' aggregate_column → arel_column (query_methods.rb): a known
  // column (after attribute-alias resolution) becomes a qualified column
  // reference, a "table.column" string resolves through the join dependencies
  // so it lands on the joined table (not the model's own), and any other
  // string (e.g. "id * wealth") passes through as raw SQL. Every Arel node —
  // attribute or SqlLiteral — mixes in Expressions, so the aggregate builder
  // (count/sum/…) is callable uniformly.
  // Fallback for a column absent from the model's columns_hash: the primary key
  // still belongs to the base table (our test models omit the implicit PK from
  // columns_hash, unlike Rails), so qualify it there; anything else is a joined
  // or expression column and stays unqualified raw SQL — exactly what
  // MIN(written_on) over a joined table needs.
  const pk = rel._modelClass.primaryKey;
  const pks = Array.isArray(pk) ? pk : [pk];
  const node = arelColumn.call(rel as never, column, (field: string) =>
    pks.includes(field) ? rel._modelClass.arelTable.get(field) : new Nodes.SqlLiteral(field),
  ) as Nodes.Node & {
    count(distinct: boolean): Nodes.Node;
    sum(): Nodes.Node;
    average(): Nodes.Node;
    minimum(): Nodes.Node;
    maximum(): Nodes.Node;
  };
  if (distinct) {
    return new Nodes.NamedFunction(sqlName, [node], undefined, true);
  }
  switch (fn) {
    case "count":
      return node.count(false);
    case "sum":
      return node.sum();
    case "average":
      return node.average();
    case "minimum":
      return node.minimum();
    case "maximum":
      return node.maximum();
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
  return rel._conn().adapterName === "sqlite";
}

/**
 * Wrap a bigint aggregate SQL in CAST(... AS TEXT) so SQLite returns
 * a decimal string instead of a lossy number. Only used when
 * needsBigintCast() is true. Aliases are quoted to match SQLite's
 * identifier quoting convention.
 */
function wrapBigintAgg(innerSql: string, grouped = false, aggAlias = "val"): string {
  if (grouped) {
    return `SELECT "group_key", CAST("${aggAlias}" AS TEXT) AS "${aggAlias}" FROM (${innerSql}) AS "_bigint_agg"`;
  }
  return `SELECT CAST("val" AS TEXT) AS "val" FROM (${innerSql}) AS "_bigint_agg"`;
}

/**
 * Prefix the `WITH` clause onto an aggregate's compiled SQL, collecting the
 * CTE-body binds through the visitor and prepending them to the main query's
 * binds — exactly as the SELECT path does — rather than inlining them. The
 * `WITH` clause renders first, so its binds lead; for PG `$N` placeholders the
 * main body is renumbered up by the CTE bind count (SQLite/MySQL `?` are
 * positional, so document order suffices and the shift is a no-op).
 */
function prependCtes(
  rel: CalculationRelation,
  body: string,
  binds: unknown[],
): [string, unknown[]] {
  if (rel._ctes.length === 0) return [body, binds];
  const connection = rel._conn();
  const compile = (node: Nodes.Node): [string, unknown[]] => {
    if (!connection.visitor?.compileWithBinds) return [connection.toSql(node), []];
    return connection.visitor.compileWithBinds(node);
  };
  const { sql: cteSql, binds: cteRawBinds } = buildCteSql(rel._ctes, compile, (name) =>
    connection.quoteTableName(name),
  );
  const cteBinds = cteRawBinds.map(typeCastCalcBind);
  const offset = cteBinds.length;
  // PG `$N` placeholders in the body restart at `$1`; shift them past the
  // CTE binds that now lead the bind array (mirrors buildCteSql's own shift).
  const shifted =
    offset > 0 ? body.replace(/\$(\d+)/g, (_m, n) => `$${parseInt(n, 10) + offset}`) : body;
  return [`${cteSql} ${shifted}`, [...cteBinds, ...binds]];
}

function typeCastCalcBind(b: unknown): unknown {
  if (b !== null && typeof b === "object" && "valueForDatabase" in b) {
    return (b as { valueForDatabase: unknown }).valueForDatabase;
  }
  return b;
}

function compileManagerWithBinds(rel: CalculationRelation, manager: any): [string, unknown[]] {
  const conn = rel._conn() as {
    visitor?: { compileWithBinds?(ast: unknown): [string, unknown[], boolean, boolean] };
    toSql(m: unknown): string;
    preparedStatements?: boolean;
    bindParamsLength?(): number;
  };
  const visitor = conn.visitor;
  if (visitor?.compileWithBinds) {
    const [sql, rawBinds] = visitor.compileWithBinds(manager.ast);
    const binds = rawBinds.map(typeCastCalcBind);
    // Mirrors Rails to_sql_and_binds (database_statements.rb:36-38): when the
    // bind count exceeds the adapter's parameter cap, fall back to an inlined
    // (unprepared) compile so the driver's variable limit isn't overflowed.
    // Reachable via multi-value `IN`/`NOT IN` (`HomogeneousIn`) over large id
    // arrays — see BindParameterTest "too many binds".
    if (exceedsBindParamsLimit(conn, binds.length)) {
      return [conn.toSql(manager), []];
    }
    return [sql, binds];
  }
  return [conn.toSql(manager), []];
}

/**
 * Apply this relation's `from()` source onto a calculation `SelectManager`
 * **before** compilation, reusing `Relation#_buildFromNode` / `buildFrom` so
 * the FROM source — string, Arel node, or live subquery Relation — threads
 * through the single visitor collector exactly as the main SELECT path does
 * (relation.ts `_buildSelectManager`). Binds land in document order (FROM
 * before WHERE) and identifier quoting stays in the visitor; there is no
 * Rails analog of the old `applyFromClause` SQL rewrite.
 */
function applyFromToManager(rel: CalculationRelation, manager: any): void {
  const fromNode = rel._buildFromNode();
  if (fromNode !== undefined && fromNode !== null) manager.from(fromNode);
}

function isBigintColumn(rel: CalculationRelation, fn: AggFn, column: string | Nodes.Node): boolean {
  if (fn === "count" || fn === "average" || column === "*") return false;
  if (column instanceof Nodes.Node) return false;
  const table = rel._modelClass.arelTable as {
    typeForAttribute?(col: string): unknown;
  };
  return table.typeForAttribute?.(column) instanceof BigIntegerType;
}

/**
 * The associations Rails' `apply_join_dependency` builds the eager
 * JoinDependency from: `eager_load_values | includes_values`
 * (finder_methods.rb:458), where plain `includes` promoted to eager load via a
 * matching `references` is folded in. De-duplicated, preserving order.
 * @internal
 */
function collectEagerSpecs(rel: CalculationRelation): string[] {
  const anyRel = rel as any;
  const eager: string[] = (anyRel._eagerLoadAssociations as string[] | undefined) ?? [];
  const includes: string[] = (anyRel._includesAssociations as string[] | undefined) ?? [];
  const promoted: string[] =
    (anyRel._includesToPromoteFromReferences?.() as string[] | undefined) ?? [];
  return [...new Set([...eager, ...includes, ...promoted])];
}

async function singleAggregate(
  rel: CalculationRelation,
  fn: AggFn,
  column: string | Nodes.Node,
  coerceNumeric: boolean = true,
): Promise<unknown | null> {
  // Rails routes aggregates through apply_join_dependency when eager loading,
  // raising EagerLoadPolymorphicError for polymorphic specs (calculations.rb).
  rel._checkEagerLoadable();
  const table = rel._modelClass.arelTable;
  const aggNode = buildAggNode(rel, fn, column, rel._isDistinct);
  const projection = aggNode.as("val");
  const manager = table.project(projection);
  // Rails routes sum/average/maximum/minimum through apply_join_dependency when
  // has_include? — includes().references() promotes to a LEFT OUTER JOIN here.
  const allEagerSa = collectEagerSpecs(rel);
  // Fold the eager JoinDependency into the shared `build_joins` port
  // (`_applyJoinsToManager(manager, eagerJd)`) exactly as Rails
  // `apply_join_dependency` folds it into `joins_values` — one shared
  // `AliasTracker` spans the manual joins AND the eager JD, and `walk` dedups a
  // coinciding association, so no parallel eager tracker is built.
  const eagerJd =
    allEagerSa.length > 0
      ? QueryMethodBangs.constructJoinDependency.call(rel as any, allEagerSa, Nodes.OuterJoin)
      : undefined;
  rel._applyJoinsToManager(manager, eagerJd);
  rel._applyWheresToManager(manager, table);
  applyFromToManager(rel, manager);

  const colType = resolveColType(rel, column);
  const [rawSql, managerBinds] = compileManagerWithBinds(rel, manager);
  const [withCtes, ctedBinds] = prependCtes(rel, rawSql, managerBinds);
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel) ? wrapBigintAgg(withCtes) : withCtes;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const result = await rel._conn().selectAll(sql, `${rel._modelClass.name} ${opName}`, ctedBinds);
  const rows = result.toArray();
  const val = rows[0]?.val;
  if (val === undefined || val === null) {
    return fn === "sum" ? castAggValue(null, fn, colType, coerceNumeric) : null;
  }
  return castAggValue(val, fn, colType, coerceNumeric);
}

async function groupedAggregate(
  rel: CalculationRelation,
  fn: AggFn,
  column: string | Nodes.Node,
  coerceNumeric: boolean = true,
): Promise<Record<string, unknown> | Map<unknown, unknown>> {
  rel._checkEagerLoadable();
  const table = rel._modelClass.arelTable;
  const groupCol = rel._groupColumns[0];
  // Rails: a single group field that reflects to a belongs_to association
  // groups by the association's foreign key, then maps the result keys back to
  // the loaded associated records (calculations.rb:execute_grouped_calculation).
  const association = resolveGroupAssociation(rel, groupCol);
  if (association && Array.isArray(association.foreignKey)) {
    return groupedCompositeAssoc(rel, association, fn, column, coerceNumeric);
  }
  const effectiveGroupCol = association ? (association.foreignKey as string) : groupCol;
  // Mirror Rails `execute_grouped_calculation`, which resolves group fields via
  // the plural `arel_columns` — so a `from(subquery, alias)` leaves the group
  // column unqualified (matching the subquery alias) instead of pinning it to
  // the original model table, and a raw Arel node passes straight through.
  const groupNode = arelColumns.call(rel as never, [effectiveGroupCol])[0] as Nodes.Node;
  const aggNode = buildAggNode(rel, fn, column, rel._isDistinct);
  const groupKeyAlias = new Nodes.As(groupNode, new Nodes.SqlLiteral("group_key"));
  // Rails aliases the aggregate as `column_alias_for("#{operation} #{column_name}")`
  // — e.g. `sum_credit_limit`, `count_all` — so order("sum_credit_limit desc")
  // can reference it (calculations.rb:537). A raw Arel node keeps "val".
  const aggAlias =
    typeof column === "string"
      ? columnAliasFor(`${fn} ${column.toLowerCase()}`.replace(/\*/g, "all"))
      : "val";
  const manager = table.project(groupKeyAlias, aggNode.as(aggAlias));
  // Rails `calculate` (calculations.rb:217-238) folds the eager JoinDependency
  // into `joins_values` via `apply_join_dependency` before dispatching to the
  // grouped/simple calculation. Fold it into the shared `build_joins` port so
  // the eager JD and any manual joins share ONE `AliasTracker` and dedup via
  // `walk`.
  const allEagerGa = collectEagerSpecs(rel);
  const eagerJdGa =
    allEagerGa.length > 0
      ? QueryMethodBangs.constructJoinDependency.call(rel as any, allEagerGa, Nodes.OuterJoin)
      : undefined;
  rel._applyJoinsToManager(manager, eagerJdGa);
  rel._applyWheresToManager(manager, table);
  applyFromToManager(rel, manager);
  manager.group(groupNode);
  // Rails `execute_grouped_calculation` runs `select_all` on the relation's own
  // arel, which retains order_values — without the ORDER BY, LIMIT/OFFSET pick
  // arbitrary groups on PG/MySQL.
  rel._applyOrderToManager(manager, table);

  if (rel._limitValue !== null) manager.take(rel._limitValue);
  if (rel._offsetValue !== null) manager.skip(rel._offsetValue);

  const colType = resolveColType(rel, column);
  const [rawSql, managerBinds] = compileManagerWithBinds(rel, manager);
  const [withCtes, ctedBinds] = prependCtes(rel, rawSql, managerBinds);
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? wrapBigintAgg(withCtes, true, aggAlias)
      : withCtes;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel
    ._conn()
    .selectAll(sql, `${rel._modelClass.name} ${opName}`, ctedBinds);
  const rows = queryResult.toArray();

  const aggOf = (val: unknown): unknown =>
    val === undefined || val === null
      ? fn === "sum"
        ? castAggValue(null, fn, colType, coerceNumeric)
        : null
      : castAggValue(val, fn, colType, coerceNumeric);

  if (association) {
    // Rails keys the result hash by the associated record objects, looked up by
    // foreign-key value. JS Map keys compare by reference, so callers locate a
    // key by its `id` rather than by holding the same instance.
    const klass = association.klass.baseClass ?? association.klass;
    const ids = rows.map((row) => row.group_key).filter((v) => v != null);
    const records: any[] =
      ids.length > 0 ? await klass.where({ [klass.primaryKey]: ids }).toArray() : [];
    const byId = new Map(records.map((r) => [String(r.id), r]));
    const result = new Map<unknown, unknown>();
    for (const row of rows) {
      result.set(byId.get(String(row.group_key)) ?? null, aggOf(row[aggAlias]));
    }
    return result;
  }

  // Rails keys the result by the group column's deserialized value
  // (execute_grouped_calculation → type_cast_calculated_value on the key), so a
  // boolean column yields true/false keys rather than the raw driver 1/0.
  const keyType = pluckCastTypeForKnownColumn(rel, effectiveGroupCol) as {
    deserialize?(v: unknown): unknown;
  } | null;
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const raw = row.group_key;
    const key =
      raw == null
        ? "null"
        : String(typeof keyType?.deserialize === "function" ? keyType.deserialize(raw) : raw);
    result[key] = aggOf(row[aggAlias]);
  }
  return result;
}

/**
 * Resolve a single grouped field to its belongs_to reflection, or null. Mirrors
 * Rails' `model._reflect_on_association(field).belongs_to?` guard — only
 * belongs_to associations are grouped by foreign key and keyed by record.
 */
function resolveGroupAssociation(rel: CalculationRelation, groupCol: string): any {
  if (rel._groupColumns.length !== 1 || typeof groupCol !== "string") return null;
  const reflection = (rel._modelClass as any)._reflectOnAssociation?.(groupCol);
  if (!reflection || !reflection.belongsTo?.()) return null;
  // Rails (calculations.rb:521) does `group_fields = Array(association.foreign_key)`
  // and builds a multi-column GROUP BY for a composite-key belongs_to, keyed by
  // the loaded record. A composite FK (string[]) is handled by
  // `groupedCompositeAssoc`; a single-column FK by the caller's main path.
  return reflection;
}

/**
 * Grouped calculation keyed by a composite-key belongs_to association. Mirrors
 * Rails' `execute_grouped_calculation` (calculations.rb): GROUP BY every foreign
 * key column, then map each group's key tuple back to the loaded associated
 * record via the target's composite primary key. JS Map keys compare by
 * reference, so callers locate a key record by its component values, not by
 * holding the same instance.
 */
async function groupedCompositeAssoc(
  rel: CalculationRelation,
  association: any,
  fn: AggFn,
  column: string | Nodes.Node,
  coerceNumeric: boolean,
): Promise<Map<unknown, unknown>> {
  const table = rel._modelClass.arelTable;
  const fkCols = association.foreignKey as string[];
  const aliases = fkCols.map((_, i) => `group_key_${i}`);
  const groupNodes = fkCols.map((c) => groupColumnToArel(c, table));
  const aggNode = buildAggNode(rel, fn, column, rel._isDistinct);
  const projections = groupNodes.map((n, i) => new Nodes.As(n, new Nodes.SqlLiteral(aliases[i])));
  const manager = table.project(...projections, aggNode.as("val"));
  // Rails `calculate` (calculations.rb:217-238) folds the eager JoinDependency
  // into `joins_values` via `apply_join_dependency` before dispatching to the
  // grouped calculation, regardless of key arity. Fold it into the shared
  // `build_joins` port so the eager JD and any manual joins share ONE
  // `AliasTracker` and dedup via `walk`, mirroring `singleAggregate`/
  // `groupedAggregate`.
  const allEagerCa = collectEagerSpecs(rel);
  const eagerJdCa =
    allEagerCa.length > 0
      ? QueryMethodBangs.constructJoinDependency.call(rel as any, allEagerCa, Nodes.OuterJoin)
      : undefined;
  rel._applyJoinsToManager(manager, eagerJdCa);
  rel._applyWheresToManager(manager, table);
  applyFromToManager(rel, manager);
  for (const n of groupNodes) manager.group(n);

  if (rel._limitValue !== null) manager.take(rel._limitValue);
  if (rel._offsetValue !== null) manager.skip(rel._offsetValue);

  const colType = resolveColType(rel, column);
  const [rawSql, managerBinds] = compileManagerWithBinds(rel, manager);
  const [withCtes, ctedBinds] = prependCtes(rel, rawSql, managerBinds);
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? `SELECT ${aliases.map((a) => `"${a}"`).join(", ")}, CAST("val" AS TEXT) AS "val" FROM (${withCtes}) AS "_bigint_agg"`
      : withCtes;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel
    ._conn()
    .selectAll(sql, `${rel._modelClass.name} ${opName}`, ctedBinds);
  const rows = queryResult.toArray();

  const aggOf = (val: unknown): unknown =>
    val === undefined || val === null
      ? fn === "sum"
        ? castAggValue(null, fn, colType, coerceNumeric)
        : null
      : castAggValue(val, fn, colType, coerceNumeric);

  const klass = association.klass.baseClass ?? association.klass;
  const pk = (Array.isArray(klass.primaryKey) ? klass.primaryKey : [klass.primaryKey]) as string[];
  // NUL-join so string-valued key components cannot collide across the tuple
  // boundary (e.g. ["a b","c"] vs ["a","b c"]).
  const keyOf = (vals: unknown[]): string => vals.map((v) => String(v)).join("\u0000");
  const tuples = rows
    .map((row) => aliases.map((a) => row[a]))
    .filter((vals) => vals.every((v) => v != null));
  const records: any[] = tuples.length > 0 ? await klass.where(pk, tuples).toArray() : [];
  // The composite-PK `id` accessor returns an array, so key the lookup map by
  // the raw per-column attribute values to match the SQL group-key tuple.
  const byKey = new Map(records.map((r) => [keyOf(pk.map((k) => r._readAttribute(k))), r]));

  const result = new Map<unknown, unknown>();
  for (const row of rows) {
    const vals = aliases.map((a) => row[a]);
    const record = vals.every((v) => v != null) ? (byKey.get(keyOf(vals)) ?? null) : null;
    result.set(record, aggOf(row.val));
  }
  return result;
}

/**
 * True when a calculation yields its empty value without issuing a query.
 *
 * `none()` (`_isNone`) always short-circuits — Rails' `NullRelation#calculate`
 * returns `0`/`nil` (or `{}` when grouped) for every operation. A contradictory
 * where-clause (`where(col: [])`, which compiles to an empty `IN`) only
 * short-circuits the SIMPLE calculation: Rails checks `where_clause.contradiction?`
 * in `execute_simple_calculation` and returns `ActiveRecord::Result.empty`, but
 * `execute_grouped_calculation` has no such guard — a grouped contradiction still
 * runs the query (zero rows → `{}`). So the contradiction branch is gated on the
 * relation being ungrouped.
 */
function isEmptyCalculationScope(rel: CalculationRelation): boolean {
  // `_isEmptyRelation()` is the shared none-short-circuit chokepoint: on an
  // AssociationRelation it first rebases a stale new-owner `1=0` seed onto the
  // live association scope, so count/sum/average/minimum/maximum on a relation
  // spawned off a new owner pick up the persisted FK after `save`.
  if (rel._isEmptyRelation()) return true;
  return rel._groupColumns.length === 0 && rel._whereClause.isContradiction();
}

export async function performCount(
  this: CalculationRelation,
  column?: string | Nodes.Node,
): Promise<number | Record<string, number> | Map<unknown, number>> {
  if (this._limitValue === 0) return 0;
  // Safe to test contradiction here: every calc method is wrapped by
  // `inQueryConnection`, which awaits `_materializeDeferredDistinctPkPredicates()`
  // before invoking this perform fn — so a deferred distinct-PK marker that
  // resolves to an empty id set is already an empty `IN` (contradiction) by now,
  // same as pluck/exists which materialize inside their own inner functions.
  if (isEmptyCalculationScope(this)) return this._groupColumns.length > 0 ? {} : 0;

  // Mirrors calculations.rb:231: `calculate`'s has_include? check precedes the
  // group dispatch. When eager-loading with a group, Rails' `calculate`
  // (calculations.rb:217-238) applies the eager join then dispatches to the
  // grouped calculation — groupedAggregate has no hasInclude guard.
  if (this._groupColumns.length > 0 && hasInclude(this, column ?? null)) {
    // CPK + grouped eagerLoad not yet supported; fall through to plain groupedAggregate.
    if (!Array.isArray(this._modelClass.primaryKey)) {
      const pk = this._modelClass.primaryKey;
      // Mirror `calculate` (calculations.rb:217-238): apply the eager join then
      // dispatch to the grouped calculation. The eager associations stay on the
      // relation so `groupedAggregate` folds them through the shared
      // `build_joins` port (ONE `AliasTracker`) rather than pre-resolving them
      // with a parallel tracker. Only set distinct when the relation isn't
      // already distinct (calculations.rb:233-236).
      const joinedRel = (this._isDistinct ? this : (this as any).distinct()) as CalculationRelation;
      // count("*") → pk: COUNT(DISTINCT *) is invalid SQL.
      return groupedAggregate(
        joinedRel,
        "count",
        column != null && column !== "*" ? column : pk,
        true,
      ) as Promise<Record<string, number> | Map<unknown, number>>;
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
    const allEager = collectEagerSpecs(this);
    if (allEager.length > 0) {
      const pk = this._modelClass.primaryKey;
      if (!Array.isArray(pk)) {
        // Fold the eager JoinDependency into the shared `build_joins` port
        // (`_applyJoinsToManager(manager, eagerJd)`) as Rails
        // `apply_join_dependency` folds it into `joins_values`. One shared
        // `AliasTracker` spans the manual joins AND the eager JD, so an eager
        // association coinciding with an explicit join re-aliases at emit-time
        // (`comments_people_2`) via `walk` rather than colliding — no bespoke
        // table-name skip filter, no parallel tracker. A fresh JD per manager:
        // `joinConstraints` aliases nodes in place, so the id and count queries
        // cannot share one instance.
        const makeEagerJd = (): JoinDependency =>
          QueryMethodBangs.constructJoinDependency.call(anyRel, allEager, Nodes.OuterJoin);
        const table = this._modelClass.arelTable;
        if (this._limitValue !== null || this._offsetValue !== null) {
          // Rails finder_methods.rb apply_join_dependency: with a limit/offset on an
          // eager-loaded count, Rails does NOT nest the limit inside the count. It first
          // runs `limited_ids_for` — a standalone `SELECT DISTINCT pk ... LIMIT/OFFSET`
          // query — to materialize the actual id values, then re-counts over a relation
          // filtered by `pk IN (<literal ids>)` with the limit/offset removed
          // (`relation.except(:limit, :offset).where!(primary_key => limited_ids)`).
          // Running the id query separately (literal `IN`, not a nested subquery) honors
          // any requested aggregate column AND avoids MariaDB's "doesn't yet support
          // 'LIMIT & IN/ALL/ANY/SOME subquery'" restriction.
          const idSubquery = table.project(table.get(pk));
          idSubquery.distinct();
          this._applyJoinsToManager(idSubquery, makeEagerJd());
          this._applyWheresToManager(idSubquery, table);
          // Mirror Rails `distinct_relation_for_primary_key`
          // (schema_statements.rb:1429-1452): the limited id subquery retains
          // the relation's `order_values` so the LIMIT/OFFSET selects a
          // deterministic, Rails-ordered top-n set of primary keys before the
          // re-count — otherwise an arbitrary limited id set can diverge.
          this._applyOrderToManager(idSubquery, table);
          // Rails builds the DISTINCT select via `columns_for_distinct(pk,
          // order_values)`: PG/MySQL reject `SELECT DISTINCT id ... ORDER BY
          // <non-selected>`, so those adapters prepend the (aliased) order
          // expressions to the select list. Re-project through the adapter hook
          // so the ordered id fetch is valid cross-adapter (sqlite's base hook
          // returns the pk unchanged). The pk column keeps its name, so the
          // by-name `row[pk]` extraction below still finds it.
          const pkColumn = `${this._conn().quoteTableName(table.name)}.${this._conn().quoteColumnName(pk)}`;
          const distinctSelect = this._conn().columnsForDistinct(pkColumn, idSubquery.orders);
          idSubquery.projections = (
            Array.isArray(distinctSelect) ? distinctSelect : [distinctSelect]
          ).map((s) => new Nodes.SqlLiteral(s));
          applyFromToManager(this, idSubquery);
          if (this._limitValue !== null) idSubquery.take(this._limitValue);
          if (this._offsetValue !== null) idSubquery.skip(this._offsetValue);
          const [idSql, idBinds] = compileManagerWithBinds(this, idSubquery);
          const [idWithCtes, idCtedBinds] = prependCtes(this, idSql, [...idBinds]);
          const idResult = await this._conn().selectAll(
            idWithCtes,
            `${this._modelClass.name} Ids`,
            idCtedBinds,
          );
          const limitedIds = idResult.toArray().map((row) => row[pk]);
          // `pk IN ()` is invalid SQL — Rails' `where!(primary_key => [])` short-circuits
          // to a no-match relation, so the count is 0.
          if (limitedIds.length === 0) return 0;

          const colForCount = column != null && column !== "*" ? column : pk;
          const countManager = table.project(
            (aggregateColumn(this, colForCount) as any).count(true).as("count"),
          );
          this._applyJoinsToManager(countManager, makeEagerJd());
          // Rails `where!(pk => limited_ids)` adds the id filter to the relation that
          // STILL carries the original where + from, only nulling limit/offset. Re-apply
          // them so a collection-level predicate (e.g. `comments.body = 'x'`) keeps
          // constraining the count, not just the id set.
          this._applyWheresToManager(countManager, table);
          applyFromToManager(this, countManager);
          countManager.where(table.get(pk).in(limitedIds));
          const [countSql, countBinds] = compileManagerWithBinds(this, countManager);
          const [withCtes, ctedBinds] = prependCtes(this, countSql, [...countBinds]);
          const limitedResult = await this._conn().selectAll(
            withCtes,
            `${this._modelClass.name} Count`,
            ctedBinds,
          );
          const limitedRows = limitedResult.toArray();
          return Number(limitedRows[0]?.count ?? 0);
        }
        // Mirrors Rails recursive calculate() on the JD relation: COUNT(DISTINCT requested_col).
        // count("*") routes through JD and uses PK — COUNT(DISTINCT *) is invalid.
        const colForCount = column != null && column !== "*" ? column : pk;
        const manager = table.project(
          (aggregateColumn(this, colForCount) as any).count(true).as("count"),
        );
        this._applyJoinsToManager(manager, makeEagerJd());
        this._applyWheresToManager(manager, table);
        applyFromToManager(this, manager);
        const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
        const [withCtes, ctedBinds] = prependCtes(this, rawSql, managerBinds);
        const result = await this._conn().selectAll(
          withCtes,
          `${this._modelClass.name} Count`,
          ctedBinds,
        );
        const rows = result.toArray();
        return Number(rows[0]?.count ?? 0);
      } else {
        // Composite-PK eager count. Rails `calculate` (calculations.rb:231-238)
        // sets `select_values = Array(model.primary_key)` and recurses with
        // `distinct!`, counting over the multi-column PK. `COUNT(DISTINCT c1,
        // c2)` isn't valid SQL on SQLite/PG, so a specific requested column is
        // counted distinctly inline while `count(*)` wraps a DISTINCT-pk-columns
        // subquery (mirroring the non-eager composite path). The eager JD folds
        // through the shared `build_joins` port so one `AliasTracker` spans the
        // manual joins AND the eager JD.
        const makeEagerJd = (): JoinDependency =>
          QueryMethodBangs.constructJoinDependency.call(anyRel, allEager, Nodes.OuterJoin);
        const table = this._modelClass.arelTable;
        if (column != null && column !== "*") {
          if (this._limitValue !== null || this._offsetValue !== null) {
            // Rails `apply_join_dependency` (finder_methods.rb:463-478) routes an
            // eager collection join + limit/offset through
            // `distinct_relation_for_primary_key` (schema_statements.rb:1429-1452):
            // materialize the limited DISTINCT pk TUPLES first (bounding which
            // ROWS participate, joined+ordered), then re-count over
            // `WHERE pk IN (tuples)` with the limit/offset cleared. So the limit
            // constrains rows, and `COUNT(DISTINCT column)` runs across only those
            // rows — NOT a `DISTINCT column ... LIMIT n` value list, which would
            // truncate distinct values instead of rows.
            const idSubquery = table.project(...pk.map((c: string) => table.get(c)));
            idSubquery.distinct();
            this._applyJoinsToManager(idSubquery, makeEagerJd());
            this._applyWheresToManager(idSubquery, table);
            this._applyOrderToManager(idSubquery, table);
            // Rails `distinct_relation_for_primary_key` builds the DISTINCT
            // select via `columns_for_distinct(primary_key_columns,
            // order_values)`: PG/MySQL reject `SELECT DISTINCT id ... ORDER BY
            // <non-selected>`, so those adapters prepend the (aliased) order
            // expressions to the select list. Re-project through the adapter
            // hook so the ordered composite-pk id fetch is valid cross-adapter
            // (sqlite's base hook returns the pk columns unchanged). The pk
            // columns keep their names, so the by-name `row[c]` tuple
            // extraction below still finds them.
            const pkColumns = pk.map(
              (c: string) =>
                `${this._conn().quoteTableName(table.name)}.${this._conn().quoteColumnName(c)}`,
            );
            const distinctSelect = this._conn().columnsForDistinct(pkColumns, idSubquery.orders);
            idSubquery.projections = (
              Array.isArray(distinctSelect) ? distinctSelect : [distinctSelect]
            ).map((s) => new Nodes.SqlLiteral(s));
            applyFromToManager(this, idSubquery);
            if (this._limitValue !== null) idSubquery.take(this._limitValue);
            if (this._offsetValue !== null) idSubquery.skip(this._offsetValue);
            const [idSql, idBinds] = compileManagerWithBinds(this, idSubquery);
            const [idWithCtes, idCtedBinds] = prependCtes(this, idSql, [...idBinds]);
            const idResult = await this._conn().selectAll(
              idWithCtes,
              `${this._modelClass.name} Ids`,
              idCtedBinds,
            );
            const tuples = idResult.toArray().map((row) => pk.map((c) => row[c]));
            // `pk IN ()` is invalid SQL — an empty limited set is a no-match → 0.
            if (tuples.length === 0) return 0;

            const countManager = table.project(
              (aggregateColumn(this, column) as any).count(true).as("count"),
            );
            this._applyJoinsToManager(countManager, makeEagerJd());
            this._applyWheresToManager(countManager, table);
            applyFromToManager(this, countManager);
            // Rails `distinct_relation_for_primary_key` restricts via
            // `where!(pk.zip(limited_ids.transpose).to_h)` — a per-column `IN`
            // (`author_id IN (...) AND id IN (...)`), not a tuple `IN`.
            pk.forEach((c: string, i: number) => {
              countManager.where(table.get(c).in(tuples.map((t) => t[i])));
            });
            const [countSql, countBinds] = compileManagerWithBinds(this, countManager);
            const [withCtes, ctedBinds] = prependCtes(this, countSql, [...countBinds]);
            const result = await this._conn().selectAll(
              withCtes,
              `${this._modelClass.name} Count`,
              ctedBinds,
            );
            return Number(result.toArray()[0]?.count ?? 0);
          }
          const manager = table.project(
            (aggregateColumn(this, column) as any).count(true).as("count"),
          );
          this._applyJoinsToManager(manager, makeEagerJd());
          this._applyWheresToManager(manager, table);
          applyFromToManager(this, manager);
          const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
          const [withCtes, ctedBinds] = prependCtes(this, rawSql, managerBinds);
          const result = await this._conn().selectAll(
            withCtes,
            `${this._modelClass.name} Count`,
            ctedBinds,
          );
          return Number(result.toArray()[0]?.count ?? 0);
        }
        const innerManager = table.project(...pk.map((c: string) => table.get(c)));
        innerManager.distinct();
        this._applyJoinsToManager(innerManager, makeEagerJd());
        this._applyWheresToManager(innerManager, table);
        applyFromToManager(this, innerManager);
        if (this._limitValue !== null) innerManager.take(this._limitValue);
        if (this._offsetValue !== null) innerManager.skip(this._offsetValue);
        const [innerSql, allInnerBinds] = compileManagerWithBinds(this, innerManager);
        const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
        const outerManager = table.project(countAll.as("count"));
        outerManager.from(new Nodes.SqlLiteral(`(${innerSql}) AS subquery`));
        const [outerSql, outerBinds] = compileManagerWithBinds(this, outerManager);
        const [withCtes, ctedBinds] = prependCtes(this, outerSql, [
          ...allInnerBinds,
          ...outerBinds,
        ]);
        const result = await this._conn().selectAll(
          withCtes,
          `${this._modelClass.name} Count`,
          ctedBinds,
        );
        return Number(result.toArray()[0]?.count ?? 0);
      }
    }
  }

  // Use the relation's table — the model's arel_table unless the relation was
  // built on a table alias — so COUNT's FROM/WHERE match the alias the predicate
  // builder qualified the conditions with. `Table#project` seeds a SelectManager
  // FROM the table; a table ALIAS (Nodes.TableAlias) is a bare AST node without
  // that helper, so seed the manager directly via `new SelectManager(node)`.
  const baseTable = this._modelClass.arelTable;
  const table = (this as unknown as { table?: typeof baseTable }).table ?? baseTable;
  const project = (...projections: unknown[]): SelectManager => {
    if (table instanceof Table) return table.project(...(projections as never[]));
    const m = new SelectManager(table as never);
    m.project(...(projections as never[]));
    return m;
  };

  if (this._limitValue !== null || this._offsetValue !== null) {
    // Rails: build_count_subquery — wraps the limited relation as a subquery
    // and counts its rows without instantiating records.
    // Mirrors: ActiveRecord::Calculations#build_count_subquery
    const innerTable = table;
    let innerManager: SelectManager;
    // columnAlias: what the outer COUNT targets. Mirrors Rails:
    //   column_name == :all → Arel.star   (outer: COUNT(*))
    //   else                → "count_column" (outer: COUNT(count_column))
    const rawEffectiveCol = column === "*" ? undefined : column;
    // Inherit select-value column when no explicit column is provided (same logic
    // as the non-limit path below — mirrors Rails execute_simple_calculation).
    const selectColsLimited = (this as any)._selectColumns as unknown[] | null | undefined;
    const singleSelectColLimited =
      !rawEffectiveCol &&
      selectColsLimited?.length === 1 &&
      selectColsLimited[0] instanceof Nodes.Node
        ? selectColsLimited[0]
        : null;
    const effectiveCol = rawEffectiveCol ?? singleSelectColLimited ?? undefined;
    let columnAlias: Nodes.Node;
    // Resolve effectiveCol: an Arel node is used as-is; a string goes through table.get.
    const resolveColNode = (
      col: string | Nodes.Node,
    ): Nodes.Node & { as(alias: string): unknown } =>
      (col instanceof Nodes.Node ? col : innerTable.get(col)) as Nodes.Node & {
        as(alias: string): unknown;
      };
    if (this._isDistinct && effectiveCol) {
      // DISTINCT + specific column: project that column aliased as count_column
      // with DISTINCT applied so the inner query counts distinct non-NULL values
      // of the requested column (matches COUNT(DISTINCT col) semantics).
      innerManager = project(resolveColNode(effectiveCol).as("count_column"));
      innerManager.distinct();
      columnAlias = new Nodes.SqlLiteral("count_column");
    } else if (this._isDistinct) {
      // DISTINCT + count(*): project PK with DISTINCT to deduplicate rows.
      // Use table.get(c) so PK refs are qualified (unambiguous with joins).
      const pk = (this._modelClass as any).primaryKey ?? "id";
      if (Array.isArray(pk)) {
        innerManager = project(...pk.map((c: string) => innerTable.get(c)));
      } else {
        innerManager = project(innerTable.get(pk));
      }
      innerManager.distinct();
      columnAlias = new Nodes.SqlLiteral("*");
    } else if (effectiveCol) {
      // Specific column requested: project it aliased as count_column so the
      // outer COUNT(count_column) excludes NULLs, matching non-limited semantics.
      const colNode = resolveColNode(effectiveCol);
      innerManager = project(colNode.as("count_column"));
      columnAlias = new Nodes.SqlLiteral("count_column");
    } else {
      innerManager = project(new Nodes.SqlLiteral("1 AS one"));
      columnAlias = new Nodes.SqlLiteral("*");
    }
    this._applyJoinsToManager(innerManager);
    this._applyWheresToManager(innerManager, innerTable);
    applyFromToManager(this, innerManager);
    if (this._limitValue !== null) innerManager.take(this._limitValue);
    if (this._offsetValue !== null) innerManager.skip(this._offsetValue);
    // Wrap inner query as Arel AST: Grouping (parens) + TableAlias.
    // Mirrors Rails: Arel::Nodes::TableAlias.new(Arel::Nodes::Grouping.new(inner), alias)
    const [innerSql, allInnerBinds] = compileManagerWithBinds(this, innerManager);
    const subqueryNode = new Nodes.TableAlias(
      new Nodes.Grouping(new Nodes.SqlLiteral(innerSql)),
      new Nodes.SqlLiteral("subquery_for_count", { retryable: true }),
    );
    const countNode = new Nodes.NamedFunction("COUNT", [columnAlias]);
    const outerManager = project(countNode.as("count"));
    outerManager.from(subqueryNode);
    // Rails' build_subquery strips optimizer hints from the inner relation
    // (except(:optimizer_hints)) and re-applies them to the outer COUNT
    // SelectManager — keeping the hint at the front of the emitted query.
    if (this._optimizerHints.length > 0) outerManager.optimizerHints(...this._optimizerHints);
    const [outerSql, outerBinds] = compileManagerWithBinds(this, outerManager);
    const [withCtes, ctedBinds] = prependCtes(this, outerSql, [...allInnerBinds, ...outerBinds]);
    const result = await this._conn().selectAll(
      withCtes,
      `${this._modelClass.name} Count`,
      ctedBinds,
    );
    const rows = result.toArray();
    return Number(rows[0]?.count ?? 0);
  }

  // `table` and `project` (alias-aware) were resolved above the limit/offset
  // branch so every count path shares them.
  // "all" is the JS analogue of Rails' :all symbol — aggregate_column maps both
  // it and "*" to Arel.star, i.e. COUNT(*) (calculations.rb:414-423).
  const effectiveColumn = column === "*" || column === "all" ? undefined : column;

  // Rails: when no explicit column, check if select_values has a single Arel attribute
  // and use it as the count column (mirrors calculations.rb#execute_simple_calculation).
  const selectColsNonLimited = (this as any)._selectColumns as unknown[] | null | undefined;
  const singleSelectColForCount =
    !effectiveColumn &&
    selectColsNonLimited?.length === 1 &&
    selectColsNonLimited[0] instanceof Nodes.Node
      ? selectColsNonLimited[0]
      : null;
  const resolvedColumn = effectiveColumn ?? singleSelectColForCount ?? undefined;

  if (resolvedColumn) {
    const countNode = (aggregateColumn(this, resolvedColumn) as any).count(this._isDistinct);
    const manager = project(countNode.as("count"));
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    applyFromToManager(this, manager);
    const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
    const [withCtes, ctedBinds] = prependCtes(this, rawSql, managerBinds);
    const result = await this._conn().selectAll(
      withCtes,
      `${this._modelClass.name} Count`,
      ctedBinds,
    );
    const rows = result.toArray();
    return Number(rows[0]?.count ?? 0);
  }

  if (this._isDistinct) {
    const pk = this._modelClass.primaryKey;
    if (Array.isArray(pk)) {
      // Multi-column DISTINCT COUNT requires a subquery since
      // COUNT(DISTINCT col1, col2) isn't valid on SQLite/PG
      const innerManager = project(...pk.map((c: string) => table.get(c)));
      innerManager.distinct();
      this._applyJoinsToManager(innerManager);
      this._applyWheresToManager(innerManager, table);
      applyFromToManager(this, innerManager);
      const [innerSqlWithFrom, allInnerBinds] = compileManagerWithBinds(this, innerManager);
      const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const outerManager = project(countAll.as("count"));
      outerManager.from(new Nodes.SqlLiteral(`(${innerSqlWithFrom}) AS subquery`));
      const [outerSql, outerBinds] = compileManagerWithBinds(this, outerManager);
      const [withCtes, ctedBinds] = prependCtes(this, outerSql, [...allInnerBinds, ...outerBinds]);
      const result = await this._conn().selectAll(
        withCtes,
        `${this._modelClass.name} Count`,
        ctedBinds,
      );
      const rows = result.toArray();
      return Number(rows[0]?.count ?? 0);
    }
    const countNode = table.get(pk).count(true);
    const manager = project(countNode.as("count"));
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    applyFromToManager(this, manager);
    const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
    const [withCtes, ctedBinds] = prependCtes(this, rawSql, managerBinds);
    const result = await this._conn().selectAll(
      withCtes,
      `${this._modelClass.name} Count`,
      ctedBinds,
    );
    const rows = result.toArray();
    return Number(rows[0]?.count ?? 0);
  }

  const countAll = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
  const manager = project(countAll.as("count"));
  this._applyJoinsToManager(manager);
  this._applyWheresToManager(manager, table);
  applyFromToManager(this, manager);
  const [rawSql, managerBinds] = compileManagerWithBinds(this, manager);
  const [withCtes, ctedBinds] = prependCtes(this, rawSql, managerBinds);
  const result = await this._conn().selectAll(
    withCtes,
    `${this._modelClass.name} Count`,
    ctedBinds,
  );
  const rows = result.toArray();
  return Number(rows[0]?.count ?? 0);
}

export async function performSum(
  this: CalculationRelation,
  column?: string | Nodes.Node,
): Promise<number | bigint | Record<string, number | bigint> | Map<unknown, number | bigint>> {
  if (isEmptyCalculationScope(this)) {
    if (this._groupColumns.length > 0) return {};
    return column && resolveColType(this, column) instanceof BigIntegerType ? 0n : 0;
  }
  if (!column) return 0;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "sum", column, true) as Promise<
      Record<string, number | bigint> | Map<unknown, number | bigint>
    >;
  }
  return ((await singleAggregate(this, "sum", column, true)) as number | bigint) ?? 0;
}

export async function performAverage(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Record<string, unknown> | Map<unknown, unknown>> {
  // Returns `unknown` (not just number) because non-numeric column types
  // — interval (Duration), money, time — route through the column type's
  // deserialize and yield a domain object. Rails' AVG return type is
  // similarly polymorphic (BigDecimal for integer/decimal, Duration for
  // interval, etc.). Numeric averages still narrow to JS number at the
  // call site.
  if (isEmptyCalculationScope(this)) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "average", column, true);
  }
  return singleAggregate(this, "average", column, true);
}

export async function performMinimum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Record<string, unknown> | Map<unknown, unknown>> {
  if (isEmptyCalculationScope(this)) return this._groupColumns.length > 0 ? {} : null;
  if (this._groupColumns.length > 0) {
    return groupedAggregate(this, "minimum", column, false);
  }
  return singleAggregate(this, "minimum", column, false);
}

export async function performMaximum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Record<string, unknown> | Map<unknown, unknown>> {
  if (isEmptyCalculationScope(this)) return this._groupColumns.length > 0 ? {} : null;
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
  count(
    column?: string | Nodes.Node,
  ): Promise<number | Record<string, number> | Map<unknown, number>>;
  sum(
    column?: string | Nodes.Node,
  ): Promise<number | bigint | Record<string, number | bigint> | Map<unknown, number | bigint>>;
  average(column: string | Nodes.Node): Promise<unknown | null | Record<string, unknown>>;
  minimum(column: string | Nodes.Node): Promise<unknown | null | Record<string, unknown>>;
  maximum(column: string | Nodes.Node): Promise<unknown | null | Record<string, unknown>>;
}

/**
 * Wrap a calculation method so its query runs inside `with_connection`; see
 * {@link withQueryConnection}. Releases the connection afterwards instead of
 * permanently leasing it via the deprecated `.connection` getter under
 * `permanent_connection_checkout = :deprecated | :disallowed`.
 */
function inQueryConnection<A extends unknown[], R>(
  fn: (this: CalculationRelation, ...args: A) => Promise<R>,
): (this: CalculationRelation, ...args: A) => Promise<R> {
  return function (this: CalculationRelation, ...args: A): Promise<R> {
    const modelClass = (this as { _modelClass?: unknown })._modelClass as typeof Base;
    return withQueryConnection(modelClass, async () => {
      // Resolve any deferred distinct-PK subquery markers to a literal id list
      // before the calculation compiles its where clause, so count/sum/avg/min/
      // max emit `pk IN (ids)` rather than the inline `IN (SELECT … LIMIT n)`
      // MySQL rejects (Rails materializes these at `.where()`-build time).
      await (
        this as { _materializeDeferredDistinctPkPredicates?(): Promise<void> }
      )._materializeDeferredDistinctPkPredicates?.();
      return fn.apply(this, args);
    });
  };
}

export const Calculations = {
  count: inQueryConnection(performCount),
  sum: inQueryConnection(performSum),
  average: inQueryConnection(performAverage),
  minimum: inQueryConnection(performMinimum),
  maximum: inQueryConnection(performMaximum),
} as const;

/**
 * Tracks column aliases during calculation queries to avoid
 * conflicts when multiple aggregates are computed.
 *
 * Mirrors: ActiveRecord::Calculations::ColumnAliasTracker
 */
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
export function aggregateColumn(
  rel: CalculationRelation,
  columnName: string | Nodes.Node,
): unknown {
  if (columnName instanceof Nodes.Node) return columnName;
  const table = rel._modelClass.arelTable;
  if (columnName === "*" || columnName === "1") {
    return table.sql ? table.sql(columnName) : columnName;
  }
  // Mirrors buildAggNode / Rails' aggregate_column → arel_column: a known column
  // qualifies onto the model's own table, a "table.column" string resolves
  // through the join dependencies onto the joined table, and the primary key
  // falls back to the base table (our test models omit the implicit PK from
  // columns_hash). Anything else passes through as raw SQL.
  const pk = rel._modelClass.primaryKey;
  const pks = Array.isArray(pk) ? pk : [pk];
  return arelColumn.call(rel as never, columnName, (field: string) =>
    pks.includes(field) ? table.get(field) : new Nodes.SqlLiteral(field),
  );
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
export function hasInclude(
  rel: CalculationRelation,
  columnName: string | Nodes.Node | null,
): boolean {
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
): Promise<Record<string, unknown> | Map<unknown, unknown>> {
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
      const type = castTypeFromKlass(node.baseKlass, name);
      if (type) return type;
    }
  }
  return null;
}

function castTypeFromKlass(klass: any, name: string): unknown {
  if (!klass) return null;
  const rawTypes: unknown =
    typeof klass.attributeTypes === "function" ? klass.attributeTypes() : klass.attributeTypes;
  if (!rawTypes) return null;
  return rawTypes instanceof Map ? rawTypes.get(name) : (rawTypes as Record<string, unknown>)[name];
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
  return sel
    .map((s: unknown) => {
      if (s instanceof Nodes.Node) {
        const visitor = rel._conn?.()?.visitor;
        return visitor ? visitor.compile(s) : String(s);
      }
      return String(s);
    })
    .join(", ");
}

/** @internal */
export function isBuildCountSubquery(
  operation: string,
  columnName: string,
  distinct: boolean,
): boolean {
  return operation === "count" && distinct && columnName !== "*";
}
