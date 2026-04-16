/**
 * Schema cache — caches database schema information to avoid repeated
 * introspection queries.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import { Column } from "./column.js";
import type { ColumnJSON } from "./column.js";

// ---------------------------------------------------------------------------
// Helper: run callback inside pool.withConnection if available
// ---------------------------------------------------------------------------

async function withConnection<T>(
  pool: unknown,
  callback: (connection: any) => T | Promise<T>,
): Promise<T> {
  if (pool && typeof (pool as any).withConnection === "function") {
    return (pool as any).withConnection(callback);
  }
  return callback(pool);
}

// ---------------------------------------------------------------------------
// Helper: rehydrate a column from plain JSON or pass through if already Column
// ---------------------------------------------------------------------------

function serializeColumn(col: any): ColumnJSON {
  if (typeof col.toJSON === "function") return col.toJSON();
  // Fallback for adapter-specific Column classes (e.g. PostgreSQL::Column)
  // that don't extend the base Column
  return {
    name: col.name,
    default: col.default,
    sqlTypeMetadata:
      col.sqlTypeMetadata?.toJSON?.() ??
      (col.sqlType != null
        ? {
            sqlType: col.sqlType,
            type: col.type ?? col.sqlType,
            limit: col.limit ?? null,
            precision: col.precision ?? null,
            scale: col.scale ?? null,
          }
        : null),
    null: col.null ?? true,
    defaultFunction: col.defaultFunction ?? null,
    collation: col.collation ?? null,
    comment: col.comment ?? null,
    primaryKey: col.primaryKey ?? false,
  };
}

function rehydrateColumn(data: unknown): Column {
  if (data instanceof Column) return data;
  return Column.fromJSON(data as ColumnJSON);
}

// ---------------------------------------------------------------------------
// SchemaCache
// ---------------------------------------------------------------------------

export class SchemaCache {
  private _columns = new Map<string, Column[]>();
  private _columnsHash = new Map<string, Record<string, Column>>();
  private _primaryKeys = new Map<string, string | null>();
  private _dataSourceExists = new Map<string, boolean>();
  private _indexes = new Map<string, unknown[]>();
  private _version: string | number | null = null;

  static _loadFrom(filename: string): SchemaCache | null {
    try {
      const fs = getFs();
      if (!fs.existsSync(filename)) return null;
      const data = SchemaCache.read(filename, (content) => content);
      if (typeof data !== "string") return null;
      const parsed = JSON.parse(data);
      const cache = new SchemaCache();
      cache.initWith(parsed);
      return cache;
    } catch {
      return null;
    }
  }

  static read<T>(filename: string, callback: (data: string) => T): T {
    const fs = getFs();
    const content = fs.readFileSync(filename, "utf-8");
    return callback(content);
  }

  initializeDup(): SchemaCache {
    const dup = new SchemaCache();
    dup._columns = new Map(this._columns);
    dup._columnsHash = new Map(this._columnsHash);
    dup._primaryKeys = new Map(this._primaryKeys);
    dup._dataSourceExists = new Map(this._dataSourceExists);
    dup._indexes = new Map(this._indexes);
    dup._version = this._version;
    return dup;
  }

  encodeWith(coder: Record<string, unknown>): void {
    const byKey = (a: [string, unknown], b: [string, unknown]) => a[0].localeCompare(b[0]);
    coder["columns"] = Object.fromEntries(
      [...this._columns]
        .sort(byKey)
        .map(([table, cols]) => [table, cols.map((c) => serializeColumn(c))]),
    );
    coder["primary_keys"] = Object.fromEntries([...this._primaryKeys].sort(byKey));
    coder["data_sources"] = Object.fromEntries([...this._dataSourceExists].sort(byKey));
    coder["indexes"] = Object.fromEntries([...this._indexes].sort(byKey));
    coder["version"] = this._version;
  }

  initWith(coder: Record<string, unknown>): void {
    if (coder["columns"] instanceof Map) {
      this._columns = coder["columns"] as Map<string, Column[]>;
    } else if (coder["columns"] && typeof coder["columns"] === "object") {
      const entries = Object.entries(coder["columns"] as Record<string, unknown[]>);
      this._columns = new Map(
        entries.map(([table, cols]) => [table, cols.map((c) => rehydrateColumn(c))]),
      );
    }

    if (coder["primary_keys"] instanceof Map) {
      this._primaryKeys = coder["primary_keys"] as Map<string, string | null>;
    } else if (coder["primary_keys"] && typeof coder["primary_keys"] === "object") {
      this._primaryKeys = new Map(
        Object.entries(coder["primary_keys"] as Record<string, string | null>),
      );
    }

    if (coder["data_sources"] instanceof Map) {
      this._dataSourceExists = coder["data_sources"] as Map<string, boolean>;
    } else if (coder["data_sources"] && typeof coder["data_sources"] === "object") {
      this._dataSourceExists = new Map(
        Object.entries(coder["data_sources"] as Record<string, boolean>),
      );
    }

    if (coder["indexes"] instanceof Map) {
      this._indexes = coder["indexes"] as Map<string, unknown[]>;
    } else if (coder["indexes"] && typeof coder["indexes"] === "object") {
      this._indexes = new Map(Object.entries(coder["indexes"] as Record<string, unknown[]>));
    }

    this._version = (coder["version"] as string | number) ?? null;

    // Derive columnsHash from columns (Rails: derive_columns_hash_and_deduplicate_values)
    this._columnsHash.clear();
    for (const [table, cols] of this._columns) {
      const hash: Record<string, Column> = {};
      for (const col of cols) {
        hash[col.name] = col;
      }
      this._columnsHash.set(table, hash);
    }
  }

  isCached(tableName: string): boolean {
    return this._columns.has(tableName);
  }

  async primaryKeys(pool: unknown, tableName: string): Promise<string | null | undefined> {
    if (this._primaryKeys.has(tableName)) {
      return this._primaryKeys.get(tableName);
    }

    return withConnection(pool, async (connection) => {
      if (await this.dataSourceExists(connection, tableName)) {
        const pk =
          typeof connection.primaryKey === "function"
            ? ((await connection.primaryKey(tableName)) ?? null)
            : null;
        this._primaryKeys.set(tableName, pk);
        return pk;
      }
      return undefined;
    });
  }

  async dataSourceExists(pool: unknown, name: string): Promise<boolean | undefined> {
    // Rails: eager-load all data sources on first cache miss
    if (this._dataSourceExists.size === 0) {
      const tables = await this.tablesToCache(pool);
      for (const source of tables) {
        this._dataSourceExists.set(source, true);
      }
    }

    if (this._dataSourceExists.has(name)) {
      return this._dataSourceExists.get(name);
    }

    return withConnection(pool, async (connection) => {
      if (typeof connection.dataSourceExists === "function") {
        const exists = await connection.dataSourceExists(name);
        this._dataSourceExists.set(name, exists);
        return exists;
      }
      return undefined;
    });
  }

  async add(pool: unknown, tableName: string): Promise<void> {
    await withConnection(pool, async (connection) => {
      if (await this.dataSourceExists(connection, tableName)) {
        await this.primaryKeys(connection, tableName);
        await this.columns(connection, tableName);
        await this.columnsHash(connection, tableName);
        await this.indexes(connection, tableName);
      }
    });
  }

  async columns(pool: unknown, tableName: string): Promise<Column[] | undefined> {
    if (this._columns.has(tableName)) {
      return this._columns.get(tableName);
    }

    return withConnection(pool, async (connection) => {
      if (typeof connection.columns === "function") {
        const cols = await connection.columns(tableName);
        this.setColumns(tableName, cols);
        return cols;
      }
      return undefined;
    });
  }

  async columnsHash(pool: unknown, tableName: string): Promise<Record<string, Column> | undefined> {
    if (this._columnsHash.has(tableName)) {
      return this._columnsHash.get(tableName);
    }

    // Rails: @columns_hash[table_name] = columns(pool, table_name).index_by(&:name).freeze
    const cols = await this.columns(pool, tableName);
    if (cols) {
      const hash: Record<string, Column> = {};
      for (const col of cols) {
        hash[col.name] = col;
      }
      this._columnsHash.set(tableName, hash);
      return hash;
    }
    return undefined;
  }

  isColumnsHashCached(_pool: unknown, tableName: string): boolean {
    return this._columnsHash.has(tableName);
  }

  getCachedColumnsHash(tableName: string): Record<string, Column> | undefined {
    return this._columnsHash.get(tableName);
  }

  async indexes(pool: unknown, tableName: string): Promise<unknown[]> {
    if (this._indexes.has(tableName)) {
      return this._indexes.get(tableName)!;
    }

    return withConnection(pool, async (connection) => {
      if (typeof connection.indexes === "function") {
        if (await this.dataSourceExists(connection, tableName)) {
          const idx = await connection.indexes(tableName);
          this._indexes.set(tableName, idx);
          return idx;
        }
      }
      return [];
    });
  }

  async version(pool: unknown): Promise<string | number | null> {
    if (this._version !== null) return this._version;

    return withConnection(pool, async (connection) => {
      if (typeof connection.schemaVersion === "function") {
        this._version = await connection.schemaVersion();
      }
      return this._version;
    });
  }

  get schemaVersion(): string | number | null {
    return this._version;
  }

  // Rails: [@columns, @columns_hash, @primary_keys, @data_sources].sum(&:size)
  get size(): number {
    return (
      this._columns.size +
      this._columnsHash.size +
      this._primaryKeys.size +
      this._dataSourceExists.size
    );
  }

  // Rails: clear_data_source_cache!(_connection, name)
  clearDataSourceCacheBang(_connection: unknown, name: string): void {
    this._columns.delete(name);
    this._columnsHash.delete(name);
    this._primaryKeys.delete(name);
    this._dataSourceExists.delete(name);
    this._indexes.delete(name);
  }

  setColumns(tableName: string, cols: Column[]): void {
    this._columns.set(tableName, cols);
    const hash: Record<string, Column> = {};
    for (const col of cols) {
      hash[col.name] = col;
    }
    this._columnsHash.set(tableName, hash);
    this._dataSourceExists.set(tableName, true);
  }

  setPrimaryKeys(tableName: string, pk: string | null): void {
    this._primaryKeys.set(tableName, pk);
  }

  setDataSourceExists(tableName: string, exists: boolean): void {
    this._dataSourceExists.set(tableName, exists);
  }

  async addAll(pool: unknown): Promise<void> {
    await withConnection(pool, async (connection) => {
      const tables = await this.tablesToCache(connection);
      for (const table of tables) {
        await this.add(connection, table);
      }
      await this.version(connection);
    });
  }

  dumpTo(filename: string): void {
    const fs = getFs();
    const path = getPath();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const coder: Record<string, unknown> = {};
    this.encodeWith(coder);
    fs.writeFileSync(filename, JSON.stringify(coder, null, 2), "utf-8");
  }

  marshalDump(): unknown[] {
    const columnsData = Object.fromEntries(
      [...this._columns].map(([table, cols]) => [table, cols.map((c) => serializeColumn(c))]),
    );
    return [
      this._version,
      columnsData,
      {},
      Object.fromEntries(this._primaryKeys),
      Object.fromEntries(this._dataSourceExists),
      Object.fromEntries(this._indexes),
    ];
  }

  marshalLoad(array: unknown[]): void {
    const [version, columns, _columnsHash, primaryKeys, dataSources, indexes] = array;
    this._version = (version as string | number) ?? null;

    const rawCols = (columns as Record<string, unknown[]>) ?? {};
    this._columns = new Map(
      Object.entries(rawCols).map(([table, cols]) => [table, cols.map((c) => rehydrateColumn(c))]),
    );
    this._primaryKeys = new Map(
      Object.entries((primaryKeys as Record<string, string | null>) ?? {}),
    );
    this._dataSourceExists = new Map(
      Object.entries((dataSources as Record<string, boolean>) ?? {}),
    );
    this._indexes = new Map(Object.entries((indexes as Record<string, unknown[]>) ?? {}));

    // Derive columnsHash (Rails: derive_columns_hash_and_deduplicate_values)
    this._columnsHash.clear();
    for (const [table, cols] of this._columns) {
      const hash: Record<string, Column> = {};
      for (const col of cols) {
        hash[col.name] = col;
      }
      this._columnsHash.set(table, hash);
    }
  }

  clear(): void {
    this._columns.clear();
    this._columnsHash.clear();
    this._primaryKeys.clear();
    this._dataSourceExists.clear();
    this._indexes.clear();
    this._version = null;
  }

  // Rails: tables_to_cache(pool) — gets data_sources from connection
  private async tablesToCache(pool: unknown): Promise<string[]> {
    return withConnection(pool, async (connection) => {
      if (typeof connection.dataSources === "function") {
        return (await connection.dataSources()) as string[];
      }
      return [];
    });
  }
}

// ---------------------------------------------------------------------------
// SchemaReflection
// ---------------------------------------------------------------------------

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaReflection
 */
