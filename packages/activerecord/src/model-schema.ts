import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import {
  Attribute,
  AttributeSetBuilder,
  YAMLEncoder,
  typeRegistry,
} from "@blazetrails/activemodel";
import { isStiSubclass, getStiBase } from "./inheritance.js";
import { quote, quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "./adapter-name.js";
import { applyPendingEncryptions } from "./encryption.js";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";

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
  if (isStiSubclass(this)) {
    return resolveTableName.call(getStiBase(this));
  }
  const prefix = (this as any)._tableNamePrefix ?? "";
  const suffix = (this as any)._tableNameSuffix ?? "";
  const inferred = pluralize(underscore(this.name));
  return `${prefix}${inferred}${suffix}`;
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
  const adapter = detectAdapterName(this.adapter);
  if (Array.isArray(pk)) {
    if (!Array.isArray(idValue) || idValue.length !== pk.length) return "1=0";
    const conditions: string[] = [];
    for (let i = 0; i < pk.length; i++) {
      const v = idValue[i];
      if (v === undefined || v === null) return "1=0";
      conditions.push(`${quoteIdentifier(pk[i], adapter)} = ${quote(v)}`);
    }
    return conditions.join(" AND ");
  }
  if (idValue === undefined || idValue === null) return "1=0";
  return `${quoteIdentifier(pk as string, adapter)} = ${quote(idValue)}`;
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
  const attr = table.get(pk as string);
  if (idValue === undefined || idValue === null) return arelSql("1=0");
  return attr.eq(idValue);
}

// ---------------------------------------------------------------------------
// Column introspection
// ---------------------------------------------------------------------------

/**
 * Return column names for a model, excluding ignored columns.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#column_names
 */
export function columnNames(this: typeof Base): string[] {
  const ignored = new Set(this.ignoredColumns ?? []);
  return Array.from(this._attributeDefinitions.keys()).filter((name) => !ignored.has(name));
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
 * Return a hash of column definitions keyed by name.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#columns_hash
 */
export function columnsHash(
  this: typeof Base,
): Record<string, { name: string; type: string; default: unknown }> {
  if (this.abstractClass) {
    throw new Error(`Cannot call columnsHash on abstract class ${this.name}`);
  }
  const result: Record<string, { name: string; type: string; default: unknown }> = {};
  for (const [name, def] of this._attributeDefinitions) {
    result[name] = { name, type: def.type.name, default: def.defaultValue ?? null };
  }
  return result;
}

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
  const adapterName = detectAdapterName(this.adapter);
  const isMysql = adapterName === "mysql";
  const isPg = adapterName === "postgres";
  const pkSet = new Set(pks);

  await this.adapter.executeMutation(`DROP TABLE IF EXISTS ${quoteTableName(table, adapterName)}`);

  const colDefs: string[] = [];
  if (pks.length === 1) {
    const pk = pks[0];
    const pkDef = isPg
      ? `${quoteIdentifier(pk, adapterName)} SERIAL PRIMARY KEY`
      : isMysql
        ? `${quoteIdentifier(pk, adapterName)} BIGINT AUTO_INCREMENT PRIMARY KEY`
        : `${quoteIdentifier(pk, adapterName)} INTEGER PRIMARY KEY AUTOINCREMENT`;
    colDefs.push(pkDef);
  } else {
    for (const pk of pks) {
      const pkDef = this._attributeDefinitions.get(pk);
      const pkType = sqlTypeFor(pkDef?.type?.name || "integer", adapterName);
      colDefs.push(`${quoteIdentifier(pk, adapterName)} ${pkType} NOT NULL`);
    }
  }

  for (const [name, def] of this._attributeDefinitions) {
    if (pkSet.has(name)) continue;
    const sqlType = sqlTypeFor(def.type?.name || "string", adapterName);
    colDefs.push(`${quoteIdentifier(name, adapterName)} ${sqlType}`);
  }

  if (pks.length > 1) {
    colDefs.push(`PRIMARY KEY (${pks.map((pk) => quoteIdentifier(pk, adapterName)).join(", ")})`);
  }

  await this.adapter.executeMutation(
    `CREATE TABLE IF NOT EXISTS ${quoteTableName(table, adapterName)} (${colDefs.join(", ")})`,
  );
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
  _inheritanceColumn?: string;
  _abstractClass?: boolean;
  _ignoredColumns?: string[];
  _attributeDefinitions: Map<string, any>;
  _columnsHash?: Record<string, any>;
  _columns?: any[];
  _attributesBuilder?: any;
  _schemaLoaded?: boolean;
  adapter: any;
  superclass?: SchemaHost;
}

