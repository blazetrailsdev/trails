/**
 * Schema cache — caches database schema information to avoid repeated
 * introspection queries.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache
 */

import type { Column } from "./column.js";

export class SchemaCache {
  private _columns = new Map<string, Column[]>();
  private _columnsHash = new Map<string, Map<string, Column>>();
  private _primaryKeys = new Map<string, string | null>();
  private _dataSourceExists = new Map<string, boolean>();
  private _version: string | null = null;

  get version(): string | null {
    return this._version;
  }

  set version(v: string | null) {
    this._version = v;
  }

  get size(): number {
    return this._columns.size;
  }

  columns(tableName: string): Column[] | undefined {
    return this._columns.get(tableName);
  }

  columnsHash(tableName: string): Map<string, Column> | undefined {
    return this._columnsHash.get(tableName);
  }

  setColumns(tableName: string, cols: Column[]): void {
    this._columns.set(tableName, cols);
    const hash = new Map<string, Column>();
    for (const col of cols) {
      hash.set(col.name, col);
    }
    this._columnsHash.set(tableName, hash);
  }

  primaryKeys(tableName: string): string | null | undefined {
    return this._primaryKeys.get(tableName);
  }

  setPrimaryKeys(tableName: string, pk: string | null): void {
    this._primaryKeys.set(tableName, pk);
  }

  dataSourceExists(tableName: string): boolean | undefined {
    return this._dataSourceExists.get(tableName);
  }

  setDataSourceExists(tableName: string, exists: boolean): void {
    this._dataSourceExists.set(tableName, exists);
  }

  clearTableCache(tableName: string): void {
    this._columns.delete(tableName);
    this._columnsHash.delete(tableName);
    this._primaryKeys.delete(tableName);
    this._dataSourceExists.delete(tableName);
  }

  clear(): void {
    this._columns.clear();
    this._columnsHash.clear();
    this._primaryKeys.clear();
    this._dataSourceExists.clear();
    this._version = null;
  }

  marshal(): Record<string, unknown> {
    return {
      version: this._version,
      columns: Object.fromEntries(this._columns),
      primaryKeys: Object.fromEntries(this._primaryKeys),
      dataSourceExists: Object.fromEntries(this._dataSourceExists),
    };
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaReflection
 *
 * Wraps a SchemaCache. Introspection methods that consult the cache
 * and fall back to the database will be added as they are needed.
 */
export class SchemaReflection {
  private _cache: SchemaCache;

  constructor(cache?: SchemaCache) {
    this._cache = cache ?? new SchemaCache();
  }

  get cache(): SchemaCache {
    return this._cache;
  }

  clearCache(): void {
    this._cache.clear();
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::BoundSchemaReflection
 *
 * Schema reflection bound to a specific connection pool.
 */
export class BoundSchemaReflection {
  private _reflection: SchemaReflection;
  private _pool: unknown;

  constructor(reflection: SchemaReflection, pool: unknown) {
    this._reflection = reflection;
    this._pool = pool;
  }

  get reflection(): SchemaReflection {
    return this._reflection;
  }

  get pool(): unknown {
    return this._pool;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::BoundSchemaReflection::FakePool
 */
export class FakePool {
  private _schemaCache: SchemaCache;

  constructor(schemaCache?: SchemaCache) {
    this._schemaCache = schemaCache ?? new SchemaCache();
  }

  get schemaCache(): SchemaCache {
    return this._schemaCache;
  }
}