export class SchemaReflection {
  static useSchemaCacheDump = true;
  static checkSchemaCacheDumpVersion = true;
  /**
   * Mirrors Rails' `ActiveRecord.lazily_load_schema_cache` (default
   * false). When true, ConnectionPool.newConnection will kick off a
   * fire-and-forget `schemaCache.loadBang()` on first connection —
   * apps that commit `db/schema_cache.json` get it populated at boot
   * without paying the introspection cost on every model load.
   *
   * Off by default because the load involves file I/O + optional
   * schema-version validation; apps opt in by setting this to true
   * (typically in production boot) the same way Rails exposes it.
   */
  static lazilyLoadSchemaCache = false;

  private _cache: SchemaCache | null;
  private _cachePath: string | null;
  private _cachePromise: Promise<SchemaCache> | null = null;

  constructor(cachePath?: string | null, cache?: SchemaCache) {
    this._cache = cache ?? null;
    this._cachePath = cachePath ?? null;
  }

  clearBang(): void {
    this._cache = new SchemaCache();
    this._cachePromise = null;
  }

  async loadBang(pool: unknown): Promise<this> {
    await this.cache(pool);
    return this;
  }

  /**
   * @internal Return the internal SchemaCache if already loaded, or
   * null if no cache has been populated yet. Used by ConnectionPool to
   * propagate the reflection's loaded cache into poolConfig.schemaCache
   * so adapter-side consumers (AbstractAdapter.schemaCache) see the
   * preloaded data from a schema_cache.json without hitting the DB.
   * External callers should not mutate the returned cache.
   */
  get loadedCache(): SchemaCache | null {
    return this._cache;
  }

