/**
 * Schema cache — caches database schema information to avoid repeated
 * introspection queries.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCache
 */

import { getFs, getPath } from "@blazetrails/activesupport";
import { Gzip } from "@blazetrails/activesupport/gzip";
import { Column } from "./column.js";
import type { ColumnJSON } from "./column.js";
import { Column as MysqlColumn } from "./mysql/column.js";
import { isSchemaCacheIgnoredTable } from "../ar-config.js";
import { StatementInvalid } from "../errors.js";
import { poolAbsent } from "./abstract/connection-pool.js";

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
  const json = data as ColumnJSON & { __mysql?: boolean };
  if (json && json.__mysql) return MysqlColumn.fromJSON(json);
  return Column.fromJSON(json);
}

// ---------------------------------------------------------------------------
// SchemaCache
// ---------------------------------------------------------------------------

export class SchemaCache {
  private _columns = new Map<string, Column[]>();
  private _columnsHash = new Map<string, Record<string, Column>>();
  private _primaryKeys = new Map<string, string | string[] | null>();
  private _dataSourceExists = new Map<string, boolean>();
  private _indexes = new Map<string, unknown[]>();
  private _version: string | number | null = null;
  // When non-null, records the name of every table passed to
  // `clearDataSourceCacheBang` — i.e. every table touched by DDL
  // (`create_table` / `drop_table` / `add_column` / … all funnel through it).
  // The AR test harness opens a recording window per test so teardown can
  // re-reflect only the DDL-touched tables instead of clearing the whole
  // cache (mirrors Rails' per-table `clear_data_source_cache!`). Off (null)
  // by default so production paths never pay the bookkeeping.
  private _touchedTables: Set<string> | null = null;

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

