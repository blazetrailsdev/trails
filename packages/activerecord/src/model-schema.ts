import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import { isStiSubclass, getStiBase } from "./inheritance.js";
import { quote, quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "./adapter-name.js";

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
export function resolveTableName(modelClass: typeof Base): string {
  if ((modelClass as any)._tableName != null) return (modelClass as any)._tableName;
  if (isStiSubclass(modelClass)) {
    return resolveTableName(getStiBase(modelClass));
  }
  const prefix = (modelClass as any)._tableNamePrefix ?? "";
  const suffix = (modelClass as any)._tableNameSuffix ?? "";
  const inferred = pluralize(underscore(modelClass.name));
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
export function buildPkWhere(modelClass: typeof Base, idValue: unknown): string {
  const pk = modelClass.primaryKey;
  const adapter = detectAdapterName(modelClass.adapter);
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
  modelClass: typeof Base,
  idValue: unknown,
): InstanceType<typeof Nodes.Node> {
  const table = modelClass.arelTable;
  const pk = modelClass.primaryKey;
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
export function columnNames(modelClass: typeof Base): string[] {
  const ignored = new Set(modelClass.ignoredColumns ?? []);
  return Array.from(modelClass._attributeDefinitions.keys()).filter((name) => !ignored.has(name));
}

/**
 * Check if a model class has a given attribute defined.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#has_attribute?
 */
export function hasAttributeDefinition(modelClass: typeof Base, name: string): boolean {
  return modelClass._attributeDefinitions.has(name);
}

/**
 * Return a hash of column definitions keyed by name.
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#columns_hash
 */
export function columnsHash(
  modelClass: typeof Base,
): Record<string, { name: string; type: string; default: unknown }> {
  if (modelClass.abstractClass) {
    throw new Error(`Cannot call columnsHash on abstract class ${modelClass.name}`);
  }
  const result: Record<string, { name: string; type: string; default: unknown }> = {};
  for (const [name, def] of modelClass._attributeDefinitions) {
    result[name] = { name, type: def.type.name, default: def.defaultValue ?? null };
  }
  return result;
}

/**
 * Return content columns (excluding PK, FKs, and timestamps).
 *
 * Mirrors: ActiveRecord::ModelSchema::ClassMethods#content_columns
 */
export function contentColumns(modelClass: typeof Base): string[] {
  const pk = modelClass.primaryKey;
  return columnNames(modelClass).filter((col) => {
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
export async function createTable(modelClass: typeof Base): Promise<void> {
  const table = resolveTableName(modelClass);
  const pks = Array.isArray(modelClass.primaryKey)
    ? modelClass.primaryKey
    : [modelClass.primaryKey];
  const adapterName = detectAdapterName(modelClass.adapter);
  const isMysql = adapterName === "mysql";
  const isPg = adapterName === "postgres";
  const pkSet = new Set(pks);

  await modelClass.adapter.executeMutation(
    `DROP TABLE IF EXISTS ${quoteTableName(table, adapterName)}`,
  );

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
      const pkDef = modelClass._attributeDefinitions.get(pk);
      const pkType = sqlTypeFor(pkDef?.type?.name || "integer", adapterName);
      colDefs.push(`${quoteIdentifier(pk, adapterName)} ${pkType} NOT NULL`);
    }
  }

  for (const [name, def] of modelClass._attributeDefinitions) {
    if (pkSet.has(name)) continue;
    const sqlType = sqlTypeFor(def.type?.name || "string", adapterName);
    colDefs.push(`${quoteIdentifier(name, adapterName)} ${sqlType}`);
  }

  if (pks.length > 1) {
    colDefs.push(`PRIMARY KEY (${pks.map((pk) => quoteIdentifier(pk, adapterName)).join(", ")})`);
  }

  await modelClass.adapter.executeMutation(
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
  const name = resolveTableName(this as any);
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
export function attributesBuilder(this: SchemaHost): {
  buildFromDatabase(values: Record<string, unknown>): Record<string, unknown>;
} {
  if (this._attributesBuilder) return this._attributesBuilder;

  const host = this;
  this._attributesBuilder = {
    buildFromDatabase(values: Record<string, unknown>): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      const pk = host.primaryKey;
      const pkSet = new Set(Array.isArray(pk) ? pk : [pk]);
      for (const [name, def] of host._attributeDefinitions) {
        if (!pkSet.has(name) && def.defaultValue !== undefined) {
          result[name] =
            typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
        }
      }
      Object.assign(result, values);
      return result;
    },
  };
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

export function yamlEncoder(this: SchemaHost): { encode(value: unknown): string } {
  return {
    encode(value: unknown): string {
      return JSON.stringify(value);
    },
  };
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
