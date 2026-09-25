import { Encoding, File, FileUtils, Zlib } from "@blazetrails/ruby-compat";
import { atomicWrite } from "@blazetrails/activesupport";
import { parse as yamlParse, stringify as yamlStringify } from "@blazetrails/activesupport/yaml";
import { Column } from "./column.js";
import { deduplicate } from "./deduplicable.js";
import type { Deduplicable } from "./deduplicable.js";
import type { ColumnCoder } from "./column.js";
import { Column as MysqlColumn } from "./mysql/column.js";
import { Column as PostgresqlColumn } from "./postgresql/column.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { TypeMetadata as MysqlTypeMetadata } from "./mysql/type-metadata.js";
import { TypeMetadata as PostgresqlTypeMetadata } from "./postgresql/type-metadata.js";
import { isSchemaCacheIgnoredTable } from "../active-record.js";
import { ActiveRecordError, StatementInvalid } from "../errors.js";
import { IndexDefinition } from "./abstract/schema-definitions.js";

export type Pool = {
  withConnection<T>(callback: (connection: any) => T | Promise<T>): T | Promise<T>;
};

function serializeColumn(col: Column): ColumnCoder {
  const coder: ColumnCoder = {};
  coder["class"] = Object.keys(COLUMN_CLASSES)
    .reverse()
    .find((name) => Object.prototype.isPrototypeOf.call(COLUMN_CLASSES[name].prototype, col));
  col.encodeWith(coder);
  const metadata = coder["sql_type_metadata"];
  if (metadata instanceof SqlTypeMetadata) {
    coder["sql_type_metadata"] = {
      class: Object.keys(TYPE_METADATA_CLASSES)
        .reverse()
        .find((name) =>
          Object.prototype.isPrototypeOf.call(TYPE_METADATA_CLASSES[name].prototype, metadata),
        ),
      ...metadata,
    };
  }
  return coder;
}

const COLUMN_CLASSES: Record<string, { prototype: Column }> = {
  Column,
  "MySQL::Column": MysqlColumn,
  "PostgreSQL::Column": PostgresqlColumn,
  "SQLite3::Column": Sqlite3Column,
};

const TYPE_METADATA_CLASSES: Record<string, { prototype: SqlTypeMetadata }> = {
  SqlTypeMetadata,
  "MySQL::TypeMetadata": MysqlTypeMetadata,
  "PostgreSQL::TypeMetadata": PostgresqlTypeMetadata,
};

