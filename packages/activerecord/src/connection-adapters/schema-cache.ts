/**
 * Schema cache — caches database schema information to avoid repeated
 * introspection queries.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import { Gzip } from "@blazetrails/activesupport/gzip";
import { Column } from "./column.js";
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

/**
 * The Column subclasses a dump can name, keyed by the `class` tag
 * `Column#encodeWith` writes — JSON's stand-in for YAML's `!ruby/object:` tag.
 */
const COLUMN_CLASSES: Record<string, { prototype: Column }> = {
  Column,
  "MySQL::Column": MysqlColumn,
  "PostgreSQL::Column": PostgresqlColumn,
  "SQLite3::Column": Sqlite3Column,
};

/**
 * Psych's restore step: allocate the tagged class, then `init_with` the coder
 * (`psych/visitors/to_ruby.rb`; `column.rb:46-53`). `Object.create` is the JS
 * `allocate` — it must not run a constructor, because the coder is the only
 * source of state.
 */
function rehydrateColumn(data: unknown): Column {
  if (data instanceof Column) return data;
  const coder = data as ColumnCoder;
  const klass = COLUMN_CLASSES[coder["class"] as string] ?? Column;
  const column = Object.create(klass.prototype) as Column;
  column.initWith(coder);
  return column;
}

/**
 * `IndexDefinition#conciseOptions` collapses a per-column option map to a bare
 * scalar when every key column shares the value, so a serialized row can carry
 * either shape. Re-expand the scalar over the key columns before handing it
 * back to the constructor, which collapses it again. An expression index has no
 * key columns to expand over — `columns` is the raw expression string — so its
 * scalar passes straight through to `conciseOptions`, which leaves a non-map
 * value alone.
 */
function expandIndexOption<T>(
  columns: string | string[],
  value: unknown,
): Record<string, T> | T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value as Record<string, T>;
  if (!Array.isArray(columns)) return value as T;
  return Object.fromEntries(columns.map((c) => [c, value as T]));
}

