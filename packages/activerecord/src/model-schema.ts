import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import { resolveAliasNameIn } from "@blazetrails/activemodel";
import {
  Attribute,
  AttributeSetBuilder,
  AttributeSetCoder,
  typeRegistry,
  defineDirtyAttributeMethods,
  replayOwnPendingDecorators,
  type Type,
} from "@blazetrails/activemodel";
import {
  isBaseClass,
  baseClass,
  getAbstractClass,
  lookupModuleTableNamePrefix,
  lookupModuleTableNameSuffix,
} from "./inheritance.js";
import { singularize } from "@blazetrails/activesupport";
import { modelRegistry } from "./associations.js";
import { realPool } from "./connection-adapters/abstract/connection-pool.js";
import { TableNotSpecified } from "./errors.js";
import { encryptionHooks } from "./encryption-hooks.js";
import { isWrappedType } from "./encryption/wrapped-type.js";
import { FakePool } from "./connection-adapters/schema-cache.js";
import { threadedConnectionFor, connectionPool } from "./connection-handling.js";

/**
 * Adapter for a schema-reflection read: prefer the connection threaded by the
 * enclosing internal `with_connection` wrap ({@link threadedConnectionFor}) —
 * matching Rails, which threads the block's `connection` through schema
 * reflection — and only fall back to the deprecated `Model.connection` getter
 * when no wrap is active (or the wrap belongs to a different pool). Reading the
 * threaded connection keeps these reads off the getter so they never flip the
 * lease permanent. `threadedConnectionFor` never throws (returns `null`), so the
 * `.connection` fallback still throws where callers rely on a `try`/`catch`.
 */
function reflectionAdapter(klass: any): any {
  return threadedConnectionFor(klass) ?? klass.connection;
}

/**
 * Global so `_schemaRevision` values stay comparable ACROSS the prototype
 * chain — {@link schemaStaleAgainstAncestors} depends on that ordering.
 *
 * @internal
 */
let schemaEpoch = 0;

function nextSchemaEpoch(): number {
  return ++schemaEpoch;
}

function ownProp<K extends keyof SchemaHost>(host: SchemaHost, key: K): SchemaHost[K] | undefined {
  return Object.prototype.hasOwnProperty.call(host, key) ? host[key] : undefined;
}

/**
 * Stands in for Rails reaching descendants through DescendantsTracker's
 * `inherited` hook (model_schema.rb:566-570); JS has no equivalent for classes
 * that never called `registerSubclass`.
 *
 * Memoized against {@link schemaEpoch}: this runs on every schema-memo read,
 * including the `new Model()` hot path, and nothing can go stale without some
 * class stamping a fresh epoch.
 *
 * @internal
 */
export function schemaStaleAgainstAncestors(host: SchemaHost): boolean {
  const cached = ownProp(host, "_staleCheck");
  if (cached && cached.epoch === schemaEpoch) return cached.stale;

  const own = ownProp(host, "_schemaRevision") ?? 0;
  let stale = false;
  let current = Object.getPrototypeOf(host) as SchemaHost | null;
  while (current && (current as unknown) !== Function.prototype) {
    if ((ownProp(current, "_schemaRevision") ?? 0) > own) {
      stale = true;
      break;
    }
    current = Object.getPrototypeOf(current) as SchemaHost | null;
  }
  host._staleCheck = { epoch: schemaEpoch, stale };
  return stale;
}

/**
 * Ruby class ivars are not inherited, but JS `static` members ARE — a bare
 * `this._columnsHash` read on a subclass would see the base's memo and skip the
 * subclass's own `load_schema!` (model_schema.rb:587-597).
 *
 * @internal
 */
function ownSchemaMemo<K extends keyof SchemaHost>(
  host: SchemaHost,
  key: K,
): SchemaHost[K] | undefined {
  if (!Object.prototype.hasOwnProperty.call(host, key)) return undefined;
  return schemaStaleAgainstAncestors(host) ? undefined : host[key];
}

/**
 * Schema metadata for ActiveRecord models — table name, primary key,
 * columns, content columns, SQL helpers, and table creation.
 *
 * Mirrors: ActiveRecord::ModelSchema
 */

// ---------------------------------------------------------------------------
// Table name resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the table name for a model class.
 * Inferred from class name if not explicitly set. STI subclasses
 * inherit the base class's table name.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#table_name
 *
 * @internal
 */
export function resolveTableName(this: typeof Base): string {
  if ((this as any)._tableName != null) return (this as any)._tableName;
  // Rails compute_table_name: non-base subclasses always use base_class.table_name.
  // This covers both STI hierarchies and any subclass of a non-abstract AR model.
  if (!isBaseClass(this)) {
    const base = baseClass.call(this);
    if (base !== this) return resolveTableName.call(base);
  }
  const prefix = fullTableNamePrefix.call(this as any);
  const suffix = fullTableNameSuffix.call(this as any);
  const contained = containedTableNamePrefix.call(this as any);
  const pluralizes = (this as any).pluralizeTableNames ?? true;
  const inferred = undecoratedTableName(String(this.modelName), pluralizes);
  return `${prefix}${contained}${inferred}${suffix}`;
}

/**
 * Guesses the table name, but does not decorate it with prefix and suffix.
 * Pluralizes only when `pluralize_table_names` is on (Rails default).
 *
 * @internal
 */
function undecoratedTableName(modelName: string, pluralizes = true): string {
  const demodulized = modelName.split("::").pop() ?? modelName;
  const base = underscore(demodulized);
  return pluralizes ? pluralize(base) : base;
}

/**
 * Rails `compute_table_name`'s nested-class arm: when the immediate
 * `module_parent` is itself a concrete AR model, the table is prefixed with the
 * singularized parent table name — `Client::Contact` → `company_contacts`.
 * Mirrors model_schema.rb:608-612.
 *
 * Rails guards the `singularize` with `if module_parent.pluralize_table_names`
 * (model_schema.rb:610), so the singularize honors the parent's toggle here too.
 */
function containedTableNamePrefix(this: typeof Base): string {
  const moduleName = (this as any).moduleName as string | undefined;
  if (!moduleName) return "";
  const parent = modelRegistry.get(moduleName);
  if (!parent || getAbstractClass.call(parent as any)) return "";
  const contained =
    ((parent as any).pluralizeTableNames ?? true)
      ? singularize(parent.tableName)
      : parent.tableName;
  return `${contained}_`;
}

// ---------------------------------------------------------------------------
// Primary key helpers
// ---------------------------------------------------------------------------

/**
 * Build a WHERE clause string for the primary key of a given record.
 *
 * @internal
 */
export function buildPkWhere(this: typeof Base, idValue: unknown): string {
  const pk = this.primaryKey;
  const a = reflectionAdapter(this);
  if (Array.isArray(pk)) {
    if (!Array.isArray(idValue) || idValue.length !== pk.length) return "1=0";
    const conditions: string[] = [];
    for (let i = 0; i < pk.length; i++) {
      const v = idValue[i];
      if (v === undefined || v === null) return "1=0";
      conditions.push(`${a.quoteIdentifier(pk[i])} = ${a.quote(v)}`);
    }
    return conditions.join(" AND ");
  }
  if (idValue === undefined || idValue === null) return "1=0";
  return `${a.quoteIdentifier(pk)} = ${a.quote(idValue)}`;
}

/**
 * Build an Arel node for a primary key WHERE condition.
 *
 * @internal
 */
export function buildPkWhereNode(
  this: typeof Base,
  idValue: unknown,
): InstanceType<typeof Nodes.Node> {
  const table = this.arelTable;
  const pk = this.primaryKey;
  if (Array.isArray(pk)) {
    if (!Array.isArray(idValue) || idValue.length !== pk.length) return arelSql("1=0");
    const values = idValue;
    const conditions: InstanceType<typeof Nodes.Node>[] = [];
    for (let i = 0; i < pk.length; i++) {
      const attr = table.get(pk[i]);
      const v = values[i];
      if (v === undefined || v === null) return arelSql("1=0");
      conditions.push(attr.eq(v));
    }
    return new Nodes.And(conditions);
  }
  const attr = table.get(pk);
  if (idValue === undefined || idValue === null) return arelSql("1=0");
  return attr.eq(idValue);
}