export function deriveJoinTableName(this: SchemaHost, otherTableName: string): string {
  const tables = [underscore(this.name), otherTableName].sort();
  return tables.join("_");
}

export function quotedTableName(this: SchemaHost): string {
  return quoteTableName(this.tableName, detectAdapterName(this.adapter));
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
  if (this._abstractClass) {
    const parent = Object.getPrototypeOf(this) as SchemaHost | null;
    if (parent?.tableName != null) {
      this._tableName = parent.tableName;
      return this._tableName!;
    }
  }
  const name = resolveTableName.call(this as any);
  this._tableName = name;
  return name;
}

export function fullTableNamePrefix(this: SchemaHost): string {
  return this._tableNamePrefix ?? "";
}

export function fullTableNameSuffix(this: SchemaHost): string {
  return this._tableNameSuffix ?? "";
}

export function realInheritanceColumn(this: SchemaHost, value: string): void {
  this._inheritanceColumn = value;
}

export const _inheritanceColumn = realInheritanceColumn;

export function _returningColumnsForInsert(this: SchemaHost): string[] {
  const pk = this.primaryKey;
  if (Array.isArray(pk)) return pk;
  return pk ? [pk] : [];
}

export function resetSequenceName(this: SchemaHost): void {
  this._sequenceName = null;
}

export function isPrefetchPrimaryKey(this: SchemaHost): boolean {
  return false;
}

export function nextSequenceValue(this: SchemaHost): null {
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

  this._attributesBuilder = new AttributeSetBuilder(types, defaults);
  return this._attributesBuilder;
}

/**
 * Rails: @columns ||= columns_hash.values.freeze
 */
export function columns(this: SchemaHost): any[] {
  if (this._columns) return this._columns;
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  this._columns = Object.values(hash);
  return this._columns!;
}

export function yamlEncoder(this: SchemaHost): YAMLEncoder {
  return new YAMLEncoder();
}

/**
 * Rails: columns_hash.fetch(name) { NullColumn.new(name) }
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
 * Rails: clears column cache, schema cache, reloads schema.
 */
export function resetColumnInformation(this: SchemaHost): void {
  this._columnsHash = undefined;
  this._columns = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
}

/**
 * Rails: loads schema from schema cache if not already loaded.
 * Our schema is defined via attribute() calls, so loading is
 * checking that _columnsHash is populated from attribute definitions.
 */
export function loadSchema(this: SchemaHost): void {
  if (this._schemaLoaded) return;
  this._schemaLoaded = true;

  if (!this._columnsHash && this._attributeDefinitions.size > 0) {
    const hash: Record<string, any> = {};
    const ignored = new Set(this._ignoredColumns ?? []);
    for (const [name, def] of this._attributeDefinitions) {
      if (ignored.has(name)) continue;
      hash[name] = {
        name,
        type: def.type?.name ?? null,
        default: def.defaultValue ?? null,
      };
    }
    this._columnsHash = hash;
  }
}

