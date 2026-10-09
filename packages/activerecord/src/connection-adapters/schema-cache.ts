import {
  Encoding,
  File,
  FileUtils,
  Marshal,
  Zlib,
  forceEncoding,
  isModuleIncluded,
  registerConstant,
  sort,
} from "@blazetrails/ruby-compat";
import { atomicWrite } from "@blazetrails/activesupport";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { Column } from "./column.js";
import { Deduplicable } from "./deduplicable.js";
import { isSchemaCacheIgnoredTable } from "../active-record.js";
import { ActiveRecordError, StatementInvalid } from "../errors.js";
import type { IndexDefinition } from "./abstract/schema-definitions.js";

export type Pool = {
  withConnection<T>(callback: (connection: any) => T | Promise<T>): T | Promise<T>;
};

export class SchemaReflection {
  static useSchemaCacheDump = true;
  static checkSchemaCacheDumpVersion = true;

  /** @noRailsEquivalent PERMANENT */
  static eagerLoadSchemaCache = false;

  private _cache: SchemaCache | null;
  private _cachePath: string | null;

  constructor(cachePath?: string | null, cache?: SchemaCache) {
    this._cache = cache ?? null;
    this._cachePath = cachePath ?? null;
  }

  clearBang(): void {
    this._cache = this.emptyCache();
  }

  async loadBang(pool: Pool): Promise<this> {
    await this.cache(pool);
    return this;
  }

  async primaryKeys(pool: Pool, tableName: string): Promise<string | string[] | null> {
    return (await this.cache(pool)).primaryKeys(pool, tableName);
  }

  async dataSourceExists(pool: Pool, name: string): Promise<boolean | null> {
    return (await this.cache(pool)).dataSourceExists(pool, name);
  }

  async add(pool: Pool, name: string): Promise<void> {
    return (await this.cache(pool)).add(pool, name);
  }

  async dataSources(pool: Pool, name: string): Promise<boolean | null> {
    return (await this.cache(pool)).dataSourceExists(pool, name);
  }

  async columns(pool: Pool, tableName: string): Promise<Column[]> {
    return (await this.cache(pool)).columns(pool, tableName);
  }

  async columnsHash(pool: Pool, tableName: string): Promise<Record<string, Column>> {
    return (await this.cache(pool)).columnsHash(pool, tableName);
  }

  async isColumnsHash(pool: Pool, tableName: string): Promise<boolean> {
    return (await this.cache(pool)).isColumnsHash(pool, tableName);
  }

  async indexes(pool: Pool, tableName: string): Promise<IndexDefinition[]> {
    return (await this.cache(pool)).indexes(pool, tableName);
  }

  async version(pool: Pool): Promise<string | number | null> {
    return (await this.cache(pool)).version(pool);
  }

  async size(pool: Pool): Promise<number> {
    return (await this.cache(pool)).size;
  }

  async clearDataSourceCacheBang(pool: Pool, name: string): Promise<void> {
    if (!this._cache && !this.possibleCacheAvailable()) return;
    (await this.cache(pool)).clearDataSourceCacheBang(pool, name);
  }

  async isCached(tableName: string): Promise<boolean | null> {
    if (this._cache == null) {
      if (!SchemaReflection.checkSchemaCacheDumpVersion) {
        this._cache = await this.loadCache(null);
      }
    }

    return this._cache?.isCached(tableName) ?? null;
  }

  async dumpTo(pool: Pool, filename: string): Promise<SchemaCache> {
    const freshCache = this.emptyCache();
    await freshCache.addAll(pool);
    await freshCache.dumpTo(filename);
    return (this._cache = freshCache);
  }

  private emptyCache(): SchemaCache {
    return new SchemaCache();
  }

  /** @inventedArm then — CONVERGEABLE schema-reflection-cache-rereads-the-stored-cache-at-settle */
  private async cache(pool: Pool): Promise<SchemaCache> {
    return (this._cache ||= await this.loadCache(pool).then(
      (newCache) => this._cache || newCache || this.emptyCache(),
    ))!;
  }

  /** @missingRailsName cachePath — PERMANENT */
  private possibleCacheAvailable(): boolean {
    return (
      SchemaReflection.useSchemaCacheDump && this._cachePath != null && File.isFile(this._cachePath)
    );
  }