  /** @internal Mirrors SchemaCache.read in Rails: transparently gunzips .gz files. */
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
      this._indexes = coder["indexes"] as Map<string, unknown[]>;
    } else if (coder["indexes"] && typeof coder["indexes"] === "object") {
      this._indexes = new Map(Object.entries(coder["indexes"] as Record<string, unknown[]>));
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

    // Null-pool guard: callers (e.g. `columnForAttribute` before a pool is
    // attached) may pass `pool: null` to consult only the warm cache. Don't
    // attempt to acquire a connection in that case — return undefined and
    // let the caller fall back to the schema-less NullColumn shape.
    if (poolAbsent(pool)) return undefined;

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
   * @noRailsEquivalent Rails' only accessor, `columns_hash(pool, table)`,
   * may block on a checkout; these callers are Rails-sync and cannot await.
   * See above.
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
   * @noRailsEquivalent Rails' `data_source_exists?(pool, name)` blocks on
   * the query; `cachedTableExists` is sync and cannot await. See above.
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
   * @noRailsEquivalent Rails' `primary_keys(pool, table)` blocks on the
   * query; `Model.primaryKey` is sync and cannot await. See above.
   */
  getCachedPrimaryKeys(tableName: string): string | string[] | null | undefined {
    if (this._primaryKeys.has(tableName)) return this._primaryKeys.get(tableName);
    const cols = this._columns.get(tableName);
    if (!cols) return undefined;
    // Composite-PK ordering follows reflected column order. That matches the
    // constraint order for the canonical fixtures; a table whose PK columns are
    // declared out of column order would need the async `primaryKeys` query
    // (which sorts by the constraint's key ordinal) to disambiguate.
    const pkCols = cols.filter((c) => c.primaryKey).map((c) => c.name);
    if (pkCols.length === 0) return undefined;
    return pkCols.length === 1 ? pkCols[0] : pkCols;
  }

  async indexes(pool: unknown, tableName: string): Promise<unknown[]> {
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

  /**
   * Begin (or reset) a recording window. Subsequent
   * `clearDataSourceCacheBang` calls record their table name until
   * {@link takeTouchedTables} is called. Test-harness only.
   *
   * @internal
   *
   * @noRailsEquivalent Test-harness ledger. Rails re-reflects from a live
   * blocking connection at fixture teardown and needs no record of what was
   * cleared.
   */
  recordTouchedTables(): void {
    this._touchedTables = new Set();
  }

  /**
   * Return the tables touched since the last {@link recordTouchedTables} and
   * close the recording window. Test-harness only.
   *
   * @internal
   *
   * @noRailsEquivalent Test-harness ledger, closing the window opened by
   * `recordTouchedTables`. No Rails analogue, for the same reason.
   */
  takeTouchedTables(): Set<string> {
    const touched = this._touchedTables ?? new Set<string>();
    this._touchedTables = null;
    return touched;
  }

  // Rails: clear_data_source_cache!(_connection, name)
  clearDataSourceCacheBang(_connection: unknown, name: string): void {
    this._touchedTables?.add(name);
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
   * That is exactly why the one production caller cannot use `add()`: it has no
   * pool. `AbstractAdapter#columnForAttribute`'s bare-adapter branch
   * (`abstract-adapter.ts`, the `poolAbsent(this.pool)` fallback) runs on a
   * standalone adapter, where `add()` and the `columnsHash` DB fallback both
   * bail on the null-pool guard. It calls the adapter's own `columns()`
   * directly and seeds the result here, then reads it straight back via
   * {@link getCachedColumnsHash}.
   *
   * Also warms `_dataSourceExists` — a table whose columns just came back
   * demonstrably exists — which is what lets the sync readers above answer
   * without a query.
   *
   * @noRailsEquivalent Rails populates only via `add(pool, table_name)`,
   * which needs a pool; the one caller is the bare-adapter path that has
   * none. See above.
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
   * Sync counterpart of {@link setColumns} for the authoritative primary key.
   * Rails has no sync writer here either — `add(pool, table_name)` runs the
   * `primary_keys` query itself behind `pool.with_connection`.
   *
   * @internal Test-harness seeding only — it has no production caller. It
   * exists because the ported `SchemaCache` tests (`test_clearing`,
   * `test_marshal_dump_and_load`, `test_clear_data_source_cache`, and the
   * primary-key-reconciliation cases) drive a pool-less `SchemaCache`, where
   * Rails' tests drive a live `@cache` bound to a real connection and let
   * `add` / `primary_keys` warm the map for them. Production warms
   * `_primaryKeys` through the async `primaryKeys` query instead, which is
   * what {@link getCachedPrimaryKeys} then reads back synchronously.
   *
   * Order-independent with {@link setColumns}: whichever lands second runs
   * {@link reconcilePrimaryKeyFlags}, so the authoritative key always wins over
   * a column-reflected flag.
   *
   * @noRailsEquivalent Test-harness seeding, no production caller: Rails'
   * tests let the blocking `add` / `primary_keys` warm the map, the trails
   * ports run pool-less. See above.
   */
  setPrimaryKeys(tableName: string, pk: string | string[] | null): void {
    this._primaryKeys.set(tableName, pk);
    const cols = this._columns.get(tableName);
    if (cols) this.reconcilePrimaryKeyFlags(tableName, cols);
  }

  /**
   * Clear per-column `primaryKey` flags that the authoritative `_primaryKeys`
   * cache contradicts. This is a general safety net for any adapter whose
   * `columns()` could over-report a primary flag, reconciled query-free against
   * `_primaryKeys` (which `add()` warms via the authoritative
   * `SHOW KEYS ... 'PRIMARY'` / key_column_usage query before `columns()`).
   * Called from both `setColumns` and `setPrimaryKeys` so the correction is
   * independent of which warms first.
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

  /**
   * Sync writer for the data-source-existence map, completing the
   * {@link setColumns} / {@link setPrimaryKeys} trio. Rails populates this only
   * as a side effect of `data_source_exists?(pool, name)`, which blocks on the
   * query.
   *
   * @internal Test-harness seeding only — like {@link setPrimaryKeys} it has no
   * production caller. Rails' `SchemaCache` tests (`test_data_source_exist`,
   * `#columns_hash? is not populated by #data_source_exists?`,
   * `schema_cache_test.rb:324`, `:347`) drive a live `@cache` bound to a real
   * connection, so the blocking `data_source_exists?` warms the map for them;
   * the trails ports run pool-less and seed it through this writer instead.
   * Production warming goes through {@link setColumns} (which sets `true` for a
   * table whose columns just came back) or the async `dataSourceExists` query.
   *
   * @noRailsEquivalent Test-harness seeding, no production caller: Rails'
   * tests let the blocking `data_source_exists?` warm the map, the trails
   * ports run pool-less. See above.
   */
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
    this._indexes = new Map(Object.entries((indexes as Record<string, unknown[]>) ?? {}));

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
        return tables.filter((t) => !this.isIgnoredTable(t));
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
   * @noRailsEquivalent Opt-in eager DB warming. Rails has only
   * `lazily_load_schema_cache` (a committed dump) because its sync
   * accessors can fall back on blocking reflection; trails' cannot. See
   * above.
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
   *
   * @noRailsEquivalent trails-only composite of Rails'
   * `SchemaReflection#load!` and `SchemaCache#add_all`; Rails has no
   * `load_all!`. See above.
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
   *
   * @noRailsEquivalent Sync, non-loading peek. Rails' `SchemaReflection`
   * needs none because every accessor can block on `cache(pool)`. See
   * above.
   */
  get loadedCache(): SchemaCache | null {
    return this._cache;
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
    const freshCache = this.emptyCache();
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
  if (Array.isArray(value)) return value.map((v) => deepDeduplicate(v)) as unknown as T;
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
