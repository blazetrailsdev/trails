import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import {
  AttributeSet,
  AttributeSetBuilder,
  YAMLEncoder,
  PendingDefault,
  PendingType,
  type Attribute,
  type Type,
} from "@blazetrails/activemodel";
import {
  isBaseClass,
  baseClass,
  lookupModuleTableNamePrefix,
  lookupModuleTableNameSuffix,
} from "./inheritance.js";
import { singularize } from "@blazetrails/activesupport";
import { modelRegistry } from "./associations.js";
import { TableNotSpecified } from "./errors.js";
import { loadSchemaOverrides } from "./load-schema-overrides-slot.js";
import { encryptionHooks } from "./encryption-hooks.js";
import { FakePool } from "./connection-adapters/schema-cache.js";
import { NullColumn } from "./connection-adapters/column.js";
import {
  threadedConnectionFor,
  connectionPool,
  withConnection,
  connectedQ,
} from "./connection-handling.js";

/**
 * Adapter for a schema-reflection read: prefer the connection threaded by the
 * enclosing internal `with_connection` wrap ({@link threadedConnectionFor}) —
 * matching Rails, whose `load_schema!` and friends take the connection as the
 * `with_connection` block parameter (`model_schema.rb`) rather than
 * re-resolving `.connection`.
 *
 * Without a wrap it resolves the pool directly rather than through the
 * deprecated `Model.connection` getter, which leases: inside a plain
 * `withConnection` body it flips the lease permanent just to read a column
 * hash. `connectionPool` still throws `ConnectionNotEstablished` for a
 * pool-less model, keeping the throw the `try`/`catch` call sites rely on.
 */
function reflectionAdapter(klass: any): any {
  const threaded = threadedConnectionFor(klass);
  if (threaded) return threaded;
  if (klass._adapter) return klass._adapter;
  const pool = connectionPool.call(klass);
  return pool.activeConnection ?? pool.leaseConnectionSync();
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
  return Object.prototype.hasOwnProperty.call(host, key) ? host[key] : undefined;
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
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#compute_table_name
 * (model_schema.rb:604-618)
 *
 * The `base === this` guard on the STI arm has no Rails counterpart: there
 * `base_class? == false` is exactly `base_class != self` (inheritance.rb:119-121),
 * while trails reaches the two answers through separate memos (`isBaseClass` /
 * `baseClass`, inheritance.ts), so the guard stops a self-call recursing
 * forever if they ever disagree.
 *
 * @internal
 */
function computeTableName(this: typeof Base): string {
  if (isBaseClass(this)) {
    // Nested classes are prefixed with singular parent table name.
    const contained = containedTableNamePrefix.call(this);
    const pluralizes = (this as any).pluralizeTableNames ?? true;
    return `${fullTableNamePrefix.call(this as any)}${contained}${undecoratedTableName(
      String(this.modelName),
      pluralizes,
    )}${fullTableNameSuffix.call(this as any)}`;
  }
  // STI subclasses always use their superclass's table.
  const base = baseClass.call(this);
  if (base === this) return "";
  return base.tableName;
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
  if (!parent || (parent as any).abstractClass) return "";
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
 * @noRailsEquivalent CONVERGEABLE the primary-key predicate Ruby builds through predicate_builder in _update_record (persistence.rb:263).
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
      conditions.push(`${a.quoteColumnName(pk[i])} = ${a.quote(v)}`);
    }
    return conditions.join(" AND ");
  }
  if (idValue === undefined || idValue === null) return "1=0";
  return `${a.quoteColumnName(pk)} = ${a.quote(idValue)}`;
}

/**
 * Build an Arel node for a primary key WHERE condition.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the Arel form of that same predicate_builder call (persistence.rb:263).
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
 * @noRailsEquivalent CONVERGEABLE turns _query_constraints_hash into the predicate WHERE Ruby builds inline (persistence.rb:263).
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
  if (memo) return memo.names as string[];
  const names = this.columns().map((c: { name: string }) => c.name);
  if (ownSchemaMemo(host, "_schemaLoaded")) {
    const frozen = Object.freeze(names);
    host._columnNamesMemo = { names: frozen };
    return frozen as string[];
  }
  return names;
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
  // `load_schema unless @columns_hash` (model_schema.rb:428): the memo guard is
  // what keeps a `columns_hash` read from inside `load_schema!` — the encryption
  // decorator's `columns_hash[name]&.default`, the length validations — from
  // re-entering the load it is already inside of.
  if (ownSchemaMemo(this as unknown as SchemaHost, "_columnsHash") == null) {
    // load_schema! raises TableNotSpecified for abstract (table-less) classes.
    loadSchema.call(this as SchemaHost);
  }

  const memoized = ownSchemaMemo(this as unknown as SchemaHost, "_columnsHash");
  if (memoized != null) return memoized as Record<string, ColumnLike>;

  const klass = this;
  let adapter: DatabaseAdapterLike | null = null;
  try {
    adapter = reflectionAdapter(klass) as DatabaseAdapterLike;
  } catch {
    adapter = null;
  }
  const cache = adapter?.internalSchemaCache as
    | {
        getCachedColumnsHash?: (t: string) => Record<string, ColumnLike> | undefined;
      }
    | undefined;
  const table = klass.tableName;
  // Gate on the same map we read (`_columnsHash` via getCachedColumnsHash),
  // not `isCached` (which checks `_columns`).
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

  // `columns_hash` is a pure DB read (model_schema.rb:592-594): a table whose
  // columns have not been reflected yet has none, exactly as a Rails model with
  // no table does. A declared-but-columnless `attribute()` never appears here.
  return {};
}

/**
 * The attribute set a model's own `attribute()` declarations replay to, with no
 * schema columns underneath — Rails' `_default_attributes` seeded from an empty
 * hash instead of `columns_hash` (attribute_registration.rb:53-58 vs
 * attributes.rb:241-252).
 *
 * Rails never needs this: `columns_hash` is a DB read, so a model with no table
 * simply has no columns. It cannot go through `_defaultAttributes()`, which
 * re-enters `columnsHash()` on an unreflected class.
 */