  private async loadCache(pool: Pool | null): Promise<SchemaCache | null> {
    if (!this.possibleCacheAvailable()) return null;

    const newCache = await SchemaCache._loadFrom(this._cachePath!);
    if (!newCache) return null;

    if (SchemaReflection.checkSchemaCacheDumpVersion) {
      try {
        return await pool!.withConnection(async (connection) => {
          const currentVersion = await connection.schemaVersion();

          if ((await newCache.version(connection)) !== currentVersion) {
            console.warn(
              `Ignoring ${this._cachePath} because it has expired. The current schema version is ${currentVersion}, but the one in the schema cache file is ${newCache.schemaVersion}.`,
            );
            return null;
          }
          return newCache;
        });
      } catch (error) {
        if (!(error instanceof ActiveRecordError)) throw error;
        console.warn(
          `Failed to validate the schema cache because of ${error.name}: ${error.message}`,
        );
        return null;
      }
    }

    return newCache;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async loadAllBang(pool: Pool): Promise<this> {
    const cache = await this.cache(pool);
    await cache.addAll(pool);
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  get loadedCache(): SchemaCache | null {
    return this._cache;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  set loadedCache(cache: SchemaCache | null) {
    this._cache = cache;
  }
}

export class BoundSchemaReflection {
  private _schemaReflection: SchemaReflection;
  private _pool: Pool;

  static forLoneConnection(
    abstractSchemaReflection: SchemaReflection,
    connection: unknown,
  ): BoundSchemaReflection {
    return new BoundSchemaReflection(abstractSchemaReflection, new FakePool(connection));
  }

  constructor(abstractSchemaReflection: SchemaReflection, pool: Pool) {
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

  async isCached(tableName: string): Promise<boolean | null> {
    return this._schemaReflection.isCached(tableName);
  }

  async primaryKeys(tableName: string): Promise<string | string[] | null> {
    return this._schemaReflection.primaryKeys(this._pool, tableName);
  }

  async dataSourceExists(name: string): Promise<boolean | null> {
    return this._schemaReflection.dataSourceExists(this._pool, name);
  }

  async add(name: string): Promise<void> {
    return this._schemaReflection.add(this._pool, name);
  }

  async dataSources(name: string): Promise<boolean | null> {
    return this._schemaReflection.dataSources(this._pool, name);
  }

  async columns(tableName: string): Promise<Column[]> {
    return this._schemaReflection.columns(this._pool, tableName);
  }

  async columnsHash(tableName: string): Promise<Record<string, Column>> {
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

  async dumpTo(filename: string): Promise<SchemaCache> {
    return this._schemaReflection.dumpTo(this._pool, filename);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async loadAllBang(): Promise<this> {
    await this._schemaReflection.loadAllBang(this._pool);
    return this;
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

export class SchemaCache {
  private _columns = new Map<string, Column[]>();
  private _columnsHash = new Map<string, Record<string, Column>>();
  private _primaryKeys = new Map<string, string | string[] | null>();
  private _dataSources = new Map<string, boolean>();
  private _indexes = new Map<string, IndexDefinition[]>();
  private _version: string | number | null = null;

  /** @inventedArm forceEncoding — PERMANENT */
  static async _loadFrom(filename: string): Promise<SchemaCache | null> {
    if (!File.isFile(filename)) return null;

    return SchemaCache.read(filename, (file) => {
      if (filename.includes(".dump")) {
        return Marshal.load(file) as SchemaCache;
      } else {
        file = forceEncoding(file, Encoding.UTF_8);
        return YAML.unsafeLoad(file) as SchemaCache;
      }
    });
  }

  /**
   * @missingRailsArgs read — PERMANENT
   * @inventedArm binread — PERMANENT
   */
  private static async read<T>(filename: string, callback: (data: string) => T): Promise<T> {
    if (File.extname(filename) === ".gz") {
      return Zlib.GzipReader.open(filename, async (gz) => callback(await gz.read()));
    }
    return callback(File.binread(filename));
  }

  initializeDup(): SchemaCache {
    const dup = new SchemaCache();
    dup._columns = new Map(this._columns);
    dup._columnsHash = new Map(this._columnsHash);
    dup._primaryKeys = new Map(this._primaryKeys);
    dup._dataSources = new Map(this._dataSources);
    dup._indexes = new Map(this._indexes);
    dup._version = this._version;
    return dup;
  }

  isCached(tableName: string): boolean {
    return this._columns.has(tableName);
  }

  async primaryKeys(pool: Pool, tableName: string): Promise<string | string[] | null> {
    if (this._primaryKeys.has(tableName)) {
      return this._primaryKeys.get(tableName)!;
    }

    return pool.withConnection(async (connection) => {
      if (await this.dataSourceExists(pool, tableName)) {
        const pk = deepDeduplicate(await connection.primaryKey(tableName));
        this._primaryKeys.set(deepDeduplicate(tableName), pk);
        return pk;
      }
      return null;
    });
  }

  async dataSourceExists(pool: Pool, name: string): Promise<boolean | null> {
    if (this.isIgnoredTable(name)) return null;
    if (this._dataSources.size === 0) {
      const tables = await this.tablesToCache(pool);
      for (const source of tables) {
        this._dataSources.set(source, true);
      }
    }

    if (this._dataSources.has(name)) {
      return this._dataSources.get(name)!;
    }

    const exists: boolean = await pool.withConnection((connection) =>
      connection.dataSourceExists(name),
    );
    this._dataSources.set(deepDeduplicate(name), exists);
    return exists;
  }

  async add(pool: Pool, tableName: string): Promise<void> {
    await pool.withConnection(async () => {
      if (await this.dataSourceExists(pool, tableName)) {
        await this.primaryKeys(pool, tableName);
        await this.columns(pool, tableName);
        await this.columnsHash(pool, tableName);
        await this.indexes(pool, tableName);
      }
    });
  }

  async columns(pool: Pool, tableName: string): Promise<Column[]> {
    if (this.isIgnoredTable(tableName)) {
      throw new StatementInvalid(`Table '${tableName}' doesn't exist`);
    }

    if (this._columns.has(tableName)) {
      return this._columns.get(tableName)!;
    }

    return pool.withConnection(async (connection) => {
      const cols: Column[] = deepDeduplicate(await connection.columns(tableName));
      this.setColumns(deepDeduplicate(tableName), cols);
      return cols;
    });
  }

  async columnsHash(pool: Pool, tableName: string): Promise<Record<string, Column>> {
    if (this._columnsHash.has(tableName)) {
      return this._columnsHash.get(tableName)!;
    }

    const hash: Record<string, Column> = {};
    for (const col of await this.columns(pool, tableName)) {
      hash[col.name] = col;
    }
    Object.freeze(hash);
    this._columnsHash.set(deepDeduplicate(tableName), hash);
    return hash;
  }

  isColumnsHash(_pool: unknown, tableName: string): boolean {
    return this._columnsHash.has(tableName);
  }

  async indexes(pool: Pool, tableName: string): Promise<IndexDefinition[]> {
    if (this._indexes.has(tableName)) {
      return this._indexes.get(tableName)!;
    }

    return pool.withConnection(async (connection) => {
      if (await this.dataSourceExists(pool, tableName)) {
        const idx: IndexDefinition[] = deepDeduplicate(await connection.indexes(tableName));
        this._indexes.set(deepDeduplicate(tableName), idx);
        return idx;
      }
      return [];
    });
  }

  async version(pool: Pool): Promise<string | number | null> {
    if (this._version != null) return this._version;

    return (this._version = await pool.withConnection((connection) => connection.schemaVersion()));
  }

  get schemaVersion(): string | number | null {
    return this._version;
  }

  get size(): number {
    return (
      this._columns.size + this._columnsHash.size + this._primaryKeys.size + this._dataSources.size
    );
  }

  clearDataSourceCacheBang(_connection: unknown, name: string): void {
    this._columns.delete(name);
    this._columnsHash.delete(name);
    this._primaryKeys.delete(name);
    this._dataSources.delete(name);
    this._indexes.delete(name);
  }

  async addAll(pool: Pool): Promise<void> {
    await pool.withConnection(async () => {
      const tables = await this.tablesToCache(pool);
      for (const table of tables) {
        await this.add(pool, table);
      }
      await this.version(pool);
    });
  }

  async dumpTo(filename: string): Promise<void> {
    await this.open(filename, (f) => {
      if (filename.includes(".dump")) {
        f.write(Uint8Array.from(Marshal.dump(this), (byte) => byte.charCodeAt(0)));
      } else {
        f.write(YAML.dump(this));
      }
    });
  }

  marshalDump(): unknown[] {
    return [
      this._version,
      this._columns,
      new Map(),
      this._primaryKeys,
      this._dataSources,
      this._indexes,
    ];
  }

  marshalLoad(array: unknown[]): void {
    let _columnsHash: unknown, _databaseVersion: unknown;
    [
      this._version,
      this._columns,
      _columnsHash,
      this._primaryKeys,
      this._dataSources,
      this._indexes,
      _databaseVersion,
    ] = array as [
      string | number | null,
      Map<string, Column[]>,
      unknown,
      Map<string, string | string[] | null>,
      Map<string, boolean>,
      Map<string, IndexDefinition[]>,
      unknown,
    ];
    this._indexes ??= new Map();

    this.deriveColumnsHashAndDeduplicateValues();
  }

  private async tablesToCache(pool: Pool): Promise<string[]> {
    return pool.withConnection(async (connection) => {
      const tables: string[] = await connection.dataSources();
      return tables.filter((table) => !this.isIgnoredTable(table));
    });
  }

  private isIgnoredTable(tableName: string): boolean {
    return isSchemaCacheIgnoredTable(tableName);
  }

  /**
   * @missingRailsName columns — PERMANENT
   * @missingRailsName primaryKeys — PERMANENT
   * @missingRailsName dataSources — PERMANENT
   * @missingRailsName indexes — PERMANENT
   */
  private deriveColumnsHashAndDeduplicateValues(): void {
    this._columns = deepDeduplicate(this._columns);
    this._columnsHash = new Map(
      [...this._columns].map(([table, columns]) => [
        table,
        Object.fromEntries(columns.map((column) => [column.name, column])),
      ]),
    );
    this._primaryKeys = deepDeduplicate(this._primaryKeys);
    this._dataSources = deepDeduplicate(this._dataSources);
    this._indexes = deepDeduplicate(this._indexes);
  }

  /** @internal */
  private async open(
    filename: string,
    block: (file: { write(string: string | Uint8Array): unknown }) => unknown,
  ): Promise<unknown> {
    FileUtils.mkdirP(File.dirname(filename));

    return atomicWrite(filename, async (file) => {
      if (File.extname(filename) === ".gz") {
        const zipper = new Zlib.GzipWriter(file);
        zipper.mtime = 0;
        await block(zipper);
        await zipper.flush();
        return zipper.close();
      } else {
        return block(file);
      }
    });
  }

  encodeWith(coder: Record<string, unknown>): void {
    coder["columns"] = new Map(sort([...this._columns]));
    coder["primary_keys"] = new Map(sort([...this._primaryKeys]));
    coder["data_sources"] = new Map(sort([...this._dataSources]));
    coder["indexes"] = new Map(sort([...this._indexes]));
    coder["version"] = this._version;
  }

  initWith(coder: Record<string, unknown>): void {
    this._columns = coder["columns"] as Map<string, Column[]>;
    this._columnsHash = coder["columns_hash"] as Map<string, Record<string, Column>>;
    this._primaryKeys = coder["primary_keys"] as Map<string, string | string[] | null>;
    this._dataSources = coder["data_sources"] as Map<string, boolean>;
    this._indexes = (coder["indexes"] as Map<string, IndexDefinition[]>) ?? new Map();
    this._version = (coder["version"] as string | number | null | undefined) ?? null;

    if (coder["deduplicated"] == null || coder["deduplicated"] === false) {
      this.deriveColumnsHashAndDeduplicateValues();
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  getCachedColumnsHash(tableName: string): Record<string, Column> | undefined {
    return this._columnsHash.get(tableName);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  getCachedDataSourceExists(name: string): boolean | undefined {
    return this._dataSources.get(name);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  getCachedPrimaryKeys(tableName: string): string | string[] | null | undefined {
    return this._primaryKeys.get(tableName);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  setColumns(tableName: string, cols: Column[]): void {
    this._columns.set(tableName, cols);
    const hash: Record<string, Column> = {};
    for (const col of cols) {
      hash[col.name] = col;
    }
    this._columnsHash.set(tableName, hash);
    this._dataSources.set(tableName, true);
  }
}

/** @internal */
export function deepDeduplicate<T>(value: T): T {
  if (
    value instanceof Map ||
    (typeof value === "object" && value && !Object.getPrototypeOf(value))
  ) {
    return new Map(
      [...(value instanceof Map ? value : Object.entries(value))].map(([k, v]) => [
        deepDeduplicate(k),
        deepDeduplicate(v),
      ]),
    ) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((i) => deepDeduplicate(i)) as unknown as T;
  if (
    value !== null &&
    typeof value === "object" &&
    isModuleIncluded(value.constructor as { prototype: object }, Deduplicable)
  ) {
    return (value as unknown as { negate(): T }).negate();
  }
  return value;
}

registerConstant("ActiveRecord::ConnectionAdapters::SchemaCache", SchemaCache);