  async primaryKeys(pool: unknown, tableName: string): Promise<string | null | undefined> {
    return (await this.cache(pool)).primaryKeys(pool, tableName);
  }

  async dataSourceExists(pool: unknown, name: string): Promise<boolean | undefined> {
    return (await this.cache(pool)).dataSourceExists(pool, name);
  }

  async add(pool: unknown, name: string): Promise<void> {
    return (await this.cache(pool)).add(pool, name);
  }

  async dataSources(pool: unknown, name: string): Promise<boolean | undefined> {
    return (await this.cache(pool)).dataSourceExists(pool, name);
  }

  async columns(pool: unknown, tableName: string): Promise<Column[] | undefined> {
    return (await this.cache(pool)).columns(pool, tableName);
  }

  async columnsHash(pool: unknown, tableName: string): Promise<Record<string, Column> | undefined> {
    return (await this.cache(pool)).columnsHash(pool, tableName);
  }

  isColumnsHashCached(pool: unknown, tableName: string): boolean {
    this.ensureSyncCache();
    return this._cache?.isColumnsHashCached(pool, tableName) ?? false;
  }

  async indexes(pool: unknown, tableName: string): Promise<unknown[]> {
    return (await this.cache(pool)).indexes(pool, tableName);
  }

  async version(pool: unknown): Promise<string | number | null> {
    return (await this.cache(pool)).version(pool);
  }