function declaredAttributes(host: SchemaHost): AttributeSet {
  const attributeSet = new AttributeSet(new Map<string, Attribute>());
  applyDeclarations(host, attributeSet);
  return attributeSet;
}

/**
 * `apply_pending_attribute_modifications` (attribute_registration.rb:78-86)
 * restricted to the two modifications that INTRODUCE an attribute. The
 * decorators are skipped deliberately: they read the type the column seed put
 * there, and `enum`'s raises outright when it finds the `Type.default_value`
 * an unseeded set answers with (enum.ts:164-168).
 */
function applyDeclarations(cls: SchemaHost, attributeSet: AttributeSet): void {
  const superclass = Object.getPrototypeOf(cls) as
    | (SchemaHost & { _defaultAttributes?: unknown; _pendingAttributeModifications?: unknown[] })
    | null;
  if (superclass && typeof superclass._defaultAttributes === "function") {
    applyDeclarations(superclass, attributeSet);
  }
  if (!Object.hasOwn(cls, "_pendingAttributeModifications")) return;
  for (const modification of (cls as unknown as { _pendingAttributeModifications: unknown[] })
    ._pendingAttributeModifications) {
    if (modification instanceof PendingType || modification instanceof PendingDefault) {
      modification.applyTo(attributeSet);
    }
  }
}

type DatabaseAdapterLike = { internalSchemaCache?: unknown };

/**
 * Connection-safe read of the cached column hash for `klass`'s table.
 *
 * Used by `_defaultAttributes` to seed schema columns via `Attribute.fromDatabase`
 * (Rails' `columns_hash.transform_values { Attribute.from_database(...) }`) without
 * ever touching `.connection` — which under the default `permanentConnectionCheckout`
 * would permanently lease a connection on every record construction. Reads the warm
 * schema cache off an already-available connection only: the threaded (in-query)
 * connection, else a connection the pool has already leased. Returns `undefined`
 * when the cache has no entry for the table — no connection was available (a bare
 * `new Model()`), or the table has not been reflected yet — as distinct from a `{}`
 * entry for a table that reflected and genuinely has no columns. Callers that only
 * need to look a column up can `?? {}`; the one that must tell "not reflected yet"
 * from "no such column" — `_defaultAttributes`' seed, feeding decorators that
 * branch on `subtype == Type.default_value` — depends on the difference. Any real
 * DB column whose default matters here has already pinned a connection via the
 * `!_schemaLoaded` reflection in `_defaultAttributes`, so a miss is only reached
 * for columns that carry no client-side default anyway.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE connection-free read of ModelSchema#columns_hash (model_schema.rb:427-441); retires with RFC 0073.
 */
export function cachedColumnsHash(klass: typeof Base): Record<string, ColumnLike> | undefined {
  const cachedFrom = (conn: { internalSchemaCache?: unknown } | null | undefined) => {
    const cache = conn?.internalSchemaCache as
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
      cachedFrom((klass as { _adapter?: { internalSchemaCache?: unknown } })._adapter) ??
      cachedFrom(
        connectionPool.call(klass).activeConnection as { internalSchemaCache?: unknown } | null,
      );
    if (hash) return hash;
  } catch {
    /* fall through */
  }
  return undefined;
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
  if (adapterName === "mysql2") {
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
  const table = this.tableName;
  const pks = Array.isArray(this.primaryKey) ? this.primaryKey : [this.primaryKey];
  const adapterName = this.connection.adapterName;
  const isMysql = adapterName === "mysql2";
  const isPg = adapterName === "postgres";
  const pkSet = new Set(pks);
  const a = this.connection;
  const declared = declaredAttributes(this);

  // eslint-disable-next-line blazetrails/no-raw-sql -- DDL: Arel has no schema-statement nodes; Rails builds this SQL as a string too.
  await a.execute(`DROP TABLE IF EXISTS ${a.quoteTableName(table)}`);

  const colDefs: string[] = [];
  if (pks.length === 1) {
    const pk = pks[0];
    const pkDef = isPg
      ? `${a.quoteColumnName(pk)} SERIAL PRIMARY KEY`
      : isMysql
        ? `${a.quoteColumnName(pk)} BIGINT AUTO_INCREMENT PRIMARY KEY`
        : `${a.quoteColumnName(pk)} INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL`;
    colDefs.push(pkDef);
  } else {
    for (const pk of pks) {
      const pkType = sqlTypeFor(declared.getAttribute(pk).type?.name || "integer", adapterName);
      colDefs.push(`${a.quoteColumnName(pk)} ${pkType} NOT NULL`);
    }
  }

  for (const name of declared.keys()) {
    if (pkSet.has(name)) continue;
    const sqlType = sqlTypeFor(declared.getAttribute(name).type?.name || "string", adapterName);
    colDefs.push(`${a.quoteColumnName(name)} ${sqlType}`);
  }

  if (pks.length > 1) {
    colDefs.push(`PRIMARY KEY (${pks.map((pk) => a.quoteColumnName(pk)).join(", ")})`);
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
      internalSchemaCache?: { clearDataSourceCacheBang(pool: unknown, name: string): void };
      pool?: unknown;
    }
  ).internalSchemaCache?.clearDataSourceCacheBang((a as { pool?: unknown }).pool ?? null, table);
}

