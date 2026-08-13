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
import { ArgumentError, BigIntegerType } from "@blazetrails/activemodel";
import { any, many, tryCall } from "@blazetrails/activesupport";
import type { AdapterName } from "../connection-adapters/abstract-adapter.js";
import type { Base } from "../base.js";
import { withQueryConnection } from "../connection-handling.js";
import { exceedsBindParamsLimit } from "../connection-adapters/abstract/database-limits.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { columnType, Result, type ColumnType } from "../result.js";
import { EnumType } from "../enum.js";
import { defaultValue } from "../type.js";
import { arelColumn, arelColumns, buildJoinDependencies } from "./query-methods.js";

/**
 * Mirrors: ActiveRecord::Calculations::ColumnAliasTracker
 * (calculations.rb:8-47).
 */
export class ColumnAliasTracker {
  private connection: AliasingConnection;
  private aliases: Map<string, number> = new Map();

  constructor(connection: AliasingConnection) {
    this.connection = connection;
  }

  aliasFor(field: string): string {
    const aliasedName = this.columnAliasFor(field);

    if ((this.aliases.get(aliasedName) ?? 0) === 0) {
      this.aliases.set(aliasedName, 1);
      return aliasedName;
    } else {
      const count = (this.aliases.get(aliasedName) ?? 0) + 1;
      this.aliases.set(aliasedName, count);
      return `${this.truncate(aliasedName)}_${count}`;
    }
  }

  /**
   * Converts the given field to the value that the database adapter returns as
   * a usable column name:
   *
   *   columnAliasFor("users.id")                 // => "users_id"
   *   columnAliasFor("sum(id)")                  // => "sum_id"
   *   columnAliasFor("count(distinct users.id)") // => "count_distinct_users_id"
   *   columnAliasFor("count(*)")                 // => "count_all"
   */
  private columnAliasFor(field: string): string {
    let columnAlias = field;
    columnAlias = columnAlias.replace(/\*/g, "all");
    columnAlias = columnAlias.replace(/\W+/g, " ");
    columnAlias = columnAlias.trim();
    columnAlias = columnAlias.replace(/ +/g, "_");
    return this.connection.tableAliasFor(columnAlias);
  }

  private truncate(name: string): string {
    return name.slice(0, this.connection.tableAliasLength() - 2);
  }
}

/** The connection surface {@link ColumnAliasTracker} needs. @internal */
interface AliasingConnection {
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
}

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
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
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
  model: CalculationRelation["_model"];
  /** Rails `delegate :primary_key, to: :model` (delegation.rb:106). */
  primaryKey: string | string[];
  _model: {
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
   * `_model.connection` keeps internal reads off the deprecated getter.
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
  /** Mirrors `Relation#distinct!` (query_methods.rb). */
  distinctBang(value?: boolean): unknown;
  /** Mirrors `Relation#unscope` (query_methods.rb). */
  unscope(...args: unknown[]): CalculationRelation;
  /** Mirrors `SpawnMethods#except` (spawn_methods.rb:59). */
  except(...skips: string[]): CalculationRelation;
  /** Mirrors `Relation#arel` (query_methods.rb:1594). */
  arel(): SelectManager;
  /** Mirrors `Relation#build_subquery` (query_methods.rb:1605). */
  buildSubquery(subqueryAlias: string, selectValue: unknown): SelectManager;
  /** Mirrors `Relation#spawn` (spawn_methods.rb:10). */
  spawn(): CalculationRelation;
  _groupColumns: string[];
  /** Mirrors `Relation#group_values`. */
  groupValues: string[];
  /** The `select_values` store — written by `calculate`'s has_include? arm. */
  _selectColumns: (string | symbol | Nodes.Node)[] | null;
  /**
   * Mirrors `Relation#order_values`; read by the count-column resolution and
   * cleared by `calculate`'s has_include? arm.
   */
  _orderClauses: Array<string | Nodes.Node>;
  _whereClause: { isContradiction(): boolean };
  /** Mirrors `Relation#having_clause`; grouped calculations ride the relation's own arel. */
  havingClause: { isEmpty(): boolean; ast: Nodes.Node };
  /** Mirrors `Relation#select_values`; folded into a grouped projection when HAVING is present. */
  selectValues: (string | symbol | Nodes.Node)[];
  _ctes: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  _applyJoinsToManager(manager: any): void;
  /** @internal Rails `apply_join_dependency`; see Relation. */
  applyJoinDependency(options?: { eagerLoading?: boolean }): CalculationRelation;
  /** @internal Awaitable `apply_join_dependency`; see Relation. */
  _applyJoinDependencyAsync<R>(run: (relation: CalculationRelation) => Promise<R>): Promise<R>;
  /** Mirrors `Relation#calculate`; `calculate` recurses through it. */
  calculate(operation: string, columnName?: string | Nodes.Node | number | null): Promise<unknown>;
  _applyWheresToManager(manager: any, table: any): void;
  _applyOrderToManager(manager: any): void;
  _buildFromNode(): Nodes.Node | string | undefined;
  _checkEagerLoadable(): void;
  toArray(): Promise<any[]>;
}