/**
 * Build an Arel node for a WHERE condition from a `_query_constraints_hash`
 * (column name → value). A single entry yields a bare predicate node and
 * multiple entries an `And` of predicates — for the simple single-PK and
 * composite-PK cases this reproduces the non-null `buildPkWhereNode` output,
 * while a `query_constraints` model maps each declared constraint column to its
 * value.
 *
 * A null/undefined value produces an `IS NULL` predicate (not a dead `1=0`),
 * mirroring Rails' `_update_record`/`_delete_record`, which route every
 * `{name, value}` pair through `predicate_builder[name, value]` — and
 * `predicate_builder[name, nil]` builds `name IS NULL`. This matters for
 * `query_constraints` columns that are legitimately null in the DB: a `1=0`
 * predicate would silently update/delete zero rows.
 *
 * Mirrors: how `ActiveRecord::Persistence#_update_record` / `#_delete_record`
 * turn `_query_constraints_hash` into the predicate WHERE.
 *
 * @internal
 */
export function buildWhereNodeFromConstraints(
  this: typeof Base,
  constraints: Record<string, unknown>,
): InstanceType<typeof Nodes.Node> {
  const table = this.arelTable;
  const conditions: InstanceType<typeof Nodes.Node>[] = [];
  for (const [col, value] of Object.entries(constraints)) {
    const attr = table.get(col);
    conditions.push(value === undefined || value === null ? attr.eq(null) : attr.eq(value));
  }
  if (conditions.length === 1) return conditions[0];
  return new Nodes.And(conditions);
}

// ---------------------------------------------------------------------------
// Column introspection
// ---------------------------------------------------------------------------

/**
 * Return column names for a model, excluding ignored columns.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#column_names
 * (`@column_names ||= columns.map(&:name).freeze`, model_schema.rb:478-480).
 */
export function columnNames(this: typeof Base): string[] {
  const host = this as unknown as SchemaHost;
  const memo = Object.prototype.hasOwnProperty.call(host, "_columnNamesMemo")
    ? host._columnNamesMemo
    : undefined;
  if (memo && memo.revision === (host._schemaRevision ?? 0)) return memo.names as string[];
  const names = this.columns().map((c: { name: string }) => c.name);
  if (ownSchemaMemo(host, "_schemaLoaded")) {
    const frozen = Object.freeze(names);
    host._columnNamesMemo = { revision: host._schemaRevision ?? 0, names: frozen };
    return frozen as string[];
  }
  return names;
}

/**
 * Check if a model class has a given attribute defined. Backs the Rails-named
 * public accessor `Base.hasAttribute` (Rails' `has_attribute?`, attribute_methods.rb).
 *
 * @internal
 */
export function hasAttributeDefinition(this: typeof Base, name: string): boolean {
  // Rails: `attr_name = attribute_aliases[attr_name] || attr_name`
  // (attribute_methods.rb:256) before checking `attribute_types`.
  const defs = this._attributeDefinitions;
  return defs.has(resolveAliasNameIn(this as never, defs, String(name)));
}

/**
 * Column-like shape returned by `columnsHash`. When the schema cache is
 * populated, entries are the adapter's full Column objects (`sqlType`,
 * `collation`, `comment`, nullable `type`, ...); otherwise a synthesized
 * shape derived from attribute definitions.
 */