// ---------------------------------------------------------------------------
// Missing ClassMethods from parity:api
// ---------------------------------------------------------------------------

export interface SchemaHost {
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
  _defaultAttributes(): AttributeSet;
  _columnsHash?: Record<string, unknown>;
  _columns?: any[];
  _returningColumnsForInsertCache?: string[];
  _attributesBuilder?: any;
  _yamlEncoder?: YAMLEncoder;
  attributeTypes(): Record<string, any>;
  _schemaLoaded?: boolean;
  /** Rails' `@column_names` memo (model_schema.rb:478-480). @internal */
  _columnNamesMemo?: { names: readonly string[] };
  connection: any;
  prototype: Record<string, unknown>;
  superclass?: SchemaHost;
  hookAttributeType?(name: string, type: Type): Type;
}

/**
 * Drop the memoized class-level `attributeNames` and `columnNames` on `host`
 * and its descendants — Rails' `reload_schema_from_cache` nils
 * `@attribute_names` and `@column_names` recursively (model_schema.rb:553-568).
 * Used by every invalidation path (`attribute`, `table_name=`,
 * `ignored_columns=`, `reload_schema_from_cache`, `load_schema!`).
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the recursive the recursive attribute-name and column-name memo nil-out of reload_schema_from_cache (model_schema.rb:553-568).
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
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#reset_table_name
 * (model_schema.rb:289-300)
 *
 * Reaches its value by assigning through `table_name=`, so a first read gets
 * the writer's cache invalidation exactly where Rails has it. Rails' `self ==
 * Base` is spelled through the own-property sentinel `setBaseClass` tests for
 * the same thing (inheritance.ts).
 */
