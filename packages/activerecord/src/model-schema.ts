import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pluralize, underscore } from "@blazetrails/activesupport";
import {
  AttributeSetBuilder,
  YAMLEncoder,
  type AttributeSet,
  type ValueType,
} from "@blazetrails/activemodel";
import { classAttribute, included } from "@blazetrails/activesupport";
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
import { NullColumn } from "./connection-adapters/column.js";
import {
  threadedConnectionFor,
  connectionPool,
  withConnection,
  connectedQ,
} from "./connection-handling.js";

function reflectionAdapter(klass: any): any {
  const threaded = threadedConnectionFor(klass);
  if (threaded) return threaded;
  if (klass._adapter) return klass._adapter;
  const pool = connectionPool.call(klass);
  return pool.activeConnection ?? pool.leaseConnectionSync();
}

/** @internal */
function ownSchemaMemo<K extends keyof SchemaHost>(
  host: SchemaHost,
  key: K,
): SchemaHost[K] | undefined {
  return Object.prototype.hasOwnProperty.call(host, key) ? host[key] : undefined;
}

/** @internal */
function computeTableName(this: typeof Base): string {
  if (isBaseClass(this)) {
    const contained = containedTableNamePrefix.call(this);
    const pluralizes = (this as any).pluralizeTableNames ?? true;
    return `${fullTableNamePrefix.call(this as any)}${contained}${undecoratedTableName(
      String(this.modelName),
      pluralizes,
    )}${fullTableNameSuffix.call(this as any)}`;
  }
  const base = baseClass.call(this);
  if (base === this) return "";
  return base.tableName;
}

/** @internal */
function undecoratedTableName(modelName: string, pluralizes = true): string {
  const demodulized = modelName.split("::").pop() ?? modelName;
  const base = underscore(demodulized);
  return pluralizes ? pluralize(base) : base;
}

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

export interface ColumnLike {
  name: string;
  type?: string | null;
  sqlType?: string;
  default?: unknown;
  [key: string]: unknown;
}