type AggFn = "count" | "sum" | "average" | "minimum" | "maximum";

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
function wrapBigintAgg(
  innerSql: string,
  groupAliases: string[] | null = null,
  aggAlias = "val",
): string {
  if (groupAliases) {
    const keys = groupAliases.map((a) => `"${a}"`).join(", ");
    return `SELECT ${keys}, CAST("${aggAlias}" AS TEXT) AS "${aggAlias}" FROM (${innerSql}) AS "_bigint_agg"`;
  }
  return `SELECT CAST("val" AS TEXT) AS "val" FROM (${innerSql}) AS "_bigint_agg"`;
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
  // Rails' non-prepared `to_sql_and_binds` branch (database_statements.rb:44):
  // the collector is a `SubstituteBinds`, so every value inlines and no binds
  // are sent — not just the over-limit case below.
  if (conn.preparedStatements === false) return [conn.toSql(manager), []];
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

function isBigintColumn(
  rel: CalculationRelation,
  fn: AggFn,
  column: string | Nodes.Node | number,
): boolean {
  if (fn === "count" || fn === "average" || column === "*") return false;
  if (column instanceof Nodes.Node) return false;
  const table = rel._model.arelTable as {
    typeForAttribute?(col: string): unknown;
  };
  return table.typeForAttribute?.(String(column)) instanceof BigIntegerType;
}

/**
 * Rails `calculate` obtains the eager-joined relation from
 * `apply_join_dependency` (calculations.rb:217-238) — the single place that
 * builds the eager JoinDependency out of `eager_load_values | includes_values`
 * and pushes it into `joins_values` (finder_methods.rb:457-461). Route every
 * eager calculation arm through it instead of constructing a JoinDependency
 * locally, so the `except(:includes, :eager_load, :preload)` clear and the
 * `using_limitable_reflections?` branch live in one place.
 *
 * `eagerLoading` mirrors Rails' `apply_join_dependency(eager_loading:
 * group_values.empty?)`: `false` on a grouped relation, and also on the
 * count arms that materialize the limited primary keys themselves below —
 * those implement `distinct_relation_for_primary_key` inline, so the
 * relation-level guard for that same case must not fire.
 * @internal
 */
function eagerJoinedRelation(rel: CalculationRelation, eagerLoading: boolean): CalculationRelation {
  return rel.applyJoinDependency({ eagerLoading });
}

/**
 * `execute_grouped_calculation`'s projection (calculations.rb:540-550): the
 * aggregate, then the relation's own `select_values` whenever the having clause
 * is non-empty — that is what makes an aliased select
 * (`select("MIN(x) AS min_x").having("min_x > 50")`) referencable from HAVING —
 * then the aliased group columns. Grouped only: `execute_simple_calculation`
 * REPLACES `select_values` with the lone aggregate (calculations.rb:484).
 * @internal
 */
function buildGroupedSelectValues(
  rel: CalculationRelation,
  selectValue: Nodes.Node,
  groupColumns: Nodes.Node[],
): (string | symbol | Nodes.Node)[] {
  const selectValues: Nodes.Node[] = [selectValue];
  if (!rel.havingClause.isEmpty()) {
    selectValues.push(
      ...(arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[]),
    );
  }
  selectValues.push(...groupColumns);
  return selectValues;
}

async function groupedAggregate(
  rel: CalculationRelation,
  fn: AggFn,
  column: string | Nodes.Node | number,
  distinct: boolean | null = rel._isDistinct,
): Promise<Map<unknown, unknown>> {
  rel._checkEagerLoadable();
  const table = rel._model.arelTable;
  // Rails `execute_grouped_calculation` (calculations.rb:515-522) keeps EVERY
  // group field, uniq'ing only when there is more than one. A belongs_to
  // reflection is attempted from a LONE field, which then expands to that
  // association's foreign key; the result is keyed by the loaded associated
  // records rather than by the raw key values.
  let groupFields: unknown[] = rel._groupColumns;
  if (groupFields.length > 1) groupFields = [...new Set(groupFields)];
  const association =
    groupFields.length === 1 ? resolveGroupAssociation(rel, groupFields[0]) : null;
  if (association && Array.isArray(association.foreignKey)) {
    return groupedCompositeAssoc(rel, association, fn, column);
  }
  if (association) groupFields = [association.foreignKey as string];
  // Mirror Rails `execute_grouped_calculation`, which resolves group fields via
  // the plural `arel_columns` — so a `from(subquery, alias)` leaves the group
  // column unqualified (matching the subquery alias) instead of pinning it to
  // the original model table, and a raw Arel node passes straight through.
  // calculations.rb:524: `relation = except(:group).distinct!(false)`, with the
  // eager JoinDependency already folded into joins_values by
  // `apply_join_dependency` (calculations.rb:232) — `eager_loading: false`,
  // since this arm only ever runs grouped.
  const relation = eagerJoinedRelation(rel, false)
    .except("group")
    .distinctBang(false) as CalculationRelation;
  const groupNodes = arelColumns.call(relation as never, groupFields) as Nodes.Node[];
  const columnAliasTracker = new ColumnAliasTracker(rel._conn());
  const aliases = groupNodes.map((field) =>
    columnAliasTracker.aliasFor(
      (field instanceof Nodes.Node
        ? (rel._conn().visitor?.compile(field) ?? String(field))
        : String(field)
      ).toLowerCase(),
    ),
  );
  const aggNode = operationOverAggregateColumn(
    aggregateColumn(relation, column),
    fn,
    distinct ?? false,
  ) as any;
  const groupKeyAliases = groupNodes.map(
    (n, i) => new Nodes.As(n, new Nodes.SqlLiteral(rel._conn().quoteColumnName(aliases[i]))),
  );
  const aggAlias = columnAliasTracker.aliasFor(
    `${fn} ${(column == null ? "" : String(column)).toLowerCase()}`,
  );
  const selectValues = buildGroupedSelectValues(
    rel,
    aggNode.as(rel._conn().quoteColumnName(aggAlias)),
    groupKeyAliases,
  );
  // calculations.rb:552: Rails assigns the `arel_columns`-RESOLVED fields, so a
  // `from(subquery)` group column stays unqualified instead of being re-pinned
  // to the model's table by `build_group`.
  relation._groupColumns = groupNodes as unknown as string[];
  relation._selectColumns = selectValues;

  // calculations.rb:580-583: the aggregate's cast type is the aggregate column's
  // own type caster, then a type discovered through the join dependencies, then
  // Type.default_value, with an EnumType unwrapped to its subtype.
  let type: unknown;
  if (fn !== "count") {
    type =
      typeCasterFor(aggregateColumn(rel, column)) ??
      lookupCastTypeFromJoinDependencies(rel, String(column)) ??
      defaultValue();
    if (type instanceof EnumType) type = type.subtypeType();
  }
  const [rawSql, binds] = compileManagerWithBinds(relation, relation.arel());
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? wrapBigintAgg(rawSql, aliases, aggAlias)
      : rawSql;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel._conn().selectAll(sql, `${rel.model.name} ${opName}`, binds);
  const rows = queryResult.toArray();

  // calculations.rb:591: every group's aggregate folds through the same
  // type_cast_calculated_value the ungrouped arm uses.
  const aggOf = (val: unknown): unknown => typeCastCalculatedValue(val ?? null, fn, type);

  if (association) {
    // Rails keys the result hash by the associated record objects, looked up by
    // foreign-key value. JS Map keys compare by reference, so callers locate a
    // key by its `id` rather than by holding the same instance.
    const klass = association.klass.baseClass ?? association.klass;
    const ids = rows.map((row) => row[aliases[0]]).filter((v) => v != null);
    const records: any[] =
      ids.length > 0 ? await klass.where({ [klass.primaryKey]: ids }).toArray() : [];
    const byId = new Map(records.map((r) => [String(r.id), r]));
    const result = new Map<unknown, unknown>();
    for (const row of rows) {
      result.set(byId.get(String(row[aliases[0]])) ?? null, aggOf(row[aggAlias]));
    }
    return result;
  }

  // Rails: `col_name.try(:type_caster) || type_for(col_name) { column_types.fetch(...) }`
  // (calculations.rb:567-570), resolved per group field — an Arel attribute group
  // field carries its own table's type caster, ahead of the model lookup and the
  // result's column types.
  const keyTypes = groupNodes.map((node, i) => {
    const fieldName = qualifiedGroupFieldForModel(rel, groupFields[i]);
    return ((node instanceof Nodes.Attribute ? node.typeCaster : null) ??
      (fieldName === null ? null : pluckCastTypeForKnownColumn(rel.model, fieldName)) ??
      queryResult.columnTypes?.[aliases[i]] ??
      null) as { deserialize?(v: unknown): unknown } | null;
  });
  const result = new Map<unknown, unknown>();
  for (const row of rows) {
    // Rails `key = group_aliases.map { ... }; key = key.first if key.size == 1`
    // (calculations.rb:583-584). JS arrays compare by reference as Map keys, so
    // callers locate a multi-field key by its component values, not identity.
    const key = aliases.map((alias, i) => {
      const raw = row[alias];
      const keyType = keyTypes[i];
      return raw == null
        ? null
        : typeof keyType?.deserialize === "function"
          ? keyType.deserialize(raw)
          : raw;
    });
    result.set(key.length === 1 ? key[0] : key, aggOf(row[aggAlias]));
  }
  return result;
}

/**
 * The model-attribute name a group field resolves its key type through, or null
 * when it must fall through to the result's column types. Mirrors Rails'
 * `col_name.try(:type_caster) || type_for(col_name)`: a field qualified to a
 * DIFFERENT table keeps that table's type (grouping Company by "accounts.status"
 * keys by accounts' strings, not Company's integer enum), while a bare or
 * self-qualified field resolves through the model by its last `.`-segment.
 */
function qualifiedGroupFieldForModel(rel: CalculationRelation, field: unknown): string | null {
  if (typeof field !== "string") return null;
  const dot = field.indexOf(".");
  if (dot === -1) return field;
  const [table, column] = [field.slice(0, dot), field.slice(dot + 1)];
  return table === (rel._model as { tableName?: string }).tableName ? column : null;
}

/**
 * Resolve a single grouped field to its belongs_to reflection, or null. Mirrors
 * Rails' `model._reflect_on_association(field).belongs_to?` guard — only
 * belongs_to associations are grouped by foreign key and keyed by record.
 */
function resolveGroupAssociation(rel: CalculationRelation, groupCol: unknown): any {
  if (typeof groupCol !== "string") return null;
  const reflection = (rel.model as any)._reflectOnAssociation?.(groupCol);
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
  column: string | Nodes.Node | number,
): Promise<Map<unknown, unknown>> {
  const table = rel._model.arelTable;
  const fkCols = association.foreignKey as string[];
  const groupNodes = fkCols.map((c) => groupColumnToArel(c, table));
  const columnAliasTracker = new ColumnAliasTracker(rel._conn());
  const aliases = groupNodes.map((field) =>
    columnAliasTracker.aliasFor(
      (field instanceof Nodes.Node
        ? (rel._conn().visitor?.compile(field) ?? String(field))
        : String(field)
      ).toLowerCase(),
    ),
  );
  // Rails `calculate` (calculations.rb:217-238) folds the eager JoinDependency
  // into `joins_values` via `apply_join_dependency` before dispatching to the
  // grouped calculation, regardless of key arity — mirroring `groupedAggregate`.
  const relation = eagerJoinedRelation(rel, false)
    .except("group")
    .distinctBang(false) as CalculationRelation;
  const aggNode = operationOverAggregateColumn(
    aggregateColumn(relation, column),
    fn,
    rel._isDistinct,
  ) as any;
  const projections = groupNodes.map(
    (n, i) => new Nodes.As(n, new Nodes.SqlLiteral(rel._conn().quoteColumnName(aliases[i]))),
  );
  const aggAlias = columnAliasTracker.aliasFor(
    `${fn} ${(column == null ? "" : String(column)).toLowerCase()}`,
  );
  relation._groupColumns = groupNodes as unknown as string[];
  relation._selectColumns = buildGroupedSelectValues(
    rel,
    aggNode.as(rel._conn().quoteColumnName(aggAlias)),
    projections,
  );

  // calculations.rb:580-583: the aggregate's cast type is the aggregate column's
  // own type caster, then a type discovered through the join dependencies, then
  // Type.default_value, with an EnumType unwrapped to its subtype.
  let type: unknown;
  if (fn !== "count") {
    type =
      typeCasterFor(aggregateColumn(rel, column)) ??
      lookupCastTypeFromJoinDependencies(rel, String(column)) ??
      defaultValue();
    if (type instanceof EnumType) type = type.subtypeType();
  }
  const [rawSql, binds] = compileManagerWithBinds(relation, relation.arel());
  const sql =
    isBigintColumn(rel, fn, column) && needsBigintCast(rel)
      ? wrapBigintAgg(rawSql, aliases, aggAlias)
      : rawSql;
  const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
  const queryResult = await rel._conn().selectAll(sql, `${rel.model.name} ${opName}`, binds);
  const rows = queryResult.toArray();

  // calculations.rb:591: every group's aggregate folds through the same
  // type_cast_calculated_value the ungrouped arm uses.
  const aggOf = (val: unknown): unknown => typeCastCalculatedValue(val ?? null, fn, type);

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
    result.set(record, aggOf(row[aggAlias]));
  }
  return result;
}

