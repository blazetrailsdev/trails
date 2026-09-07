import { Encoding, File, FileUtils, Zlib } from "@blazetrails/ruby-compat";
import { atomicWrite } from "@blazetrails/activesupport";
import { Column } from "./column.js";
import { deduplicate } from "./deduplicable.js";
import type { Deduplicable } from "./deduplicable.js";
import type { ColumnCoder } from "./column.js";
import { Column as MysqlColumn } from "./mysql/column.js";
import { Column as PostgresqlColumn } from "./postgresql/column.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { isSchemaCacheIgnoredTable } from "../ar-config.js";
import { StatementInvalid } from "../errors.js";
import { IndexDefinition } from "./abstract/schema-definitions.js";

async function withConnection<T>(
  pool: unknown,
  callback: (connection: any) => T | Promise<T>,
): Promise<T> {
  if (pool && typeof (pool as any).withConnection === "function") {
    return (pool as any).withConnection(callback);
  }
  return callback(pool);
}

function serializeColumn(col: Column): ColumnCoder {
  const coder: ColumnCoder = {};
  col.encodeWith(coder);
  return coder;
}

const COLUMN_CLASSES: Record<string, { prototype: Column }> = {
  Column,
  "MySQL::Column": MysqlColumn,
  "PostgreSQL::Column": PostgresqlColumn,
  "SQLite3::Column": Sqlite3Column,
};

function rehydrateColumn(data: unknown): Column {
  if (data instanceof Column) return data;
  const coder = data as ColumnCoder;
  const klass = COLUMN_CLASSES[coder["class"] as string] ?? Column;
  const column = Object.create(klass.prototype) as Column;
  column.initWith(coder);
  return column;
}

function expandIndexOption<T>(
  columns: string | string[],
  value: unknown,
): Record<string, T> | T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value as Record<string, T>;
  if (!Array.isArray(columns)) return value as T;
  return Object.fromEntries(columns.map((c) => [c, value as T]));
}

function rehydrateIndex(data: unknown): IndexDefinition {
  if (data instanceof IndexDefinition) return data;
  const row = data as Record<string, unknown>;
  const columns = (row["columns"] ?? []) as string | string[];
  return new IndexDefinition(
    row["table"] as string,
    row["name"] as string,
    (row["unique"] ?? false) as boolean,
    columns,
    {
      where: row["where"] as string | undefined,
      orders: expandIndexOption<string>(columns, row["orders"]),
      lengths:
        typeof row["lengths"] === "number"
          ? row["lengths"]
          : expandIndexOption<number>(columns, row["lengths"]),
      opclasses: expandIndexOption<string>(columns, row["opclasses"]),
      type: row["type"] as string | undefined,
      using: row["using"] as string | undefined,
      include: row["include"] as string[] | undefined,
      nullsNotDistinct: row["nullsNotDistinct"] as boolean | undefined,
      comment: row["comment"] as string | undefined,
      valid: row["valid"] as boolean | undefined,
      algorithm: row["algorithm"] as string | undefined,
      ifNotExists: row["ifNotExists"] as boolean | undefined,
    },
  );
}

export class SchemaCache {
  private _columns = new Map<string, Column[]>();
  private _columnsHash = new Map<string, Record<string, Column>>();
  private _primaryKeys = new Map<string, string | string[] | null>();
  private _dataSourceExists = new Map<string, boolean>();
  private _indexes = new Map<string, IndexDefinition[]>();
  private _version: string | number | null = null;

  /** @missingRailsCall load — PERMANENT */
  static async _loadFrom(filename: string): Promise<SchemaCache | null> {
    try {
      if (!File.isFile(filename)) return null;
      const data = await SchemaCache.read(filename, (content) => content);
      const parsed = JSON.parse(data);
      const cache = new SchemaCache();
      cache.initWith(parsed);
      return cache;
    } catch {
      return null;
    }
  }