export function resetTableName(this: SchemaHost): string {
  const klass = this as unknown as typeof Base;
  const superclass = Object.getPrototypeOf(klass) as typeof Base | null;
  tableName.call(
    this,
    Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase")
      ? null
      : klass.abstractClass
        ? (superclass?.tableName ?? null)
        : superclass?.abstractClass
          ? superclass.tableName || computeTableName.call(klass)
          : computeTableName.call(klass),
  );
  return this._tableName ?? "";
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

export async function _returningColumnsForInsert(
  this: SchemaHost,
  connection: { returnValueAfterInsert?(column: { name: string }): Promise<boolean> },
): Promise<string[]> {
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
  const keep = await Promise.all(
    cols.map(
      async (c) =>
        typeof c.isAutoPopulated === "function" &&
        ((await connection.returnValueAfterInsert?.(c)) ?? false),
    ),
  );
  const autoPopulated = cols.filter((_c, i) => keep[i]).map((c) => c.name);
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
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#attributes_builder
 * (model_schema.rb:420-424):
 *
 *   @attributes_builder ||= begin
 *     defaults = _default_attributes.except(*(column_names - [primary_key]))
 *     ActiveModel::AttributeSet::Builder.new(attribute_types, defaults)
 *   end
 */
export function attributesBuilder(this: SchemaHost): AttributeSetBuilder {
  const ownBuilder = ownSchemaMemo(this, "_attributesBuilder");
  if (ownBuilder) return ownBuilder;

  const primaryKey = this.primaryKey;
  const defaults = this._defaultAttributes().except(
    ...columnNames.call(this as unknown as typeof Base).filter((name) => name !== primaryKey),
  );
  const builder = new AttributeSetBuilder(new Map(Object.entries(this.attributeTypes())), defaults);
  this._attributesBuilder = builder;
  return builder;
}

/**
 * Rails: @columns ||= columns_hash.values.freeze
 */
export function columns(this: SchemaHost): any[] {
  const ownColumns = ownSchemaMemo(this, "_columns");
  if (ownColumns != null) return ownColumns;
  const built = Object.values(columnsHash.call(this as unknown as typeof Base));
  this._columns = built;
  return built;
}

/**
 * Rails: `@yaml_encoder ||= ActiveModel::AttributeSet::YAMLEncoder.new(attribute_types)`
 * (model_schema.rb:446-448). trails' coder is codec-agnostic (JSON by default)
 * rather than YAML-only, but the accessor keeps the Rails name and passes the
 * model's own attribute types, so a declared `attribute :x, :my_type` override
 * round-trips through that type rather than through a global registry lookup.
 */
export function yamlEncoder(this: SchemaHost): YAMLEncoder {
  const own = ownSchemaMemo(this, "_yamlEncoder");
  if (own) return own;
  this._yamlEncoder = new YAMLEncoder(this.attributeTypes());
  return this._yamlEncoder;
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
 * instead. Returns a NullColumn for unknown names (model_schema.rb:463-468)
 * so `column.null`, `column.type`, etc. remain safely accessible. `fetch` with
 * a block, not `??`: a stored column wins even when falsy.
 */
export function columnForAttribute(this: SchemaHost, name: string): any {
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  return name in hash ? hash[name] : new NullColumn(name);
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
  // adapter's own `internalSchemaCache` getter returns (abstract-adapter.ts).
  type Cache = {
    clearDataSourceCacheBang?: (connection: unknown, name: string) => void;
  };
  let cache: Cache | null | undefined;
  let table: string | undefined;
  try {
    table = (host as unknown as { tableName?: string }).tableName;
    const direct = (host as unknown as { _adapter?: { internalSchemaCache?: Cache } })._adapter;
    if (direct?.internalSchemaCache) {
      cache = direct.internalSchemaCache;
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
 * Re-reflect the table entry `clearAdapterDataSourceCache` just dropped.
 *
 * Rails' readers re-read a cleared entry lazily **on the next access**, blocking
 * on a connection checkout, so a cleared cache is invisible to the caller
 * (`model_schema.rb:523-530`). trails' sync readers (`columnsHash()`,
 * `columnNames()`, `columnDefaults`) answer only from a warm cache and cannot
 * block, so a cleared entry reads as empty; re-warming it is what lets a ported
 * body call `resetColumnInformation` and read straight after, as Rails does.
 *
 * The returned thenable starts the reflection when it is first awaited, never
 * before — Rails' laziness, and load-bearing here: an eager fetch from a caller
 * that does not await (a `beforeEach` reset, a `finally` cleanup) can resolve
 * after a later DDL statement and write the pre-DDL columns back over the fresh
 * entry. Best-effort: a model with no adapter or no such table stays cold.
 */
function rewarmDataSourceCache(host: SchemaHost): PromiseLike<void> | void {
  let adapter: SchemaHost["connection"] | undefined;
  try {
    adapter = reflectionAdapter(host);
  } catch {
    return;
  }
  const table = (host as unknown as { tableName?: string }).tableName;
  const cache = (
    adapter as unknown as { schemaCache?: { columns?: (t: string) => Promise<unknown> } }
  )?.schemaCache;
  if (!table || typeof cache?.columns !== "function") return;
  let started: Promise<void> | undefined;
  return {
    then(onFulfilled, onRejected) {
      started ??= cache.columns!(table).then(
        () => {},
        () => {},
      );
      return started.then(onFulfilled, onRejected);
    },
  };
}

/**
 * Rails: clears column cache, schema cache, reloads schema.
 * Drops schema-sourced attribute defs so the next load re-reflects them;
 * user-declared defs are preserved, matching Rails' reload_schema_from_cache
 * behavior where user-provided attributes survive reload.
 *
 * Returns the re-warm thenable (see {@link rewarmDataSourceCache}). Declared
 * `PromiseLike<void> | void` rather than `async` on purpose: every write above the
 * return happens synchronously, so the ~170 sync call sites are unaffected and
 * only a caller that needs the re-warmed entry has to await.
 */
export function resetColumnInformation(this: SchemaHost): PromiseLike<void> | void {
  // Rails reset_column_information calls initialize_find_by_cache right after
  // reload_schema_from_cache, resetting @find_by_statement_cache. Clearing it
  // here (lazy reinit on next access) mirrors that; reload_schema_from_cache
  // itself leaves the cache alone.
  try {
    void (
      connectionPool.call(this as unknown as typeof Base).activeConnection as {
        clearCacheBang?: () => unknown;
      } | null
    )?.clearCacheBang?.();
  } catch {
    // `connectionPool` throws for a pool-less model (a directly-assigned
    // adapter); Ruby's `connection_pool` is always there to answer nil.
  }
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
  return rewarmDataSourceCache(this);
}

/** @internal */
export function reloadSchemaFromCache(this: SchemaHost): void {
  this._columnsHash = undefined;
  this._columns = undefined;
  this._returningColumnsForInsertCache = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
  // ActiveRecord::Attributes overrides `reload_schema_from_cache` to call
  // `reset_default_attributes!` before `super` (attributes.rb:268-271), which
  // nils `@attribute_types` as well as `@default_attributes`
  // (attribute_registration.rb:96-99). Sent to `this`, the way Ruby sends an
  // inherited private method — ActiveModel's `Model` defines the static.
  (this as SchemaHost & { resetDefaultAttributesBang(): void }).resetDefaultAttributesBang();
  (this as SchemaHost & { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
  clearAttributeNamesMemo(this);
  for (const sub of (this as { subclasses?: SchemaHost[] }).subclasses ?? []) {
    reloadSchemaFromCache.call(sub);
  }
}

/**
 * Mirrors: ActiveRecord::ModelSchema#load_schema
 *
 * Sync: consults the adapter's schema cache if it's already populated
 * (no I/O), and reflects columns into `columnsHash`. A model whose cache entry
 * is cold reflects nothing and stays unloaded — `columns_hash` is a pure DB
 * read (model_schema.rb:592-594).
 *
 * For a full async reflection (fetching from the adapter if the cache
 * isn't populated), call `Base.loadSchema()` (base.ts).
 */
export function loadSchema(this: SchemaHost): void {
  if (ownSchemaMemo(this, "_schemaLoaded")) return;
  // `return if @columns_hash` (model_schema.rb:534-546): the guard that stops a
  // `columns_hash` read from inside `load_schema!` re-entering the load it is
  // already inside of.
  if (ownSchemaMemo(this, "_columnsHash") != null) return;
  try {
    loadSchemaBang.call(this);
  } catch (error) {
    // `rescue; reload_schema_from_cache; raise` (:541-544) — a load that failed
    // half way through must not leave its partial state behind.
    reloadSchemaFromCache.call(this);
    throw error;
  }
  if (!ownSchemaMemo(this, "_schemaLoaded")) {
    // Same reset, for the failure mode Rails cannot have: its
    // `schema_cache.columns_hash` blocks, so `load_schema!` either reflects or
    // raises. trails' is async, so a cold cache leaves the load incomplete —
    // the anchor set `@columns_hash` for re-entrancy but never reflected. Reset
    // it so a later `loadSchema`, once the cache is warm, runs the real read
    // instead of serving the empty hash forever.
    reloadSchemaFromCache.call(this);
  }
}

/**
 * Rails builds `load_schema!` as a super chain: `ModelSchema#load_schema!`
 * (model_schema.rb:587-597) is the anchor, and each concern that needs
 * schema-time bookkeeping overrides it and calls `super` — `CounterCache`
 * (counter_cache.rb:186-195), `Encryption::EncryptableRecord`
 * (encryptable_record.rb:126-130). A TS class cannot splice a module into its
 * ancestor chain, so the overrides register through
 * `registerLoadSchemaOverride` (load-schema-overrides-slot.ts) and are wrapped
 * here by ascending `includeOrder` — the last-included module ends up
 * outermost, exactly where `include` puts it in the ancestors — each handed the
 * next link as `superFn`, the idiom `CounterCache._createRecord` already uses
 * for a `super`-calling override.
 */
export function loadSchemaBang(this: SchemaHost): void {
  runLoadSchemaChain(this, () => loadSchemaBangAnchor.call(this));
}

function runLoadSchemaChain(host: SchemaHost, anchor: () => void): void {
  let next = anchor;
  for (const { override } of loadSchemaOverrides) {
    const superFn = next;
    next = () => override.call(host, superFn);
  }
  next();
}

/**
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#load_schema!
 * (model_schema.rb:587-597) — the base of the chain. Its guard is
 * `raise TableNotSpecified unless table_name` (model_schema.rb:587-590): the
 * table name alone, with no `abstract_class?` term, so an abstract class that
 * inherits a concrete superclass's table reflects that table's columns.
 */
function loadSchemaBangAnchor(this: SchemaHost): void {
  const klass = this as unknown as typeof Base;
  if (!klass.tableName) {
    throw new TableNotSpecified(
      `${klass.name} has no table configured. Set one with ${klass.name}.table_name=`,
    );
  }

  const reflected = loadSchemaFromCacheSync(this);
  if (reflected) {
    this._schemaLoaded = true;
    // `_default_attributes # Precompute to cache DB-dependent attribute types`
    // (model_schema.rb:596). It runs after `_schemaLoaded` is stamped, not
    // before: the flag is trails' marker that `@columns_hash` is settled, and
    // `_defaultAttributes` re-enters `columnsHash()` while it is unset.
    this._defaultAttributes();
    defineAttributeMethodsAfterLoad(this);
    return;
  }

  // trails' `schema_cache.columns_hash` is async where Rails' blocks, so this
  // path exists at all: a cold cache leaves nothing to reflect.
  // `@columns_hash` is still assigned, as `load_schema!` always assigns it
  // (model_schema.rb:592-594) and `load_schema`'s `return if @columns_hash`
  // (:534-546) is the re-entrancy guard a `columns_hash` read from inside the
  // load depends on. `_schemaLoaded` is deliberately not stamped: the DB read
  // has not happened, so a later `loadSchema` must still run it.
  this._columnsHash = {};
}

/**
 * Rails generates attribute methods on demand: `method_missing` calls
 * `define_attribute_methods` and retries (activemodel/attribute_methods.rb:474-486),
 * while `load_schema!` itself defines nothing (model_schema.rb:587-597). A
 * trails reader is a property, not a method, so there is no miss to hook (see
 * CLAUDE.md, "Generated attribute readers are properties"); the demand point
 * is instead the end of a schema load — the columns just reflected are exactly
 * the ones an instance is about to read. It runs *after* `_schemaLoaded` is
 * set, so `define_attribute_methods`' own `load_schema` (attribute_methods.rb:114)
 * returns immediately instead of re-entering the load.
 *
 * @noRailsEquivalent Rails needs no such hook: its readers are methods, so
 * `method_missing` is the trigger.
 */
function defineAttributeMethodsAfterLoad(host: SchemaHost): void {
  (host as unknown as { defineAttributeMethods?: () => boolean }).defineAttributeMethods?.();
  // Generation reads `attribute_names` (attribute_methods.rb:115) → `column_names`,
  // which re-warms the `columns` memo `applyColumnsHash` cleared a moment ago.
  // Rails' `load_schema!` never touches `@columns` (model_schema.rb:587-597),
  // so its memo (`@columns ||= columns_hash.values`, :432-434) is still nil
  // after a load; clear it again to leave the same state.
  (host as unknown as { _columns?: unknown })._columns = undefined;
}

function getColumnsHash(host: SchemaHost): Record<string, unknown> {
  const own = ownSchemaMemo(host, "_columnsHash");
  if (own != null) return own;
  const ch = (host as any).columnsHash;
  if (typeof ch === "function") return ch.call(host) ?? {};
  return {};
}

/**
 * `load_schema!`'s `@columns_hash = columns_hash.except(*ignored_columns)`
 * (model_schema.rb:592-594); the `_default_attributes` precompute that follows
 * it (:596) is in `loadSchemaBangAnchor`, which owns both arms of the load.
 * Nothing is registered against a class-level attribute registry — a column
 * lives in `columns_hash` and a user declaration in the pending-modification
 * queue, and the two only ever meet inside `_default_attributes`
 * (attributes.rb:241-252).
 *
 * `host` is always the class the load was triggered on: every class reflects
 * its OWN `table_name` (model_schema.rb:587-597).
 *
 * Rails drops `@default_attributes` / `@attribute_types` only in
 * `reload_schema_from_cache` (attributes.rb:267-270,
 * activemodel/attribute_registration.rb:88-95) — never in `load_schema!` — and
 * gets away with it because `_default_attributes` (attributes.rb:241-252) reads
 * `columns_hash` through the SYNCHRONOUS `load_schema` (model_schema.rb:530-546),
 * which re-raises after resetting when the load fails. A Ruby memo is therefore
 * built from the loaded columns by construction.
 *
 * trails' load is `async` (`loadSchemaFromAdapter` below), so a caller can force
 * `_defaultAttributes` before the columns land and latch a memo built without
 * them, which no later load would replace. The two memos are dropped here for
 * that reason alone. Removing this reset is what CI caught: Topic's cold memo
 * survived its load and every attribute read raised
 * `UnknownAttributeError: unknown attribute 'title'`.
 */
function applyColumnsHash(host: SchemaHost, hash: Record<string, unknown>): void {
  const ignored = new Set(host._ignoredColumns ?? []);
  const filteredHash: Record<string, unknown> = {};
  for (const [name, column] of Object.entries(hash)) {
    if (ignored.has(name)) continue;
    filteredHash[name] = column;
  }

  type CacheBag = {
    _attributesBuilder?: unknown;
    _yamlEncoder?: unknown;
    _cachedDefaultAttributes?: unknown;
    _cachedAttributeTypes?: unknown;
    _columnsHash?: unknown;
    _columns?: unknown;
  };
  const bag = host as CacheBag;
  bag._attributesBuilder = undefined;
  bag._yamlEncoder = undefined;
  bag._cachedDefaultAttributes = null;
  bag._cachedAttributeTypes = null;
  bag._columns = undefined;
  host._columnsHash = filteredHash;

  // `load_schema!` defines no attribute methods (model_schema.rb:587-597) —
  // generation is demand-driven, off `define_attribute_methods`. Reflection
  // only invalidates what it just re-settled, so the next demand regenerates.
  const methodHost = host as unknown as { _attributeMethodsGenerated?: boolean };
  methodHost._attributeMethodsGenerated = false;

  // Encryption still needs a post-reflection pass — not for type wrapping (the
  // durable decorator was pushed at declaration; `typeForAttribute` resolves it)
  // but for column-size validation re-runs against the now-known DB limits.
  // `normalizes` / `serialize` push their durable decorator eagerly, so
  // — now that `type_for_attribute` / `TypeCaster::Map` resolve through
  // `attribute_types` — no per-feature replay is needed.
  encryptionHooks.applyPendingEncryptions(host);

  // Now the DB column set is authoritative: re-run the ignoreCase
  // `original_<name>` requirement so a genuinely absent column raises even when
  // `encrypts(ignoreCase)` was declared before the adapter connected
  // (fail-closed, matching Rails). The reflected `hash` keys — not the eager
  // `columnNames()` partial-load path — are the source of truth here.
  const reflectedColumnNames = Object.keys(hash).filter((n) => !ignored.has(n));
  encryptionHooks.requireOriginalColumnsAfterReflection?.(host, reflectedColumnNames);

  // `load_schema!` re-settles `@columns_hash`, so the derived `@column_names` /
  // `@attribute_names` memos are nil'd alongside it (model_schema.rb:553-568).
  clearAttributeNamesMemo(host);
}

/**
 * Register attribute definitions from the adapter's schema cache.
 *
 * Mirrors: ActiveRecord::ModelSchema#load_schema! — walks `columns_hash`
 * and calls `define_attribute(..., user_provided_default: false)` for each
 * column so the cast type comes from the adapter (e.g. PG OID map) rather
 * than the generic ActiveModel type registry.
 *
 * Populates the schema cache if needed (async). User-declared attributes —
 * the ones carrying a pending `attribute(...)` modification — are NEVER
 * overwritten, matching Rails where the pending replay runs after the column
 * seed so `attribute :foo, :bar` always wins over the reflected type.
 *
 * This is the async half of `schema_cache.columns_hash` (schema_cache.rb):
 * it warms the cache and then enters the single `load_schema!` body, so the
 * concern overrides (counter_cache.rb:186-195, encryptable_record.rb:126-130)
 * run over a real anchor.
 *
 * Rails' `schema_cache` is a POOL read (`load_schema!`, model_schema.rb:591) and
 * never checks a connection out permanently, so the warm runs inside a
 * `with_connection` scope: `reflectionAdapter`'s last resort is
 * `leaseConnectionSync`, whose lease is permanent and trips
 * `permanent_connection_checkout = :deprecated | :disallowed` on every save. The
 * re-entry is the scope — inside it the connection is threaded, so the guard is
 * false and the body runs once. A model with a directly-assigned adapter has no
 * pool to scope against and skips it, as does a pool-less model, whose
 * `connection_pool` throws where Ruby's always answers.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the async half of ModelSchema#load_schema! (model_schema.rb:587), which Ruby reaches synchronously through the schema cache.
 */
export async function loadSchemaFromAdapter(this: SchemaHost): Promise<void> {
  if ((this as any).abstractClass) return;
  const startingAdapter: SchemaHost["connection"] | undefined =
    threadedConnectionFor(this as unknown as typeof Base) ??
    (this as unknown as { _adapter?: SchemaHost["connection"] })._adapter;
  if (!startingAdapter) {
    try {
      return await withConnection.call<typeof Base, [() => Promise<void>], Promise<void>>(
        this as unknown as typeof Base,
        () => loadSchemaFromAdapter.call(this),
      );
    } catch {
      return;
    }
  }
  const adapterOwner = this;
  const cache = startingAdapter.internalSchemaCache;
  if (!cache) return;
  const table = this.tableName;
  // Rails' `for_lone_connection` shape (schema_cache.rb:155): on
  // lone-connection pools (SQLite :memory: + size 1) the connection is
  // permanently checked out, so routing through pool.withConnection deadlocks.
  const pool = new FakePool(startingAdapter);

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

  // The cache is warm now, so `load_schema!` — the one body, chain and all —
  // reflects from it exactly as it does on the sync path
  // (model_schema.rb:534-546 puts the cache-vs-adapter distinction inside
  // `schema_cache.columns_hash`, not in a second `load_schema!`).
  loadSchemaBang.call(this);
}

/**
 * Sync counterpart: consult the already-populated schema cache only.
 * Returns true if reflection happened; false when the cache is empty
 */
function loadSchemaFromCacheSync(host: SchemaHost): boolean {
  // No `abstract_class?` term: `load_schema!` guards on the table name alone
  // (model_schema.rb:587-590), so an abstract class inheriting a concrete
  // superclass's table reflects that table's columns.
  // Access can throw when no pool is configured; treat as "no adapter".
  let adapter: SchemaHost["connection"] | undefined;
  try {
    adapter = reflectionAdapter(host);
  } catch {
    adapter = undefined;
  }
  if (!adapter) return false;
  const cache = adapter.internalSchemaCache;
  if (!cache || typeof cache.getCachedColumnsHash !== "function") return false;
  const table = host.tableName;
  // Gate on `_columnsHash` (the map we read) rather than `isCached`/`_columns`,
  // so an out-of-sync `_columns` entry can't pass the guard and yield undefined.
  let hash = cache.getCachedColumnsHash(table);
  if (!hash) hash = warmColumnsHashSync(adapter, cache, table);
  if (!hash) return false;
  applyColumnsHash(host, hash);
  return true;
}

/**
 * Rails' `schema_cache.columns_hash` is synchronous, so `load_schema!` reflects
 * a cold table right where it stands (model_schema.rb:534-546). trails' cache
 * read is async, which leaves this path with nothing to reflect and — before
 * this — silently yielding an empty attribute set for any model whose columns
 * never came from a query, e.g. `Contact`, whose columns come from the fake
 * adapter's `merge_column` (test/models/contact.rb:30-32).
 *
 * An adapter whose `columns` answers synchronously is exactly that case, so
 * reflect and warm the cache here. A real adapter's `columns` returns a
 * promise; drop it (with its rejection handled) and leave the cold-cache
 * fallback below to run, so DB-backed models are unaffected.
 *
 * @noRailsEquivalent Bridges trails' async `SchemaCache#columns_hash` back to
 * the synchronous read Rails has; retire it when the cache read can block.
 */
function warmColumnsHashSync(
  adapter: NonNullable<SchemaHost["connection"]>,
  cache: {
    setColumns?: (table: string, cols: any[]) => void;
    getCachedColumnsHash: (table: string) => Record<string, unknown> | undefined;
  },
  table: string,
): Record<string, unknown> | undefined {
  if (typeof adapter.columns !== "function" || typeof cache.setColumns !== "function") {
    return undefined;
  }
  let cols: unknown;
  try {
    cols = adapter.columns(table);
  } catch {
    return undefined;
  }
  if (cols != null && typeof (cols as any).then === "function") {
    void (cols as Promise<unknown>).catch(() => {});
    return undefined;
  }
  if (!Array.isArray(cols) || cols.length === 0) return undefined;
  cache.setColumns(table, cols);
  return cache.getCachedColumnsHash(table);
}

/**
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#table_name (model_schema.rb:260-263)
 * and #table_name= (model_schema.rb:270-282).
 *
 * The reader is lazy and memoizes into `_tableName` via `reset_table_name`.
 * Ruby class ivars are not inherited but JS statics are, so the `defined?`
 * guard is an own-property check — a plain read would hand a subclass on
 * another table its base's name.
 *
 * The `reset_column_information if connected?` call runs before the store, so
 * the caches it drops are the OLD table's, as in Rails (model_schema.rb:273-281,
 * :523-529). Its lazy rewarm ({@link rewarmDataSourceCache}) is started rather
 * than discarded, which Rails has no counterpart for and needs none: there
 * `clear_data_source_cache!` is invisible because the next reader re-reflects
 * on access under a checkout, while trails' sync readers answer only from a
 * warm cache, so a dropped rewarm leaves the old table permanently cold for
 * every other model on it. Starting it restores exactly the state Rails' next
 * access would produce — measured: without it, `base_test.rb`'s "find multiple
 * ordered last" inserts a declared-but-uncolumned attribute into `users`.
 *
 * Two of the writer's clears have no code below them. `@arel_table = nil`:
 * `arelTable` builds a fresh Table per call (core.ts:835), so there is no memo
 * to clear. `@sequence_name = nil unless @explicit_sequence_name`: a non-null
 * `_sequenceName` IS `@explicit_sequence_name` — only `sequence_name=` sets it
 * and `reset_sequence_name` nils it — so the clear is a no-op on every
 * reachable state.
 */
export function tableName(this: SchemaHost, value?: string | null): string {
  if (value !== undefined) {
    value = value == null ? null : String(value);
    if (Object.prototype.hasOwnProperty.call(this, "_tableName")) {
      if (value === this._tableName) return this._tableName ?? "";
      if (connectedQ.call(this as unknown as typeof Base)) {
        void Promise.resolve(resetColumnInformation.call(this)).catch(() => {});
      }
    }
    this._tableName = value;
    (this as { _predicateBuilder?: unknown })._predicateBuilder = null;
    // Rails reset_column_information also reloads the schema so the new
    // table's columns are re-reflected. A subclass created with a different
    // table_name (e.g. `Class.new(Minimalistic) { self.table_name = "aircraft" }`)
    // inherits the parent's `_schemaLoaded = true` through the prototype
    // chain and would otherwise never reflect its own table. Shadow the
    // inherited flag with an own `false` so the next load re-reflects.
    (this as { _schemaLoaded?: boolean })._schemaLoaded = false;
    return this._tableName ?? "";
  }
  if (!Object.prototype.hasOwnProperty.call(this, "_tableName")) resetTableName.call(this);
  return this._tableName ?? "";
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

/**
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#sequence_name
 * (model_schema.rb:371-377) and #sequence_name= (:398-401).
 *
 * A non-base class answers its own `@sequence_name` if it has one and the base
 * class's otherwise; only a base class computes one.
 *
 * The writer stores `value.to_s` and sets `@explicit_sequence_name` — a
 * non-null `_sequenceName` IS that flag here, since only this writer sets it
 * and `reset_sequence_name` nils it — so `sequence_name = nil` stores an
 * explicit `""` (Ruby's `nil.to_s`, not JS `String(null)`) rather than falling
 * back to the computed name, exactly as Rails does.
 *
 * Rails memoizes `reset_sequence_name`, which reaches the default through
 * `with_connection { |c| c.default_sequence_name(...) }` (model_schema.rb:379-382)
 * — async in trails, and this reader is synchronous — so the conventional name
 * every adapter builds is spelled here instead.
 */
export function sequenceName(this: SchemaHost, value?: string | null): string | null {
  if (value !== undefined) {
    this._sequenceName = value == null ? "" : String(value);
    return this._sequenceName;
  }
  if (isBaseClass(this as unknown as typeof Base)) {
    const pk = this.primaryKey;
    if (Array.isArray(pk)) return this._sequenceName;
    return this._sequenceName ?? `${this.tableName}_${pk}_seq`;
  }
  return this._sequenceName ?? baseClass.call(this as unknown as typeof Base).sequenceName;
}

export function ignoredColumns(this: SchemaHost, value?: string[]): string[] {
  if (value !== undefined) {
    reloadSchemaFromCache.call(this);
    this._ignoredColumns = value.map(String);
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
 * @noRailsEquivalent CONVERGEABLE cache-only view of ModelSchema#table_exists? (model_schema.rb:416) for the sync callers; retires with RFC 0073.
 */
export function cachedTableExists(this: SchemaHost): boolean | undefined {
  let conn: any;
  try {
    conn = reflectionAdapter(this);
  } catch {
    return undefined;
  }
  const cache = conn?.internalSchemaCache;
  if (!cache || typeof cache.getCachedDataSourceExists !== "function") return undefined;
  return cache.getCachedDataSourceExists(this.tableName);
}

export async function tableExists(this: SchemaHost): Promise<boolean> {
  return (await reflectionAdapter(this).schemaCache.dataSourceExists(this.tableName)) ?? false;
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
 * - `computeTableName`, `buildPkWhere`, `buildPkWhereNode` — internal helpers
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
  yamlEncoder,
  columnForAttribute,
  symbolColumnToString,
  resetColumnInformation,
  _returningColumnsForInsert,
  loadSchemaFromAdapter,
};

/**
 * Mirrors: `delegate :type_for_attribute, :column_for_attribute, to: :class`
 * (model_schema.rb:183) — the instance-side delegates ActiveRecord adds. Neither
 * exists on `ActiveModel::Model`, where `type_for_attribute` is defined only in
 * `AttributeRegistration::ClassMethods` (attribute_registration.rb:43).
 */
export const InstanceMethods = {
  typeForAttribute(this: { constructor: unknown }, name: string, block?: () => Type): Type {
    return (
      this.constructor as { typeForAttribute(n: string, b?: () => Type): Type }
    ).typeForAttribute(name, block);
  },

  columnForAttribute(this: { constructor: unknown }, name: string): unknown {
    return (this.constructor as { columnForAttribute(n: string): unknown }).columnForAttribute(
      name,
    );
  },
};

/** @internal */
function initializeLoadSchemaMonitor(this: SchemaHost): void {
  // no-op: JS is single-threaded; no Monitor/Mutex needed
}

/** @internal */
export function isSchemaLoaded(this: SchemaHost): boolean {
  return ownSchemaMemo(this, "_schemaLoaded") ?? false;
}

/** @internal */
function typeForColumn(this: SchemaHost, connection: any, column: any): any {
  if (typeof connection?.lookupCastTypeFromColumn === "function") {
    return connection.lookupCastTypeFromColumn(column);
  }
  return null;
}
