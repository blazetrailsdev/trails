import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import {
  Attribute,
  AttributeSetBuilder,
  AttributeSetCoder,
  typeRegistry,
  defineDirtyAttributeMethods,
  type Type,
} from "@blazetrails/activemodel";
import {
  isStiSubclass,
  getStiBase,
  isBaseClass,
  baseClass,
  getAbstractClass,
  qualifiedName,
  lookupModuleTableNamePrefix,
  lookupModuleTableNameSuffix,
} from "./inheritance.js";
import { singularize } from "@blazetrails/activesupport";
import { modelRegistry } from "./associations.js";
import { TableNotSpecified } from "./errors.js";
import { encryptionHooks } from "./encryption-hooks.js";
import { isWrappedType } from "./encryption/wrapped-type.js";
import { FakePool } from "./connection-adapters/schema-cache.js";

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
  const inferred = undecoratedTableName(qualifiedName(this as any));
  return `${prefix}${contained}${inferred}${suffix}`;
}

/**
 * Guesses the table name, but does not decorate it with prefix and suffix.
 *
 * @internal
 */
function undecoratedTableName(modelName: string): string {
  const demodulized = modelName.split("::").pop() ?? modelName;
  return pluralize(underscore(demodulized));
}

/**
 * Rails `compute_table_name`'s nested-class arm: when the immediate
 * `module_parent` is itself a concrete AR model, the table is prefixed with the
 * singularized parent table name — `Client::Contact` → `company_contacts`.
 * Mirrors model_schema.rb:608-612.
 *
 * Rails guards the `singularize` with `if module_parent.pluralize_table_names`
 * (model_schema.rb:610). trails has no `pluralize_table_names` toggle — it is
 * always on (Rails' default) — so the singularize is unconditional here.
 */
function containedTableNamePrefix(this: typeof Base): string {
  const moduleName = (this as any).moduleName as string | undefined;
  if (!moduleName) return "";
  const parent = modelRegistry.get(moduleName);
  if (!parent || getAbstractClass.call(parent as any)) return "";
  return `${singularize(parent.tableName)}_`;
}

// ---------------------------------------------------------------------------
// Primary key helpers
// ---------------------------------------------------------------------------

/**
 * Build a WHERE clause string for the primary key of a given record.
 *
 * Mirrors: used throughout ActiveRecord persistence internals
 */