export function columnsHash(this: typeof Base): Record<string, ColumnLike> {
  if (ownSchemaMemo(this as unknown as SchemaHost, "_columnsHash") == null) {
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

  return {};
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
  try {
    const hash =
      cachedFrom(threadedConnectionFor(klass)) ??
      cachedFrom((klass as { _adapter?: { internalSchemaCache?: unknown } })._adapter) ??
      cachedFrom(
        connectionPool.call(klass).activeConnection as { internalSchemaCache?: unknown } | null,
      );
    if (hash) return hash;
  } catch {}
  return undefined;
}

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

export interface SchemaHost {
  name: string;
  tableName: string;
  primaryKey: string | string[];
  _tableName: string | null;
  tableNamePrefix: string;
  tableNameSuffix: string;
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
  /** @internal */
  _columnNamesMemo?: { names: readonly string[] };
  connection: any;
  prototype: object;
  superclass?: SchemaHost;
  hookAttributeType?(name: string, type: ValueType): ValueType;
  /** @internal */
  reloadSchemaFromCache(): void;
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

export function deriveJoinTableName(firstTable: string, secondTable: string): string {
  const joined = [String(firstTable), String(secondTable)].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}

export function quotedTableName(this: SchemaHost): string {
  return reflectionAdapter(this).quoteTableName(this.tableName);
}

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
  return lookupModuleTableNamePrefix(moduleName) ?? this.tableNamePrefix ?? "";
}

export function fullTableNameSuffix(this: SchemaHost): string {
  const moduleName = (this as any).moduleName as string | undefined;
  return lookupModuleTableNameSuffix(moduleName) ?? this.tableNameSuffix ?? "";
}

export function realInheritanceColumn(this: SchemaHost, value: string | null): void {
  this._inheritanceColumn = value;
}

export const _inheritanceColumn = realInheritanceColumn;

export async function _returningColumnsForInsert(
  this: SchemaHost,
  connection: { returnValueAfterInsert?(column: { name: string }): Promise<boolean> },
): Promise<string[]> {
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

export function attributesBuilder(this: SchemaHost): AttributeSetBuilder {
  const ownBuilder = ownSchemaMemo(this, "_attributesBuilder");
  if (ownBuilder) return ownBuilder;

  const primaryKey = this.primaryKey;
  const defaults = this._defaultAttributes().except(
    ...columnNames.call(this as unknown as typeof Base).filter((name) => name !== primaryKey),
  );
  const builder = new AttributeSetBuilder(this.attributeTypes(), defaults);
  this._attributesBuilder = builder;
  return builder;
}

export function columns(this: SchemaHost): any[] {
  const ownColumns = ownSchemaMemo(this, "_columns");
  if (ownColumns != null) return ownColumns;
  const built = Object.values(columnsHash.call(this as unknown as typeof Base));
  this._columns = built;
  return built;
}

export function yamlEncoder(this: SchemaHost): YAMLEncoder {
  const own = ownSchemaMemo(this, "_yamlEncoder");
  if (own) return own;
  this._yamlEncoder = new YAMLEncoder(this.attributeTypes());
  return this._yamlEncoder;
}

export function columnForAttribute(this: SchemaHost, name: string): any {
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  return name in hash ? hash[name] : new NullColumn(name);
}

export function symbolColumnToString(this: SchemaHost, nameSymbol: string): string | undefined {
  loadSchema.call(this);
  const hash = getColumnsHash(this);
  return hash[nameSymbol] ? nameSymbol : undefined;
}

function clearAdapterDataSourceCache(host: SchemaHost): void {
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

export function resetColumnInformation(this: SchemaHost): PromiseLike<void> | void {
  try {
    void (
      connectionPool.call(this as unknown as typeof Base).activeConnection as {
        clearCacheBang?: () => unknown;
      } | null
    )?.clearCacheBang?.();
  } catch {}
  (this as { _findByStatementCache?: unknown })._findByStatementCache = undefined;
  clearAdapterDataSourceCache(this);
  this.reloadSchemaFromCache();
  return rewarmDataSourceCache(this);
}

/** @internal */
export function reloadSchemaFromCache(this: SchemaHost): void {
  this._columnsHash = undefined;
  this._columns = undefined;
  this._returningColumnsForInsertCache = undefined;
  this._attributesBuilder = undefined;
  this._schemaLoaded = false;
  (this as SchemaHost & { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
  clearAttributeNamesMemo(this);
  for (const sub of (this as { subclasses?: SchemaHost[] }).subclasses ?? []) {
    sub.reloadSchemaFromCache();
  }
}

export function loadSchema(this: SchemaHost): void {
  if (ownSchemaMemo(this, "_schemaLoaded")) return;
  try {
    loadSchemaBang.call(this);
  } catch (error) {
    this.reloadSchemaFromCache();
    throw error;
  }
  if (!ownSchemaMemo(this, "_schemaLoaded")) {
    this._columnsHash = undefined;
  }
}

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
    this._defaultAttributes();
    return;
  }

  this._columnsHash = {};
}

function getColumnsHash(host: SchemaHost): Record<string, unknown> {
  const own = ownSchemaMemo(host, "_columnsHash");
  if (own != null) return own;
  const ch = (host as any).columnsHash;
  if (typeof ch === "function") return ch.call(host) ?? {};
  return {};
}

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

  const methodHost = host as unknown as {
    _attributeMethodsGenerated?: boolean;
  };
  methodHost._attributeMethodsGenerated = false;

  encryptionHooks.applyPendingEncryptions(host);

  const reflectedColumnNames = Object.keys(hash).filter((n) => !ignored.has(n));
  encryptionHooks.requireOriginalColumnsAfterReflection?.(host, reflectedColumnNames);

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
  const cache = startingAdapter.schemaCache;
  if (!cache) return;
  const table = this.tableName;

  const exists = await cache.dataSourceExists(table);
  if (exists === false) return;

  const hash = await cache.columnsHash(table);
  if (!hash) return;

  await cache.primaryKeys(table);

  let currentAdapter: SchemaHost["connection"] | undefined;
  try {
    currentAdapter = reflectionAdapter(adapterOwner);
  } catch {
    currentAdapter = undefined;
  }
  if (currentAdapter !== startingAdapter) return;

  loadSchemaBang.call(this);
}

function loadSchemaFromCacheSync(host: SchemaHost): boolean {
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
  if (value !== undefined) this._inheritanceColumn = value;
  if (this._inheritanceColumn === null) return null;
  return this._inheritanceColumn ?? "type";
}

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
    this.reloadSchemaFromCache();
    this._ignoredColumns = value.map(String);
  }
  return this._ignoredColumns ?? [];
}

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

export interface ModelSchema {
  tableNamePrefix: string;
  tableNameSuffix: string;
}

export const ModelSchema = {
  [included](base: object): void {
    classAttribute.call(base, "tableNamePrefix", { instanceWriter: false, default: "" });
    classAttribute.call(base, "tableNameSuffix", { instanceWriter: false, default: "" });
  },
};

export const ClassMethods = {
  columnNames,
  columnsHash,
  contentColumns,
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

export const InstanceMethods = {
  typeForAttribute(
    this: { constructor: unknown },
    name: string,
    block?: () => ValueType,
  ): ValueType | null {
    return (
      this.constructor as { typeForAttribute(n: string, b?: () => ValueType): ValueType | null }
    ).typeForAttribute(name, block);
  },

  columnForAttribute(this: { constructor: unknown }, name: string): unknown {
    return (this.constructor as { columnForAttribute(n: string): unknown }).columnForAttribute(
      name,
    );
  },
};

/** @internal */
function initializeLoadSchemaMonitor(this: SchemaHost): void {}

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