/**
 * Mirrors: ActiveRecord::Calculations#count (calculations.rb:94-104). Rails'
 * block form (`count { |r| ... }`) is `Enumerable#count` on the loaded
 * records; every other arm is `calculate(:count, column_name)`.
 */
export async function performCount(
  this: CalculationRelation,
  columnName?: string | Nodes.Node,
  ...rest: unknown[]
): Promise<number | Map<unknown, number>> {
  // Ruby's `def count(column_name = nil)` arity check; JS silently drops the
  // extra arguments, so the ArgumentError has to be raised explicitly.
  if (rest.length > 0) {
    throw new ArgumentError(`wrong number of arguments (given ${rest.length + 1}, expected 0..1)`);
  }
  return calculate.call(this, "count", columnName) as Promise<number | Map<unknown, number>>;
}

/**
 * Mirrors: ActiveRecord::Calculations#calculate (calculations.rb:217-246).
 */
export async function calculate(
  this: CalculationRelation,
  operation: string,
  columnName?: string | Nodes.Node | number | null,
): Promise<unknown> {
  operation = operation.toLowerCase();

  // Rails' `@none`. `_isEmptyRelation()` is the shared none-short-circuit
  // chokepoint: on an AssociationRelation it first rebases a stale new-owner
  // `1=0` seed onto the live association scope, so a calculation on a relation
  // spawned off a new owner picks up the persisted FK after `save`.
  if (this._isEmptyRelation()) {
    switch (operation) {
      case "count":
      case "sum":
        return any(this.groupValues) ? new Map() : 0;
      case "average":
      case "minimum":
      case "maximum":
        return any(this.groupValues) ? new Map() : null;
    }
  }

  if (hasInclude(this, columnName ?? null)) {
    // Rails takes `relation = apply_join_dependency`; a trails `Relation` is
    // thenable, so the joined relation is delivered to a block instead (the
    // block form `apply_join_dependency` also has).
    return this._applyJoinDependencyAsync((relation) => {
      if (operation === "count") {
        if (!this._isDistinct && !isDistinctSelect(this, columnName ?? selectForCount(this))) {
          relation.distinctBang();
          const primaryKey = this.model.primaryKey;
          relation._selectColumns =
            primaryKey == null
              ? [new Nodes.SqlLiteral("*")]
              : Array.isArray(primaryKey)
                ? [...primaryKey]
                : [primaryKey];
        }
        // PostgreSQL: ORDER BY expressions must appear in SELECT list when using DISTINCT
        if (this.groupValues.length === 0) relation._orderClauses = [];
      }

      return relation.calculate(operation, columnName);
    });
  } else {
    return performCalculation(this, operation, columnName ?? null);
  }
}

