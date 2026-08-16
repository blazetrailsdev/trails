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
import { exceedsBindParamsLimit } from "../connection-adapters/abstract/database-limits.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { columnType, Result, type ColumnType } from "../result.js";
import { EnumType } from "../enum.js";
import { defaultValue } from "../type.js";
import {
  arelColumn,
  arelColumns,
  argumentError,
  buildJoinDependencies,
  eachJoinDependencies,
} from "./query-methods.js";

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
  /** Rails `select_all(arel, name, binds)` (database_statements.rb:69-71). */
  selectAll(
    arel: unknown,
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
    /** Mirrors `Model.load_schema` — `type_cast_pluck_values` needs attribute_types. */
    ensureSchemaLoaded(): Promise<void>;
    /** Rails `model.disallow_raw_sql!` (calculations.rb:313). */
    disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], options?: { permit?: RegExp }): void;
    /** Mirrors `Model.attribute_names` — stands in for `columns_hash.key?`. */
    attributeNames(): string[];
  };
  /**
   * The connection threaded by the enclosing `withConnection` wrap, else
   * the model's `.connection`. Mirrors `Relation#_conn`; reading it instead of
   * `_model.connection` keeps internal reads off the deprecated getter.
   * @internal
   */
  _conn(): CalculationConnection;
  /** Rails `delegate :with_connection, to: :model` (delegation.rb:106). */
  withConnection<R>(fn: (conn: CalculationConnection) => R | Promise<R>): Promise<R>;
  limitValue: number | null;
  offsetValue: number | null;
  optimizerHintsValues: string[];
  _isNone: boolean;
  /** @internal Rebase-then-report none short-circuit; see Relation. */
  _isEmptyRelation(): boolean;
  distinctValue: boolean;
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
  /** Rails `@values` (relation.rb:86) — the hash behind every value method. */
  _values: Record<string, unknown>;
  /** Mirrors `Relation#group_values`. */
  groupValues: string[];
  /**
   * Mirrors `Relation#order_values`; read by the count-column resolution and
   * cleared by `calculate`'s has_include? arm.
   */
  orderValues: Array<string | Nodes.Node>;
  whereClause: { isContradiction(): boolean };
  /** Mirrors `Relation#having_clause`; grouped calculations ride the relation's own arel. */
  havingClause: { isEmpty(): boolean; ast: Nodes.Node };
  /** Mirrors `Relation#select_values`; folded into a grouped projection when HAVING is present. */
  selectValues: (string | symbol | Nodes.Node)[];
  withValues: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  /** @internal Rails `apply_join_dependency`; see Relation. */
  applyJoinDependency(options?: { eagerLoading?: boolean }): CalculationRelation;
  /** @internal Awaitable `apply_join_dependency`; see Relation. */
  _applyJoinDependencyAsync<R>(run: (relation: CalculationRelation) => Promise<R>): Promise<R>;
  /** Mirrors `Relation#calculate`; `calculate` recurses through it. */
  calculate(operation: string, columnName?: string | Nodes.Node | number | null): Promise<unknown>;
  _checkEagerLoadable(): void;
  toArray(): Promise<any[]>;
  // --- read by pluck / pick / ids (calculations.rb:291-412) ---
  /** Mirrors `Relation#loaded?`. */
  loaded: boolean;
  /** Mirrors `Relation#@records`; the `loaded?` arm of `ids` reads it directly. */
  _records: Array<{ _readAttribute(name: string): unknown }>;
  /** Mirrors `Relation#records` (relation.rb:250). */
  records(): Promise<any[]>;
  /** Mirrors `Relation#table`. */
  table: Table;
  /** Mirrors `Relation#limit` (query_methods.rb:407). */
  limit(value: number | null): CalculationRelation;
  /** Mirrors `Relation#where` (query_methods.rb:668). */
  where(opts: unknown): CalculationRelation;
  /** Mirrors `Relation#group` (query_methods.rb:390). */
  group(...args: unknown[]): CalculationRelation;
  /** Mirrors `QueryMethods#left_outer_joins` (query_methods.rb:341). */
  leftOuterJoins(...args: unknown[]): CalculationRelation;
  /** Mirrors `Calculations#pluck` — the recursive arms re-enter through the prototype. */
  pluck(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]>;
  /** Mirrors `Calculations#pick`. */
  pick(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown>;
  /** Mirrors `Calculations#ids` — the has_include? arm recurses through the prototype. */
  ids(): Promise<unknown[]>;
  /** Mirrors `Calculations#count` / `#sum` / `#average` / `#minimum` / `#maximum`. */
  count(columnName?: string | Nodes.Node): Promise<number | Map<unknown, number>>;
  sum(
    initialValueOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  /** Mirrors `Relation#arel_columns` (query_methods.rb:1735). */
  arelColumns(columns: unknown[]): unknown[];
  /** Mirrors `Relation#flattened_args` (relation.rb). */
  flattenedArgs(args: unknown[]): unknown[];
  /** Mirrors `Relation#skip_query_cache_if_necessary` (relation.rb:1000). */
  skipQueryCacheIfNecessary<R>(fn: () => Promise<R>): Promise<R>;
  /** @internal trails: resolves deferred distinct-PK markers; see Relation. */
  _materializeDeferredDistinctPkPredicates(): Promise<void>;
  /** @internal trails: the eager-load spec stores backing `has_include?`. */
  eagerLoadValues: unknown[];
  includesValues: unknown[];
  /** @internal trails: `spawn` without the scoping re-application; see Relation. */
  _clone(): CalculationRelation;
  /** @internal trails: builds the JoinDependency `apply_join_dependency` would. */
  _buildEagerJoinDependency(specs: unknown[]): JoinDependency;
  /** Mirrors `Relation#limit_or_offset?`. */
  hasLimitOrOffset: boolean;
  /** @internal trails: `using_limitable_reflections?` (finder_methods.rb:475). */
  _eagerJoinDependencyIsLimitable(jd: JoinDependency): boolean;
  /** @internal trails: `distinct_relation_for_primary_key`'s executed half. */
  _materializeLimitedIds(jd: JoinDependency, primaryKey: string | string[]): Promise<unknown[]>;
  /** @internal Rails `build_arel` (query_methods.rb:1750). */
  toArel(aliases?: unknown): SelectManager;
}

type AggFn = "count" | "sum" | "average" | "minimum" | "maximum";

/** The `&block` of `Calculations#sum` (calculations.rb:172): one record in, a summable out. */
export type SumBlock = (record: any) => number | bigint;

/**
 * Mirror of Ruby's `TypeError`, as `attribute-assignment.ts` and `cache/store.ts`
 * carry it — what `Array#sum` raises when its initial value cannot be added to
 * the block results.
 */
class TypeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
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
  column: string | Nodes.Node | number | null,
): boolean {
  if (fn === "count" || fn === "average" || column == null || column === "*") return false;
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
 * Mirrors: ActiveRecord::Calculations#execute_grouped_calculation
 * (calculations.rb:514-593)
 * @internal
 */
export async function executeGroupedCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
  distinct: boolean | null,
): Promise<Map<unknown, unknown>> {
  const fn = operation.toLowerCase() as AggFn;
  const column = aggregateTarget(columnName);
  rel._checkEagerLoadable();
  // Rails `execute_grouped_calculation` (calculations.rb:515-522) keeps EVERY
  // group field, uniq'ing only when there is more than one. A belongs_to
  // reflection is attempted from a LONE field, which then expands to that
  // association's foreign key; the result is keyed by the loaded associated
  // records rather than by the raw key values.
  let groupFields: unknown[] = rel.groupValues;
  // `uniq` — spelled as a filter rather than `new Set(...)` so the body's first
  // constructor call stays `ColumnAliasTracker.new` (calculations.rb:528), as it
  // is in Rails.
  if (groupFields.length > 1) groupFields = groupFields.filter((f, i, all) => all.indexOf(f) === i);
  const association =
    groupFields.length === 1 ? resolveGroupAssociation(rel, groupFields[0]) : null;
  // calculations.rb:521 — `Array(association.foreign_key)` expands a
  // composite-key belongs_to to every FK column; the rest of the body carries
  // whatever arity that produces.
  if (association) {
    groupFields = Array.isArray(association.foreignKey)
      ? [...(association.foreignKey as string[])]
      : [association.foreignKey as string];
  }
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
  // calculations.rb:541-551: the aggregate, then the relation's own
  // `select_values` whenever the having clause is non-empty — that is what makes
  // an aliased select (`select("MIN(x) AS min_x").having("min_x > 50")`)
  // referencable from HAVING — then the aliased group columns. Grouped only:
  // `execute_simple_calculation` REPLACES `select_values` with the lone
  // aggregate (calculations.rb:484).
  const selectValues: Nodes.Node[] = [aggNode.as(rel._conn().quoteColumnName(aggAlias))];
  if (!rel.havingClause.isEmpty()) {
    selectValues.push(
      ...(arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[]),
    );
  }
  selectValues.push(...groupKeyAliases);
  // calculations.rb:552: Rails assigns the `arel_columns`-RESOLVED fields, so a
  // `from(subquery)` group column stays unqualified instead of being re-pinned
  // to the model's table by `build_group`.
  relation.groupValues = groupNodes as unknown as string[];
  relation.selectValues = selectValues as (string | Nodes.Node)[];

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
  // calculations.rb:521: the grouped SELECT runs inside
  // skip_query_cache_if_necessary, so `uncached`/`skip_query_cache!` relations
  // bypass the query cache exactly as the simple arm does.
  const queryResult = await (
    rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
  ).skipQueryCacheIfNecessary(() =>
    // calculations.rb:527/556 — `model.with_connection { |connection|
    // connection.select_all(...) }`.
    rel.withConnection((connection) =>
      connection.selectAll(sql, `${rel.model.name} ${opName}`, binds),
    ),
  );
  const rows = queryResult.toArray();

  // calculations.rb:591: every group's aggregate folds through the same
  // type_cast_calculated_value the ungrouped arm uses.
  const aggOf = (val: unknown): unknown => typeCastCalculatedValue(val ?? null, fn, type);

  if (association) {
    // Rails keys the result hash by the associated record objects, looked up by
    // foreign-key value. JS Map keys compare by reference, so callers locate a
    // key by its `id` rather than by holding the same instance.
    const klass = association.klass.baseClass ?? association.klass;
    const primaryKey = (
      Array.isArray(klass.primaryKey) ? klass.primaryKey : [klass.primaryKey]
    ) as string[];
    // NUL-join so string-valued key components cannot collide across the tuple
    // boundary (e.g. ["a b","c"] vs ["a","b c"]).
    const keyOf = (vals: unknown[]): string => vals.map((v) => String(v)).join("\u0000");
    const keyIds = rows
      .map((row) => aliases.map((a) => row[a]))
      .filter((vals) => vals.every((v) => v != null));
    // `where(cols, tuples)` is the trails spelling of the Array-key hash Rails
    // passes here (calculations.rb:562-563), one-column key included
    // (predicate_builder.rb:87-90).
    const keyRecords: any[] = await klass.where(primaryKey, keyIds).toArray();
    // The composite-PK `id` accessor returns an array, so key the lookup map by
    // the raw per-column attribute values to match the SQL group-key tuple.
    const byKey = new Map(
      keyRecords.map((r) => [keyOf(primaryKey.map((k) => r._readAttribute(k))), r]),
    );
    const result = new Map<unknown, unknown>();
    for (const row of rows) {
      const vals = aliases.map((a) => row[a]);
      const record = vals.every((v) => v != null) ? (byKey.get(keyOf(vals)) ?? null) : null;
      result.set(record, aggOf(row[aggAlias]));
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
  return reflection;
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
 * Mirrors: ActiveRecord::Calculations#async_count (calculations.rb:108).
 */
export function asyncCount(
  this: CalculationRelation,
  columnName?: string,
): Promise<number | Map<unknown, number>> {
  return this.count(columnName);
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

/**
 * Mirrors: ActiveRecord::Calculations#async_average (calculations.rb:122).
 */
export function asyncAverage(
  this: CalculationRelation,
  columnName: string,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.average(columnName);
}

export async function performMinimum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return calculate.call(this, "minimum", column);
}

/**
 * Mirrors: ActiveRecord::Calculations#async_minimum (calculations.rb:137).
 */
export function asyncMinimum(
  this: CalculationRelation,
  columnName: string,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.minimum(columnName);
}

export async function performMaximum(
  this: CalculationRelation,
  column: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return calculate.call(this, "maximum", column);
}

/**
 * Mirrors: ActiveRecord::Calculations#async_maximum (calculations.rb:152).
 */
export function asyncMaximum(
  this: CalculationRelation,
  columnName: string,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.maximum(columnName);
}

/**
 * Mirrors: ActiveRecord::Calculations#sum (calculations.rb:171-177).
 *
 * The identity default falls through `aggregate_column` -> `arel_column`, whose
 * `field.to_s` (query_methods.rb:1993) makes it the SQL literal summed over, so
 * the no-argument answer comes out of `calculate` rather than a guard.
 *
 * The block arm is `map(&block).sum(initial_value_or_column)`
 * (calculations.rb:172-173): `Enumerable#map` loads the relation — a no-op when
 * it is already loaded — and `Array#sum` seeds the accumulation with the
 * initial value. Ruby's trailing `&block` has no TS slot, so it rides the
 * argument list: a function in the first position is the block with the default
 * identity, and `sum(1000, block)` is the explicit-initial-value form.
 */
/**
 * Ruby's `Integer#+` across the numeric tower, which is what `Array#sum` folds
 * with: an Integer and a Bignum add exactly, and a Float operand takes the sum
 * to Float. JS has no tower — `0 + 1n` is a TypeError — so a `bigint` operand
 * pulls a whole-number partner up to `bigint`, and a fractional `number` pulls
 * both down to `number`, which is where Ruby's Float arm lands too.
 *
 * A non-numeric memo is the seed of a `sum(column) { … }` call, and Ruby raises
 * it here rather than up front — from `String#+`, at the FIRST addition, so
 * `[].sum("age")` still answers `"age"` and only `[1].sum("age")` raises. The
 * `rails-error-parity` rule keys on the constructor name, so it flags this
 * throw whether the class is the global `TypeError` or the ported mirror above;
 * `attribute-assignment.ts` and `cache/store.ts` carry the same suppression for
 * the same reason.
 */
function sumAdd(memo: number | bigint, value: number | bigint): number | bigint {
  if (typeof memo !== "number" && typeof memo !== "bigint") {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError(
      `no implicit conversion of ${
        typeof value === "bigint" || Number.isInteger(value) ? "Integer" : "Float"
      } into ${typeof memo === "string" ? "String" : (memo as object).constructor.name}`,
    );
  }
  if (typeof memo === typeof value) {
    return typeof memo === "bigint" ? memo + (value as bigint) : memo + (value as number);
  }
  const [n, b] = typeof memo === "bigint" ? [value as number, memo] : [memo, value];
  if (!Number.isInteger(n)) return n + Number(b);
  return BigInt(n) + (b as bigint);
}

export async function performSum(
  this: CalculationRelation,
  initialValueOrColumn: string | Nodes.Node | number | null | SumBlock = 0,
  block?: SumBlock,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  if (typeof initialValueOrColumn === "function") {
    block = initialValueOrColumn;
    initialValueOrColumn = 0;
  }
  if (block !== undefined) {
    const records = await this.toArray();
    return records.map(block).reduce(sumAdd, initialValueOrColumn as number | bigint);
  }
  const sum = await calculate.call(this, "sum", initialValueOrColumn);
  if (this.groupValues.length > 0) return sum as Map<unknown, number | bigint>;
  return (sum as number | bigint) ?? 0;
}

/**
 * Mirrors: ActiveRecord::Calculations#async_sum (calculations.rb:182).
 */
export function asyncSum(
  this: CalculationRelation,
  identityOrColumn: string | Nodes.Node | number | null = null,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  return this.sum(identityOrColumn);
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
    return this._applyJoinDependencyAsync(async (relation) => {
      if (operation === "count") {
        if (
          !this.distinctValue &&
          !isDistinctSelect(this, columnName ?? (await selectForCount(this)))
        ) {
          relation.distinctBang();
          const primaryKey = this.model.primaryKey;
          relation.selectValues =
            primaryKey == null
              ? [new Nodes.SqlLiteral("*")]
              : Array.isArray(primaryKey)
                ? [...primaryKey]
                : [primaryKey];
        }
        // PostgreSQL: ORDER BY expressions must appear in SELECT list when using DISTINCT
        if (this.groupValues.length === 0) relation.orderValues = [];
      }

      return relation.calculate(operation, columnName);
    });
  } else {
    return performCalculation(this, operation, columnName ?? null);
  }
}

/**
 * Pluck values for columns.
 *
 * Mirrors: ActiveRecord::Calculations#pluck (calculations.rb:291).
 */
export async function pluck(
  this: CalculationRelation,
  ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
): Promise<unknown[]> {
  // `pick` routes through `limit(1).pluck(...)`, so it inherits this rebase.
  if (this._isEmptyRelation()) return [];

  // calculations.rb:300 — a loaded relation whose plucked columns are all
  // attributes reads the materialized records instead of issuing SQL, the same
  // arm `pick` carries (:353).
  if (this.loaded && isAllAttributes(this, columns as unknown as string[])) {
    const records = await this.records();
    return records.map((record) =>
      columns.length > 1
        ? columns.map((column) => record.get(String(column)))
        : record.get(String(columns[0])),
    );
  }

  return this.withConnection(async () => {
    // Resolve any deferred distinct-PK subquery markers to a literal id list
    // before compiling, so pluck (like Rails) emits `pk IN (ids)` rather than
    // the inline `IN (SELECT … LIMIT n)` MySQL rejects.
    await this._materializeDeferredDistinctPkPredicates();
    // Mirrors Calculations#pluck: a contradictory where-clause (`where(col: [])`,
    // an empty `IN`) returns `ActiveRecord::Result.empty` without issuing SQL.
    // Checked after materialization so a deferred distinct-PK
    // predicate that resolves to an empty id set also short-circuits.
    if (this.whereClause.isContradiction()) {
      return typeCastPluckValues(Result.empty(), columns, this as any);
    }
    // Mirrors Calculations#pluck: when has_include? is true, apply_join_dependency
    // converts the includes/eager_load associations to LEFT OUTER JOINs (clearing
    // the eager values) and recurses, so the plucked columns can reference the
    // joined tables. Rails builds the JoinDependency over `eager_load_values |
    // includes_values` (finder_methods.rb:457); we model that with leftOuterJoins
    // over the cleared specs below. The cleared recursion takes the plain (else)
    // branch, so there is no infinite loop. For a limit/offset over a collection
    // reflection we also materialize the limited DISTINCT primary keys
    // (distinct_relation_for_primary_key) before recursing.
    const firstColumnName =
      columns.length === 0 ? null : typeof columns[0] === "string" ? columns[0] : "\0arel";
    if (hasInclude(this as any, firstColumnName)) {
      // hasInclude is true only when eagerLoadValues or
      // includesValues is non-empty, so the union is always non-empty here.
      const eagerSpecs = [...new Set([...this.eagerLoadValues, ...this.includesValues])];
      const rel = this._clone();
      rel.eagerLoadValues = [];
      rel.includesValues = [];

      const basePk = (this._model as any).primaryKey ?? "id";
      const jd = this._buildEagerJoinDependency(eagerSpecs);

      if (this.hasLimitOrOffset && !this._eagerJoinDependencyIsLimitable(jd)) {
        // A composite base PK can't be materialized here — `_materializeLimitedIds`
        // (Rails' zip/transpose over `Array(primary_key)`) has no composite
        // support, so it would emit a wrong single-column `"col1,col2"` predicate.
        // Surface the same explicit NotImplementedError the cache_version path
        // raises for this shape (tracked by
        // 0023-surfaced-deviations/converge-composite-pk-distinct-relation-materialization).
        if (Array.isArray(basePk)) this.applyJoinDependency();
        // Rails apply_join_dependency, for a limit/offset over a collection
        // reflection, replaces the relation via distinct_relation_for_primary_key
        // (finder_methods.rb:463): execute a query to materialize the limited
        // DISTINCT primary keys, rewrite as `WHERE pk IN (ids)`, and clear
        // limit/offset. Limiting the joined rows directly would be wrong under
        // fan-out (it limits associated rows, not parents).
        const limitedIds = await this._materializeLimitedIds(jd, basePk);
        const limited = rel.leftOuterJoins(eagerSpecs).where({
          [basePk]: limitedIds,
        });
        limited.limitValue = null;
        limited.offsetValue = null;
        return limited.pluck(...columns);
      }
      return rel.leftOuterJoins(eagerSpecs).pluck(...columns);
    }

    // Reflect the schema before casting results so the model's attribute
    // types are available — Rails' type_cast_pluck_values reads
    // model.attribute_types, which runs load_schema first. pluck issues a
    // raw query (no toArray()), so it must trigger the load itself.
    await this._model.ensureSchemaLoaded();

    this._model.disallowRawSqlBang(this.flattenedArgs(columns) as (string | symbol | Nodes.Node)[]);

    const table = this.table;
    // Rails columns_hash.key? — qualify a bare known column to the base table.
    const knownColumns = new Set(this._model.attributeNames());
    const isKnownColumn = (name: string): boolean => knownColumns.has(name);
    const projections = columns.map((c) => {
      if (c instanceof Nodes.SqlLiteral) {
        // Rails' Arel::Nodes::SqlLiteral subclasses String, so arel_columns routes
        // it through arel_column: a bare known-column literal is qualified to the
        // base table (e.g. "id" → "posts"."id"), which keeps pluck unambiguous once
        // apply_join_dependency adds a LEFT OUTER JOIN. Complex or unknown literals
        // (functions, dotted names, non-columns) pass through verbatim.
        const v = c.value.trim();
        return /^\w+$/.test(v) && isKnownColumn(v) ? table.get(v) : c;
      }
      if (typeof c !== "string") return c;
      // Table-qualified ("table.col"), quoted ('"table"."col"'), function expressions,
      // or comma-separated lists must pass through as raw SQL.
      // Comma-separated lists are not allowed in a single pluck argument —
      // each column must be passed as a separate argument for correct result mapping.
      if (hasTopLevelComma(c)) {
        throw argumentError(
          `pluck does not allow comma-separated column lists in a single argument. ` +
            `Pass each column as a separate argument: pluck("col1", "col2")`,
        );
      }
      const isComplex =
        c.includes(".") ||
        c.includes("(") ||
        c.includes('"') ||
        c.includes("`") ||
        c.includes("::") ||
        /\s+AS\s+/i.test(c);
      if (isComplex) return new Nodes.SqlLiteral(c);
      // Mirrors Rails arel_column: only a column in the base model's
      // columns_hash is qualified to the base table. A bare column absent
      // from columns_hash stays unqualified so the database resolves it
      // against a joined table (test_pluck_not_auto_table_name_prefix_if_column_*).
      return isKnownColumn(c) ? table.get(c) : new Nodes.SqlLiteral(c);
    });
    // Rails' pluck spawns, sets select_values = columns, then executes the full
    // relation arel (calculations.rb), so build the same manager as a normal
    // read — joins/wheres/order/group/having/from/lock/optimizer-hints thread
    // through identically — but with the pluck columns as the select. Clearing
    // the spawn's select before building is essential: resolving the discarded
    // select list would mutate referencesValues and could promote includes
    // (adding joins Rails would not add for the pluck columns).
    const rel = this._clone();
    delete rel._values.select;
    // calculations.rb:315-316 — `relation.select_values = columns; relation.arel`.
    // Going through `select_values` (rather than overwriting `manager.projections`)
    // is what makes a zero-column `pluck` project `table[Arel.star]` via
    // `build_select`'s else arm instead of emitting a projection-less `SELECT FROM`.
    rel.selectValues = projections as any;
    const manager = rel.toArel();

    // Rails: `select_all(relation.arel, "#{model.name} Pluck")` (calculations.rb:317).
    const result = await this.skipQueryCacheIfNecessary(() =>
      this._conn().selectAll(manager, `${this.model.name} Pluck`),
    );

    // Type-cast results positionally through each result column's type
    // (model attribute type → join dependency → driver OID → identity),
    // mirroring Rails' Calculations#type_cast_pluck_values.
    return typeCastPluckValues(result, columns, this as any);
  });
}

/**
 * Mirrors: ActiveRecord::Calculations#async_pluck (calculations.rb:334).
 */
export function asyncPluck(
  this: CalculationRelation,
  ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
): Promise<unknown[]> {
  return this.pluck(...columns);
}

/**
 * Pick values for columns from the first matching record.
 *
 * Mirrors: ActiveRecord::Calculations#pick (calculations.rb:352).
 */
export async function pick(
  this: CalculationRelation,
  ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
): Promise<unknown> {
  if (this.loaded && isAllAttributes(this, columnNames as unknown as string[])) {
    const records = await this.records();
    if (records.length === 0) return null;
    const first = records[0] as unknown as { get(attrName: string): unknown };
    return columnNames.length > 1
      ? columnNames.map((columnName) => first.get(String(columnName)))
      : first.get(String(columnNames[0]));
  }

  const values = await this.limit(1).pluck(...columnNames);
  return values[0] ?? null;
}

/**
 * Mirrors: ActiveRecord::Calculations#async_pick (calculations.rb:363).
 */
export function asyncPick(
  this: CalculationRelation,
  ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
): Promise<unknown> {
  return this.pick(...columnNames);
}

/**
 * Pluck the primary key values.
 *
 * Mirrors: ActiveRecord::Calculations#ids (calculations.rb:371).
 */
export async function ids(this: CalculationRelation): Promise<unknown[]> {
  const pk = this.model.primaryKey as string | string[] | null;
  const primaryKeyArray = Array.isArray(pk) ? pk : pk == null ? [] : [pk];

  if (this.loaded) {
    const result = this._records.map((record) => {
      if (primaryKeyArray.length === 1) {
        return record._readAttribute(primaryKeyArray[0]);
      }
      return primaryKeyArray.map((column) => record._readAttribute(column));
    });
    return result;
  }

  if (hasInclude(this as any, pk as string)) {
    // DIVERGENCE (finder_methods.rb:457-463): trails' `applyJoinDependency`
    // no-ops unless the relation already eager-loads for SQL, so the plain
    // `apply_join_dependency` call would not terminate this recursion. Spell
    // it as `pluck` does — clear the eager values, LEFT OUTER JOIN
    // `eager_load_values | includes_values`, and materialize the limited
    // DISTINCT primary keys (`distinct_relation_for_primary_key`, :463) that
    // a synchronous applyJoinDependency cannot execute.
    // Deduped without a `Set`: the `new` Rails records for `ids` is
    // `Promise::Complete.new` in the `loaded?` arm (calculations.rb:382),
    // which trails models with the native async surface, so a `new Set` here
    // would be the body's first constructor and land after `hasInclude`.
    // Measured, not assumed: spelling it `[...new Set([...])]` adds a
    // `relation.ts ids order:hasInclude,constructor` row to
    // `pnpm parity:api:calls`. `pluck`'s arm keeps its `Set` because its body
    // is compared through the `_pluckInner` helper union, not directly.
    const eagerSpecs = [...this.eagerLoadValues, ...this.includesValues].filter(
      (spec, i, all) => all.indexOf(spec) === i,
    );
    const rel = this._clone();
    rel.eagerLoadValues = [];
    rel.includesValues = [];

    const jd = this._buildEagerJoinDependency(eagerSpecs);
    if (this.hasLimitOrOffset && !this._eagerJoinDependencyIsLimitable(jd)) {
      // Same two guards `pluck`'s arm carries: `hasInclude` returns true off
      // `eagerLoadValues` alone, so `pk` can still be null here (a
      // view), and `_materializeLimitedIds` — Rails' zip/transpose over
      // `Array(primary_key)` (schema_statements.rb:1448) — has neither a null
      // nor a composite arm, so the composite case surfaces
      // applyJoinDependency's explicit NotImplementedError instead.
      const basePk = pk ?? "id";
      if (Array.isArray(basePk)) this.applyJoinDependency();
      const limitedIds = await this._materializeLimitedIds(jd, basePk);
      const limited = rel.leftOuterJoins(eagerSpecs).where({ [basePk as string]: limitedIds });
      limited.limitValue = null;
      limited.offsetValue = null;
      return limited.group(...primaryKeyArray).ids();
    }
    const relation = rel.leftOuterJoins(eagerSpecs).group(...primaryKeyArray);
    return relation.ids();
  }

  const columns = this.arelColumns(primaryKeyArray);
  const relation = this.spawn();
  relation.selectValues = columns as (string | Nodes.Node)[];

  const result = relation.whereClause.isContradiction()
    ? Result.empty()
    : await this.skipQueryCacheIfNecessary(() =>
        this.withConnection(async (c) => {
          // trails preliminaries the Rails body has no counterpart for,
          // carried over from the delegation this replaces:
          // `type_cast_pluck_values` reads `model.attribute_types`, and a
          // deferred distinct-PK marker must resolve to a literal id list
          // before the arel compiles.
          await this._model.ensureSchemaLoaded();
          await relation._materializeDeferredDistinctPkPredicates();
          const manager = relation.arel();
          return c.selectAll(manager, `${this.model.name} Ids`);
        }),
      );

  return typeCastPluckValues(result, columns, this as any);
}

/**
 * Mirrors: ActiveRecord::Calculations#async_ids (calculations.rb:409).
 */
export function asyncIds(this: CalculationRelation): Promise<unknown[]> {
  return this.ids();
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
  /** `sum { |record| … }` — the block arm on the default identity. */
  sum(block: SumBlock): Promise<number | bigint>;
  /** `sum(1000) { |record| … }` — the block arm on an explicit initial value. */
  sum(initialValue: number, block: SumBlock): Promise<number | bigint>;
  sum(
    initialValueOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  asyncCount(columnName?: string): Promise<number | Map<unknown, number>>;
  asyncSum(
    identityOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  asyncAverage(columnName: string): Promise<unknown | null | Map<unknown, unknown>>;
  asyncMinimum(columnName: string): Promise<unknown | null | Map<unknown, unknown>>;
  asyncMaximum(columnName: string): Promise<unknown | null | Map<unknown, unknown>>;
  pluck(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]>;
  asyncPluck(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]>;
  pick(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown>;
  asyncPick(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown>;
  ids(): Promise<unknown[]>;
  asyncIds(): Promise<unknown[]>;
}

/**
 * Wrap a calculation method so its query runs inside `with_connection`; see
 * {@link withConnection}. Releases the connection afterwards instead of
 * permanently leasing it via the deprecated `.connection` getter under
 * `permanent_connection_checkout = :deprecated | :disallowed`.
 */
function inQueryConnection<A extends unknown[], R>(
  fn: (this: CalculationRelation, ...args: A) => Promise<R>,
): (this: CalculationRelation, ...args: A) => Promise<R> {
  return function (this: CalculationRelation, ...args: A): Promise<R> {
    const modelClass = (this as { _model?: unknown })._model as typeof Base;
    return modelClass.withConnection(async () => {
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
  asyncCount,
  average: inQueryConnection(performAverage),
  asyncAverage,
  minimum: inQueryConnection(performMinimum),
  asyncMinimum,
  maximum: inQueryConnection(performMaximum),
  asyncMaximum,
  sum: inQueryConnection(performSum),
  asyncSum,
  calculate: inQueryConnection(calculate),
  // `pluck` / `ids` do their own `with_connection` (and `skip_query_cache_if_necessary`)
  // around the one query they issue, exactly as calculations.rb:316/396 does —
  // so they are NOT wrapped in `inQueryConnection`, which is the seam for the
  // aggregate methods whose query is built inside `calculate`.
  pluck,
  asyncPluck,
  pick,
  asyncPick,
  ids,
  asyncIds,
} as const;

// ---------------------------------------------------------------------------
// Private helpers (mirrors Rails' ActiveRecord::Calculations private methods)
// ---------------------------------------------------------------------------

/**
 * Split a pluck argument on a top-level comma — one outside every quote and
 * paren nesting. Backs the comma-separated-list rejection in `pluck`, which
 * Rails gets for free because `arel_column` never sees a list.
 * @internal
 */
function hasTopLevelComma(s: string): boolean {
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      // SQL doubled-quote escape ("" or ``)
      if (ch === quote && s[i + 1] === quote) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
}

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
  if (anyRel.eagerLoadValues?.length > 0) return true;
  // includes_values with references → triggers via references_eager_loaded_tables?
  const promoted = anyRel._includesToPromoteFromReferences?.() as string[] | undefined;
  if (promoted && promoted.length > 0) return true;
  // Plain includes: triggers when a non-:all column is specified.
  // Rails excludes only the :all symbol (calculations.rb:94); explicit "*" is not excluded.
  if (anyRel.includesValues?.length > 0) {
    return columnName != null && columnName !== "all";
  }
  return false;
}

/**
 * Narrows the resolved `column_name` to what `aggregate_column` accepts. Rails
 * hands its own resolved value straight through (calculations.rb:414-423) — nil
 * included, which is how `async_sum`'s identity default reaches `arel_column`
 * as `""` — so a composite `primary_key` reaches Arel as an array and emits
 * broken SQL there too; the join here picks one spelling for that already-
 * degenerate case rather than pretending trails supports it.
 * @internal
 */
function aggregateTarget(
  columnName: string | string[] | Nodes.Node | number | null,
): string | Nodes.Node | number | null {
  return Array.isArray(columnName) ? columnName.join(",") : columnName;
}

/** @internal */
export async function performCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
): Promise<unknown> {
  operation = operation.toLowerCase();

  // Mirrors Rails `perform_calculation` (calculations.rb:434-458): resolve the
  // effective `distinct` flag and count column before dispatching. `:all` is
  // spelled "*"/"all" here (the JS analogue Rails' aggregate_column maps to
  // Arel.star — calculations.rb:414-423).
  let distinct: boolean | null = rel.distinctValue;
  if (operation === "count") {
    columnName ??= await selectForCount(rel);
    if (columnName === "*" || columnName === "all") {
      if (!distinct) {
        if (rel.groupValues.length === 0)
          distinct = isDistinctSelect(rel, await selectForCount(rel));
      } else if (
        any(rel.groupValues) ||
        (rel.selectValues.length === 0 && rel.orderValues.length === 0)
      ) {
        columnName = rel.primaryKey;
      }
    } else if (isDistinctSelect(rel, columnName)) {
      distinct = null;
    }
  }

  if (any(rel.groupValues)) {
    return executeGroupedCalculation(rel, operation, columnName, distinct);
  }
  return executeSimpleCalculation(rel, operation, columnName, distinct);
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
    if (!distinct) relation.selectValues = [new Nodes.SqlLiteral("1 AS one")];
  } else {
    columnAlias = new Nodes.SqlLiteral("count_column");
    const column = aggregateColumn(relation, columnName) as Nodes.Node & {
      as(alias: string): Nodes.Node;
    };
    relation.selectValues = [column.as("count_column")];
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
    if (rel.limitValue === 0) return 0;

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
    const joined = eagerJoinedRelation(rel, rel.groupValues.length === 0);
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
    relation.selectValues = [castsBigint ? selectValue.as("val") : selectValue];

    const [rawSql, managerBinds] = compileManagerWithBinds(relation, relation.arel());
    sql = castsBigint ? wrapBigintAgg(rawSql) : rawSql;
    binds = managerBinds;
  }

  // calculations.rb:487-497: a contradictory where clause (`where(col: [])`,
  // which compiles to an empty `IN`) yields `ActiveRecord::Result.empty` with no
  // query at all, and `type_cast_calculated_value` folds that empty result to
  // the operation's identity. Checked after the query builder is chosen, as
  // Rails does.
  const queryResult = rel.whereClause.isContradiction()
    ? Result.empty()
    : await (
        rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
      ).skipQueryCacheIfNecessary(() =>
        rel.withConnection((c) =>
          c.selectAll(
            sql,
            `${rel.model.name} ${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
            binds,
          ),
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
  let found: unknown = null;
  eachJoinDependencies.call(rel as any, joinDependencies, (join: any) => {
    if (found != null) return;
    // Ruby `return type if type` returns from lookup_cast_type_from_join_dependencies
    // itself (calculations.rb:596); a TS callback cannot, so the first hit is kept
    // and later joins are skipped.
    const type = castTypeFromKlass(join.baseKlass, name);
    if (type) found = type;
  });
  return found;
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
  let joinDependencies: JoinDependency[] | undefined;
  const castTypes = result.columns.map((name, i) => {
    // Rails' `model.attribute_types.fetch(name) { ... }` (calculations.rb:611):
    // the block runs only when the model owns no such attribute, and it builds
    // the join dependencies at most once for the whole column list.
    const known = pluckCastTypeForKnownColumn(rel.model, name);
    if (known) return known;
    joinDependencies ??= buildJoinDependencies.call(rel as any);
    return (
      (lookupCastTypeFromJoinDependencies(rel, name, joinDependencies) as ColumnType | null) ??
      // Driver OID type (e.g. PostgreSQL) or identity fallback.
      columnType(result, name, i, {})
    );
  });
  return result.castValues(castTypes);
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
export async function selectForCount(rel: CalculationRelation): Promise<string> {
  // "*" is the JS analogue of Rails' `:all` symbol (calculations.rb:646-654).
  if (rel.selectValues.length === 0) return "*";
  return rel.withConnection((conn) =>
    (arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[])
      .map((column) => (conn.visitor ? conn.visitor.compile(column) : String(column)))
      .join(", "),
  );
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
      rel.limitValue !== null ||
      rel.offsetValue !== null)
  );
}
