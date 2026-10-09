import {
  type Hash,
  fetch,
  hashAref,
  isEmpty,
  block as rbBlock,
  rbObjAsString,
  rbClassSuperclass,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { ActiveRecord } from "./namespaces.js";
import * as ModelSchemaModule from "./model-schema.js";
import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { indexBy, kernelArray, pluralize, underscore } from "@blazetrails/activesupport";
import {
  AttributeSetBuilder,
  YAMLEncoder,
  type AttributeSet,
  type ValueType,
} from "@blazetrails/activemodel";
import {
  classAttribute,
  delegate,
  included,
  moduleParent,
  moduleParents,
} from "@blazetrails/activesupport";
import { isBaseClass, baseClass } from "./inheritance.js";
import { singularize } from "@blazetrails/activesupport";
import { TableNotSpecified } from "./errors.js";
import { EncryptableRecord } from "./encryption/encryptable-record.js";
import { NullColumn } from "./connection-adapters/column.js";
import { withConnection, isConnected } from "./connection-handling.js";

function reflectionAdapter(klass: any): any {
  const pool = klass.connectionPool();
  return pool.withConnectionSync((connection: any) => connection);
}

/** @internal */
function ownSchemaMemo<K extends keyof SchemaHost>(
  host: SchemaHost,
  key: K,
): SchemaHost[K] | undefined {
  return Object.prototype.hasOwnProperty.call(host, key) ? host[key] : undefined;
}

/** @internal */
function computeTableName(this: typeof Base): string | null {
  if (isBaseClass(this)) {
    const contained = containedTableNamePrefix.call(this);
    const pluralizes = (this as any).pluralizeTableNames ?? true;
    return `${fullTableNamePrefix.call(this as any)}${contained}${undecoratedTableName(
      String(this.modelName),
      pluralizes,
    )}${fullTableNameSuffix.call(this as any)}`;
  }
  return baseClass.call(this).tableName;
}

/** @internal */
function undecoratedTableName(modelName: string, pluralizes = true): string {
  const demodulized = modelName.split("::").pop() ?? modelName;
  const base = underscore(demodulized);
  return pluralizes ? pluralize(base) : base;
}

function containedTableNamePrefix(this: typeof Base): string {
  const parent = moduleParent(this) as typeof Base;
  if (!(typeof parent === "function" && parent.prototype instanceof ActiveRecord.Base)) return "";
  if (parent.abstractClass) return "";
  const contained =
    ((parent as any).pluralizeTableNames ?? true)
      ? singularize(parent.tableName!)
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
): Nodes.Node | Nodes.SqlLiteral {
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
  return (ownSchemaMemo(host, "_columnNames") ??
    (host._columnNames = Object.freeze(
      this.columns().map((c: { name: string }) => c.name),
    ))) as string[];
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

  return (ownSchemaMemo(this as unknown as SchemaHost, "_columnsHash") ?? {}) as Record<
    string,
    ColumnLike
  >;
}

export function contentColumns(this: typeof Base): any[] {
  const host = this as unknown as SchemaHost;
  return (
    ownSchemaMemo(host, "_contentColumns") ??
    (host._contentColumns = Object.freeze(
      columns
        .call(host)
        .filter(
          (c: { name: string }) =>
            !(
              c.name === this.primaryKey ||
              c.name === this.inheritanceColumn ||
              c.name.endsWith("_id") ||
              c.name.endsWith("_count")
            ),
        ),
    ) as any[])
  );
}

export interface SchemaHost {
  name: string;
  tableName: string | null;
  primaryKey: string | string[];
  _tableName: string | null;
  tableNamePrefix: string;
  tableNameSuffix: string;
  _sequenceName: string | null | Promise<string | null>;
  /** @internal */
  _explicitSequenceName?: boolean;
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
  attributeTypes(): Record<string, any> | Hash<string, any>;
  _schemaLoaded?: boolean;
  loadSchemaBang(): void;
  /** @internal */
  _columnNames?: readonly string[];
  /** @internal */
  _contentColumns?: any[];
  /** @internal */
  _symbolColumnToStringNameHash?: Record<string, string>;
  connection: any;
  prototype: object;
  superclass?: SchemaHost;
  hookAttributeType?(name: string, type: ValueType): ValueType;
  /** @internal */
  reloadSchemaFromCache(recursive?: boolean): void;
}

export function deriveJoinTableName(firstTable: string | null, secondTable: string | null): string {
  const joined = [firstTable ?? "", secondTable ?? ""].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}

export function quotedTableName(this: SchemaHost): string {
  return (this as unknown as typeof Base).adapterClass().quoteTableName(this.tableName);
}

export function resetTableName(this: SchemaHost): string | null {
  const klass = this as unknown as typeof Base;
  const superclass = rbClassSuperclass(klass) as typeof Base;
  setTableName.call(
    this,
    klass === ActiveRecord.Base
      ? null
      : klass.abstractClass
        ? superclass.tableName
        : superclass.abstractClass
          ? superclass.tableName || computeTableName.call(klass)
          : computeTableName.call(klass),
  );
  return this._tableName;
}

export function fullTableNamePrefix(this: SchemaHost): string {
  return (
    (moduleParents(this).find((p) => rbObjRespondTo(p, "tableNamePrefix")) as
      | SchemaHost
      | undefined) ?? this
  ).tableNamePrefix;
}

export function fullTableNameSuffix(this: SchemaHost): string {
  return (
    (moduleParents(this).find((p) => rbObjRespondTo(p, "tableNameSuffix")) as
      | SchemaHost
      | undefined) ?? this
  ).tableNameSuffix;
}

export function realInheritanceColumn(this: SchemaHost, value: string | null): void {
  this._inheritanceColumn = value;
}

export const _inheritanceColumn = realInheritanceColumn;

export async function _returningColumnsForInsert(
  this: SchemaHost,
  connection: { returnValueAfterInsert(column: { name: string }): Promise<boolean> },
): Promise<string[]> {
  const memo = ownSchemaMemo(this, "_returningColumnsForInsertCache");
  if (memo) return memo;

  const autoPopulatedColumns: string[] = [];
  for (const c of columns.call(this) as { name: string }[]) {
    if (await connection.returnValueAfterInsert(c)) autoPopulatedColumns.push(c.name);
  }

  return (this._returningColumnsForInsertCache = isEmpty(autoPopulatedColumns)
    ? kernelArray(this.primaryKey)
    : autoPopulatedColumns);
}

/** @inventedArm if — PERMANENT */
export function resetSequenceName(this: SchemaHost): Promise<string | null> {
  this._explicitSequenceName = false;
  const sequenceName = (this as unknown as typeof Base).withConnection((c) =>
    (
      c as unknown as {
        defaultSequenceName(
          tableName: string | null,
          primaryKey: string | string[],
        ): Promise<string | null> | string | null;
      }
    ).defaultSequenceName(this.tableName, this.primaryKey),
  );
  sequenceName.then(
    (value) => {
      if (this._sequenceName === sequenceName) this._sequenceName = value;
    },
    () => {
      if (this._sequenceName === sequenceName) this._sequenceName = null;
    },
  );
  return (this._sequenceName = sequenceName);
}

export function isPrefetchPrimaryKey(this: SchemaHost): boolean {
  return false;
}

export function nextSequenceValue(this: SchemaHost): number | null {
  return null;
}

export function attributesBuilder(this: SchemaHost): AttributeSetBuilder {
  return (
    ownSchemaMemo(this, "_attributesBuilder") ??
    (this._attributesBuilder = (() => {
      const defaults = this._defaultAttributes().except(
        ...columnNames
          .call(this as unknown as typeof Base)
          .filter((name) => name !== this.primaryKey),
      );
      return new AttributeSetBuilder(this.attributeTypes(), defaults);
    })())
  );
}

/** @missingRailsName columnsHash — PERMANENT */
export function columns(this: SchemaHost): any[] {
  return (
    ownSchemaMemo(this, "_columns") ??
    (this._columns = Object.freeze(
      Object.values(columnsHash.call(this as unknown as typeof Base)),
    ) as any[])
  );
}

export function yamlEncoder(this: SchemaHost): YAMLEncoder {
  return (
    ownSchemaMemo(this, "_yamlEncoder") ??
    (this._yamlEncoder = new YAMLEncoder(this.attributeTypes()))
  );
}

export function columnForAttribute(this: SchemaHost, name: string): any {
  name = rbObjAsString(name);
  return fetch(
    (this as unknown as typeof Base).columnsHash(),
    name,
    rbBlock(() => new NullColumn(name)),
  );
}

export function symbolColumnToString(this: SchemaHost, nameSymbol: string): string | null {
  const symbolColumnToStringNameHash =
    ownSchemaMemo(this, "_symbolColumnToStringNameHash") ??
    (this._symbolColumnToStringNameHash = indexBy(
      columnNames.call(this as unknown as typeof Base),
      (name) => name,
    ));
  return hashAref(symbolColumnToStringNameHash, nameSymbol) as string | null;
}

function clearAdapterDataSourceCache(host: SchemaHost): void {
  type Cache = {
    clearDataSourceCacheBang?: (connection: unknown, name: string) => void;
  };
  let cache: Cache | null | undefined;
  let table: string | undefined;
  try {
    table = (host as unknown as { tableName?: string }).tableName;
    const pool = (
      host as unknown as {
        connectionPool?: () => { poolConfig?: { schemaReflection: { loadedCache: Cache | null } } };
      }
    ).connectionPool?.();
    cache = pool?.poolConfig?.schemaReflection.loadedCache;
  } catch {
    return;
  }
  if (!table) return;
  if (typeof cache?.clearDataSourceCacheBang === "function") {
    cache.clearDataSourceCacheBang(null, table);
  }
}

function rewarmDataSourceCache(host: SchemaHost): PromiseLike<void> | void {
  let cache: { columns?: (t: string) => Promise<unknown> } | null | undefined;
  try {
    cache = (host as unknown as typeof Base).connectionPool().schemaCache as typeof cache;
  } catch {
    return;
  }
  const table = (host as unknown as { tableName?: string }).tableName;
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
 * @inventedArm try — CONVERGEABLE reset-column-information-rewarm-is-not-in-rails
 * @inventedArm rescue — CONVERGEABLE reset-column-information-rewarm-is-not-in-rails
 */
export function resetColumnInformation(this: SchemaHost): PromiseLike<void> | void {
  try {
    void (
      (this as unknown as typeof Base).connectionPool().activeConnection as {
        clearCacheBang?: () => unknown;
      } | null
    )?.clearCacheBang?.();
  } catch {}
  for (const klass of [this as unknown as typeof Base].concat(
    (this as unknown as typeof Base).descendants,
  )) {
    klass.undefineAttributeMethods();
  }
  clearAdapterDataSourceCache(this);

  this.reloadSchemaFromCache();
  (this as unknown as typeof Base).initializeFindByCache();
  return rewarmDataSourceCache(this);
}

/** @internal */
export function reloadSchemaFromCache(this: SchemaHost, recursive = true): void {
  this._returningColumnsForInsertCache = undefined;
  (this as { _arelTable?: unknown })._arelTable = undefined;
  this._columnNames = undefined;
  this._symbolColumnToStringNameHash = undefined;
  this._contentColumns = undefined;
  this._attributesBuilder = undefined;
  this._columns = undefined;
  this._columnsHash = undefined;
  this._schemaLoaded = false;
  (this as SchemaHost & { _schemaLoadPromise?: Promise<void> })._schemaLoadPromise = undefined;
  (this as SchemaHost & { _attributeNamesMemo?: unknown })._attributeNamesMemo = undefined;
  this._yamlEncoder = undefined;
  if (recursive) {
    for (const sub of (this as { subclasses?: SchemaHost[] }).subclasses ?? []) {
      sub.reloadSchemaFromCache();
    }
  }
}

export function loadSchema(this: SchemaHost): void {
  if (ownSchemaMemo(this, "_schemaLoaded")) return;
  try {
    this.loadSchemaBang();
  } catch (error) {
    this.reloadSchemaFromCache();
    throw error;
  }
  if (!ownSchemaMemo(this, "_schemaLoaded")) {
    this._columnsHash = undefined;
  }
}

export function loadSchemaBang(this: SchemaHost): void {
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
    _columnNames?: unknown;
    _contentColumns?: unknown;
    _symbolColumnToStringNameHash?: unknown;
    _attributeNamesMemo?: unknown;
  };
  const bag = host as CacheBag;
  bag._attributesBuilder = undefined;
  bag._yamlEncoder = undefined;
  bag._cachedDefaultAttributes = null;
  bag._cachedAttributeTypes = null;
  bag._columns = undefined;
  bag._columnNames = undefined;
  bag._contentColumns = undefined;
  bag._symbolColumnToStringNameHash = undefined;
  bag._attributeNamesMemo = undefined;
  host._columnsHash = filteredHash;

  const methodHost = host as unknown as {
    _attributeMethodsGenerated?: boolean;
  };
  methodHost._attributeMethodsGenerated = false;

  const reflectedColumnNames = Object.keys(hash).filter((n) => !ignored.has(n));
  EncryptableRecord.requireOriginalColumnsAfterReflection(host, reflectedColumnNames);
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
 * `with_connection` scope, so the connection `reflectionAdapter` reads through
 * `withConnectionSync` stays threaded for the whole warm and the guard is false
 * on re-entry, so the body runs once. A model with a directly-assigned adapter has no
 * pool to scope against and skips it, as does a pool-less model, whose
 * `connection_pool` throws where Ruby's always answers.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the async half of ModelSchema#load_schema! (model_schema.rb:587), which Ruby reaches synchronously through the schema cache.
 */
export async function loadSchemaFromAdapter(this: SchemaHost): Promise<void> {
  if ((this as any).abstractClass) return;
  let startingAdapter: SchemaHost["connection"] | undefined;
  try {
    startingAdapter =
      (this as unknown as typeof Base).connectionPool().activeConnection ?? undefined;
  } catch {
    startingAdapter = undefined;
  }
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

  await cache.columnsHash(table);

  await cache.primaryKeys(table);

  let currentAdapter: SchemaHost["connection"] | undefined;
  try {
    currentAdapter = reflectionAdapter(adapterOwner);
  } catch {
    currentAdapter = undefined;
  }
  if (currentAdapter !== startingAdapter) return;

  this.loadSchemaBang();
}

function loadSchemaFromCacheSync(host: SchemaHost): boolean {
  let pool: ReturnType<typeof Base.connectionPool>;
  try {
    pool = (host as unknown as typeof Base).connectionPool();
  } catch {
    return false;
  }
  const cache = pool.schemaReflection.loadedCache;
  if (cache && typeof cache.getCachedColumnsHash !== "function") return false;
  const table = host.tableName;
  if (table == null) return false;
  let hash: Record<string, unknown> | undefined = cache?.getCachedColumnsHash(table);
  if (!hash) {
    let adapter: SchemaHost["connection"] | undefined;
    try {
      adapter = reflectionAdapter(host);
    } catch {
      adapter = undefined;
    }
    if (adapter) hash = warmColumnsHashSync(adapter, cache, table);
  }
  if (!hash) return false;
  applyColumnsHash(host, hash);
  return true;
}

function warmColumnsHashSync(
  adapter: NonNullable<SchemaHost["connection"]>,
  cache: {
    setColumns?: (table: string, cols: any[]) => void;
    getCachedColumnsHash: (table: string) => Record<string, unknown> | undefined;
  } | null,
  table: string,
): Record<string, unknown> | undefined {
  if (typeof adapter.columns !== "function") return undefined;
  if (cache && typeof cache.setColumns !== "function") return undefined;
  const cols: unknown = adapter.columns(table);
  if (cols != null && typeof (cols as any).then === "function") {
    void (cols as Promise<unknown>).catch(() => {});
    return undefined;
  }
  if (!Array.isArray(cols)) return undefined;
  if (!cache) return Object.fromEntries(cols.map((col) => [col.name, col]));
  cache.setColumns!(table, cols);
  return cache.getCachedColumnsHash(table);
}

export function tableName(this: SchemaHost): string | null {
  if (!Object.prototype.hasOwnProperty.call(this, "_tableName")) resetTableName.call(this);
  return this._tableName;
}

export function setTableName(this: SchemaHost, value: string | null): void {
  value = value == null ? null : String(value);

  if (Object.prototype.hasOwnProperty.call(this, "_tableName")) {
    if (value === this._tableName) return;
    if (isConnected.call(this as unknown as typeof Base)) void resetColumnInformation.call(this);
  }

  this._tableName = value;
  (this as { _arelTable?: unknown })._arelTable = null;
  if (!ownSchemaMemo(this, "_explicitSequenceName")) this._sequenceName = null;
  (this as { _predicateBuilder?: unknown })._predicateBuilder = null;
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

export async function sequenceName(this: SchemaHost): Promise<string | null> {
  if (isBaseClass(this as unknown as typeof Base)) {
    return ownSchemaMemo(this, "_sequenceName") ?? resetSequenceName.call(this);
  } else {
    return (
      ownSchemaMemo(this, "_sequenceName") ??
      (this._sequenceName = null) ??
      baseClass.call(this as unknown as typeof Base).sequenceName
    );
  }
}

export function setSequenceName(this: SchemaHost, value: string | null): void {
  this._sequenceName = rbObjAsString(value);
  this._explicitSequenceName = true;
}

export function ignoredColumns(this: SchemaHost): string[] {
  return this._ignoredColumns ?? [];
}

export function setIgnoredColumns(this: SchemaHost, columns: string[]): void {
  this.reloadSchemaFromCache();
  this._ignoredColumns = Object.freeze(columns.map(String)) as string[];
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
  let pool: ReturnType<typeof Base.connectionPool>;
  try {
    pool = (this as unknown as typeof Base).connectionPool();
  } catch {
    return undefined;
  }
  const cache = pool.schemaReflection.loadedCache;
  if (!cache || typeof cache.getCachedDataSourceExists !== "function") return undefined;
  return cache.getCachedDataSourceExists(this.tableName as string);
}

export async function tableExists(this: SchemaHost): Promise<boolean> {
  return (
    (await (this as unknown as typeof Base)
      .connectionPool()
      .schemaCache.dataSourceExists(this.tableName!)) ?? false
  );
}

export interface ModelSchema {
  primaryKeyPrefixType: string | null | undefined;
  tableNamePrefix: string;
  tableNameSuffix: string;
  pluralizeTableNames: boolean;
}

export const ModelSchema = {
  [included](base: object): void {
    classAttribute.call(base, "primaryKeyPrefixType", { instanceWriter: false });
    classAttribute.call(base, "tableNamePrefix", { instanceWriter: false, default: "" });
    classAttribute.call(base, "tableNameSuffix", { instanceWriter: false, default: "" });
    classAttribute.call(base, "schemaMigrationsTableName", {
      instanceAccessor: false,
      default: "schema_migrations",
    });
    classAttribute.call(base, "internalMetadataTableName", {
      instanceAccessor: false,
      default: "ar_internal_metadata",
    });
    classAttribute.call(base, "pluralizeTableNames", { instanceWriter: false, default: true });
    classAttribute.call(base, "implicitOrderColumn", { instanceAccessor: false });
    classAttribute.call(base, "immutableStringsByDefault", { instanceAccessor: false });

    delegate.call(
      (base as { prototype: object }).prototype,
      "typeForAttribute",
      "columnForAttribute",
      {
        to: "class",
      },
    );
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
  loadSchemaBang,
  loadSchemaFromAdapter,
};

/** @internal */
function initializeLoadSchemaMonitor(this: SchemaHost): void {}

/** @internal */
export function isSchemaLoaded(this: SchemaHost): boolean {
  return ownSchemaMemo(this, "_schemaLoaded") ?? false;
}

/** @internal */
export function typeForColumn(this: SchemaHost, connection: any, column: any): any {
  let type = connection.lookupCastTypeFromColumn(column);

  const immutableStringsByDefault = (this as unknown as typeof Base).immutableStringsByDefault;
  if (
    immutableStringsByDefault != null &&
    immutableStringsByDefault !== false &&
    rbObjRespondTo(type, "toImmutableString")
  ) {
    type = type.toImmutableString();
  }

  return type;
}

ActiveRecord.ModelSchema = ModelSchemaModule;