  static async read<T>(filename: string, callback: (data: string) => T): Promise<T> {
    if (File.extname(filename) === ".gz") {
      return Zlib.GzipReader.open(filename, async (gz) => callback(await gz.read()));
    }
    return callback(File.read(filename));
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
    this._columns = new Map(
      Object.entries((coder["columns"] as Record<string, unknown[]>) ?? {}).map(([table, cols]) => [
        table,
        cols.map((c) => rehydrateColumn(c)),
      ]),
    );

    this._columnsHash = new Map(
      Object.entries((coder["columns_hash"] as Record<string, Record<string, unknown>>) ?? {}).map(
        ([table, hash]) => [
          table,
          Object.fromEntries(
            Object.entries(hash).map(([name, col]) => [name, rehydrateColumn(col)]),
          ),
        ],
      ),
    );

    this._primaryKeys = new Map(
      Object.entries((coder["primary_keys"] as Record<string, string | string[] | null>) ?? {}),
    );

    this._dataSourceExists = new Map(
      Object.entries((coder["data_sources"] as Record<string, boolean>) ?? {}),
    );

    this._indexes = new Map(
      Object.entries((coder["indexes"] as Record<string, unknown[]>) ?? {}).map(([table, idx]) => [
        table,
        idx.map((i) => rehydrateIndex(i)),
      ]),
    );

    this._version = (coder["version"] as string | number) ?? null;

    if (coder["deduplicated"] == null || coder["deduplicated"] === false) {
      this.deriveColumnsHashAndDeduplicateValues();
    }
  }

  isCached(tableName: string): boolean {
    return this._columns.has(tableName);
  }

  async primaryKeys(
    pool: unknown,
    tableName: string,
  ): Promise<string | string[] | null | undefined> {
    if (this._primaryKeys.has(tableName)) {
      return this._primaryKeys.get(tableName);
    }

    if (this.isIgnoredTable(tableName)) return null;

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
    if (this.isIgnoredTable(name)) return undefined;
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
    if (this.isIgnoredTable(tableName)) {
      throw new StatementInvalid(`Table '${tableName}' doesn't exist`);
    }

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

    const cols = await this.columns(pool, tableName);
    if (cols) {
      const hash: Record<string, Column> = {};
      for (const col of cols) {
        hash[col.name] = col;
      }
      Object.freeze(hash);
      this._columnsHash.set(deepDeduplicate(tableName), hash);
      return hash;
    }
    return undefined;
  }