  size(pool: unknown): number {
    this.ensureSyncCache();
    return this._cache?.size ?? 0;
  }

  // Rails: return if @cache.nil? && !possible_cache_available?
  //        cache(pool).clear_data_source_cache!(pool, name)
  async clearDataSourceCacheBang(pool: unknown, name: string): Promise<void> {
    if (!this._cache && !this.possibleCacheAvailable()) return;
    (await this.cache(pool)).clearDataSourceCacheBang(pool, name);
  }

  isCached(tableName: string): boolean {
    this.ensureSyncCache();
    return this._cache?.isCached(tableName) ?? false;
  }

  async dumpTo(pool: unknown, filename: string): Promise<void> {
    const freshCache = new SchemaCache();
    await freshCache.addAll(pool);
    freshCache.dumpTo(filename);
    this._cache = freshCache;
    this._cachePromise = null;
  }

  private async cache(pool: unknown): Promise<SchemaCache> {
    if (this._cache) return this._cache;

    // Memoize in-flight load so concurrent callers share one disk read
    if (!this._cachePromise) {
      const promise = this.loadCache(pool).then((loaded) => {
        // Guard against clearBang() racing with an in-flight load
        if (this._cachePromise === promise) {
          this._cache = loaded ?? new SchemaCache();
          this._cachePromise = null;
        }
        return this._cache ?? new SchemaCache();
      });
      this._cachePromise = promise;
    }
    return this._cachePromise;
  }