export interface ColumnLike {
  name: string;
  type?: string | null;
  sqlType?: string;
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Return a hash of column definitions keyed by name.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#columns_hash
 */
export function columnsHash(this: typeof Base): Record<string, ColumnLike> {
  // load_schema! raises TableNotSpecified for abstract (table-less) classes.
  loadSchema.call(this as SchemaHost);

  const memoized = ownSchemaMemo(this as unknown as SchemaHost, "_columnsHash");
  if (memoized != null) return memoized as Record<string, ColumnLike>;

  const klass = this;
  let adapter: DatabaseAdapterLike | null = null;
  try {
    adapter = reflectionAdapter(klass) as DatabaseAdapterLike;
  } catch {
    adapter = null;
  }
  const cache = adapter?.schemaCache as
    | {
        getCachedColumnsHash?: (t: string) => Record<string, ColumnLike> | undefined;
      }
    | undefined;
  const table = klass.tableName;
  // Gate on the same map we read (`_columnsHash` via getCachedColumnsHash),
  // not `isCached` (which checks `_columns`): a populated `_columns` without a
  // matching `_columnsHash` entry would otherwise pass the guard, return
  // undefined here, and fall through to the synthesized branch — re-leaking
  // virtual attributes the warm was meant to exclude.
  if (cache && typeof cache.getCachedColumnsHash === "function") {
    const cached = cache.getCachedColumnsHash(table);
    if (cached) {
      const ignored = new Set(this.ignoredColumns ?? []);
      const filtered: Record<string, ColumnLike> = {};
      for (const [k, v] of Object.entries(cached)) {
        if (ignored.has(k)) continue;
        filtered[k] = v;
      }
      return filtered;
    }
  }

  // Synthesized fallback: filter ignoredColumns and virtual attrs to match
  // loadSchema's fallback and Rails behavior (virtual attrs are not DB columns).
  const ignored = new Set(this.ignoredColumns ?? []);
  const result: Record<string, ColumnLike> = {};
  for (const [name, def] of this._attributeDefinitions) {
    if (ignored.has(name)) continue;
    if ((def as any).virtual) continue;
    const fn = (def as any).defaultFunction ?? null;
    result[name] = {
      name,
      type: def.type?.name ?? null,
      default: def.defaultValue ?? null,
      ...(fn != null ? { defaultFunction: fn } : {}),
    };
  }
  return result;
}

type DatabaseAdapterLike = { schemaCache?: unknown };

/**
 * Connection-safe read of the cached column hash for `klass`'s table.
 *
 * Used by `_defaultAttributes` to seed schema columns via `Attribute.fromDatabase`
 * (Rails' `columns_hash.transform_values { Attribute.from_database(...) }`) without
 * ever touching `.connection` — which under the default `permanentConnectionCheckout`
 * would permanently lease a connection on every record construction. Reads the warm
 * schema cache off an already-available connection only: the threaded (in-query)
 * connection, else a connection the pool has already leased. Returns `{}` when
 * neither is available (a bare `new Model()` with no active connection); the caller
 * then seeds that column from its attribute definition instead. Any real DB column
 * whose default matters here has already pinned a connection via the
 * `!_schemaLoaded` reflection in `_defaultAttributes`, so `{}` is only reached for
 * columns that carry no client-side default anyway.
 *
 * @internal
 */
export function cachedColumnsHash(klass: typeof Base): Record<string, ColumnLike> {
  const cachedFrom = (conn: { schemaCache?: unknown } | null | undefined) => {
    const cache = conn?.schemaCache as
      | { getCachedColumnsHash?: (t: string) => Record<string, ColumnLike> | undefined }
      | undefined;
    return cache?.getCachedColumnsHash?.(klass.tableName);
  };
  // Read the warm schema cache off an already-available connection — the
  // threaded (in-query) one, else a connection the pool has already leased.
  // Both are connection-free reads (no `.connection`), so this is safe on the
  // hot `new Model()` path and never forces a permanent checkout.
  try {
    const hash =
      cachedFrom(threadedConnectionFor(klass)) ??
      cachedFrom(connectionPool.call(klass).activeConnection as { schemaCache?: unknown } | null);
    if (hash) return hash;
  } catch {
    /* fall through */
  }
  return {};
}

/**
 * Return the column objects for "content" columns — everything except the
 * primary key, the inheritance column, and `_id`/`_count` columns.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#content_columns
 * (model_schema.rb:489-495). Rails memoizes into `@content_columns` (cleared by
 * reset_column_information); recomputing here is behaviorally identical — the
 * underlying `columns` array is already memoized — and avoids threading another
 * cache slot through SchemaHost and the reset/STI cache-host plumbing.
 */
export function contentColumns(this: typeof Base): any[] {
  const pk = this.primaryKey;
  const inheritance = this.inheritanceColumn;
  return columns.call(this as unknown as SchemaHost).filter((col: { name: string }) => {
    if (col.name === pk) return false;
    if (col.name === inheritance) return false;
    if (col.name.endsWith("_id") || col.name.endsWith("_count")) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// SQL type mapping
// ---------------------------------------------------------------------------

/**
 * Map ActiveModel type names to SQL column types.
 * Adapter-aware: PostgreSQL uses native types, MySQL uses its own,
 * SQLite uses affinity types.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#native_database_types
 */
function sqlTypeFor(typeName: string, adapterName?: string): string {
  if (adapterName === "postgres") {
    switch (typeName) {
      case "integer":
        return "integer";
      case "big_integer":
        return "bigint";
      case "float":
        return "float";
      case "decimal":
        return "decimal";
      case "boolean":
        return "boolean";
      case "binary":
        return "bytea";
      case "text":
        return "text";
      case "json":
        return "jsonb";
      case "datetime":
        return "timestamp";
      default:
        return "varchar";
    }
  }
  if (adapterName === "mysql") {
    switch (typeName) {
      case "integer":
        return "int";
      case "big_integer":
        return "bigint";
      case "float":
        return "float";
      case "decimal":
        return "decimal";
      case "boolean":
        return "tinyint(1)";
      case "binary":
        return "blob";
      case "text":
        return "text";
      case "json":
        return "json";
      case "datetime":
        return "datetime";
      default:
        return "varchar(255)";
    }
  }
  // SQLite (default) — uses type affinity
  switch (typeName) {
    case "integer":
    case "big_integer":
      return "INTEGER";
    case "float":
    case "decimal":
      return "REAL";
    case "boolean":
      return "INTEGER";
    case "binary":
      return "BLOB";
    default:
      return "TEXT";
  }
}

// ---------------------------------------------------------------------------
// Table creation (test/development helper)
// ---------------------------------------------------------------------------

/**
 * Create the database table for a model from its attribute definitions.
 * Drops the table first if it already exists.
 *
 * This is a test/development helper — in production, use migrations.
 *
 * Mirrors: used by test infrastructure, not a direct Rails API
 */
export async function createTable(this: typeof Base): Promise<void> {
  const table = resolveTableName.call(this);
  const pks = Array.isArray(this.primaryKey) ? this.primaryKey : [this.primaryKey];
  const adapterName = this.connection.adapterName;
  const isMysql = adapterName === "mysql";
  const isPg = adapterName === "postgres";
  const pkSet = new Set(pks);
  const a = this.connection;

  // eslint-disable-next-line blazetrails/no-raw-sql -- DDL: Arel has no schema-statement nodes; Rails builds this SQL as a string too.
  await a.execute(`DROP TABLE IF EXISTS ${a.quoteTableName(table)}`);

  const colDefs: string[] = [];
  if (pks.length === 1) {
    const pk = pks[0];
    const pkDef = isPg
      ? `${a.quoteIdentifier(pk)} SERIAL PRIMARY KEY`
      : isMysql
        ? `${a.quoteIdentifier(pk)} BIGINT AUTO_INCREMENT PRIMARY KEY`
        : `${a.quoteIdentifier(pk)} INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL`;
    colDefs.push(pkDef);
  } else {
    for (const pk of pks) {
      const pkDef = this._attributeDefinitions.get(pk);
      const pkType = sqlTypeFor(pkDef?.type?.name || "integer", adapterName);
      colDefs.push(`${a.quoteIdentifier(pk)} ${pkType} NOT NULL`);
    }
  }

  for (const [name, def] of this._attributeDefinitions) {
    if (pkSet.has(name)) continue;
    const sqlType = sqlTypeFor(def.type?.name || "string", adapterName);
    colDefs.push(`${a.quoteIdentifier(name)} ${sqlType}`);
  }

  if (pks.length > 1) {
    colDefs.push(`PRIMARY KEY (${pks.map((pk) => a.quoteIdentifier(pk)).join(", ")})`);
  }

  await a.execute(
    // eslint-disable-next-line blazetrails/no-raw-sql -- DDL: Arel has no schema-statement nodes; Rails builds this SQL as a string too.
    `CREATE TABLE IF NOT EXISTS ${a.quoteTableName(table)} (${colDefs.join(", ")})`,
  );

  // This helper issues raw DROP/CREATE DDL instead of routing through
  // SchemaStatements, so it must invalidate the schema cache itself —
  // otherwise a previously-warmed entry (e.g. from the test harness'
  // eager warm) survives and reports the old table shape to the next
  // `columnsHash()` read. Mirrors SchemaStatements#createTable's
  // `clear_data_source_cache!`.
  (
    a as {
      schemaCache?: { clearDataSourceCacheBang(pool: unknown, name: string): void };
      pool?: unknown;
    }
  ).schemaCache?.clearDataSourceCacheBang((a as { pool?: unknown }).pool ?? null, table);
}

// ---------------------------------------------------------------------------
// Missing ClassMethods from api:compare
// ---------------------------------------------------------------------------

interface SchemaHost {
  name: string;
  tableName: string;
  primaryKey: string | string[];
  _tableName: string | null;
  _tableNamePrefix: string;
  _tableNameSuffix: string;
  _sequenceName: string | null;
  _inheritanceColumn?: string | null;
  _abstractClass?: boolean;
  _ignoredColumns?: string[];
  _protectedEnvironments?: string[];
  _attributeDefinitions: Map<string, any>;
  _defaultAttributes(): { deepDup(): { toHash(): Record<string, unknown> } };
  _columnsHash?: Record<string, unknown>;
  _columns?: any[];
  _returningColumnsForInsertCache?: string[];
  _attributesBuilder?: any;
  _schemaLoaded?: boolean;
  _virtualAttributesReconciled?: boolean;
  /** Global epoch stamped on reflect/invalidate; see {@link schemaEpoch}. @internal */
  _schemaRevision?: number;
  /** Memoized {@link schemaStaleAgainstAncestors} result. @internal */
  _staleCheck?: { epoch: number; stale: boolean };
  /** Rails' `@column_names` memo, revision-stamped. @internal */
  _columnNamesMemo?: { revision: number; names: readonly string[] };
  connection: any;
  prototype: Record<string, unknown>;
  superclass?: SchemaHost;
  hookAttributeType?(name: string, type: Type): Type;
}

/**
 * Drop the memoized class-level `attributeNames` and `columnNames` on `host`
 * and its descendants — Rails' `reload_schema_from_cache` nils
 * `@attribute_names` and `@column_names` recursively (model_schema.rb:553-568).
 * Used by the invalidation paths that don't bump `_schemaRevision`
 * (`attribute`, `table_name=`, `ignored_columns=`).
 *
 * @internal
 */
export function clearAttributeNamesMemo(host: SchemaHost): void {
  const descendants = (host as { descendants?: SchemaHost[] }).descendants ?? [];
  for (const klass of [host, ...descendants]) {
    for (const memo of ["_attributeNamesMemo", "_columnNamesMemo"] as const) {
      if (Object.prototype.hasOwnProperty.call(klass, memo)) {
        Reflect.deleteProperty(klass, memo);
      }
    }
  }
}

/**
 * Mirrors: ActiveRecord::ModelSchema.derive_join_table_name
 *
 * A module-level function in Rails (not a class method on the model): it takes
 * both table names, sorts them, and collapses a shared `foo_`/`foo.` prefix so
 * `foo_bars` + `foo_bazes` derive `foo_bars_bazes` rather than
 * `foo_bars_foo_bazes`.
 */
export function deriveJoinTableName(firstTable: string, secondTable: string): string {
  const joined = [String(firstTable), String(secondTable)].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}

export function quotedTableName(this: SchemaHost): string {
  return reflectionAdapter(this).quoteTableName(this.tableName);
}

/**
 * Rails: resets and recomputes table name, handling abstract classes
 * and STI inheritance.
 */
export function resetTableName(this: SchemaHost): string {
  this._tableName = null;
  if (this.name === "Base") {
    return "";
  }
  if (getAbstractClass.call(this as any)) {
    const parent = Object.getPrototypeOf(this) as SchemaHost | null;
    if (parent?.tableName != null) {
      this._tableName = parent.tableName;
      return this._tableName;
    }
  }
  const name = resolveTableName.call(this as any);
  this._tableName = name;
  return name;
}

export function fullTableNamePrefix(this: SchemaHost): string {
  const moduleName = (this as any).moduleName as string | undefined;
  return lookupModuleTableNamePrefix(moduleName) ?? this._tableNamePrefix ?? "";
}

export function fullTableNameSuffix(this: SchemaHost): string {
  const moduleName = (this as any).moduleName as string | undefined;
  return lookupModuleTableNameSuffix(moduleName) ?? this._tableNameSuffix ?? "";
}

export function realInheritanceColumn(this: SchemaHost, value: string | null): void {
  this._inheritanceColumn = value;
}

export const _inheritanceColumn = realInheritanceColumn;

export function _returningColumnsForInsert(
  this: SchemaHost,
  connection: { returnValueAfterInsert?(column: { name: string }): boolean },
): string[] {
  // Mirrors Rails _returning_columns_for_insert: the columns the DB auto-populates
  // on INSERT (auto-increment / serial / identity columns and DB-computed
  // defaults), falling back to the PK when the adapter reports none.
  // `returnValueAfterInsert` calls `column.isAutoPopulated`, which only the
  // reflected Column objects implement; the synthesized column-hash fallback (used
  // before the schema cache is warm) holds plain shapes, so skip those — they
  // carry no auto-increment metadata and the PK fallback below covers them.
  // Rails memoizes into @_returning_columns_for_insert (model_schema.rb:437)
  // and clears it in reload_schema_from_cache; the `||=` is mirrored here, with
  // the clear in reloadSchemaFromCache (which resetColumnInformation calls).
  // Ruby class instance variables are NOT inherited, so that
  // memo is genuinely per-class -- hence the own-property check: a plain static
  // read walks the JS prototype chain and would hand a subclass on a different
  // table the base's list.
  if (Object.prototype.hasOwnProperty.call(this, "_returningColumnsForInsertCache")) {
    const memo = this._returningColumnsForInsertCache;
    if (memo !== undefined) return memo;
  }
  const cols = columns.call(this) as { name: string; isAutoPopulated?: unknown }[];
  const memoize = (value: string[]): string[] => (this._returningColumnsForInsertCache = value);
  const autoPopulated = cols
    .filter(
      (c) => typeof c.isAutoPopulated === "function" && connection.returnValueAfterInsert?.(c),
    )
    .map((c) => c.name);
  if (autoPopulated.length > 0) return memoize(autoPopulated);
  // PK fallback. Restrict to columns that actually exist on the table: Rails
  // reflects `primary_key` as nil for a table without that column (e.g. an
  // id-less HABTM join table whose model still defaults `primary_key` to "id"),
  // so `Array(primary_key)` is empty there — which also keeps the scalar
  // write-back from storing a phantom `id` attribute on an id-less model.
  const colNames = new Set(cols.map((c) => c.name));
  const pk = this.primaryKey;
  const pkArr = Array.isArray(pk) ? pk : pk ? [pk] : [];
  return memoize(pkArr.filter((p) => colNames.has(p)));
}

export function resetSequenceName(this: SchemaHost): void {
  this._sequenceName = null;
}

export function isPrefetchPrimaryKey(this: SchemaHost): boolean {
  return false;
}

export function nextSequenceValue(this: SchemaHost): number | null {
  return null;
}

/**
 * Rails: builds an AttributeSet::Builder with defaults from attribute
 * definitions, excluding PK columns from defaults.
 */
export function attributesBuilder(this: SchemaHost): AttributeSetBuilder {
  const ownBuilder = ownSchemaMemo(this, "_attributesBuilder");
  if (ownBuilder) return ownBuilder;

  const pk = this.primaryKey;
  const pkSet = new Set(Array.isArray(pk) ? pk : [pk]);
  const types = new Map<string, any>();
  const defaults = new Map<string, Attribute>();
  for (const [name, def] of this._attributeDefinitions) {
    const type = def.type ?? { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    types.set(name, type);
    if (!pkSet.has(name) && def.defaultValue !== undefined) {
      const val = typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
      defaults.set(name, Attribute.withCastValue(name, val, type));
    }
  }

  this._attributesBuilder = new AttributeSetBuilder(types, defaults);
  return this._attributesBuilder;
}

/**
 * Rails: @columns ||= columns_hash.values.freeze
 */
export function columns(this: SchemaHost): any[] {
  const ownColumns = ownSchemaMemo(this, "_columns");
  if (ownColumns != null) return ownColumns;
  this._columns = Object.values(columnsHash.call(this as unknown as typeof Base));
  return this._columns;
}

/** @internal */
export function attributeSetCoder(this: SchemaHost): AttributeSetCoder {
  return new AttributeSetCoder(typeRegistry);
}

/**
 * Rails: columns_hash.fetch(name) { NullColumn.new(name) }
 *
 * Returns the **schema column** (DB-reflected metadata: sqlType,
 * default, null, etc.), not the **attribute** definition (the
 * user-facing Type produced by `typeForAttribute`). Schema columns
 * exist only for actual DB columns; user-declared `attribute :virtual,
 * :string` defs have no column. Callers needing the AM Type — for
 * casting, dirty tracking, comparison — should use `typeForAttribute`
 * instead. Returns a NullColumn-shaped object for unknown names so
 * `column.null`, `column.type`, etc. remain safely accessible.
 */
export function columnForAttribute(this: SchemaHost, name: string): any {
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  return hash[name] ?? { name, null: true, type: null };
}

/**
 * Rails: column_names.index_by(&:to_sym)[name_symbol]
 */
export function symbolColumnToString(this: SchemaHost, name: string): string | undefined {
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  return hash[name] ? name : undefined;
}

/**
 * Drop the cached reflected columns for a model's table, matching the
 * `schema_cache.clear_data_source_cache!(table_name)` step in Rails'
 * `reset_column_information` (model_schema.rb).
 *
 * The cache is resolved WITHOUT leasing a connection — Rails keeps
 * `reset_column_information` inert (`active_connection&.`, schema_cache reached
 * via the pool). We prefer a directly-assigned adapter (`Base.adapter=` bypasses
 * the pool), else the pool-level schema cache; both skip `leaseConnection()`.
 * Best-effort: a model with no pool/table simply has nothing to clear.
 */
function clearAdapterDataSourceCache(host: SchemaHost): void {
  // The raw, sync SchemaCache — `clearDataSourceCacheBang(connection, name)`.
  // NOT the pool's BoundSchemaReflection (async, single-arg `(name)`); reaching
  // for that form here would clear a table named `null` and leave a floating
  // Promise. Both branches below resolve the raw cache, matching what the
  // adapter's own `schemaCache` getter returns (abstract-adapter.ts).
  type Cache = {
    clearDataSourceCacheBang?: (connection: unknown, name: string) => void;
  };
  let cache: Cache | null | undefined;
  let table: string | undefined;
  try {
    table = (host as unknown as { tableName?: string }).tableName;
    const direct = (host as unknown as { _adapter?: { schemaCache?: Cache } })._adapter;
    if (direct?.schemaCache) {
      cache = direct.schemaCache;
    } else {
      // Pooled path: read the pool config's raw SchemaCache directly (the slot
      // the adapter getter shares), NOT `schemaCache()` whose fallback is the
      // bound reflection. Getting the pool never leases a connection — Rails
      // reaches schema_cache through the pool in `reset_column_information`.
      const pool = (
        host as unknown as {
          connectionPool?: () => { poolConfig?: { schemaCache?: Cache | null } };
        }
      ).connectionPool?.();
      cache = pool?.poolConfig?.schemaCache;
    }
  } catch {
    return;
  }
  if (!table) return;
  if (typeof cache?.clearDataSourceCacheBang === "function") {
    cache.clearDataSourceCacheBang(null, table);
  }
}

/**
 * Rails: clears column cache, schema cache, reloads schema.
 * Drops schema-sourced attribute defs so the next load re-reflects
 * them; user-declared defs (source === "user") are preserved, matching
 * Rails' reload_schema_from_cache behavior where user-provided
 * attributes survive reload.
 */
export function resetColumnInformation(this: SchemaHost): void {
  // Rails reset_column_information calls initialize_find_by_cache right after
  // reload_schema_from_cache, resetting @find_by_statement_cache. Clearing it
  // here (lazy reinit on next access) mirrors that; reload_schema_from_cache
  // itself leaves the cache alone.
  (this as { _findByStatementCache?: unknown })._findByStatementCache = undefined;
  // Mirrors Rails reset_column_information's
  // `schema_cache.clear_data_source_cache!(table_name)` (model_schema.rb): drop
  // the connection's per-table reflected columns so the next load re-reads from
  // the database. trails bakes the resolved cast type into each cached Column,
  // so this is also what lets a toggled `emulate_booleans` re-resolve
  // tinyint(1) columns; without it the stale boolean/integer type would survive.
  // This clear (and the find-by reset above) live ONLY here, not in
  // reloadSchemaFromCache — Rails' protected reload_schema_from_cache nils
  // class-level schema ivars without touching the schema cache.
  clearAdapterDataSourceCache(this);
  reloadSchemaFromCache.call(this);
}

/**
 * Drop schema-sourced attribute defs (and their generated accessors) so the
 * next load re-reflects them; user-declared defs (source === "user") are
 * preserved, matching Rails where user-provided attributes survive reload.
 */
function scrubSchemaSourcedDefinitions(host: SchemaHost): void {
  for (const [name, def] of Array.from(host._attributeDefinitions)) {
    if ((def.userProvided ?? true) === false || def.source === "schema") {
      host._attributeDefinitions.delete(name);
      if (Object.prototype.hasOwnProperty.call(host.prototype, name)) {
        delete host.prototype[name];
      }
    }
  }
}

/** @internal */
export function reloadSchemaFromCache(this: SchemaHost): void {
  this._columnsHash = undefined;
  this._columns = undefined;
  this._returningColumnsForInsertCache = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
  this._virtualAttributesReconciled = false;
  this._schemaRevision = nextSchemaEpoch();
  (this as SchemaHost & { _cachedDefaultAttributes?: unknown })._cachedDefaultAttributes = null;
  (this as SchemaHost & { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
  clearAttributeNamesMemo(this);
  if (Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    scrubSchemaSourcedDefinitions(this);
  }
  for (const sub of (this as { subclasses?: SchemaHost[] }).subclasses ?? []) {
    reloadSchemaFromCache.call(sub);
  }
}

/**
 * Mirrors: ActiveRecord::ModelSchema#load_schema
 *
 * Sync: consults the adapter's schema cache if it's already populated
 * (no I/O), and reflects columns into `_attributeDefinitions`. For
 * models without a backing table (test fixtures with only user
 * `attribute()` declarations), falls back to synthesizing `_columnsHash`
 * from existing defs so downstream readers continue to work.
 *
 * For a full async reflection (fetching from the adapter if the cache
 * isn't populated), call `Base.loadSchema()` (base.ts).
 */
export function loadSchema(this: SchemaHost): void {
  if (ownSchemaMemo(this, "_schemaLoaded")) return;

  // Rails ModelSchema#load_schema!: `raise TableNotSpecified unless table_name`.
  // Rails' `table_name` is nil for an abstract class; ours computes an inferred
  // name even for abstract classes, so mirror the Rails effect by treating an
  // abstract class (or an explicitly cleared `table_name`) as table-less.
  const klass = this as unknown as typeof Base;
  if (getAbstractClass.call(this as any) || !klass.tableName) {
    throw new TableNotSpecified(
      `${klass.name} has no table configured. Set one with ${klass.name}.table_name=`,
    );
  }

  const reflected = loadSchemaFromCacheSync(this);
  if (reflected) {
    this._schemaLoaded = true;
    return;
  }

  // Cache-miss path: with the schema cache always warm (RFC 0031), a
  // table-backed model reflects from the persistent cache entry above and
  // returns — so the int8→BigInt PK divergence that the removed eager id
  // pre-cast (`_castAttributeValue`) worried about cannot arise on this path.
  // Reaching here
  // means a genuinely tableless attribute-only model (the synthesize fallback
  // below builds its `columnsHash` from declared attributes), which has no
  // adapter-resolved PK type at all. If such a model still lacks a typed
  // primary-key def, do NOT mark the load terminal: leaving `_schemaLoaded`
  // unset lets a later load replace the synthesized view with real reflected
  // columns once a cache entry exists. The find path passing the raw string id
  // to the bind for a tableless model in the meantime is harmless — there is
  // no DB column type to cast through.
  let pkStillMissing = false;
  if (this._attributeDefinitions.size > 0) {
    const pks = Array.isArray(this.primaryKey)
      ? this.primaryKey
      : this.primaryKey != null
        ? [this.primaryKey]
        : [];
    if (pks.some((pk) => !this._attributeDefinitions.has(pk))) {
      pkStillMissing = true;
    }
  }

  if (!ownSchemaMemo(this, "_columnsHash") && this._attributeDefinitions.size > 0) {
    const hash: Record<string, unknown> = {};
    const ignored = new Set(this._ignoredColumns ?? []);
    for (const [name, def] of this._attributeDefinitions) {
      if (ignored.has(name)) continue;
      if (def.virtual) continue;
      const fn = def.defaultFunction ?? null;
      hash[name] = {
        name,
        type: def.type?.name ?? null,
        default: def.defaultValue ?? null,
        limit: def.limit ?? null,
        ...(fn != null ? { defaultFunction: fn } : {}),
      };
    }
    this._columnsHash = hash;
  }
  if (!pkStillMissing) this._schemaLoaded = true;
}

function getColumnsHash(host: SchemaHost): Record<string, unknown> {
  const own = ownSchemaMemo(host, "_columnsHash");
  if (own != null) return own;
  const ch = (host as any).columnsHash;
  if (typeof ch === "function") return ch.call(host) ?? {};
  return {};
}

/**
 * Rails' `ActiveRecord::Attributes#type_for_column`: the adapter's cast type
 * for a column, run through `ModelSchema`'s immutable-string conversion
 * (model_schema.rb:622-629) and then `hook_attribute_type` (attributes.rb:
 * 301-302), which layers tz-conversion / optimistic-locking wrappers. Shared by
 * the non-enum schema-def path and the enum-subtype stash so both seed the same
 * reflected type. Falls back to the `value` type when the adapter yields none.
 */
function reflectedTypeForColumn(
  host: { immutableStringsByDefault?: boolean; hookAttributeType?: (n: string, t: Type) => Type },
  adapter: { lookupCastTypeFromColumn?: (c: unknown) => unknown },
  name: string,
  column: unknown,
): Type {
  const castType =
    typeof adapter.lookupCastTypeFromColumn === "function"
      ? adapter.lookupCastTypeFromColumn(column)
      : null;
  let type = (castType as Type | null) ?? typeRegistry.lookup("value");
  // Only mutable StringType responds to toImmutableString, mirroring Ruby's
  // `type.respond_to?(:to_immutable_string)` guard.
  if (host.immutableStringsByDefault) {
    const toImmutable = (type as { toImmutableString?: () => Type }).toImmutableString;
    if (typeof toImmutable === "function") type = toImmutable.call(type);
  }
  return host.hookAttributeType?.(name, type) ?? type;
}

/**
 * Sync worker: apply a columns hash (already fetched from the schema
 * cache) to `_attributeDefinitions`. Shared by sync `loadSchema` and
 * async `loadSchemaFromAdapter`.
 *
 * `host` is always the class the load was triggered on: every class reflects
 * its OWN `table_name` into its own definitions and prototype
 * (model_schema.rb:587-597).
 */
// The enum decorator calls `columnForAttribute`, which calls `loadSchema`;
// without this guard that cycle recurses until the stack blows.
const replayingDecorators = new WeakSet<object>();

function applyColumnsHash(
  host: SchemaHost,
  adapter: { lookupCastTypeFromColumn?: (c: unknown) => unknown },
  hash: Record<string, unknown>,
): void {
  if (!Object.prototype.hasOwnProperty.call(host, "_attributeDefinitions")) {
    host._attributeDefinitions = new Map(host._attributeDefinitions);
  }

  const ignored = new Set(host._ignoredColumns ?? []);
  const filteredHash: Record<string, unknown> = {};
  for (const [name, column] of Object.entries(hash)) {
    if (ignored.has(name)) {
      // Remove the prototype accessor unconditionally so `name in record`
      // respects the ignore. Only drop the attribute def when it's
      // schema-sourced — user-declared defs survive `ignoredColumns`
      // per base.test.ts semantics.
      if (Object.prototype.hasOwnProperty.call(host.prototype, name)) {
        delete host.prototype[name];
      }
      const existing = host._attributeDefinitions.get(name);
      if (!existing || (existing.userProvided ?? true) === false) {
        host._attributeDefinitions.delete(name);
      }
      continue;
    }
    filteredHash[name] = column;
    const existing = host._attributeDefinitions.get(name);
    if (existing && (existing.userProvided ?? true)) {
      // A user-declared type override (e.g. an enum) preserves its type across
      // reflection. The schema column's default is NOT merged onto the def;
      // `_defaultAttributes` seeds it via from_database directly from the cached
      // column (Rails' column-seed-then-replay), then replays the user override.
      //
      // Stash the reflected `type_for_column` on the def so phase 1 of
      // `_defaultAttributes` can seed the override attribute with the real
      // column `Type::Value` — matching Rails, which seeds
      // `_default_attributes` from `type_for_column(connection, column)`
      // (attributes.rb:241-245) and then replays the user's pending
      // modifications on top. The decorators (enum / serialize / normalizes /
      // encryption) therefore receive the reflected column type as their
      // `subtype`; an explicit `attribute(name, type)` still wins because its
      // PendingType overrides the seed during the phase-2 replay. Computed here
      // (the adapter is in hand) via the SAME `type_for_column` pipeline the
      // non-user schema path uses — immutable-string conversion +
      // `hook_attribute_type` (attributes.rb:301-302, model_schema.rb:622-629).
      existing.reflectedColumnType = reflectedTypeForColumn(host, adapter, name, column);
      continue;
    }

    const reflectedColumnType = reflectedTypeForColumn(host, adapter, name, column);
    let type = reflectedColumnType;

    // Preserve encryption wrappers across schema reflection. Both
    // EncryptedAttributeType variants implement `WrappedType`; any
    // future type implementing the same contract is automatically
    // supported. No `instanceof` branching on concrete classes.
    const existingType = existing?.type;
    if (isWrappedType(existingType)) {
      type = existingType.withInnerType(type);
    }

    const defaultValue = (column as { default?: unknown }).default ?? null;
    const colLimit = (column as { limit?: number | null }).limit ?? null;
    const colDefaultFunction =
      (column as { defaultFunction?: string | null }).defaultFunction ?? null;

    host._attributeDefinitions.set(name, {
      name,
      type,
      // The BARE reflected `type_for_column` result, before the wrapper
      // preservation above re-applies any decoration already baked into
      // `type`. Rails seeds `_default_attributes` from `type_for_column`
      // (attributes.rb:241-245) and lets the pending-decorator queue do ALL
      // the wrapping; seeding from the decorated `type` instead double-applies
      // every decorator that also lives in the queue — e.g. `serialize` +
      // `encrypts` on one column yields Encrypted(Serialized(Encrypted(...))).
      reflectedColumnType,
      defaultValue,
      userProvided: false,
      source: "schema",
      ...(typeof host.tableName === "string" ? { reflectedTable: host.tableName } : {}),
      ...(colLimit != null ? { limit: colLimit } : {}),
      ...(colDefaultFunction != null ? { defaultFunction: colDefaultFunction } : {}),
    });

    // `id` is excluded from dirty-method generation here; its accessor (and any
    // stale own `id` property) is handled by defineAttributeMethods below.
    if (name === "id") continue;
    const proto = host.prototype;
    // The main attribute accessor and the *BeforeTypeCast / *ForDatabase
    // accessors are generated through defineAttributeMethods (invalidated +
    // regenerated below), not installed inline — mirroring Rails' single
    // define_attribute_methods generation path.
    // Per-attribute dirty methods (nameChanged, nameWas, nameChange, …).
    // Mirrors the call in activemodel's `attribute()` for user-declared attrs.
    // Guards inside defineDirtyAttributeMethods skip already-defined methods.
    defineDirtyAttributeMethods(proto, name);
  }

  // Regenerate attribute accessors through the single define_attribute_methods
  // path now that schema reflection has settled the attribute definitions.
  const methodHost = host as unknown as {
    _attributeMethodsGenerated?: boolean;
    defineAttributeMethods?: () => boolean;
  };
  methodHost._attributeMethodsGenerated = false;
  methodHost.defineAttributeMethods?.();

  type CacheBag = {
    _attributesBuilder?: unknown;
    _cachedDefaultAttributes?: unknown;
    _columnsHash?: unknown;
    _columns?: unknown;
  };
  const bag = host as CacheBag;
  bag._attributesBuilder = undefined;
  bag._cachedDefaultAttributes = null;
  bag._columns = undefined;
  host._columnsHash = filteredHash;

  // Encryption still needs a post-reflection pass — not for type wrapping (the
  // durable decorator was pushed at declaration; `typeForAttribute` resolves it)
  // but for column-size validation re-runs against the now-known DB limits.
  // `normalizes` / `serialize` push their durable decorator eagerly, so
  // — now that `type_for_attribute` / `TypeCaster::Map` resolve through
  // `attribute_types` — no per-feature `_attributeDefinitions` replay is needed.
  encryptionHooks.applyPendingEncryptions(host);

  // Now the DB column set is authoritative: re-run the ignoreCase
  // `original_<name>` requirement so a genuinely absent column raises even when
  // `encrypts(ignoreCase)` was declared before the adapter connected
  // (fail-closed, matching Rails). The reflected `hash` keys — not the eager
  // `columnNames()` partial-load path — are the source of truth here.
  const reflectedColumnNames = Object.keys(hash).filter((n) => !ignored.has(n));
  encryptionHooks.requireOriginalColumnsAfterReflection?.(host, reflectedColumnNames);

  // Mirrors ActiveModel::AttributeRegistration#_default_attributes rebuilding
  // from `columns_hash` and replaying the pending chain, so a `normalizes` /
  // `serialize` decoration survives the overwrite above. Restricted to reflected
  // columns: `_attributeDefinitions` is trails' eager type cache, not Rails'
  // `_default_attributes`, so replaying a NON-column attribute here would fire
  // guards Rails only raises when the default set is built (enum.rb:240-245).
  if (!replayingDecorators.has(host as object)) {
    replayingDecorators.add(host as object);
    try {
      const reflectedDefs = new Map(
        Object.keys(filteredHash)
          .filter((n) => host._attributeDefinitions.has(n))
          .map((n) => [n, host._attributeDefinitions.get(n)] as const),
      );
      replayOwnPendingDecorators(host as never, reflectedDefs as never);
      for (const [name, def] of reflectedDefs) host._attributeDefinitions.set(name, def);
    } finally {
      replayingDecorators.delete(host as object);
    }
  }

  // Reflection may change a column's type/default without changing the key set,
  // so the revision stamps cannot infer staleness from key coverage.
  host._schemaRevision = nextSchemaEpoch();
}

/**
 * Register attribute definitions from the adapter's schema cache.
 *
 * Mirrors: ActiveRecord::ModelSchema#load_schema! — walks `columns_hash`
 * and calls `define_attribute(..., user_provided_default: false)` for each
 * column so the cast type comes from the adapter (e.g. PG OID map) rather
 * than the generic ActiveModel type registry.
 *
 * Populates the schema cache if needed (async). User-declared attributes
 * (`userProvided: true`) are NEVER overwritten — matching Rails where
 * `attribute :foo, :bar` always wins over schema-reflected types.
 *
 * @internal
 */
export async function loadSchemaFromAdapter(this: SchemaHost): Promise<void> {
  if (getAbstractClass.call(this as any)) return;
  let startingAdapter: SchemaHost["connection"] | undefined;
  try {
    startingAdapter = reflectionAdapter(this);
  } catch {
    startingAdapter = undefined;
  }
  if (!startingAdapter) return;
  const adapterOwner = this;
  const cache = startingAdapter.schemaCache;
  if (!cache) return;
  const table = this.tableName;
  // Resolve a target for schemaCache lookups. If `.pool` is an actual ConnectionPool
  // (has `withConnection`), wrap startingAdapter in a FakePool — mirroring
  // Rails' BoundSchemaReflection.for_lone_connection. On lone-connection
  // pools (SQLite :memory: + size 1) the connection is already permanently
  // checked out, so calling pool.withConnection would deadlock; FakePool
  // yields the connection we already hold.
  const candidate = realPool(startingAdapter.pool) ?? startingAdapter;
  const pool =
    candidate && typeof (candidate as { withConnection?: unknown }).withConnection === "function"
      ? new FakePool(startingAdapter)
      : candidate;

  if (typeof cache.dataSourceExists === "function") {
    const exists = await cache.dataSourceExists(pool, table);
    if (exists === false) return;
  }

  let hash: Record<string, unknown> | undefined;
  if (typeof cache.columnsHash === "function") {
    hash = await cache.columnsHash(pool, table);
  } else if (typeof cache.getCachedColumnsHash === "function") {
    hash = cache.getCachedColumnsHash(table);
  }
  if (!hash) return;

  // Warm the primary-key cache alongside columns so the synchronous
  // `primary_key` resolution (getPrimaryKeyAttr) can detect a key-less data
  // source — e.g. a view, whose introspected primary key is null — instead of
  // assuming the "id" convention. Mirrors Rails' get_primary_key reading
  // connection.schema_cache.primary_keys(table_name).
  if (typeof cache.primaryKeys === "function") {
    await cache.primaryKeys(pool, table);
  }

  // Guard against adapter swaps during the async work above. Verify the
  // *same* host that supplied startingAdapter still has it — checking
  // other candidates would let a stale reflection slip through if the
  // adapter moved.
  let currentAdapter: SchemaHost["connection"] | undefined;
  try {
    currentAdapter = reflectionAdapter(adapterOwner);
  } catch {
    currentAdapter = undefined;
  }
  if (currentAdapter !== startingAdapter) return;

  applyColumnsHash(this, startingAdapter, hash);
}

/**
 * Real column names from the already-populated schema cache only — never issues
 * a query. Returns null when the table's columns aren't cached yet.
 */
function cachedColumnNames(host: SchemaHost): Set<string> | null {
  try {
    const cached = reflectionAdapter(host)?.schemaCache?.getCachedColumnsHash?.(host.tableName) as
      | Record<string, unknown>
      | undefined;
    if (cached) return new Set(Object.keys(cached));
  } catch {
    return null;
  }
  return null;
}

/**
 * Real column names, reflecting from the database when the schema cache is cold.
 * May issue a schema-introspection query, so only the write path uses it (reads
 * must not introduce queries — see the query-cache contract). Populates the
 * shared schema cache so subsequent lookups are warm. Returns null when the
 * columns can't be determined (no connection/schema, or reflection failed).
 */
async function reflectColumnNames(host: SchemaHost): Promise<Set<string> | null> {
  const cached = cachedColumnNames(host);
  if (cached) return cached;
  try {
    const conn = reflectionAdapter(host);
    const table = host.tableName;
    if (!conn || !table) return null;
    // Resolve columns through the shared schema cache so the reflection is
    // memoized (`getCachedColumnsHash` warms after this), making subsequent
    // cold-cache writes reconcile query-free. Mirror loadSchemaFromCache's
    // FakePool handling so a lone-connection pool (SQLite :memory:, size 1)
    // doesn't deadlock on withConnection.
    const cache = conn.schemaCache;
    if (cache && typeof cache.columnsHash === "function") {
      const candidate = realPool(conn.pool) ?? conn;
      const pool =
        candidate &&
        typeof (candidate as { withConnection?: unknown }).withConnection === "function"
          ? new FakePool(conn)
          : candidate;
      const hash = (await cache.columnsHash(pool, table)) as Record<string, unknown> | undefined;
      if (hash) {
        const names = Object.keys(hash);
        if (names.length > 0) {
          // The shared cache is now warm. A model that synthesized a minimal
          // columnsHash while the cache was cold (loadSchema's fallback set
          // `_schemaLoaded` with only the declared attrs) would otherwise keep
          // that stale view forever — leaving `columnNames()` reading the warm
          // cache's real columns while `attributeNames()` stays minimal. Drop
          // the flag so the next `loadSchema` re-reflects from the warm cache
          // and merges the real columns into `_attributeDefinitions`. The flag
          // drop does not bump `_schemaRevision`, so also drop the name memos
          // stamped against the synthesized view — otherwise `columnNames()`
          // keeps serving the pre-warm list.
          if (ownSchemaMemo(host, "_schemaLoaded")) {
            host._schemaLoaded = false;
            host._columnsHash = undefined;
            host._columns = undefined;
            clearAttributeNamesMemo(host);
          }
          return new Set(names);
        }
      }
      return null;
    }
    // No schema cache available — fall back to a raw introspection query.
    if (typeof conn.columns !== "function") return null;
    const cols = (await conn.columns(table)) as Array<{ name: string }> | undefined;
    if (Array.isArray(cols) && cols.length > 0) {
      return new Set(cols.map((c) => c.name));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Flag any user-declared attribute that has no backing DB column as virtual.
 *
 * `column_names` in Rails is always `columns.map(&:name)` — purely DB-sourced —
 * so a user attribute declared via `attribute()` that isn't a real column never
 * appears in it (model_schema.rb#column_names; attribute_methods.rb
 * #attributes_for_create/#attributes_for_update intersect with it). In trails,
 * `ensureSchemaLoaded` short-circuits once a model declares its own attribute(),
 * leaving the synthesized columnsHash unable to tell a virtual attribute from a
 * real column. Reconcile against the table's actual columns here so the existing
 * `virtual` flag — already honored by `columnNames`/`columnsHash`/
 * `attributesForCreate` — excludes them. Schema-sourced defs and real columns
 * are left untouched (types included — this only sets the flag). The decision is
 * purely positional — a user attribute is virtual iff it has no DB column — so
 * it reclassifies in BOTH directions: an attribute that gains a real column on a
 * later reflection (e.g. after `resetColumnInformation`) is unflagged. The
 * one-shot guard is cleared whenever the schema caches or attribute set change
 * (`resetColumnInformation`, `attribute()`), so a reset/re-declare re-runs.
 *
 * `reflect` controls whether a cold schema cache may trigger an introspection
 * query: the write path (persistence) passes `true`; the generic read path
 * (`ensureSchemaLoaded`) passes `false` so a query is never issued on reads —
 * Rails likewise does not re-introspect on a cached read (the residual cold-read
 * gap is the documented sync/async limitation). With `reflect: false` and a cold
 * cache this is a no-op that leaves the guard unset, so a later write reconciles.
 *
 * @internal
 */
export async function reconcileVirtualAttributes(this: SchemaHost, reflect = false): Promise<void> {
  const host = this;
  if (ownSchemaMemo(host, "_virtualAttributesReconciled")) return;
  const real = reflect ? await reflectColumnNames(host) : cachedColumnNames(host);
  if (!real) return;
  for (const [name, def] of host._attributeDefinitions) {
    const userDeclared =
      (def.source ?? (def.userProvided === false ? "schema" : "user")) === "user";
    if (!userDeclared) continue;
    const isVirtual = !real.has(name);
    if (!!def.virtual !== isVirtual) def.virtual = isVirtual;
  }
  host._virtualAttributesReconciled = true;
}

/**
 * Sync counterpart: consult the already-populated schema cache only.
 * Returns true if reflection happened; false when the cache is empty
 * (caller may fall back to attribute-defs-derived metadata).
 */
function loadSchemaFromCacheSync(host: SchemaHost): boolean {
  if (getAbstractClass.call(host as any)) return false;
  // Access can throw when no pool is configured; treat as "no adapter".
  let adapter: SchemaHost["connection"] | undefined;
  try {
    adapter = reflectionAdapter(host);
  } catch {
    adapter = undefined;
  }
  if (!adapter) return false;
  const cache = adapter.schemaCache;
  if (!cache || typeof cache.getCachedColumnsHash !== "function") return false;
  const table = host.tableName;
  // Gate on `_columnsHash` (the map we read) rather than `isCached`/`_columns`,
  // so an out-of-sync `_columns` entry can't pass the guard and yield undefined.
  const hash = cache.getCachedColumnsHash(table);
  if (!hash) return false;
  applyColumnsHash(host, adapter, hash);
  return true;
}

export function tableName(this: SchemaHost, value?: string): string {
  if (value !== undefined) {
    const changed = this._tableName !== value;
    this._tableName = value;
    if (changed) {
      // Rails table_name= runs `reset_column_information if connected?`, which
      // resets the predicate builder and (via initialize_find_by_cache) the
      // find_by statement cache. We have no connection-pool `connected?`
      // gate, so we clear these two caches eagerly and directly (rather than
      // routing through the heavier resetColumnInformation/schema reload) so
      // the next query rebuilds against the new table.
      (this as { _predicateBuilder?: unknown })._predicateBuilder = null;
      (this as { _findByStatementCache?: unknown })._findByStatementCache = undefined;
      // Rails reset_column_information also reloads the schema so the new
      // table's columns are re-reflected. A subclass created with a different
      // table_name (e.g. `Class.new(Minimalistic) { self.table_name = "aircraft" }`)
      // inherits the parent's `_schemaLoaded = true` through the prototype
      // chain and would otherwise never reflect its own table. Shadow the
      // inherited flag with an own `false` so the next load re-reflects.
      (this as { _schemaLoaded?: boolean })._schemaLoaded = false;
      // Rails' reset_column_information also nils @attribute_names (on the
      // class and, recursively, its descendants); drop the memos now so reads
      // before the next load don't see the old table's names.
      clearAttributeNamesMemo(this);
    }
  }
  return resolveTableName.call(this as any);
}

export function protectedEnvironments(this: SchemaHost, value?: string[]): string[] {
  if (value !== undefined) this._protectedEnvironments = value.map(String);
  return this._protectedEnvironments ?? ["production"];
}

export function inheritanceColumn(this: SchemaHost, value?: string | null): string | null {
  // An explicit `null` disables STI (Rails: `self.inheritance_column = nil`) and
  // must stay distinguishable from "unset". Store it verbatim — `undefined` alone
  // means unset and falls through to the "type" default below.
  if (value !== undefined) this._inheritanceColumn = value;
  if (this._inheritanceColumn === null) return null;
  // Rails defaults `inheritance_column` to "type" for every model.
  return this._inheritanceColumn ?? "type";
}

export function sequenceName(this: SchemaHost, value?: string | null): string | null {
  if (value !== undefined) {
    this._sequenceName = value;
    return value;
  }
  const pk = this.primaryKey;
  if (Array.isArray(pk)) return this._sequenceName;
  return this._sequenceName ?? `${this.tableName}_${pk}_seq`;
}

export function ignoredColumns(this: SchemaHost, value?: string[]): string[] {
  if (value !== undefined) {
    reloadSchemaFromCache.call(this);
    this._ignoredColumns = value.map(String);
    for (const col of value) {
      if (col in this.prototype) {
        Object.defineProperty(this.prototype, col, {
          get: undefined,
          set: undefined,
          configurable: true,
        });
        delete (this.prototype as any)[col];
      }
    }
  }
  return this._ignoredColumns ?? [];
}

/** Mirrors: ActiveRecord::ModelSchema::ClassMethods#column_defaults */
export function columnDefaults(this: SchemaHost): Record<string, unknown> {
  return this._defaultAttributes().deepDup().toHash();
}

/**
 * Synchronous, cache-only view of `tableExists`: `false` only when the schema
 * cache has already resolved this table as absent, `undefined` when unknown
 * (cold cache / no adapter). Sync callers of Rails' `table_exists?` guard
 * (class-level `attribute_names`) use this since `tableExists` is async.
 *
 * @internal
 */
export function cachedTableExists(this: SchemaHost): boolean | undefined {
  let conn: any;
  try {
    conn = reflectionAdapter(this);
  } catch {
    return undefined;
  }
  const cache = conn?.schemaCache;
  if (!cache || typeof cache.getCachedDataSourceExists !== "function") return undefined;
  return cache.getCachedDataSourceExists(this.tableName);
}

export async function tableExists(this: SchemaHost): Promise<boolean> {
  const conn = reflectionAdapter(this);
  const cache = conn.schemaCache;
  if (!cache || typeof cache.dataSourceExists !== "function") return true;
  const pool = realPool(conn.pool) ?? conn;
  const exists = await cache.dataSourceExists(pool, this.tableName);
  return exists !== false;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 *
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention: a Concern
 * module exposes a `ClassMethods` object whose members become class methods
 * on any class that includes the Concern. Grouping them here keeps the
 * mixin surface colocated with the implementations.
 *
 * Not included:
 * - `resolveTableName`, `buildPkWhere`, `buildPkWhereNode` — internal helpers
 *   that back the `tableName` getter and the underscore-prefixed
 *   `_buildPkWhere*` accessors. They use the `this:` convention for internal
 *   consistency but aren't Rails-style class methods.
 * - `realInheritanceColumn` — internal setter alias; `Base` already exposes
 *   `inheritanceColumn` as a getter/setter.
 * - `loadSchema` — private lifecycle hook in Rails; called automatically
 *   rather than by user code.
 * - `tableName`, `sequenceName`, `protectedEnvironments`, `ignoredColumns`,
 *   `inheritanceColumn` — implemented as static getter/setter pairs on `Base`
 *   directly; `columnDefaults` is a getter-only property on `Base`. Adding
 *   these to `ClassMethods` would cause `extend()` to overwrite the getter
 *   descriptor with a plain property assignment, breaking lazy-evaluation
 *   semantics.
 */
export const ClassMethods = {
  // Mirrors: ActiveRecord::ModelSchema::ClassMethods
  columnNames,
  hasAttributeDefinition,
  columnsHash,
  contentColumns,
  createTable,
  quotedTableName,
  resetTableName,
  fullTableNamePrefix,
  fullTableNameSuffix,
  resetSequenceName,
  isPrefetchPrimaryKey,
  nextSequenceValue,
  attributesBuilder,
  columns,
  attributeSetCoder,
  columnForAttribute,
  symbolColumnToString,
  resetColumnInformation,
  _returningColumnsForInsert,
  loadSchemaFromAdapter,
};

/** @internal */
function yamlEncoder(this: SchemaHost): AttributeSetCoder {
  return attributeSetCoder.call(this);
}

/** @internal */
function initializeLoadSchemaMonitor(this: SchemaHost): void {
  // no-op: JS is single-threaded; no Monitor/Mutex needed
}

/** @internal */
export function isSchemaLoaded(this: SchemaHost): boolean {
  return ownSchemaMemo(this, "_schemaLoaded") ?? false;
}

/** @internal */
function loadSchemaBang(this: SchemaHost): void {
  loadSchema.call(this);
}

/** @internal */
function computeTableName(this: SchemaHost): string {
  return resolveTableName.call(this as any);
}

/** @internal */
function typeForColumn(this: SchemaHost, connection: any, column: any): any {
  if (typeof connection?.lookupCastTypeFromColumn === "function") {
    return connection.lookupCastTypeFromColumn(column);
  }
  return null;
}