export function buildPkWhere(this: typeof Base, idValue: unknown): string {
  const pk = this.primaryKey;
  const a = this.connection;
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
 * Mirrors: used with Arel managers for type-safe SQL generation
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
 */
export function buildWhereNodeFromConstraints(
  this: typeof Base,
  constraints: Record<string, unknown>,
): InstanceType<typeof Nodes.Node> {
  const table = this.arelTable;
  const conditions: InstanceType<typeof Nodes.Node>[] = [];
  for (const [col, value] of Object.entries(constraints)) {
    const attr = table.get(col);
    conditions.push(value === undefined || value === null ? attr.isNull() : attr.eq(value));
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
 * (`columns.map(&:name)`, i.e. the `columns_hash` keys).
 */
export function columnNames(this: typeof Base): string[] {
  // Abstract classes have no concrete table, and `columnsHash` throws for them.
  // Fall back to the declared (non-virtual) attribute names so introspecting an
  // abstract model doesn't blow up — matches the pre-columnsHash behavior.
  if (this.abstractClass) {
    const ignored = new Set(this.ignoredColumns ?? []);
    const out: string[] = [];
    for (const [name, def] of this._attributeDefinitions) {
      if (ignored.has(name)) continue;
      if ((def as { virtual?: boolean }).virtual) continue;
      out.push(name);
    }
    return out;
  }
  return Object.keys(this.columnsHash());
}

/**
 * Check if a model class has a given attribute defined.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#has_attribute?
 */
export function hasAttributeDefinition(this: typeof Base, name: string): boolean {
  return this._attributeDefinitions.has(name);
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

  // STI-aware adapter + table resolution: adapter may live on the base
  // OR the concrete subclass. Use the same candidate-list logic the
  // schema loader uses so `Circle.columnsHash()` can still pull the
  // cached Column objects from Shape's adapter.
  const klass = this;
  const stiTarget = isStiSubclass(klass) ? getStiBase(klass) : klass;
  const candidates = stiTarget === klass ? [klass] : [stiTarget, klass];
  let adapter: DatabaseAdapterLike | null = null;
  for (const cand of candidates) {
    try {
      adapter = cand.connection as DatabaseAdapterLike;
    } catch {
      adapter = null;
    }
    if (adapter) break;
  }
  const cache = adapter?.schemaCache as
    | {
        getCachedColumnsHash?: (t: string) => Record<string, ColumnLike> | undefined;
      }
    | undefined;
  const table = stiTarget.tableName;
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
 * Return content columns (excluding PK, FKs, and timestamps).
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#content_columns
 */
export function contentColumns(this: typeof Base): string[] {
  const pk = this.primaryKey;
  return columnNames.call(this).filter((col) => {
    if (col === pk) return false;
    if (col.endsWith("_id")) return false;
    if (col === "created_at" || col === "updated_at") return false;
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
export function sqlTypeFor(typeName: string, adapterName?: string): string {
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

  await a.executeMutation(`DROP TABLE IF EXISTS ${a.quoteTableName(table)}`);

  const colDefs: string[] = [];
  if (pks.length === 1) {
    const pk = pks[0];
    const pkDef = isPg
      ? `${a.quoteIdentifier(pk)} SERIAL PRIMARY KEY`
      : isMysql
        ? `${a.quoteIdentifier(pk)} BIGINT AUTO_INCREMENT PRIMARY KEY`
        : `${a.quoteIdentifier(pk)} INTEGER PRIMARY KEY AUTOINCREMENT`;
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

  await a.executeMutation(
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
  _attributesBuilder?: any;
  _schemaLoaded?: boolean;
  _virtualAttributesReconciled?: boolean;
  connection: any;
  prototype: Record<string, unknown>;
  superclass?: SchemaHost;
  hookAttributeType?(name: string, type: Type): Type;
}

export function deriveJoinTableName(this: SchemaHost, otherTableName: string): string {
  const tables = [underscore(this.name), otherTableName].sort();
  return tables.join("_");
}

export function quotedTableName(this: SchemaHost): string {
  return this.connection.quoteTableName(this.tableName);
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
  const cols = columns.call(this) as { name: string; isAutoPopulated?: unknown }[];
  const autoPopulated = cols
    .filter(
      (c) => typeof c.isAutoPopulated === "function" && connection.returnValueAfterInsert?.(c),
    )
    .map((c) => c.name);
  if (autoPopulated.length > 0) return autoPopulated;
  // PK fallback. Restrict to columns that actually exist on the table: Rails
  // reflects `primary_key` as nil for a table without that column (e.g. an
  // id-less HABTM join table whose model still defaults `primary_key` to "id"),
  // so `Array(primary_key)` is empty there — which also keeps the scalar
  // write-back from storing a phantom `id` attribute on an id-less model.
  const colNames = new Set(cols.map((c) => c.name));
  const pk = this.primaryKey;
  const pkArr = Array.isArray(pk) ? pk : pk ? [pk] : [];
  return pkArr.filter((p) => colNames.has(p));
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
  if (this._attributesBuilder) return this._attributesBuilder;

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

  // STI: write cache to the base so subclasses inherit via prototype
  // chain, and a base reset propagates automatically.
  const cacheHost = isStiSubclass(this) ? (getStiBase(this) as SchemaHost) : this;
  cacheHost._attributesBuilder = new AttributeSetBuilder(types, defaults);
  // If we are an STI subclass, resetDefaultAttributes() may have placed an
  // own-property shadow of `undefined` on `this` to block stale inheritance.
  // Now that cacheHost has a fresh builder, remove the shadow so subsequent
  // calls on this STI subclass find cacheHost's builder via prototype chain
  // instead of rebuilding on every access.
  if (cacheHost !== this && Object.prototype.hasOwnProperty.call(this, "_attributesBuilder")) {
    delete this._attributesBuilder;
  }
  return cacheHost._attributesBuilder;
}

/**
 * Rails: @columns ||= columns_hash.values.freeze
 */
export function columns(this: SchemaHost): any[] {
  if (this._columns) return this._columns;
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  const cacheHost = isStiSubclass(this) ? (getStiBase(this) as SchemaHost) : this;
  cacheHost._columns = Object.values(hash);
  return cacheHost._columns;
}

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
 * Resolved WITHOUT leasing a connection — Rails keeps `reset_column_information`
 * inert (`active_connection&.`, schema_cache reached via the pool). We prefer a
 * directly-assigned adapter (`Base.adapter=` bypasses the pool), else the
 * pool-level schema cache; both skip `leaseConnection()`. Best-effort: a model
 * with no pool/table simply has nothing to clear.
 */
function clearAdapterDataSourceCache(host: SchemaHost): void {
  // The raw, sync SchemaCache — `clearDataSourceCacheBang(connection, name)`.
  // NOT the pool's BoundSchemaReflection (async, single-arg `(name)`); reaching
  // for that form here would clear a table named `null` and leave a floating
  // Promise. Both branches below resolve the raw cache, matching what the
  // adapter's own `schemaCache` getter returns (abstract-adapter.ts).
  type Cache = { clearDataSourceCacheBang?: (connection: unknown, name: string) => void };
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
  if (table && typeof cache?.clearDataSourceCacheBang === "function") {
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
  // STI subclasses share the base's defs. Redirect the reset to the base
  // so schema-sourced defs and accessors are actually cleared; clear the
  // subclass-local caches too so any forked metadata is dropped.
  if (isStiSubclass(this)) {
    // Delete own properties rather than assigning undefined/false, so
    // the subclass inherits the base's freshly-rebuilt caches via the
    // prototype chain instead of shadowing them.
    for (const key of [
      "_columnsHash",
      "_columns",
      "_attributesBuilder",
      "_schemaLoaded",
      "_cachedDefaultAttributes",
      "_virtualAttributesReconciled",
    ]) {
      if (Object.prototype.hasOwnProperty.call(this, key)) Reflect.deleteProperty(this, key);
    }
    // Scrub schema-sourced entries from any subclass-forked
    // _attributeDefinitions too (from a prior attribute() /
    // decorateAttributes / encrypts call). Without this, schema defs
    // leak past the reset on subclasses that forked their own map.
    if (Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
      for (const [name, def] of Array.from(this._attributeDefinitions)) {
        if ((def.userProvided ?? true) === false || def.source === "schema") {
          this._attributeDefinitions.delete(name);
          if (Object.prototype.hasOwnProperty.call(this.prototype, name)) {
            delete this.prototype[name];
          }
        }
      }
    }
    resetColumnInformation.call(getStiBase(this) as SchemaHost);
    return;
  }
  this._columnsHash = undefined;
  this._columns = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
  this._virtualAttributesReconciled = false;
  (this as SchemaHost & { _cachedDefaultAttributes?: unknown })._cachedDefaultAttributes = null;
  (this as SchemaHost & { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
  // Mirrors Rails reset_column_information's
  // `schema_cache.clear_data_source_cache!(table_name)` (model_schema.rb): drop
  // the connection's per-table reflected columns so the next load re-reads from
  // the database. trails bakes the resolved cast type into each cached Column,
  // so this is also what lets a toggled `emulate_booleans` re-resolve
  // tinyint(1) columns; without it the stale boolean/integer type would survive.
  clearAdapterDataSourceCache(this);
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) return;
  for (const [name, def] of Array.from(this._attributeDefinitions)) {
    if ((def.userProvided ?? true) === false || def.source === "schema") {
      this._attributeDefinitions.delete(name);
      if (Object.prototype.hasOwnProperty.call(this.prototype, name)) {
        delete this.prototype[name];
      }
    }
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
  if (this._schemaLoaded) return;

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

  // The class that actually owns the schema load — the STI base when
  // `this` is a subclass. We set `_schemaLoaded` only on the workHost
  // so subclasses inherit the flag via the prototype chain. Assigning
  // on the subclass would shadow the base flag and prevent re-reflection
  // when the base is reset. Delete any stale own-flag on the subclass.
  const workHost = isStiSubclass(this) ? (getStiBase(this) as SchemaHost) : this;
  if (workHost !== this && Object.prototype.hasOwnProperty.call(this, "_schemaLoaded")) {
    delete this._schemaLoaded;
  }

  const reflected = loadSchemaFromCacheSync(this);
  if (reflected) {
    workHost._schemaLoaded = true;
    return;
  }

  // Cache-miss path: with the schema cache always warm (RFC 0031), a
  // table-backed model reflects from the persistent cache entry above and
  // returns — so the int8→BigInt PK divergence that the old `_castAttributeValue`
  // parseInt fallback worried about cannot arise on this path. Reaching here
  // means a genuinely tableless attribute-only model (the synthesize fallback
  // below builds its `columnsHash` from declared attributes), which has no
  // adapter-resolved PK type at all. If such a model still lacks a typed
  // primary-key def, do NOT mark the load terminal: leaving `_schemaLoaded`
  // unset lets a later load replace the synthesized view with real reflected
  // columns once a cache entry exists. `_castAttributeValue` returning the raw
  // string id for a tableless model in the meantime is harmless — there is no
  // DB column type to cast through.
  let pkStillMissing = false;
  if (workHost._attributeDefinitions.size > 0) {
    const pks = Array.isArray(workHost.primaryKey)
      ? workHost.primaryKey
      : workHost.primaryKey != null
        ? [workHost.primaryKey]
        : [];
    if (pks.some((pk) => !workHost._attributeDefinitions.has(pk))) {
      pkStillMissing = true;
    }
  }

  // Fallback: no schema cache — synthesize a columnsHash view on the
  // work host so subclasses don't fork _columnsHash (which would persist
  // past a later base reflection).
  if (!workHost._columnsHash && workHost._attributeDefinitions.size > 0) {
    const hash: Record<string, unknown> = {};
    const ignored = new Set(workHost._ignoredColumns ?? []);
    for (const [name, def] of workHost._attributeDefinitions) {
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
    workHost._columnsHash = hash;
  }
  if (!pkStillMissing) workHost._schemaLoaded = true;
}

function getColumnsHash(host: SchemaHost): Record<string, unknown> {
  if (host._columnsHash != null) return host._columnsHash;
  const ch = (host as any).columnsHash;
  if (typeof ch === "function") return ch.call(host) ?? {};
  return {};
}

/**
 * Sync worker: apply a columns hash (already fetched from the schema
 * cache) to `_attributeDefinitions`. Shared by sync `loadSchema` and
 * async `loadSchemaFromAdapter`.
 *
 * STI note: for STI subclasses, `host` is the STI base, so the base's
 * `_ignoredColumns` governs which columns get accessors on the shared
 * prototype. Per-subclass `ignoredColumns` is still honored at read
 * time in `columnsHash()` (filters the returned hash), but it cannot
 * retroactively remove a prototype accessor already defined on the
 * base — a consequence of TypeScript not having Ruby's method_missing.
 * Subclass `attribute()` and `encrypts()` calls route through the STI
 * base (see base.ts), so those specific flows don't create forked-map
 * shadowing. Other decorators that mutate `_attributeDefinitions`
 * directly on the calling class may still fork until they're routed
 * through the same shared owner — add them to the STI redirect list
 * in base.ts when they're introduced.
 */
function applyColumnsHash(
  host: SchemaHost,
  adapter: { lookupCastTypeFromColumn?: (c: unknown) => unknown },
  hash: Record<string, unknown>,
  /**
   * Class the load was originally triggered on. Differs from `host` in
   * STI: reflection lands on the base, but any caches the subclass
   * already populated (`_columns`, `_columnsHash`, `_attributesBuilder`)
   * would otherwise stay stale indefinitely.
   */
  originatingHost?: SchemaHost,
): void {
  if (!Object.prototype.hasOwnProperty.call(host, "_attributeDefinitions")) {
    host._attributeDefinitions = new Map(host._attributeDefinitions);
  }

  const ignored = new Set(host._ignoredColumns ?? []);
  for (const [name, column] of Object.entries(hash)) {
    if (ignored.has(name)) {
      // Remove the prototype accessor unconditionally so `name in record`
      // respects the ignore. Only drop the attribute def when it's
      // schema-sourced — user-declared defs survive `ignoredColumns`
      // per base.test.ts semantics.
      if (Object.prototype.hasOwnProperty.call(host.prototype, name)) {
        delete host.prototype[name];
      }
      // STI: also strip a subclass-owned accessor if the originating
      // host declared the attribute on itself, or `"col" in record` on
      // the subclass would still return true.
      if (originatingHost && originatingHost !== host) {
        if (Object.prototype.hasOwnProperty.call(originatingHost.prototype, name)) {
          delete originatingHost.prototype[name];
        }
      }
      const existing = host._attributeDefinitions.get(name);
      if (!existing || (existing.userProvided ?? true) === false) {
        host._attributeDefinitions.delete(name);
      }
      continue;
    }
    const existing = host._attributeDefinitions.get(name);
    if (existing && (existing.userProvided ?? true)) continue;

    const castType =
      typeof adapter.lookupCastTypeFromColumn === "function"
        ? adapter.lookupCastTypeFromColumn(column)
        : null;
    let type = (castType as Type | null) ?? typeRegistry.lookup("value");

    type = host.hookAttributeType?.(name, type) ?? type;

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
      defaultValue,
      userProvided: false,
      source: "schema",
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
  const invalidate = (h: SchemaHost, { deleteOwn }: { deleteOwn: boolean }) => {
    if (deleteOwn) {
      // Delete own properties so `h` inherits freshly-rebuilt caches
      // from its prototype chain (used for the STI subclass case).
      for (const key of [
        "_attributesBuilder",
        "_cachedDefaultAttributes",
        "_columnsHash",
        "_columns",
      ]) {
        if (Object.prototype.hasOwnProperty.call(h, key)) Reflect.deleteProperty(h, key);
      }
      return;
    }
    const bag = h as CacheBag;
    bag._attributesBuilder = undefined;
    bag._cachedDefaultAttributes = null;
    bag._columnsHash = undefined;
    bag._columns = undefined;
  };
  invalidate(host, { deleteOwn: false });
  if (originatingHost && originatingHost !== host) invalidate(originatingHost, { deleteOwn: true });

  encryptionHooks.applyPendingEncryptions(host);

  // STI: if the subclass previously forked _attributeDefinitions (via
  // attribute()/decorateAttributes()/encrypts()), carry its entries
  // into the shared base map before unifying references — naive
  // reassignment would silently discard subclass-declared attributes.
  // Precedence: subclass user-provided entries win over base non-user
  // entries; otherwise base wins (Rails' STI shares attribute_types,
  // but subclass declarations extend it).
  if (originatingHost && originatingHost !== host) {
    const baseDefs = host._attributeDefinitions;
    const subDefs = originatingHost._attributeDefinitions;
    if (
      baseDefs instanceof Map &&
      subDefs instanceof Map &&
      subDefs !== baseDefs &&
      Object.prototype.hasOwnProperty.call(originatingHost, "_attributeDefinitions")
    ) {
      for (const [name, def] of subDefs) {
        const existing = baseDefs.get(name);
        const subIsUser = (def.userProvided ?? true) === true;
        const baseIsUser = existing ? (existing.userProvided ?? true) === true : false;
        if (!existing || (subIsUser && !baseIsUser)) {
          baseDefs.set(name, def);
        }
      }
    }
    originatingHost._attributeDefinitions = baseDefs;
    encryptionHooks.applyPendingEncryptions(originatingHost);
  }
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
 */
export async function loadSchemaFromAdapter(this: SchemaHost): Promise<void> {
  if (getAbstractClass.call(this as any)) return;
  // STI subclasses inherit the base's attribute defs — reflect onto the
  // STI base without forking. Use whichever class has the adapter
  // configured (base in normal Rails setup, but tolerate subclass-only
  // configuration).
  const schemaHost = isStiSubclass(this) ? (getStiBase(this) as SchemaHost) : this;

  let startingAdapter: SchemaHost["connection"] | undefined;
  let adapterOwner: SchemaHost | undefined;
  const candidates: SchemaHost[] = schemaHost === this ? [schemaHost] : [schemaHost, this];
  for (const cand of candidates) {
    try {
      startingAdapter = cand.connection;
    } catch {
      startingAdapter = undefined;
    }
    if (startingAdapter) {
      adapterOwner = cand;
      break;
    }
  }
  if (!startingAdapter || !adapterOwner) return;
  const cache = startingAdapter.schemaCache;
  if (!cache) return;
  const table = schemaHost.tableName;
  // Resolve a target for schemaCache lookups. If `.pool` is an actual ConnectionPool
  // (has `withConnection`), wrap startingAdapter in a FakePool — mirroring
  // Rails' BoundSchemaReflection.for_lone_connection. On lone-connection
  // pools (SQLite :memory: + size 1) the connection is already permanently
  // checked out, so calling pool.withConnection would deadlock; FakePool
  // yields the connection we already hold.
  const candidate = startingAdapter.pool ?? startingAdapter;
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
    currentAdapter = adapterOwner.connection;
  } catch {
    currentAdapter = undefined;
  }
  if (currentAdapter !== startingAdapter) return;

  applyColumnsHash(schemaHost, startingAdapter, hash, this);
}

/**
 * Real column names from the already-populated schema cache only — never issues
 * a query. Returns null when the table's columns aren't cached yet.
 */
function cachedColumnNames(host: SchemaHost): Set<string> | null {
  try {
    const cached = host.connection?.schemaCache?.getCachedColumnsHash?.(host.tableName) as
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
    const conn = host.connection;
    const table = host.tableName;
    if (!conn || !table) return null;
    // Resolve columns through the shared schema cache so the reflection is
    // memoized (`getCachedColumnsHash` warms after this), making subsequent
    // cold-cache writes reconcile query-free. Mirror loadSchemaFromCache's
    // FakePool handling so a lone-connection pool (SQLite :memory:, size 1)
    // doesn't deadlock on withConnection.
    const cache = conn.schemaCache;
    if (cache && typeof cache.columnsHash === "function") {
      const candidate = conn.pool ?? conn;
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
          // and merges the real columns into `_attributeDefinitions`.
          if (host._schemaLoaded) host._schemaLoaded = false;
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
  const host = isStiSubclass(this) ? (getStiBase(this) as SchemaHost) : this;
  if (host._virtualAttributesReconciled) return;
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
  // STI subclasses share the base's table and attribute defs. Reflecting
  // on a subclass would fork _attributeDefinitions; instead, apply
  // reflection to the STI base so subclasses inherit it.
  const schemaHost = isStiSubclass(host) ? (getStiBase(host) as SchemaHost) : host;
  // Adapter may be configured on the base OR on the subclass. Try base
  // first (Rails-normal), fall back to the originating host. Access can
  // throw when no pool is configured; treat as "no adapter".
  let adapter: SchemaHost["connection"] | undefined;
  const candidates = schemaHost === host ? [schemaHost] : [schemaHost, host];
  for (const cand of candidates) {
    try {
      adapter = cand.connection;
    } catch {
      adapter = undefined;
    }
    if (adapter) break;
  }
  if (!adapter) return false;
  const cache = adapter.schemaCache;
  if (!cache || typeof cache.getCachedColumnsHash !== "function") return false;
  const table = schemaHost.tableName;
  // Gate on `_columnsHash` (the map we read) rather than `isCached`/`_columns`,
  // so an out-of-sync `_columns` entry can't pass the guard and yield undefined.
  const hash = cache.getCachedColumnsHash(table);
  if (!hash) return false;
  applyColumnsHash(schemaHost, adapter, hash, host);
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
    this._ignoredColumns = value;
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

export async function tableExists(this: SchemaHost): Promise<boolean> {
  const conn = this.connection;
  const cache = conn.schemaCache;
  if (!cache || typeof cache.dataSourceExists !== "function") return true;
  const pool = conn.pool ?? conn;
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
  deriveJoinTableName,
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
function reloadSchemaFromCache(this: SchemaHost, recursive = true): void {
  resetColumnInformation.call(this);
  if (recursive) {
    const subclasses: SchemaHost[] = (this as any).subclasses ?? [];
    for (const sub of subclasses) {
      reloadSchemaFromCache.call(sub, true);
    }
  }
}

/** @internal */
function isSchemaLoaded(this: SchemaHost): boolean {
  return this._schemaLoaded ?? false;
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