  isColumnsHash(_pool: unknown, tableName: string): boolean {
    return this._columnsHash.has(tableName);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  getCachedColumnsHash(tableName: string): Record<string, Column> | undefined {
    return this._columnsHash.get(tableName);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  getCachedDataSourceExists(name: string): boolean | undefined {
    return this._dataSourceExists.get(name);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  getCachedPrimaryKeys(tableName: string): string | string[] | null | undefined {
    return this._primaryKeys.get(tableName);
  }

  async indexes(pool: unknown, tableName: string): Promise<IndexDefinition[]> {
    if (this._indexes.has(tableName)) {
      return this._indexes.get(tableName)!;
    }

    if (this.isIgnoredTable(tableName)) return [];

    return withConnection(pool, async (connection) => {
      if (typeof connection.indexes === "function") {
        if (await this.dataSourceExists(connection, tableName)) {
          const idx = deepDeduplicate(await connection.indexes(tableName));
          this._indexes.set(deepDeduplicate(tableName), idx);
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

  get size(): number {
    return (
      this._columns.size +
      this._columnsHash.size +
      this._primaryKeys.size +
      this._dataSourceExists.size
    );
  }

  clearDataSourceCacheBang(_connection: unknown, name: string): void {
    this._columns.delete(name);
    this._columnsHash.delete(name);
    this._primaryKeys.delete(name);
    this._dataSourceExists.delete(name);
    this._indexes.delete(name);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  setColumns(tableName: string, cols: Column[]): void {
    this._columns.set(tableName, cols);
    const hash: Record<string, Column> = {};
    for (const col of cols) {
      hash[col.name] = col;
    }
    this._columnsHash.set(tableName, hash);
    this._dataSourceExists.set(tableName, true);
  }

  async addAll(pool: unknown): Promise<void> {
    await withConnection(pool, async () => {
      const tables = await this.tablesToCache(pool);
      for (const table of tables) {
        await this.add(pool, table);
      }
      await this.version(pool);
    });
  }

  async dumpTo(filename: string): Promise<void> {
    await this.open(filename, (f) => {
      const coder: Record<string, unknown> = {};
      this.encodeWith(coder);
      f.write(JSON.stringify(coder, null, 2));
    });
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
      Object.entries((primaryKeys as Record<string, string | string[] | null>) ?? {}),
    );
    this._dataSourceExists = new Map(
      Object.entries((dataSources as Record<string, boolean>) ?? {}),
    );
    this._indexes = new Map(
      Object.entries((indexes as Record<string, unknown[]>) ?? {}).map(([table, idx]) => [
        table,
        idx.map((i) => rehydrateIndex(i)),
      ]),
    );

    this.deriveColumnsHashAndDeduplicateValues();
  }

  private deriveColumnsHashAndDeduplicateValues(): void {
    this._columns = deepDeduplicate(this._columns);
    this._columnsHash.clear();
    for (const [table, cols] of this._columns) {
      const hash: Record<string, Column> = {};
      for (const col of cols) {
        hash[col.name] = col;
      }
      this._columnsHash.set(table, hash);
    }
    this._primaryKeys = deepDeduplicate(this._primaryKeys);
    this._dataSourceExists = deepDeduplicate(this._dataSourceExists);
    this._indexes = deepDeduplicate(this._indexes);
  }

  clear(): void {
    this._columns.clear();
    this._columnsHash.clear();
    this._primaryKeys.clear();
    this._dataSourceExists.clear();
    this._indexes.clear();
    this._version = null;
  }

  private isIgnoredTable(tableName: string): boolean {
    return isSchemaCacheIgnoredTable(tableName);
  }

  private async tablesToCache(pool: unknown): Promise<string[]> {
    return withConnection(pool, async (connection) => {
      if (typeof connection.dataSources === "function") {
        const tables = (await connection.dataSources()) as string[];
        return tables.filter((table) => !this.isIgnoredTable(table));
      }
      return [];
    });
  }

  /**
   * @internal
   * @missingRailsArgs atomic_write — PERMANENT
   */
  private async open(
    filename: string,
    block: (file: { write(string: string): unknown }) => void,
  ): Promise<void> {
    FileUtils.mkdirP(File.dirname(filename));

    await atomicWrite(filename, undefined, async (file) => {
      if (File.extname(filename) === ".gz") {
        const zipper = new Zlib.GzipWriter(file);
        zipper.mtime = 0;
        block(zipper);
        zipper.flush();
        await zipper.close();
      } else {
        file.setEncoding(Encoding.UTF_8);
        block(file);
      }
    });
  }
}

export class SchemaReflection {
  static useSchemaCacheDump = true;
  static checkSchemaCacheDumpVersion = true;
  static lazilyLoadSchemaCache = false;

  /** @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip */
  static eagerLoadSchemaCache = false;

  private _cache: SchemaCache | null;
  private _cachePath: string | null;
  private _cachePromise: Promise<SchemaCache> | null = null;

  constructor(cachePath?: string | null, cache?: SchemaCache) {
    this._cache = cache ?? null;
    this._cachePath = cachePath ?? null;
  }

  private emptyCache(): SchemaCache {
    return new SchemaCache();
  }

  clearBang(): void {
    this._cache = this.emptyCache();
    this._cachePromise = null;
  }

  async loadBang(pool: unknown): Promise<this> {
    await this.cache(pool);
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  async loadAllBang(pool: unknown): Promise<this> {
    const cache = await this.cache(pool);
    await cache.addAll(pool);
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  get loadedCache(): SchemaCache | null {
    return this._cache;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  set loadedCache(cache: SchemaCache | null) {
    this._cache = cache;
    this._cachePromise = null;
  }

  async primaryKeys(
    pool: unknown,
    tableName: string,
  ): Promise<string | string[] | null | undefined> {
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

  async isColumnsHash(pool: unknown, tableName: string): Promise<boolean> {
    await this.ensureSyncCache();
    return this._cache?.isColumnsHash(pool, tableName) ?? false;
  }

  async indexes(pool: unknown, tableName: string): Promise<IndexDefinition[]> {
    return (await this.cache(pool)).indexes(pool, tableName);
  }

  async version(pool: unknown): Promise<string | number | null> {
    return (await this.cache(pool)).version(pool);
  }

  async size(pool: unknown): Promise<number> {
    await this.ensureSyncCache();
    return this._cache?.size ?? 0;
  }

  async clearDataSourceCacheBang(pool: unknown, name: string): Promise<void> {
    if (!this._cache && !this.possibleCacheAvailable()) return;
    (await this.cache(pool)).clearDataSourceCacheBang(pool, name);
  }

  /** @missingRailsCall load_cache — PERMANENT */
  async isCached(tableName: string): Promise<boolean> {
    await this.ensureSyncCache();
    return this._cache?.isCached(tableName) ?? false;
  }

  async dumpTo(pool: unknown, filename: string): Promise<void> {
    const freshCache = this.emptyCache();
    await freshCache.addAll(pool);
    await freshCache.dumpTo(filename);
    this._cache = freshCache;
    this._cachePromise = null;
  }

  private async cache(pool: unknown): Promise<SchemaCache> {
    if (this._cache) return this._cache;

    if (!this._cachePromise) {
      const promise = this.loadCache(pool).then((loaded) => {
        if (this._cachePromise === promise) {
          this._cache = loaded ?? this.emptyCache();
          this._cachePromise = null;
        }
        return this._cache ?? this.emptyCache();
      });
      this._cachePromise = promise;
    }
    return this._cachePromise;
  }

  private async ensureSyncCache(): Promise<void> {
    if (this._cache) return;
    if (!SchemaReflection.checkSchemaCacheDumpVersion) {
      this._cache = await this.loadCacheFromDisk();
    }
  }

  private possibleCacheAvailable(): boolean {
    if (!SchemaReflection.useSchemaCacheDump) return false;
    if (!this._cachePath) return false;
    try {
      return File.isFile(this._cachePath);
    } catch {
      return false;
    }
  }

  private async loadCacheFromDisk(): Promise<SchemaCache | null> {
    if (!this.possibleCacheAvailable()) return null;
    return SchemaCache._loadFrom(this._cachePath!);
  }

  private async loadCache(pool: unknown): Promise<SchemaCache | null> {
    if (!this.possibleCacheAvailable()) return null;

    const newCache = await SchemaCache._loadFrom(this._cachePath!);
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

export class BoundSchemaReflection {
  private _schemaReflection: SchemaReflection;
  private _pool: unknown;

  static forLoneConnection(
    abstractSchemaReflection: SchemaReflection,
    connection: unknown,
  ): BoundSchemaReflection {
    return new BoundSchemaReflection(abstractSchemaReflection, new FakePool(connection));
  }

  constructor(abstractSchemaReflection: SchemaReflection, pool: unknown) {
    this._schemaReflection = abstractSchemaReflection;
    this._pool = pool;
  }

  clearBang(): void {
    this._schemaReflection.clearBang();
  }

  async loadBang(): Promise<this> {
    await this._schemaReflection.loadBang(this._pool);
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-schema-cache-sync-readers-after-checkout-flip
   */
  async loadAllBang(): Promise<this> {
    await this._schemaReflection.loadAllBang(this._pool);
    return this;
  }

  async isCached(tableName: string): Promise<boolean> {
    return this._schemaReflection.isCached(tableName);
  }

  async primaryKeys(tableName: string): Promise<string | string[] | null | undefined> {
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

  async isColumnsHash(tableName: string): Promise<boolean> {
    return this._schemaReflection.isColumnsHash(this._pool, tableName);
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return this._schemaReflection.indexes(this._pool, tableName);
  }

  async version(): Promise<string | number | null> {
    return this._schemaReflection.version(this._pool);
  }

  async size(): Promise<number> {
    return this._schemaReflection.size(this._pool);
  }

  async clearDataSourceCacheBang(name: string): Promise<void> {
    return this._schemaReflection.clearDataSourceCacheBang(this._pool, name);
  }

  async dumpTo(filename: string): Promise<void> {
    return this._schemaReflection.dumpTo(this._pool, filename);
  }
}

export class FakePool {
  private _connection: unknown;

  constructor(connection: unknown) {
    this._connection = connection;
  }

  withConnection<T>(callback: (conn: unknown) => T): T {
    return callback(this._connection);
  }
}

/** @internal */
export function deepDeduplicate<T>(value: T): T {
  if (value instanceof Map) {
    return new Map(
      [...value].map(([k, v]) => [deepDeduplicate(k), deepDeduplicate(v)]),
    ) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((i) => deepDeduplicate(i)) as unknown as T;
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as unknown as Deduplicable).deduplicateKey === "function"
  ) {
    return deduplicate(value as unknown as Deduplicable) as unknown as T;
  }
  return value;
}