  /**
   * Attempt to populate _cache synchronously from disk when version
   * checking is disabled. Used by sync-only paths (isCached, size,
   * isColumnsHashCached) that can't await.
   */
  private ensureSyncCache(): void {
    if (this._cache) return;
    if (!SchemaReflection.checkSchemaCacheDumpVersion) {
      this._cache = this.loadCacheFromDisk();
    }
  }

  private possibleCacheAvailable(): boolean {
    if (!SchemaReflection.useSchemaCacheDump) return false;
    if (!this._cachePath) return false;
    try {
      const fs = getFs();
      return fs.existsSync(this._cachePath);
    } catch {
      return false;
    }
  }

  private loadCacheFromDisk(): SchemaCache | null {
    if (!this.possibleCacheAvailable()) return null;
    return SchemaCache._loadFrom(this._cachePath!);
  }

  private async loadCache(pool: unknown): Promise<SchemaCache | null> {
    if (!this.possibleCacheAvailable()) return null;

    const newCache = SchemaCache._loadFrom(this._cachePath!);
    if (!newCache) return null;

    if (SchemaReflection.checkSchemaCacheDumpVersion && pool) {
      try {
        const currentVersion = await withConnection(pool, async (connection) => {
          if (typeof connection.schemaVersion === "function") {
            return await connection.schemaVersion();
          }
          return null;
        });

        if (currentVersion !== null && newCache.schemaVersion !== currentVersion) {
          console.warn(
            `Ignoring ${this._cachePath} because it has expired. ` +
              `The current schema version is ${currentVersion}, ` +
              `but the one in the schema cache file is ${newCache.schemaVersion}.`,
          );
          return null;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to validate the schema cache because of ${errorMessage}`);
        return null;
      }
    }

    return newCache;
  }
}

// ---------------------------------------------------------------------------
// BoundSchemaReflection
// ---------------------------------------------------------------------------

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::BoundSchemaReflection
 */
export class BoundSchemaReflection {
  private _schemaReflection: SchemaReflection;
  private _pool: unknown;

  static forLoneConnection(
    schemaReflection: SchemaReflection,
    connection: unknown,
  ): BoundSchemaReflection {
    return new BoundSchemaReflection(schemaReflection, new FakePool(connection));
  }

  constructor(schemaReflection: SchemaReflection, pool: unknown) {
    this._schemaReflection = schemaReflection;
    this._pool = pool;
  }

  clearBang(): void {
    this._schemaReflection.clearBang();
  }

  async loadBang(): Promise<this> {
    await this._schemaReflection.loadBang(this._pool);
    return this;
  }

  isCached(tableName: string): boolean {
    return this._schemaReflection.isCached(tableName);
  }

  async primaryKeys(tableName: string): Promise<string | null | undefined> {
    return this._schemaReflection.primaryKeys(this._pool, tableName);
  }

  async dataSourceExists(name: string): Promise<boolean | undefined> {
    return this._schemaReflection.dataSourceExists(this._pool, name);
  }

  async add(name: string): Promise<void> {
    return this._schemaReflection.add(this._pool, name);
  }

  async dataSources(name: string): Promise<boolean | undefined> {
    return this._schemaReflection.dataSources(this._pool, name);
  }

  async columns(tableName: string): Promise<Column[] | undefined> {
    return this._schemaReflection.columns(this._pool, tableName);
  }

  async columnsHash(tableName: string): Promise<Record<string, Column> | undefined> {
    return this._schemaReflection.columnsHash(this._pool, tableName);
  }

  isColumnsHashCached(tableName: string): boolean {
    return this._schemaReflection.isColumnsHashCached(this._pool, tableName);
  }

  async indexes(tableName: string): Promise<unknown[]> {
    return this._schemaReflection.indexes(this._pool, tableName);
  }

  async version(): Promise<string | number | null> {
    return this._schemaReflection.version(this._pool);
  }

  size(): number {
    return this._schemaReflection.size(this._pool);
  }

  async clearDataSourceCacheBang(name: string): Promise<void> {
    return this._schemaReflection.clearDataSourceCacheBang(this._pool, name);
  }

  async dumpTo(filename: string): Promise<void> {
    return this._schemaReflection.dumpTo(this._pool, filename);
  }
}

// ---------------------------------------------------------------------------
// FakePool
// ---------------------------------------------------------------------------

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool
 */
export class FakePool {
  private _connection: unknown;

  constructor(connection: unknown) {
    this._connection = connection;
  }

  withConnection<T>(callback: (conn: unknown) => T): T {
    return callback(this._connection);
  }
}