/**
 * Rails' schema cache round-trips real `IndexDefinition` structs (the
 * YAML/Marshal payload carries the class), so derived behavior like
 * `columnOptions` / `isDefinedFor` survives a `schema_cache.yml` load. JSON has
 * no class tag, so rebuild the instance from the serialized fields.
 */
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

  /**
   * @missingRailsCall load — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_cache.rb:228-242 dispatches to `Marshal.load` or `YAML.unsafe_load`
   *   by extension; trails dumps and loads the cache as JSON
   *   (schema-cache.ts:134-146), so neither Ruby deserializer has a counterpart
   *   to call.
   */
  static _loadFrom(filename: string): SchemaCache | null {
    try {
      const fs = getFs();
      if (!fs.existsSync(filename)) return null;
      const data = SchemaCache.read(filename, (content) => content);
      const parsed = JSON.parse(data);
      const cache = new SchemaCache();
      cache.initWith(parsed);
      return cache;
    } catch {
      return null;
    }
  }

  /**
   * @internal Mirrors SchemaCache.read in Rails: transparently gunzips .gz files.
   *
   * @missingRailsCall open — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_cache.rb:246 is `Zlib::GzipReader.open(filename) { |gz| ... }`;
   *   trails reads the bytes and calls the pure `Gzip.decompress`
   *   (schema-cache.ts:149-156) — there is no reader object to open.
   */
  static read<T>(filename: string, callback: (data: string) => T): T {
    const fs = getFs();
    if (filename.endsWith(".gz")) {
      const raw = fs.readFileSync(filename, "latin1");
      return callback(Gzip.decompress(raw));
    }
    return callback(fs.readFileSync(filename, "utf-8"));
  }

  // SchemaCache is not an ActiveRecord model: Rails' SchemaCache#initialize_dup
  // supers into Object (schema_cache.rb:264) and fires no model callbacks, so
  // this override must not run any either.
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
      this._primaryKeys = coder["primary_keys"] as Map<string, string | string[] | null>;
    } else if (coder["primary_keys"] && typeof coder["primary_keys"] === "object") {
      this._primaryKeys = new Map(
        Object.entries(coder["primary_keys"] as Record<string, string | string[] | null>),
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
      this._indexes = coder["indexes"] as Map<string, IndexDefinition[]>;
    } else if (coder["indexes"] && typeof coder["indexes"] === "object") {
      this._indexes = new Map(
        Object.entries(coder["indexes"] as Record<string, unknown[]>).map(([table, idx]) => [
          table,
          idx.map((i) => rehydrateIndex(i)),
        ]),
      );
    }

    this._version = (coder["version"] as string | number) ?? null;

    this.deriveColumnsHashAndDeduplicateValues();
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

  // Rails: columns_hash?(_pool, table_name) — "checks whether the columns hash
  // is already cached for a table" (schema_cache.rb:359).
  isColumnsHash(_pool: unknown, tableName: string): boolean {
    return this._columnsHash.has(tableName);
  }

  /**
   * Synchronous, query-free read of an already-warmed columns hash. Rails has
   * no counterpart: `columns_hash(pool, table)` is its only accessor, and in
   * Ruby it can block on a connection checkout when the entry is cold.
   *
   * Both trails callers are Rails-sync accessors that cannot await: the sync
   * `Model.columnsHash()` (`model-schema.ts` `columnsHash`, which user code and
   * `columnNames()` call without awaiting) and `cachedColumnsHash`, which
   * `attributes.ts` `_defaultAttributes` reads while *constructing* a record.
   * Both gate on `_columnsHash` — the same map this reads, not `isCached`'s
   * `_columns` — so a cold table falls through to the async `columnsHash` path
   * rather than silently reporting an empty schema.
   *
   * @internal Reflection plumbing behind the sync `columnsHash` accessors, not a
   * Rails surface. It disappears once those accessors can block on a checkout
   * the way `columns_hash(pool, table)` does — blocked on RFC 0073 (the
   * permanent connection-checkout flip), not on anything TypeScript forbids.
   */
  getCachedColumnsHash(tableName: string): Record<string, Column> | undefined {
    return this._columnsHash.get(tableName);
  }

  /**
   * Synchronous, query-free read of an already-resolved data-source existence
   * check. `undefined` when this table has never been checked (a warm cache
   * only seeds `true` for tables it saw — an unchecked absent table is not
   * `false` here until `dataSourceExists` misses on it).
   *
   * @internal Reflection plumbing behind the sync `cachedTableExists`, not a
   * Rails surface. It disappears once that caller can block the way
   * `data_source_exists?(pool, name)` does — blocked on RFC 0073 (the permanent
   * connection-checkout flip).
   */
  getCachedDataSourceExists(name: string): boolean | undefined {
    return this._dataSourceExists.get(name);
  }

  /**
   * Synchronous, query-free read of an already-cached primary key. Returns
   * `undefined` when the table's primary key has not been reflected yet (the
   * caller should fall back to the convention default), or the cached value
   * — which may be `null` for a primary-key-less data source such as a view.
   *
   * When the dedicated `_primaryKeys` map has no entry but the columns are
   * already warm, derive the key from the columns' `primaryKey` flags. This is
   * what lets `id: false` tables with a custom string PK (e.g. `countries`'
   * `country_id`) surface the right key after `loadSchema` warms only the
   * columns hash — without it the caller falls back to the "id" convention and
   * the model needs an explicit `primary_key=`. Mirrors Rails, where the schema
   * cache resolves `primary_key` from the reflected table rather than the
   * convention.
   *
   * This column-flag derivation is adapter-scoped: it fires only for adapters
   * whose `columns()` flag the PK (sqlite/postgres). MySQL/MariaDB's `columns()`
   * carries no per-column primary flag — matching Rails' `MySQL::Column`
   * (`abstract_mysql_adapter.rb`), which resolves the key solely via
   * `@connection.primary_key` — so this branch never resolves a MySQL key and
   * falls through to `undefined`. That is not a gap: MySQL PK resolution is
   * authoritative-only, and `loadSchema` → `loadSchemaFromAdapter`
   * (`model-schema.ts`) always warms `_primaryKeys` (via `adapter.primaryKey()`)
   * alongside the columns hash, so the `_primaryKeys` hit above answers first.
   * A MySQL custom-PK table therefore still resolves through the model path
   * (regression-tested in `primary-keys.test.ts`); only a low-level caller that
   * warms `_columns` without `_primaryKeys` — which the model path never does —
   * would see the fall-through, exactly as Rails would require a `primary_keys`
   * query there.
   *
   * Deliberately returns `undefined` (not `null`) when the warm columns flag no
   * primary key: the authoritative keyless→`null` answer comes from the async
   * `primaryKeys` query, and resolving it here would change a warm-but-unqueried
   * keyless table's `primary_key` from the "id" convention to `null` — a
   * behavior change beyond surfacing custom keys. Falling through keeps this a
   * strictly additive read: a table that resolved "id" before still does.
   *
   * @internal Reflection plumbing behind the sync `Model.primaryKey`, not a
   * Rails surface. It disappears once that accessor can block the way
   * `primary_keys(pool, table)` does — blocked on RFC 0073 (the permanent
   * connection-checkout flip).
   */
  getCachedPrimaryKeys(tableName: string): string | string[] | null | undefined {
    if (this._primaryKeys.has(tableName)) return this._primaryKeys.get(tableName);
    const cols = this._columns.get(tableName);
    if (!cols) return undefined;
    const pkCols = cols.filter((c) => c.primaryKey).map((c) => c.name);
    if (pkCols.length === 0) return undefined;
    return pkCols.length === 1 ? pkCols[0] : pkCols;
  }

  async indexes(pool: unknown, tableName: string): Promise<IndexDefinition[]> {
    if (this._indexes.has(tableName)) {
      return this._indexes.get(tableName)!;
    }

    if (this.isIgnoredTable(tableName)) return [];

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

  /**
   * Populate the columns / columns-hash / data-source entries for a table from
   * columns the caller has *already* reflected. Rails has no sync writer — its
   * only population path is `add(pool, table_name)`, which issues the
   * introspection queries itself behind `pool.with_connection`.
   *
   * It survives as the write half of the sync readers below: `columns()` seeds
   * every reflection through it, so `getCachedColumnsHash` and friends can
   * answer query-free. Rails needs no such writer because its readers may block
   * on a checkout.
   *
   * Also warms `_dataSourceExists` — a table whose columns just came back
   * demonstrably exists — which is what lets the sync readers above answer
   * without a query.
   *
   * @internal The write half of the sync readers above — same lifetime as they
   * have: once they can block on a checkout, every population path is
   * `add(pool, tableName)` again. Blocked on RFC 0073 (the permanent
   * connection-checkout flip).
   */
  setColumns(tableName: string, cols: Column[]): void {
    this.reconcilePrimaryKeyFlags(tableName, cols);
    this._columns.set(tableName, cols);
    const hash: Record<string, Column> = {};
    for (const col of cols) {
      hash[col.name] = col;
    }
    this._columnsHash.set(tableName, hash);
    this._dataSourceExists.set(tableName, true);
  }

  /**
   * Clear per-column `primaryKey` flags that the authoritative `_primaryKeys`
   * cache contradicts. This is a general safety net for any adapter whose
   * `columns()` could over-report a primary flag, reconciled query-free against
   * `_primaryKeys` (which `add()` warms via the authoritative
   * `SHOW KEYS ... 'PRIMARY'` / key_column_usage query before `columns()`, so
   * by the time `setColumns` runs the key is already authoritative).
   *
   * Historically this cleared MySQL/MariaDB's "promoted unique" false positive:
   * they report `column_key = 'PRI'` for a UNIQUE-NOT-NULL index when a table has
   * no PRIMARY KEY, so `columns()` used to reflect a bogus flag on that column.
   * `columns()` now carries no per-column primary flag at all for MySQL/MariaDB —
   * matching Rails' `MySQL::Column`, which has none and resolves the key solely
   * from the `PRIMARY` constraint — so this reconcile is a no-op for MySQL
   * (nothing is ever set `true`, so there is nothing to clear). It stays as a
   * harmless guard for any adapter that could theoretically over-report.
   *
   * Clear-only: a flag is dropped when the authoritative key set excludes the
   * column, never added. Real primary keys (whose flag the adapter already set
   * and whose name the query returns) are untouched, and adapters that reflect
   * the flag correctly (sqlite/postgres) agree with the query so nothing changes.
   * When `_primaryKeys` is not yet warm the flags are left as reflected.
   */
  private reconcilePrimaryKeyFlags(tableName: string, cols: Column[]): void {
    if (!this._primaryKeys.has(tableName)) return;
    const pk = this._primaryKeys.get(tableName);
    const pkNames = new Set(pk == null ? [] : Array.isArray(pk) ? pk : [pk]);
    for (const col of cols) {
      if (col.primaryKey && !pkNames.has(col.name)) {
        (col as { primaryKey: boolean }).primaryKey = false;
      }
    }
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

  dumpTo(filename: string): void {
    const fs = getFs();
    const path = getPath();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const coder: Record<string, unknown> = {};
    this.encodeWith(coder);
    const payload = JSON.stringify(coder, null, 2);
    if (filename.endsWith(".gz")) {
      // Mirrors Rails: .gz files are gzipped on disk. Gzip.compress (via
      // node:zlib gzipSync) writes a header with mtime=0 and OS=0xff, so
      // two dumps of the same cache produce byte-identical output (Rails
      // relies on this in `test_gzip_dumps_identical`).
      fs.writeFileSync(filename, Gzip.compress(payload), "latin1");
    } else {
      fs.writeFileSync(filename, payload, "utf-8");
    }
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

  /**
   * Rebuild `_columnsHash` from `_columns`. Both `_columns` and the
   * authoritative `_primaryKeys` are already loaded, so reconcile the per-column
   * `primaryKey` flags against the key cache before exposing the hash — a schema
   * cache dumped before this convergence can carry MySQL's promoted-unique
   * `primaryKey: true` alongside `primary_keys: { table: null }`, and the derive
   * step must not resurface the bogus flag. Mirrors Rails treating `@primary_keys`
   * as authoritative while deriving `columns_hash` (schema_cache.rb).
   *
   * @missingRailsCall deep_deduplicate — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_cache.rb:441-445 calls `deep_deduplicate` to intern strings with
   *   Ruby's `-@`; JS has no string-interning primitive and identical string
   *   literals are already shared, so trails derives `columnsHash` only
   *   (schema-cache.ts:617-627).
   */
  private deriveColumnsHashAndDeduplicateValues(): void {
    this._columnsHash.clear();
    for (const [table, cols] of this._columns) {
      this.reconcilePrimaryKeyFlags(table, cols);
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

  // Rails: tables_to_cache(pool) — gets data_sources from connection,
  // filtering out anything matched by ActiveRecord.schema_cache_ignored_tables.
  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache#ignored_table?
   * (`schema_cache.rb:436`, private) — `ActiveRecord.schema_cache_ignored_table?`
   * behind a private method on the cache, which is what every ignore check in
   * this class calls.
   */
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
}

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

  /**
   * Eagerly warm the schema cache by DB introspection at connection/boot,
   * even when no `schema_cache.json` exists on disk. When true,
   * ConnectionPool.newConnection kicks off a fire-and-forget
   * `loadAllBang(pool)` on the first connection: it introspects every table's
   * columns/primary-keys/indexes (Rails' `schema_cache.addAll(pool)`) so a
   * synchronous `Model.columnNames()` / `columnsHash()` on a connected model
   * takes the warm, DB-sourced branch — and therefore excludes virtual
   * `attribute()` declarations — without a prior `await ensureSchemaLoaded()`.
   *
   * Distinct from {@link lazilyLoadSchemaCache}, which only loads a committed
   * dump file. Eager warming subsumes it: `loadAllBang` first consults the
   * on-disk cache (if any) as a base, then tops it up by introspection.
   *
   * Off by default — the boot-time introspection cost is opt-in, mirroring how
   * Rails apps choose between a committed dump and live reflection.
   *
   * Boot-time only: `resetColumnInformation` always clears the table's entry
   * (Rails' `clear_data_source_cache!`) regardless of this flag — the next
   * load re-reflects it.
   *
   * @noRailsEquivalent CONVERGEABLE (story:
   * retire-schema-cache-sync-readers-after-checkout-flip) — blocked on RFC 0073,
   * the permanent connection-checkout flip. Rails has only
   * `lazily_load_schema_cache` (a committed dump) because its sync accessors
   * fall back on blocking reflection; trails' cannot until the flip lands, at
   * which point this flag has nothing left to buy and goes away with it.
   */
  static eagerLoadSchemaCache = false;

  private _cache: SchemaCache | null;
  private _cachePath: string | null;
  private _cachePromise: Promise<SchemaCache> | null = null;

  constructor(cachePath?: string | null, cache?: SchemaCache) {
    this._cache = cache ?? null;
    this._cachePath = cachePath ?? null;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SchemaReflection#empty_cache
   * (`schema_cache.rb:100`, private). Rails uses `allocate` + `send(:initialize)`
   * to bypass a custom `new`; TS has no such distinction, so a plain
   * construction is the faithful equivalent. Every empty-cache fallback in this
   * class routes through it, as Rails' do.
   */
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
   * Eagerly warm the cache by full DB introspection. First resolves the base
   * cache via {@link cache} — which consults the on-disk dump when present —
   * then introspects every data source via {@link SchemaCache#addAll} to top
   * it up, so a synchronous read sees real DB columns even with no dump file.
   *
   * @internal trails-only composite — NOT a Rails method. Rails'
   * `SchemaReflection#load!(pool)` is just `cache(pool)`; the introspection
   * top-up is `SchemaCache#add_all(pool)`. There is no `load_all!` in Rails;
   * this pairs the two so the eager-warm pool path has a single entry point
   * that also routes through the lone-connection `FakePool`. Don't grep Rails
   * for it.
   */
  async loadAllBang(pool: unknown): Promise<this> {
    const cache = await this.cache(pool);
    await cache.addAll(pool);
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

  /**
   * @internal Companion setter for {@link loadedCache}: `PoolConfig#schemaCache`
   * is backed by this slot so the pool's one raw SchemaCache is shared by every
   * reader — the BoundSchemaReflection and the adapters' `internalSchemaCache`
   * alike. Assigning drops any in-flight disk load so it can't overwrite the
   * cache the caller just installed.
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

  isColumnsHash(pool: unknown, tableName: string): boolean {
    this.ensureSyncCache();
    return this._cache?.isColumnsHash(pool, tableName) ?? false;
  }

  async indexes(pool: unknown, tableName: string): Promise<IndexDefinition[]> {
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

  /**
   * @missingRailsCall load_cache — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_cache.rb:79-89 may `load_cache(nil)` inline; trails' `isCached` is
   *   synchronous while `loadCache` is promise-returning, so the load is
   *   performed by `ensureSyncCache()` from the already-resolved dump
   *   (schema-cache.ts:839-842).
   */
  isCached(tableName: string): boolean {
    this.ensureSyncCache();
    return this._cache?.isCached(tableName) ?? false;
  }

  async dumpTo(pool: unknown, filename: string): Promise<void> {
    const freshCache = this.emptyCache();
    await freshCache.addAll(pool);
    freshCache.dumpTo(filename);
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

  /**
   * Attempt to populate _cache synchronously from disk when version
   * checking is disabled. Used by sync-only paths (isCached, size,
   * isColumnsHash) that can't await.
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

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::BoundSchemaReflection
 */
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
   * @internal trails-only composite — NOT a Rails method. Bound counterpart of
   * {@link SchemaReflection#loadAllBang}; see that note. Rails has `load!` and
   * `add(name)` on BoundSchemaReflection but no `load_all!`.
   */
  async loadAllBang(): Promise<this> {
    await this._schemaReflection.loadAllBang(this._pool);
    return this;
  }

  isCached(tableName: string): boolean {
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

  isColumnsHash(tableName: string): boolean {
    return this._schemaReflection.isColumnsHash(this._pool, tableName);
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
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

/**
 * Recursively deep-clone arrays and plain objects. Rails uses `-value` (String#+@)
 * to intern strings; TS has no string interning, so primitives are returned as-is
 * and only arrays/objects are cloned (no identity preservation).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache#deep_deduplicate (private)
 *
 * @internal
 */
export function deepDeduplicate<T>(value: T): T {
  if (Array.isArray(value)) return value.map((i) => deepDeduplicate(i)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[deepDeduplicate(k)] = deepDeduplicate(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Write content to a file, creating parent directories as needed.
 * Rails uses File.atomic_write; TS writes synchronously (not atomically —
 * FsAdapter lacks renameSync).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache#open (private)
 *
 * @internal
 *
 * @missingRailsCall new — PERMANENT: Per-site verified (RFC 0106 wave 4b):
 *   schema_cache.rb:466 is `Zlib::GzipWriter.new file`; trails compresses with
 *   the pure `Gzip.compress` and writes the result, so no writer is allocated.
 */
export function open(
  filename: string,
  callback: (file: { write(data: string): void }) => void,
): void {
  const fs = getFs();
  const path = getPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let content = "";
  callback({
    write: (data: string) => {
      content += data;
    },
  });
  // FsAdapter does not expose renameSync, so a true atomic write is not possible.
  // Write directly to the target file (mirrors Rails' File.atomic_write intent;
  // full atomicity would require renameSync support in FsAdapter).
  fs.writeFileSync(filename, content, "utf-8");
}