/**
 * Mirrors: ActiveRecord::Calculations#sum (calculations.rb:171-177).
 *
 * The identity default falls through `aggregate_column` -> `arel_column`, whose
 * `field.to_s` (query_methods.rb:1993) makes it the SQL literal summed over, so
 * the no-argument answer comes out of `calculate` rather than a guard. The
 * block arm (`map(&block).sum(initial_value_or_column)`, calculations.rb:172-173)
 * is tracked by the `port-relation-sum-block-arm` story.
 */
export async function performSum(
  this: CalculationRelation,
  initialValueOrColumn: string | Nodes.Node | number | null = 0,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  const sum = await calculate.call(this, "sum", initialValueOrColumn);
  if (this._groupColumns.length > 0) return sum as Map<unknown, number | bigint>;
  return (sum as number | bigint) ?? 0;
}

export async function performAverage(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  // Returns `unknown` (not just number) because non-numeric column types
  // — interval (Duration), money, time — route through the column type's
  // deserialize and yield a domain object. Rails' AVG return type is
  // similarly polymorphic (BigDecimal for integer/decimal, Duration for
  // interval, etc.). Numeric averages still narrow to JS number at the
  // call site.
  return calculate.call(this, "average", column);
}

export async function performMinimum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return calculate.call(this, "minimum", column);
}