function getColumnsHash(host: SchemaHost): Record<string, any> {
  if (host._columnsHash != null) return host._columnsHash;
  const ch = (host as any).columnsHash;
  if (typeof ch === "function") return ch.call(host) ?? {};
  return {};
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
  if (this._abstractClass) return;
  const startingAdapter = this.adapter;
  if (!startingAdapter) return;
  const cache = startingAdapter.schemaCache;
  if (!cache) return;
  const table = (this as unknown as typeof Base).tableName;
  const pool = startingAdapter.pool ?? startingAdapter;

  if (typeof cache.dataSourceExists === "function") {
    const exists = await cache.dataSourceExists(pool, table);
    // Only bail on explicit false. `undefined` means the connection
    // doesn't implement the probe — fall through and let columnsHash
    // succeed or throw a real error.
    if (exists === false) return;
  }

  let hash: Record<string, unknown> | undefined;
  if (typeof cache.columnsHash === "function") {
    hash = await cache.columnsHash(pool, table);
  } else if (typeof cache.getCachedColumnsHash === "function") {
    hash = cache.getCachedColumnsHash(table);
  }
  if (!hash) return;

  // Guard against adapter swaps during the async work above: if a different
  // adapter was installed, discard this load rather than writing stale types.
  if (this.adapter !== startingAdapter) return;

  // Copy-on-write: match the ownership check used elsewhere (attributes.ts,
  // encryption.ts) so we mutate this class's own map, not the inherited one.
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }

  const ignored = new Set(this._ignoredColumns ?? []);
  for (const [name, column] of Object.entries(hash)) {
    // Honor Base.ignoredColumns — Rails' load_schema! excludes these too.
    if (ignored.has(name)) {
      const proto = (this as unknown as { prototype: object }).prototype;
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        delete (proto as Record<string, unknown>)[name];
      }
      this._attributeDefinitions.delete(name);
      continue;
    }
    const existing = this._attributeDefinitions.get(name);
    // Treat absent userProvided as true — externally-constructed defs
    // (pre-PR shape) are user-authored by definition; schema reflection
    // must never overwrite them.
    if (existing && (existing.userProvided ?? true)) continue;

    const castType =
      typeof startingAdapter.lookupCastTypeFromColumn === "function"
        ? startingAdapter.lookupCastTypeFromColumn(column)
        : null;
    let type = castType ?? typeRegistry.lookup("value");

    // Preserve an existing EncryptedAttributeType wrapper: re-wrap the
    // fresh adapter-resolved cast type rather than discarding encryption.
    if (existing?.type instanceof EncryptedAttributeType) {
      const scheme = (existing.type as EncryptedAttributeType).scheme;
      type = new EncryptedAttributeType({ scheme, castType: type });
    }

    const defaultValue = (column as { default?: unknown }).default ?? null;

    this._attributeDefinitions.set(name, {
      name,
      type,
      defaultValue,
      userProvided: false,
      source: "schema",
    });

    // Define the prototype accessor so `record.foo` routes through
    // readAttribute/writeAttribute. Mirrors what ActiveModel.attribute()
    // does for user-declared attrs (attributes.ts ~L56).
    //
    // Skip "id": Base.prototype.id is an accessor with composite-PK
    // logic (base.ts). Defining an own "id" on a subclass prototype
    // would shadow it — Base.attribute has the same skip (base.ts:392).
    if (name === "id") {
      const proto = (this as unknown as { prototype: object }).prototype;
      if (Object.prototype.hasOwnProperty.call(proto, "id")) {
        delete (proto as Record<string, unknown>).id;
      }
      continue;
    }
    const proto = (this as unknown as { prototype: object }).prototype;
    if (!Object.prototype.hasOwnProperty.call(proto, name)) {
      Object.defineProperty(proto, name, {
        get(this: { readAttribute(n: string): unknown }) {
          return this.readAttribute(name);
        },
        set(this: { writeAttribute(n: string, v: unknown): void }, value: unknown) {
          this.writeAttribute(name, value);
        },
        configurable: true,
      });
    }
  }

  // Invalidate every cache that derives from _attributeDefinitions —
  // columns()/columnsHash()/columnForAttribute() would otherwise serve
  // pre-reflection data forever.
  const caches = this as unknown as {
    _attributesBuilder?: unknown;
    _cachedDefaultAttributes?: unknown;
    _columnsHash?: unknown;
    _columns?: unknown;
  };
  caches._attributesBuilder = undefined;
  caches._cachedDefaultAttributes = null;
  caches._columnsHash = undefined;
  caches._columns = undefined;

  // Re-run pending encryption decorations so `encrypts :foo` declared before
  // schema load still wraps the adapter-resolved cast type. Mirrors the
  // applyPendingEncryptions call in Base.attribute (base.ts).
  applyPendingEncryptions(this);
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
  yamlEncoder,
  columnForAttribute,
  symbolColumnToString,
  resetColumnInformation,
  _returningColumnsForInsert,
  loadSchemaFromAdapter,
};
