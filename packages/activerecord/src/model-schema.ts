import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import {
  Attribute,
  AttributeSetBuilder,
  YAMLEncoder,
  typeRegistry,
  type Type,
} from "@blazetrails/activemodel";
import { isStiSubclass, getStiBase } from "./inheritance.js";
import { quote, quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "./adapter-name.js";
import { applyPendingEncryptions } from "./encryption.js";
import { isWrappedType } from "./encryption/wrapped-type.js";

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
  if (this.abstractClass) {
    throw new Error(`Cannot call columnsHash on abstract class ${this.name}`);
  }
  loadSchema.call(this as unknown as SchemaHost);

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
      adapter = (cand as typeof Base).adapter as unknown as DatabaseAdapterLike;
    } catch {
      adapter = null;
    }
    if (adapter) break;
  }
  const cache = (adapter as unknown as { schemaCache?: unknown } | null)?.schemaCache as
    | {
        isCached?: (t: string) => boolean;
        getCachedColumnsHash?: (t: string) => Record<string, ColumnLike> | undefined;
      }
    | undefined;
  const table = stiTarget.tableName;
  if (cache && typeof cache.isCached === "function" && cache.isCached(table)) {
    const cached = cache.getCachedColumnsHash?.(table);
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

  // Synthesized fallback: filter ignoredColumns to match loadSchema's
  // fallback and Rails behavior.
  const ignored = new Set(this.ignoredColumns ?? []);
  const result: Record<string, ColumnLike> = {};
  for (const [name, def] of this._attributeDefinitions) {
    if (ignored.has(name)) continue;
    result[name] = { name, type: def.type?.name ?? null, default: def.defaultValue ?? null };
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

  // STI: write cache to the base so subclasses inherit via prototype
  // chain, and a base reset propagates automatically.
  const cacheHost = isStiSubclass(this as unknown as typeof Base)
    ? (getStiBase(this as unknown as typeof Base) as unknown as SchemaHost)
    : this;
  cacheHost._attributesBuilder = new AttributeSetBuilder(types, defaults);
  // If we are an STI subclass, resetDefaultAttributes() may have placed an
  // own-property shadow of `undefined` on `this` to block stale inheritance.
  // Now that cacheHost has a fresh builder, remove the shadow so subsequent
  // calls on this STI subclass find cacheHost's builder via prototype chain
  // instead of rebuilding on every access.
  if (
    cacheHost !== (this as unknown) &&
    Object.prototype.hasOwnProperty.call(this, "_attributesBuilder")
  ) {
    delete (this as unknown as Record<string, unknown>)._attributesBuilder;
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
  const cacheHost = isStiSubclass(this as unknown as typeof Base)
    ? (getStiBase(this as unknown as typeof Base) as unknown as SchemaHost)
    : this;
  cacheHost._columns = Object.values(hash);
  return cacheHost._columns!;
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
 * Drops schema-sourced attribute defs so the next load re-reflects
 * them; user-declared defs (source === "user") are preserved, matching
 * Rails' reload_schema_from_cache behavior where user-provided
 * attributes survive reload.
 */
export function resetColumnInformation(this: SchemaHost): void {
  // STI subclasses share the base's defs. Redirect the reset to the base
  // so schema-sourced defs and accessors are actually cleared; clear the
  // subclass-local caches too so any forked metadata is dropped.
  if (isStiSubclass(this as unknown as typeof Base)) {
    const subCaches = this as SchemaHost & { _cachedDefaultAttributes?: unknown };
    // Delete own properties rather than assigning undefined/false, so
    // the subclass inherits the base's freshly-rebuilt caches via the
    // prototype chain instead of shadowing them.
    const sub = subCaches as unknown as Record<string, unknown>;
    for (const key of [
      "_columnsHash",
      "_columns",
      "_attributesBuilder",
      "_schemaLoaded",
      "_cachedDefaultAttributes",
    ]) {
      if (Object.prototype.hasOwnProperty.call(sub, key)) delete sub[key];
    }
    // Scrub schema-sourced entries from any subclass-forked
    // _attributeDefinitions too (from a prior attribute() /
    // decorateAttributes / encrypts call). Without this, schema defs
    // leak past the reset on subclasses that forked their own map.
    if (Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
      for (const [name, def] of Array.from(this._attributeDefinitions)) {
        if ((def.userProvided ?? true) === false || def.source === "schema") {
          this._attributeDefinitions.delete(name);
          const proto = (this as unknown as { prototype: object }).prototype;
          if (Object.prototype.hasOwnProperty.call(proto, name)) {
            delete (proto as Record<string, unknown>)[name];
          }
        }
      }
    }
    resetColumnInformation.call(
      getStiBase(this as unknown as typeof Base) as unknown as SchemaHost,
    );
    return;
  }
  this._columnsHash = undefined;
  this._columns = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
  (this as SchemaHost & { _cachedDefaultAttributes?: unknown })._cachedDefaultAttributes = null;
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) return;
  for (const [name, def] of Array.from(this._attributeDefinitions)) {
    if ((def.userProvided ?? true) === false || def.source === "schema") {
      this._attributeDefinitions.delete(name);
      const proto = (this as unknown as { prototype: object }).prototype;
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        delete (proto as Record<string, unknown>)[name];
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

  // The class that actually owns the schema load — the STI base when
  // `this` is a subclass. We set `_schemaLoaded` only on the workHost
  // so subclasses inherit the flag via the prototype chain. Assigning
  // on the subclass would shadow the base flag and prevent re-reflection
  // when the base is reset. Delete any stale own-flag on the subclass.
  const workHost = isStiSubclass(this as unknown as typeof Base)
    ? (getStiBase(this as unknown as typeof Base) as unknown as SchemaHost)
    : this;
  if (workHost !== this && Object.prototype.hasOwnProperty.call(this, "_schemaLoaded")) {
    delete (this as unknown as Record<string, unknown>)._schemaLoaded;
  }

  const reflected = loadSchemaFromCacheSync(this);
  if (reflected) {
    workHost._schemaLoaded = true;
    return;
  }

  // Fallback: no schema cache — synthesize a columnsHash view on the
  // work host so subclasses don't fork _columnsHash (which would persist
  // past a later base reflection).
  if (!workHost._columnsHash && workHost._attributeDefinitions.size > 0) {
    const hash: Record<string, any> = {};
    const ignored = new Set(workHost._ignoredColumns ?? []);
    for (const [name, def] of workHost._attributeDefinitions) {
      if (ignored.has(name)) continue;
      hash[name] = {
        name,
        type: def.type?.name ?? null,
        default: def.defaultValue ?? null,
      };
    }
    workHost._columnsHash = hash;
  }
  workHost._schemaLoaded = true;
}

function getColumnsHash(host: SchemaHost): Record<string, any> {
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
      const proto = (host as unknown as { prototype: object }).prototype;
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        delete (proto as Record<string, unknown>)[name];
      }
      // STI: also strip a subclass-owned accessor if the originating
      // host declared the attribute on itself, or `"col" in record` on
      // the subclass would still return true.
      if (originatingHost && originatingHost !== host) {
        const subProto = (originatingHost as unknown as { prototype: object }).prototype;
        if (Object.prototype.hasOwnProperty.call(subProto, name)) {
          delete (subProto as Record<string, unknown>)[name];
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

    // Preserve encryption wrappers across schema reflection. Both
    // EncryptedAttributeType variants implement `WrappedType`; any
    // future type implementing the same contract is automatically
    // supported. No `instanceof` branching on concrete classes.
    const existingType = existing?.type;
    if (isWrappedType(existingType)) {
      type = existingType.withInnerType(type);
    }

    const defaultValue = (column as { default?: unknown }).default ?? null;

    host._attributeDefinitions.set(name, {
      name,
      type,
      defaultValue,
      userProvided: false,
      source: "schema",
    });

    if (name === "id") {
      const proto = (host as unknown as { prototype: object }).prototype;
      if (Object.prototype.hasOwnProperty.call(proto, "id")) {
        delete (proto as Record<string, unknown>).id;
      }
      continue;
    }
    const proto = (host as unknown as { prototype: object }).prototype;
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

  type CacheBag = {
    _attributesBuilder?: unknown;
    _cachedDefaultAttributes?: unknown;
    _columnsHash?: unknown;
    _columns?: unknown;
  };
  const invalidate = (h: SchemaHost, { deleteOwn }: { deleteOwn: boolean }) => {
    const c = h as unknown as Record<string, unknown>;
    if (deleteOwn) {
      // Delete own properties so `h` inherits freshly-rebuilt caches
      // from its prototype chain (used for the STI subclass case).
      for (const key of [
        "_attributesBuilder",
        "_cachedDefaultAttributes",
        "_columnsHash",
        "_columns",
      ]) {
        if (Object.prototype.hasOwnProperty.call(c, key)) delete c[key];
      }
      return;
    }
    const bag = c as CacheBag;
    bag._attributesBuilder = undefined;
    bag._cachedDefaultAttributes = null;
    bag._columnsHash = undefined;
    bag._columns = undefined;
  };
  invalidate(host, { deleteOwn: false });
  if (originatingHost && originatingHost !== host) invalidate(originatingHost, { deleteOwn: true });

  applyPendingEncryptions(host);

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
    applyPendingEncryptions(originatingHost);
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
  if (this._abstractClass) return;
  // STI subclasses inherit the base's attribute defs — reflect onto the
  // STI base without forking. Use whichever class has the adapter
  // configured (base in normal Rails setup, but tolerate subclass-only
  // configuration).
  const klass = this as unknown as typeof Base;
  const schemaHost = isStiSubclass(klass) ? (getStiBase(klass) as unknown as SchemaHost) : this;

  let startingAdapter: SchemaHost["adapter"] | undefined;
  let adapterOwner: SchemaHost | undefined;
  const candidates: SchemaHost[] = schemaHost === this ? [schemaHost] : [schemaHost, this];
  for (const cand of candidates) {
    try {
      startingAdapter = cand.adapter;
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
  const table = (schemaHost as unknown as typeof Base).tableName;
  const pool = startingAdapter.pool ?? startingAdapter;

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

  // Guard against adapter swaps during the async work above. Verify the
  // *same* host that supplied startingAdapter still has it — checking
  // other candidates would let a stale reflection slip through if the
  // adapter moved.
  let currentAdapter: SchemaHost["adapter"] | undefined;
  try {
    currentAdapter = adapterOwner.adapter;
  } catch {
    currentAdapter = undefined;
  }
  if (currentAdapter !== startingAdapter) return;

  applyColumnsHash(schemaHost, startingAdapter, hash, this);
}

/**
 * Sync counterpart: consult the already-populated schema cache only.
 * Returns true if reflection happened; false when the cache is empty
 * (caller may fall back to attribute-defs-derived metadata).
 */
function loadSchemaFromCacheSync(host: SchemaHost): boolean {
  if (host._abstractClass) return false;
  // STI subclasses share the base's table and attribute defs. Reflecting
  // on a subclass would fork _attributeDefinitions; instead, apply
  // reflection to the STI base so subclasses inherit it.
  const schemaHost = isStiSubclass(host as unknown as typeof Base)
    ? (getStiBase(host as unknown as typeof Base) as unknown as SchemaHost)
    : host;
  // Adapter may be configured on the base OR on the subclass. Try base
  // first (Rails-normal), fall back to the originating host. Access can
  // throw when no pool is configured; treat as "no adapter".
  let adapter: SchemaHost["adapter"] | undefined;
  const candidates = schemaHost === host ? [schemaHost] : [schemaHost, host];
  for (const cand of candidates) {
    try {
      adapter = cand.adapter;
    } catch {
      adapter = undefined;
    }
    if (adapter) break;
  }
  if (!adapter) return false;
  const cache = adapter.schemaCache;
  if (!cache || typeof cache.isCached !== "function") return false;
  const table = (schemaHost as unknown as typeof Base).tableName;
  if (!cache.isCached(table)) return false;
  const hash =
    typeof cache.getCachedColumnsHash === "function"
      ? cache.getCachedColumnsHash(table)
      : undefined;
  if (!hash) return false;
  applyColumnsHash(schemaHost, adapter, hash, host);
  return true;
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