export async function performMaximum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return calculate.call(this, "maximum", column);
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
  calculate(operation: "count", column?: string): Promise<number | Map<unknown, number>>;
  calculate(
    operation: "sum",
    column: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Map<unknown, unknown>>;
  calculate(operation: string, column?: string | Nodes.Node | number | null): Promise<unknown>;
  count(column?: string | Nodes.Node): Promise<number | Map<unknown, number>>;
  sum(
    initialValueOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
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
    const modelClass = (this as { _model?: unknown })._model as typeof Base;
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
  calculate: inQueryConnection(calculate),
  count: inQueryConnection(performCount),
  sum: inQueryConnection(performSum),
  average: inQueryConnection(performAverage),
  minimum: inQueryConnection(performMinimum),
  maximum: inQueryConnection(performMaximum),
} as const;

// ---------------------------------------------------------------------------
// Private helpers (mirrors Rails' ActiveRecord::Calculations private methods)
// ---------------------------------------------------------------------------

/** @internal */
export function aggregateColumn(
  rel: CalculationRelation,
  columnName: string | Nodes.Node | number | null,
): unknown {
  if (columnName instanceof Nodes.Node) return columnName;
  const table = rel._model.arelTable;
  // Ruby `when :all then Arel.star` (calculations.rb:418-419) — ":all" is
  // spelled "*"/"all" here. "1" is the count-subquery's literal projection.
  if (columnName === "*" || columnName === "all" || columnName === "1") {
    return new Nodes.SqlLiteral(columnName === "1" ? "1" : "*");
  }
  // Mirrors Rails' aggregate_column → arel_column: a known column
  // qualifies onto the model's own table, a "table.column" string resolves
  // through the join dependencies onto the joined table, and the primary key
  // falls back to the base table (our test models omit the implicit PK from
  // columns_hash). Anything else passes through as raw SQL.
  const pk = rel._model.primaryKey;
  const pks = Array.isArray(pk) ? pk : [pk];
  return arelColumn.call(rel as never, columnName, (field: string) =>
    pks.includes(field) ? table.get(field) : new Nodes.SqlLiteral(field),
  );
}

/** @internal */
export function isAllAttributes(rel: CalculationRelation, columnNames: string[]): boolean {
  const model = rel.model as any;
  const known = new Set<string>([
    ...(typeof model.attributeNames === "function" ? (model.attributeNames() as string[]) : []),
    ...Object.keys(model._attributeAliases ?? {}),
  ]);
  return columnNames.map(String).every((c) => known.has(c));
}

/** @internal */
export function hasInclude(
  rel: CalculationRelation,
  columnName: string | Nodes.Node | number | null,
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

/**
 * Narrows the resolved `column_name` to what `aggregate_column` accepts. Rails
 * hands its own resolved value straight through (calculations.rb:414-423), so a
 * composite `primary_key` reaches Arel as an array and emits broken SQL there
 * too; the join here picks one spelling for that already-degenerate case rather
 * than pretending trails supports it.
 * @internal
 */
function aggregateTarget(
  columnName: string | string[] | Nodes.Node | number | null,
): string | Nodes.Node | number {
  if (columnName == null) return "*";
  return Array.isArray(columnName) ? columnName.join(",") : columnName;
}

/** @internal */
export function performCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
): Promise<unknown> {
  operation = operation.toLowerCase();

  // Mirrors Rails `perform_calculation` (calculations.rb:434-458): resolve the
  // effective `distinct` flag and count column before dispatching. `:all` is
  // spelled "*"/"all" here (the JS analogue Rails' aggregate_column maps to
  // Arel.star — calculations.rb:414-423).
  let distinct: boolean | null = rel._isDistinct;
  if (operation === "count") {
    columnName ??= (rel as any).selectForCount();
    if (columnName === "*" || columnName === "all") {
      if (!distinct) {
        if (rel._groupColumns.length === 0)
          distinct = (rel as any).isDistinctSelect((rel as any).selectForCount());
      } else if (
        any(rel.groupValues) ||
        (rel.selectValues.length === 0 && rel._orderClauses.length === 0)
      ) {
        columnName = rel.primaryKey;
      }
    } else if ((rel as any).isDistinctSelect(columnName)) {
      distinct = null;
    }
  }

  if (any(rel.groupValues)) {
    return dispatchTarget(rel).executeGroupedCalculation(operation, columnName, distinct);
  }
  return dispatchTarget(rel).executeSimpleCalculation(operation, columnName, distinct);
}

// Rails' `perform_calculation` calls its two private siblings directly
// (calculations.rb:455-457). They are `private` on `Relation` too, and a TS
// `private` member cannot satisfy a public interface member, so the dispatch
// reaches them through this structural view rather than `any` — the column name
// keeps the type `perform_calculation` resolved it to.
function dispatchTarget(rel: CalculationRelation): {
  executeSimpleCalculation(
    operation: string,
    columnName: string | string[] | Nodes.Node | number | null,
    distinct: boolean | null,
  ): Promise<unknown>;
  executeGroupedCalculation(
    operation: string,
    columnName: string | string[] | Nodes.Node | number | null,
    distinct: boolean | null,
  ): Promise<unknown>;
} {
  return rel as never;
}

/** @internal */
export function isDistinctSelect(
  _rel: CalculationRelation,
  columnName: string | string[] | Nodes.Node | number,
): boolean {
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

/**
 * Mirrors: ActiveRecord::Calculations#build_count_subquery
 * (calculations.rb:662-678).
 *
 * @internal
 */
function buildCountSubquery(
  relation: CalculationRelation,
  columnName: string | Nodes.Node | number | null,
  distinct: boolean,
): SelectManager {
  const isAll = columnName == null || columnName === "*" || columnName === "all";
  let columnAlias: Nodes.Node;
  if (isAll) {
    columnAlias = new Nodes.SqlLiteral("*");
    if (!distinct) relation._selectColumns = [new Nodes.SqlLiteral("1 AS one")];
  } else {
    columnAlias = new Nodes.SqlLiteral("count_column");
    const column = aggregateColumn(relation, columnName) as Nodes.Node & {
      as(alias: string): Nodes.Node;
    };
    relation._selectColumns = [column.as("count_column")];
  }

  const subqueryAlias = "subquery_for_count";
  const selectValue = operationOverAggregateColumn(columnAlias, "count", false);

  return isAll
    ? relation.unscope("order").buildSubquery(subqueryAlias, selectValue)
    : relation.buildSubquery(subqueryAlias, selectValue);
}

/** @internal */
export async function executeSimpleCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
  distinct: boolean | null,
): Promise<unknown> {
  // DIVERGENCE (calculations.rb:469-511): each arm compiles to SQL + binds
  // instead of handing Rails' `query_builder` to `select_all` — the
  // count-subquery arm compiles its inner manager here (buildCountSubquery) and
  // the CTE prefix is applied to the compiled SQL.
  let sql: string;
  let binds: unknown[];
  let column: unknown = null;

  if (isBuildCountSubquery(rel, operation, columnName, distinct === true)) {
    // Shortcut when limit is zero (calculations.rb:471-472).
    if (rel._limitValue === 0) return 0;

    const queryBuilder = buildCountSubquery(
      rel.spawn(),
      columnName as string | Nodes.Node | null,
      distinct === true,
    );
    [sql, binds] = compileManagerWithBinds(rel, queryBuilder);
  } else {
    // Rails routes aggregates through apply_join_dependency when eager loading,
    // raising EagerLoadPolymorphicError for polymorphic specs (calculations.rb).
    rel._checkEagerLoadable();
    const joined = eagerJoinedRelation(rel, rel._groupColumns.length === 0);
    // PostgreSQL doesn't like ORDER BY when there are no GROUP BY
    // (calculations.rb:477-478).
    const relation = joined.unscope("order").distinctBang(false) as CalculationRelation;

    column = aggregateColumn(relation, aggregateTarget(columnName));
    const selectValue = operationOverAggregateColumn(
      column,
      operation,
      distinct === true,
    ) as Nodes.Node & { distinct: boolean; as(alias: string): Nodes.Node };
    if (operation === "sum" && distinct) selectValue.distinct = true;

    const target = aggregateTarget(columnName);
    const castsBigint =
      isBigintColumn(relation, operation.toLowerCase() as AggFn, target) &&
      needsBigintCast(relation);
    // Rails' `relation.select_values = [select_value]` (calculations.rb:484) —
    // `selectValues` is a reader in trails, so the assignment lands on its
    // store. DIVERGENCE: the "val" alias is the anchor the SQLite bigint CAST
    // wrapper reads back, so it is added only on that path.
    relation._selectColumns = [castsBigint ? selectValue.as("val") : selectValue];

    const [rawSql, managerBinds] = compileManagerWithBinds(relation, relation.arel());
    sql = castsBigint ? wrapBigintAgg(rawSql) : rawSql;
    binds = managerBinds;
  }

  // calculations.rb:487-497: a contradictory where clause (`where(col: [])`,
  // which compiles to an empty `IN`) yields `ActiveRecord::Result.empty` with no
  // query at all, and `type_cast_calculated_value` folds that empty result to
  // the operation's identity. Checked after the query builder is chosen, as
  // Rails does.
  const queryResult = rel._whereClause.isContradiction()
    ? Result.empty()
    : await (
        rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
      ).skipQueryCacheIfNecessary(() =>
        rel
          ._conn()
          .selectAll(
            sql,
            `${rel.model.name} ${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
            binds,
          ),
      );

  let type: unknown;
  if (operation !== "count") {
    type =
      typeCasterFor(column) ??
      lookupCastTypeFromJoinDependencies(rel, String(columnName ?? "")) ??
      defaultValue();
    if (type instanceof EnumType) type = type.subtypeType();
  }

  return typeCastCalculatedValue(queryResult.castValues()[0], operation, type);
}

/**
 * Ruby `column.try(:type_caster)` (calculations.rb:505). An Arel attribute
 * carries its relation's caster and a SqlLiteral does not, so `tryCall` covers
 * Rails' `try` — except that a join-built `Table` is constructed with no caster
 * (relation.ts:731) and `Table#typeForAttribute` would raise rather than answer
 * nil, so the caster is asked for only when the relation can type-cast.
 */
function typeCasterFor(column: unknown): unknown {
  const relation = (column as { relation?: { isAbleToTypeCast?(): boolean } } | null)?.relation;
  if (relation?.isAbleToTypeCast?.() !== true) return null;
  return tryCall(column as object, "typeCaster") ?? null;
}

/** @internal */
export async function executeGroupedCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
  distinct: boolean | null,
): Promise<Map<unknown, unknown>> {
  const fn = operation.toLowerCase() as AggFn;
  // DIVERGENCE (Rails calculations.rb:513-595): the grouped aggregate body —
  // group-field uniq'ing, the belongs_to reflection, the column-alias tracker
  // and the `association.klass.base_class.where(primary_key => key_ids)`
  // key-record lookup — lives in the shared `groupedAggregate` helper. The
  // resolved `distinct` is threaded into it so it reaches
  // `operation_over_aggregate_column` (calculations.rb:538).
  return groupedAggregate(rel, fn, aggregateTarget(columnName), distinct);
}

/** @internal */
export function typeFor(rel: CalculationRelation, field: string | Nodes.Node | number): unknown {
  const fieldName =
    field instanceof Nodes.Node
      ? String((field as unknown as { name?: string }).name ?? "")
      : (String(field).split(".").pop() ?? "");
  return rel.model.typeForAttribute?.(fieldName);
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
      const type = pluckCastTypeForKnownColumn(rel.model, name);
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
  const known = pluckCastTypeForKnownColumn(rel.model, name);
  if (known) return known;
  const joinType = lookupCastTypeFromJoinDependencies(rel, name) as ColumnType | null;
  if (joinType) return joinType;
  // Driver OID type (e.g. PostgreSQL) or identity fallback.
  return columnType(result, name, index, {});
}

/**
 * The cast type for a column the model owns: a serialized attribute's coder
 * (Rails wraps these in a Serialized type) or the declared attribute type.
 * Returns null when the model has no such attribute.
 */
function pluckCastTypeForKnownColumn(
  model: CalculationRelation["_model"],
  name: string,
): ColumnType | null {
  if (!model._attributeDefinitions?.has(name)) return null;
  const coder = model._serializedAttributes?.get(name);
  if (coder) return { deserialize: (value) => coder.load(value) };
  return model.typeForAttribute?.(name) ?? null;
}

/**
 * Mirrors: ActiveRecord::Calculations#type_cast_calculated_value
 * (calculations.rb:627-643).
 *
 *   - count   → `value.to_i`, a JS number. A SQL COUNT() above 2^53-1 loses
 *               precision (Rails returns an arbitrary-precision Integer).
 *   - sum     → `type.deserialize(value || 0)`; a big_integer column yields a
 *               bigint, every other type coerces to a JS number (a documented
 *               Rails-→JS limitation, since Rails returns BigDecimal here).
 *   - average → Rails maps :integer/:decimal to `value&.to_d` (BigDecimal);
 *               trails coerces those to a JS number and routes every other
 *               type — interval, time, money — through `type.deserialize` so
 *               callers get the domain object rather than the driver string.
 *   - else    → `type.deserialize(value)` for minimum/maximum: big_integer
 *               returns bigint, datetime a Temporal instant, and so on.
 *
 * @internal
 */
export function typeCastCalculatedValue(value: unknown, operation: string, type: unknown): unknown {
  switch (operation) {
    case "count":
      return Number(value ?? 0);
    case "sum":
      if (type instanceof BigIntegerType) return type.deserialize(value ?? 0) ?? 0n;
      return Number(value ?? 0);
    case "average": {
      if (value === null || value === undefined) return null;
      const typeName = (type as { type?(): string } | null)?.type?.();
      if (type != null && !isCoerceNumericTypeName(typeName)) {
        const ct = type as { deserialize?(v: unknown): unknown };
        if (typeof ct.deserialize === "function") return ct.deserialize(value);
      }
      return Number(value);
    }
    default: {
      if (value === null || value === undefined) return null;
      const ct = type as { deserialize?(v: unknown): unknown } | null;
      if (typeof ct?.deserialize === "function") return ct.deserialize(value);
      return value;
    }
  }
}

/** @internal */
export function selectForCount(rel: CalculationRelation): string {
  // "*" is the JS analogue of Rails' `:all` symbol (calculations.rb:646-654).
  if (rel.selectValues.length === 0) return "*";
  const visitor = rel._conn().visitor;
  return (arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[])
    .map((column) => (visitor ? visitor.compile(column) : String(column)))
    .join(", ");
}

/**
 * Mirrors: ActiveRecord::Calculations#build_count_subquery?
 * (calculations.rb:655-661) — SQLite and older MySQL cannot `COUNT DISTINCT`
 * over `*` or multiple columns, so those cases go through a subquery.
 *
 * @internal
 */
export function isBuildCountSubquery(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
  distinct: boolean,
): boolean {
  const isAll = columnName == null || columnName === "*" || columnName === "all";
  const selectValues = rel.selectValues ?? [];
  return (
    operation === "count" &&
    (((isAll || many(selectValues)) && distinct) ||
      rel._limitValue !== null ||
      rel._offsetValue !== null)
  );
}