function rehydrateColumn(data: unknown): Column {
  let coder = data as ColumnCoder;
  const klass = COLUMN_CLASSES[coder["class"] as string] ?? Column;
  const column = Object.create(klass.prototype) as Column;
  const metadata = coder["sql_type_metadata"];
  if (metadata != null && !(metadata instanceof SqlTypeMetadata)) {
    const { class: metadataClass, ...ivars } = metadata as { class?: string };
    const metadataKlass = TYPE_METADATA_CLASSES[metadataClass as string] ?? SqlTypeMetadata;
    coder = {
      ...coder,
      sql_type_metadata: Object.assign(Object.create(metadataKlass.prototype), ivars),
    };
  }
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
  private _dataSources = new Map<string, boolean>();
  private _indexes = new Map<string, IndexDefinition[]>();
  private _version: string | number | null = null;

  /** @missingRailsCall load — PERMANENT */
  static async _loadFrom(filename: string): Promise<SchemaCache | null> {
    try {
      if (!File.isFile(filename)) return null;
      const data = await SchemaCache.read(filename, (content) => content);
      const parsed = yamlParse(data) as Record<string, Record<string, unknown[]> | null>;
      const cache = new SchemaCache();
      cache.initWith({
        ...parsed,
        columns: new Map(
          Object.entries(parsed["columns"] ?? {}).map(([table, cols]) => [
            table,
            cols.map((c) => rehydrateColumn(c)),
          ]),
        ),
        primary_keys: new Map(Object.entries(parsed["primary_keys"] ?? {})),
        data_sources: new Map(Object.entries(parsed["data_sources"] ?? {})),
        indexes: new Map(
          Object.entries(parsed["indexes"] ?? {}).map(([table, idx]) => [
            table,
            idx.map((i) => rehydrateIndex(i)),
          ]),
        ),
      });
      return cache;
    } catch {
      return null;
    }
  }

  private static async read<T>(filename: string, callback: (data: string) => T): Promise<T> {
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
    dup._dataSources = new Map(this._dataSources);
    dup._indexes = new Map(this._indexes);
    dup._version = this._version;
    return dup;
  }

  encodeWith(coder: Record<string, unknown>): void {
    const byKey = (a: [string, unknown], b: [string, unknown]) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    coder["columns"] = new Map([...this._columns].sort(byKey));
    coder["primary_keys"] = new Map([...this._primaryKeys].sort(byKey));
    coder["data_sources"] = new Map([...this._dataSources].sort(byKey));
    coder["indexes"] = new Map([...this._indexes].sort(byKey));
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
    if (this._version !== null) return this._version;

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
      const coder: Record<string, unknown> = {};
      this.encodeWith(coder);
      coder["columns"] = new Map(
        [...(coder["columns"] as Map<string, Column[]>)].map(([table, cols]) => [
          table,
          cols.map((c) => serializeColumn(c)),
        ]),
      );
      f.write(yamlStringify(coder));
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
      Object.fromEntries(this._dataSources),
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
    this._dataSources = new Map(Object.entries((dataSources as Record<string, boolean>) ?? {}));
    this._indexes = new Map(
      Object.entries((indexes as Record<string, unknown[]>) ?? {}).map(([table, idx]) => [
        table,
        idx.map((i) => rehydrateIndex(i)),
      ]),
    );

    this.deriveColumnsHashAndDeduplicateValues();
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

  private isIgnoredTable(tableName: string): boolean {
    return isSchemaCacheIgnoredTable(tableName);
  }

  private async tablesToCache(pool: Pool): Promise<string[]> {
    return pool.withConnection(async (connection) => {
      const tables: string[] = await connection.dataSources();
      return tables.filter((table) => !this.isIgnoredTable(table));
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
        await zipper.flush();
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

  /** @noRailsEquivalent PERMANENT */
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

  async loadBang(pool: Pool): Promise<this> {
    await this.cache(pool);
    return this;
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
    this._cachePromise = null;
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
    this._cachePromise = null;
    return (this._cache = freshCache);
  }

  private async cache(pool: Pool): Promise<SchemaCache> {
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

  /** @missingRailsName cachePath — PERMANENT */
  private possibleCacheAvailable(): boolean {
    if (!SchemaReflection.useSchemaCacheDump) return false;
    if (!this._cachePath) return false;
    try {
      return File.isFile(this._cachePath);
    } catch {
      return false;
    }
  }

  private async loadCache(pool: Pool | null): Promise<SchemaCache | null> {
    if (!this.possibleCacheAvailable()) return null;

    const newCache = await SchemaCache._loadFrom(this._cachePath!);
    if (!newCache) return null;

    if (SchemaReflection.checkSchemaCacheDumpVersion) {
      try {
        const currentVersion = await pool!.withConnection((connection) =>
          connection.schemaVersion(),
        );

        if (newCache.schemaVersion !== currentVersion) {
          console.warn(
            `Ignoring ${this._cachePath} because it has expired. ` +
              `The current schema version is ${currentVersion}, ` +
              `but the one in the schema cache file is ${newCache.schemaVersion}.`,
          );
          return null;
        }
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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async loadAllBang(): Promise<this> {
    await this._schemaReflection.loadAllBang(this._pool);
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
    typeof (value as unknown as Deduplicable).deduplicated === "function"
  ) {
    return deduplicate(value as unknown as Deduplicable & { hash(): number }) as unknown as T;
  }
  return value;
}
