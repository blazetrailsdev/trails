import type { DatabaseAdapter } from "../adapter.js";
import type { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";

export type PrimitiveColumnSpec =
  | "string"
  | "text"
  | "integer"
  | "big_integer"
  | "float"
  | "decimal"
  | "boolean"
  | "datetime"
  | "date"
  | "time"
  | "binary"
  | "json";

/**
 * PostgreSQL-only column types. Using one of these against a non-PG adapter
 * throws — there is no useful fallback (e.g. SQLite has no HSTORE), and
 * silently swapping in a different type would let test schemas drift away
 * from the production DDL they're meant to mirror.
 */
export type PgPrimitiveColumnSpec = "citext" | "hstore" | "uuid" | "interval" | "oid";

export type AnyPrimitiveColumnSpec = PrimitiveColumnSpec | PgPrimitiveColumnSpec;

export type ColumnSpec =
  | AnyPrimitiveColumnSpec
  | {
      type: AnyPrimitiveColumnSpec;
      limit?: number;
      /**
       * Decimal/numeric total digits (mirrors Rails' `precision:`).
       * Pass `null` to suppress the MySQL auto-precision-6 upgrade and emit a
       * bare `DATETIME` column — required when pairing with a `DEFAULT
       * CURRENT_TIMESTAMP` function default (mirrors Rails `precision: nil`).
       */
      precision?: number | null;
      /** Decimal/numeric fractional digits (mirrors Rails' `scale:`). */
      scale?: number;
      references?: string;
      null?: boolean;
      default?: unknown;
      /** SQL expression emitted verbatim as `DEFAULT <expr>` (e.g. `"CURRENT_TIMESTAMP"`). */
      defaultFunction?: string;
      primary?: boolean;
      /**
       * PostgreSQL array column (`INTEGER[]`, `TEXT[]`, etc.). PG-only;
       * setting `array: true` against a non-PG adapter throws.
       */
      array?: boolean;
    };

/**
 * A table-level index, mirroring Rails' `t.index`. `columns` is a column name,
 * a list of names, or a raw expression string (e.g. `"(lower(external_id))"`)
 * kept verbatim with the name derived from its `\w+` runs. Pass `where` for a
 * partial index.
 */
export interface IndexSpec {
  columns: string | string[];
  unique?: boolean;
  where?: string;
  name?: string;
}

export interface WrappedTableSchema {
  columns: Record<string, ColumnSpec>;
  /**
   * Table-level primary key. `string[]` builds a composite PK constraint
   * over the listed columns (which are also marked NOT NULL, matching
   * Rails semantics — SQLite otherwise lets NULLs slip through composite
   * PKs). `false` builds the table without a PK. A single-string form is
   * intentionally not supported — pass `[name]` for a single-column
   * non-`id` primary key. Omit to keep the default auto-increment `id`.
   *
   * Together with {@link indexes}, this disambiguates the wrapper shape from
   * the legacy `Record<colName, ColumnSpec>` shape: a wrapper carries `columns`
   * plus at least one of `primaryKey` / `indexes`.
   */
  primaryKey?: string[] | false;
  /**
   * Table-level indexes, emitted via `add_index` after the table is created
   * (mirrors Rails' `t.index`). Names default to Rails' `index_<table>_on_<cols>`.
   */
  indexes?: IndexSpec[];
}
export type TableSchema = Record<string, ColumnSpec> | WrappedTableSchema;
export type Schema = Record<string, TableSchema>;

export interface DefineSchemaOpts {
  dropExisting?: boolean;
}

/** @internal */
const WRAPPER_KEYS = new Set(["columns", "primaryKey", "indexes"]);

/** @internal */
export function isWrappedSchema(table: TableSchema): table is WrappedTableSchema {
  // The wrapper and the legacy `Record<colName, ColumnSpec>` shape both
  // permit a key called `columns`, so discrimination needs an unambiguous
  // signal. We use the presence of `primaryKey` — the wrapper's sole
  // purpose is to set a table-level PK, so making it required also
  // collapses the only ambiguity: a legacy single-column table
  // `{ columns: { type: "string" } }` is structurally identical to a
  // wrapper with one column named `type`, but it cannot have `primaryKey`,
  // so it stays unambiguously legacy.
  //
  // Rule:
  //   1. `columns` is present and an object map.
  //   2. At least one of `primaryKey` / `indexes` is present (the
  //      disambiguator from the legacy shape).
  //   3. Any present `primaryKey` / `indexes` is wrapper-shaped.
  //   4. No other top-level keys.
  if (!table || typeof table !== "object") return false;
  const candidate = (table as { columns?: unknown }).columns;
  if (!candidate || typeof candidate !== "object") return false;
  const hasPk = "primaryKey" in table;
  const hasIndexes = "indexes" in table;
  if (!hasPk && !hasIndexes) return false;
  if (hasPk) {
    const pk = (table as { primaryKey?: unknown }).primaryKey;
    // Validate primaryKey is the wrapper-shaped value; otherwise this is a
    // legacy table that happens to have a column called `primaryKey`.
    if (pk !== false && !Array.isArray(pk)) return false;
    if (Array.isArray(pk) && !pk.every((v) => typeof v === "string")) return false;
  }
  if (hasIndexes && !Array.isArray((table as { indexes?: unknown }).indexes)) return false;
  for (const key of Object.keys(table)) {
    if (!WRAPPER_KEYS.has(key)) return false;
  }
  return true;
}

/**
 * True for an `integer` or `big_integer` column spec — the two types that map
 * to an auto-increment serial/identity PK when declared `primaryKey: ["col"]`.
 * Use {@link serialIdType} to pick the per-adapter id type that preserves the
 * declared width (INT4 vs INT8) instead of letting `primary_key` widen to
 * BIGINT everywhere.
 *
 * @internal
 */
function isIntegerSpec(spec: ColumnSpec | undefined): boolean {
  if (spec === undefined) return false;
  const type = typeof spec === "string" ? spec : spec.type;
  return type === "integer" || type === "big_integer";
}

/**
 * The `createTable({ id: { type } })` value for a single-column serial PK,
 * preserving the declared INTEGER width across adapters:
 *   - PG: `integer` → `serial` (INT4), `big_integer` → `bigserial` (INT8).
 *   - MySQL: `integer` → INT, `big_integer` → BIGINT (both AUTO_INCREMENT).
 *   - SQLite: always `integer` — only `INTEGER PRIMARY KEY` aliases the rowid,
 *     so a `bigint` declaration would lose auto-increment.
 *
 * @internal
 */
function serialIdType(spec: ColumnSpec | undefined, adapterName: string): string {
  const type = typeof spec === "string" ? spec : spec?.type;
  const isBig = type === "big_integer";
  if (adapterName === "postgres") return isBig ? "bigserial" : "serial";
  if (adapterName === "sqlite") return "integer";
  return isBig ? "bigint" : "integer";
}

/** @internal */
export function columnsOf(table: TableSchema): Record<string, ColumnSpec> {
  return isWrappedSchema(table) ? table.columns : table;
}

/** @internal */
function primaryKeyOf(table: TableSchema): string[] | false | undefined {
  return isWrappedSchema(table) ? table.primaryKey : undefined;
}

/** @internal */
function indexesOf(table: TableSchema): IndexSpec[] {
  return isWrappedSchema(table) ? (table.indexes ?? []) : [];
}

/**
 * Whether the adapter supports expression indexes. The getter reads
 * `databaseVersion` synchronously (SQLite ≥ 3.9, MySQL ≥ 8.0.13, never MariaDB),
 * which throws before the version cache is populated — so prime it via the
 * async `getDatabaseVersion()` first. A missing/throwing getter is treated as
 * unsupported, so we skip the expression index rather than emit invalid DDL.
 *
 * @internal
 */
async function supportsExpressionIndex(adapter: DatabaseAdapter): Promise<boolean> {
  const a = adapter as {
    supportsExpressionIndex?: () => boolean;
    getDatabaseVersion?: () => Promise<unknown>;
  };
  if (typeof a.supportsExpressionIndex !== "function") return false;
  try {
    if (typeof a.getDatabaseVersion === "function") await a.getDatabaseVersion();
    return a.supportsExpressionIndex();
  } catch {
    return false;
  }
}

/** @internal */
function resolveReferences(schema: Schema): string[] {
  const refs = new Map<string, Set<string>>();
  for (const [table, raw] of Object.entries(schema)) {
    refs.set(table, new Set());
    const columns = columnsOf(raw);
    for (const spec of Object.values(columns)) {
      if (typeof spec === "object" && spec.references) {
        if (spec.references in schema && spec.references !== table) {
          refs.get(table)!.add(spec.references);
        }
      }
    }
  }

  const sorted: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(table: string): void {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      throw new Error(`defineSchema: circular reference detected involving table "${table}"`);
    }
    visiting.add(table);
    for (const dep of refs.get(table)!) {
      visit(dep);
    }
    visiting.delete(table);
    visited.add(table);
    sorted.push(table);
  }

  for (const table of Object.keys(schema)) {
    visit(table);
  }
  return sorted;
}

/** @internal */
const COLUMN_TYPE_MAP_PG: Record<AnyPrimitiveColumnSpec, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  big_integer: "bigint",
  float: "float",
  decimal: "decimal",
  boolean: "boolean",
  datetime: "datetime",
  date: "date",
  time: "time",
  binary: "binary",
  json: "json",
  // PG-only types — passed straight through to PostgreSQLAdapter#typeToSql,
  // which routes them via NATIVE_DATABASE_TYPES.
  citext: "citext",
  hstore: "hstore",
  uuid: "uuid",
  interval: "interval",
  oid: "oid",
};

/** @internal */
const PG_ONLY_TYPES = new Set<string>(["citext", "hstore", "uuid", "interval", "oid"]);

// MySQL/MariaDB accepts native DATETIME/DATE/TIME columns. AR serializes
// Temporal.PlainTime values for TIME columns, so time attributes round-trip
// with the correct type. Without native TIME, an introspected TIME-as-VARCHAR
// resolves to StringType and multiparameter time assignment yields a raw string
// (same problem that "date: string" caused before PR #4141 fixed it for DATE).
// json still uses "string" (VARCHAR); `binary` routes through the native BLOB
// mapping so encrypted binary attributes round-trip (BinaryData-wrapped
// ciphertext needs a binary column). PG-only types are deliberately absent:
// defineSchema throws when one is used against MySQL or SQLite.
/** @internal */
const COLUMN_TYPE_MAP_MYSQL: Record<PrimitiveColumnSpec, string> = {
  string: "string",
  text: "text",
  integer: "integer",
  big_integer: "bigint",
  float: "float",
  decimal: "decimal",
  boolean: "boolean",
  datetime: "datetime",
  date: "date",
  time: "time",
  binary: "binary",
  json: "string",
};

// SQLite has type affinity rules but accepts native datetime/date/time/json
// type names — they store as TEXT/BLOB under the hood while preserving the
// declared type for schema reflection (so the type registry resolves to
// SQLiteDateTimeType/DateType/TimeType/JsonType on load). `binary` inherits
// from `COLUMN_TYPE_MAP_MYSQL` (BLOB).
/** @internal */
const COLUMN_TYPE_MAP_SQLITE: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_MYSQL,
  datetime: "datetime",
  date: "date",
  time: "time",
  json: "json",
};

/**
 * Per-database cache of the last-applied normalized table signatures. Lets
 * `defineSchema` skip DDL when an identical schema is requested again —
 * the Phase 6 hoist (`defineSchema` in `beforeAll` instead of `beforeEach`)
 * relies on this being a no-op when nothing changed.
 *
 * Keyed by {@link databaseIdentity} so distinct adapter instances that
 * target the same underlying DB (e.g. multiple pool-leased adapters over
 * one SQLite shared-cache URI or one PG connection URL) share one cache
 * entry. Without this, file A's `defineSchema({foo})` would populate
 * adapter X's cache; file B's adapter Y would see an empty cache and
 * attempt `CREATE TABLE foo` against the live DB.
 *
 * @internal
 */
let _appliedSchemaSignatures = new Map<string, Map<string, string>>();

/**
 * Fallback cache for adapters whose underlying DB cannot be identified
 * by a stringable connection target — notably SQLite `:memory:` (each
 * adapter IS a separate DB) and any adapter that doesn't expose a
 * recognizable config field. WeakMap-keyed so entries vanish when the
 * adapter is GC'd, avoiding unbounded growth across many short-lived
 * adapters.
 *
 * @internal
 */
let _fallbackSchemaSignatures = new WeakMap<DatabaseAdapter, Map<string, string>>();

/**
 * Strip any `user:password@` userinfo from a URL-style connection string
 * so the cache key doesn't retain credentials in heap. Non-URLs (e.g.
 * `host=... dbname=...` key/value form) pass through unchanged — we don't
 * try to parse those.
 *
 * @internal
 */
function _stripUrlCredentials(s: string): string {
  try {
    const u = new URL(s);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return u.toString();
    }
    return s;
  } catch {
    return s;
  }
}

/**
 * Derive a string identity for the underlying database an adapter is
 * connected to, or `null` when no stringable identity is available
 * (callers fall back to the {@link _fallbackSchemaSignatures} WeakMap).
 *
 * Reads private fields by name on purpose — defineSchema is test-only
 * infrastructure and there is no public surface for "which DB are you
 * connected to" on AbstractAdapter today. Strips URL credentials so the
 * cache key doesn't retain `user:password@...` from `PG_TEST_URL` /
 * `MYSQL_TEST_URL`.
 *
 * @internal
 */
function databaseIdentity(adapter: DatabaseAdapter): string | null {
  const real = adapter;
  const a = real as unknown as Record<string, unknown>;
  if (real.adapterName === "sqlite") {
    const fn = a["_filename"];
    if (typeof fn === "string" && fn !== ":memory:" && fn !== "") return `sqlite:${fn}`;
    return null;
  }
  if (real.adapterName === "postgres") {
    const opts = a["_pgClientOptions"] as { connectionString?: unknown } | undefined;
    const cs = opts?.connectionString;
    if (typeof cs === "string" && cs !== "") return `postgres:${_stripUrlCredentials(cs)}`;
    return null;
  }
  if (real.adapterName === "mysql") {
    const pc = a["_poolConfig"] as { uri?: unknown } | undefined;
    if (typeof pc?.uri === "string" && pc.uri !== "")
      return `mysql:${_stripUrlCredentials(pc.uri)}`;
    const db = a["_database"];
    if (typeof db === "string" && db !== "") return `mysql:db=${db}`;
    return null;
  }
  return null;
}

/**
 * Resolve the signature cache for `adapter`, creating it if missing.
 * Adapters with a stringable DB identity share one Map across all
 * sibling adapters pointing at the same DB; the rest get a per-instance
 * WeakMap entry (auto-GC'd with the adapter).
 *
 * @internal
 */
function _cacheFor(adapter: DatabaseAdapter, create: boolean): Map<string, string> | undefined {
  const key = databaseIdentity(adapter);
  if (key !== null) {
    let cache = _appliedSchemaSignatures.get(key);
    if (!cache && create) {
      cache = new Map();
      _appliedSchemaSignatures.set(key, cache);
    }
    return cache;
  }
  const real = adapter;
  let cache = _fallbackSchemaSignatures.get(real);
  if (!cache && create) {
    cache = new Map();
    _fallbackSchemaSignatures.set(real, cache);
  }
  return cache;
}

/**
 * Snapshot the signature cache for the database the adapter targets
 * (resolved via {@link databaseIdentity}). Paired with
 * {@link _restoreAppliedSchemaSignaturesForAdapter} so
 * `withTransactionalFixtures` can preserve entries created in a `beforeAll`
 * (outside any rolled-back test transaction) while discarding entries
 * added inside an `it()` body (whose DDL was rolled back at the DB).
 *
 * Wiping the entire cache on rollback would make a follow-up
 * `defineSchema(adapter, sameSpec)` think the still-existing `beforeAll`
 * table needs recreating — and for raw adapters (no `tables` Set), it
 * would attempt `CREATE TABLE` over the live table and fail.
 *
 * @internal
 */
export function _snapshotAppliedSchemaSignaturesForAdapter(
  adapter: DatabaseAdapter,
): Map<string, string> {
  const cache = _cacheFor(adapter, false);
  return cache ? new Map(cache) : new Map();
}

/** @internal */
export function _restoreAppliedSchemaSignaturesForAdapter(
  adapter: DatabaseAdapter,
  snapshot: Map<string, string>,
): void {
  const key = databaseIdentity(adapter);
  if (key !== null) {
    _appliedSchemaSignatures.set(key, new Map(snapshot));
  } else {
    _fallbackSchemaSignatures.set(adapter, new Map(snapshot));
  }
}

/**
 * Drop the cached signatures for the database the given adapter targets
 * (resolved via {@link databaseIdentity}, so this also clears entries for
 * any sibling adapter pointing at the same DB), or for every database
 * when no argument is given. Paired with `resetTestAdapterState` so the signature
 * cache stays synchronized with `dropAllTables`: a shared adapter — which
 * survives across tests under the sidecar shape — would otherwise hold
 * signatures for tables that no longer exist, making a subsequent
 * `defineSchema(sameSpec)` no-op over a missing table.
 *
 * @internal
 */
export function clearAppliedSchemaSignatures(adapter?: DatabaseAdapter): void {
  if (adapter) {
    const key = databaseIdentity(adapter);
    if (key !== null) {
      _appliedSchemaSignatures.delete(key);
    } else {
      _fallbackSchemaSignatures.delete(adapter);
    }
  } else {
    _appliedSchemaSignatures = new Map();
    _fallbackSchemaSignatures = new WeakMap();
  }
}

/**
 * Reconcile the signature cache against the set of tables a caller actually
 * dropped: delete only those table entries, leaving the rest of the cache
 * intact. This is the surgical alternative to {@link clearAppliedSchemaSignatures}
 * for `dropAllTables` — a blanket wipe forces the next file's `defineSchema`
 * down the Path-C signature-mismatch drop for every table (re-dropping +
 * recreating tables whose shape never changed), whereas deleting only the
 * dropped tables' entries keeps cache hits for any table left untouched.
 *
 * No-op for tables that have no cache entry, and a no-op overall when no cache
 * exists for the adapter's database yet.
 *
 * @internal
 */
export function clearAppliedSchemaSignaturesForTables(
  adapter: DatabaseAdapter,
  tables: Iterable<string>,
): void {
  const cache = _cacheFor(adapter, false);
  if (!cache) return;
  for (const table of tables) cache.delete(table);
}

/** @internal */
function getCache(adapter: DatabaseAdapter): Map<string, string> {
  return _cacheFor(adapter, true)!;
}

/** @internal */
function tableSignature(table: TableSchema): string {
  const columns = columnsOf(table);
  const pk = primaryKeyOf(table);
  const sortedCols: Record<string, ColumnSpec> = {};
  for (const k of Object.keys(columns).sort()) sortedCols[k] = columns[k];
  return JSON.stringify({ columns: sortedCols, primaryKey: pk ?? null, indexes: indexesOf(table) });
}

/**
 * Pre-populate the signature cache for `schema` against `adapter` WITHOUT
 * issuing any DDL. Used by the sqlite template-clone path (Phase 0 spike):
 * the worker DB is a file copy of a pre-built template, so the canonical
 * tables already exist physically. Seeding their signatures converts the
 * per-file `defineSchema(TEST_SCHEMA)` into a cache-hit (no CREATEs), while
 * `defineSchema`'s `dataSourceExists` guard still recreates any table a
 * prior file's `dropAllTables` removed from the shared worker file.
 *
 * @internal
 */
export function seedSchemaSignatures(adapter: DatabaseAdapter, schema: Schema): void {
  const cache = getCache(adapter);
  for (const [table, raw] of Object.entries(schema)) {
    cache.set(table, tableSignature(raw));
  }
}

export async function defineSchema(schema: Schema, opts?: DefineSchemaOpts): Promise<void>;
export async function defineSchema(
  adapter: DatabaseAdapter,
  schema: Schema,
  opts?: DefineSchemaOpts,
): Promise<void>;
export async function defineSchema(
  adapterOrSchema: DatabaseAdapter | Schema,
  schemaOrOpts?: Schema | DefineSchemaOpts,
  opts?: DefineSchemaOpts,
): Promise<void> {
  let adapter: DatabaseAdapter;
  let schema: Schema;
  let resolvedOpts: DefineSchemaOpts | undefined;

  // Discriminate: if the first arg has an `adapterName` string property it's
  // a DatabaseAdapter; otherwise it's a Schema (plain object with table names).
  // Only the model-facing implicit form (`defineSchema(schema)` → the live
  // `Base.connection`) warms the schema cache. The explicit-adapter form is
  // used by low-level adapter tests that drive raw/sidecar adapters directly
  // and do not want (or safely support) eager column introspection.
  let warm = false;
  if (
    adapterOrSchema !== null &&
    typeof adapterOrSchema === "object" &&
    typeof (adapterOrSchema as DatabaseAdapter).adapterName === "string"
  ) {
    adapter = adapterOrSchema as DatabaseAdapter;
    schema = schemaOrOpts as Schema;
    resolvedOpts = opts;
  } else {
    const { Base } = await import("../base.js");
    adapter = Base.connection;
    schema = adapterOrSchema as Schema;
    resolvedOpts = schemaOrOpts as DefineSchemaOpts | undefined;
    warm = true;
  }

  return _defineSchemaImpl(adapter, schema, resolvedOpts, warm);
}

async function _resetAutoIncrement(
  adapter: DatabaseAdapter,
  _ss: SchemaStatements,
  table: string,
  // Defaults to "id" but accepts a custom-named serial PK (e.g. `movieid`):
  // those columns are now SERIAL too, so the persists-across-files fast path
  // must reset their sequence as well or a later naked `create()` could draw a
  // value a prior file's explicit-id fixture already advanced past. MySQL's
  // table-wide AUTO_INCREMENT reset and SQLite's sqlite_sequence row are keyed
  // by table, so only PostgreSQL needs the column name.
  pkColumn = "id",
): Promise<void> {
  try {
    const qt = adapter.quoteTableName(table);
    switch (adapter.adapterName) {
      case "postgres":
        await adapter.executeMutation(`SELECT setval(pg_get_serial_sequence($1, $2), 1, false)`, [
          table,
          pkColumn,
        ]);
        break;
      case "mysql":
        await adapter.executeMutation(`ALTER TABLE ${qt} AUTO_INCREMENT = 1`);
        break;
      case "sqlite":
        await adapter.executeMutation(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
        break;
    }
  } catch {
    // Table may lack an auto-increment column (e.g. composite PK).
  }
}

/**
 * Eagerly reflect a freshly-defined table's columns into the adapter's schema
 * cache, so `schemaCache.isCached(table)` is true before any query runs.
 *
 * This is the test/boot analogue of Rails loading `db/schema_cache.yml` after
 * the schema is defined: a synchronous `Model.columnNames()` / `columnsHash()`
 * on a connected model can then take the cached, DB-sourced branch instead of
 * synthesizing columns from `_attributeDefinitions`. The synthesized branch
 * cannot tell a virtual `attribute()` (no backing column) from a real column on
 * a cold cache, so warming here is what makes virtual attributes fall out of the
 * class-level column introspection without a prior `await ensureSchemaLoaded()`.
 *
 * Best-effort: a no-op for raw adapters without a pool (mirrors the
 * `dataSourceExists` guard above) and swallows reflection failures.
 *
 * @internal
 */
async function _warmSchemaCache(adapter: DatabaseAdapter, table: string): Promise<void> {
  const sc = adapter.schemaCache;
  const pool = adapter.pool ?? null;
  // `!sc` is required, not dead: the `DatabaseAdapter` interface types
  // `schemaCache` as optional (`adapter.ts`), even though AbstractAdapter's
  // getter always returns one. Dropping it fails typecheck (TS18048).
  if (!sc || pool === null) return;
  try {
    // `SchemaCache.columnsHash` short-circuits on `_columnsHash.has(table)`, so
    // an already-warm table is a no-op (no query); otherwise it reflects and
    // populates exactly the `_columnsHash` that `model-schema.ts` columnsHash()
    // reads. A guard on `isCached()` would check `_columns`, not `_columnsHash`,
    // and could skip a warm the read path still needs.
    await sc.columnsHash(pool, table);
  } catch {
    // Reflection is best-effort — a missing/locked table simply leaves the
    // cache cold, falling back to the synthesized columnsHash branch.
  }
}

async function _defineSchemaImpl(
  adapter: DatabaseAdapter,
  schema: Schema,
  opts?: DefineSchemaOpts,
  warm = false,
): Promise<void> {
  const { SchemaStatements } = await import("../connection-adapters/abstract/schema-statements.js");
  const ss = adapter.schemaStatements ? adapter.schemaStatements() : new SchemaStatements(adapter);
  const order = resolveReferences(schema);
  const typeMap =
    adapter.adapterName === "postgres"
      ? COLUMN_TYPE_MAP_PG
      : adapter.adapterName === "mysql"
        ? COLUMN_TYPE_MAP_MYSQL
        : COLUMN_TYPE_MAP_SQLITE;

  const cache = getCache(adapter);

  // Track whether any DROP/CREATE DDL ran so we can deallocate the
  // connection's prepared statements at the end, mirroring Rails'
  // `create_table`/`drop_table` calling `clear_cache!`. Without this,
  // PostgreSQL raises `cached plan must not change result type` (0A000) on
  // the first query that reuses a prepared-statement plan cached against the
  // table's prior shape, aborting the transaction.
  let issuedDdl = false;

  if (opts?.dropExisting) {
    for (const table of [...order].reverse()) {
      await ss.dropTable(table, { ifExists: true });
      cache.delete(table);
      issuedDdl = true;
    }
  }

  for (const table of order) {
    const raw = schema[table];
    const columns = columnsOf(raw);
    const pk = primaryKeyOf(raw);
    // A single-column integer PK declared via `primaryKey: ["col"]` mirrors
    // Rails' `t.primary_key :col` (movieid/key_number/monkeyID), which makes
    // the column a serial/identity. Emit it via the string `primaryKey` form
    // so the adapter generates the auto-increment sequence — the array form
    // would create a plain integer PK with no sequence, and on PostgreSQL an
    // INSERT that omits the PK then trips a NOT NULL violation.
    const serialPkName =
      Array.isArray(pk) && pk.length === 1 && isIntegerSpec(columns[pk[0]]) ? pk[0] : null;
    const newSig = tableSignature(raw);
    const cachedSig = cache.get(table);
    const sc = adapter.schemaCache;
    const pool = adapter.pool ?? null;
    const stillExists =
      sc && pool !== null
        ? ((await sc.dataSourceExists(pool, table)) ?? cachedSig !== undefined)
        : cachedSig !== undefined;
    if (cachedSig === newSig && stillExists) {
      // D-Z: table persists across files. Reset auto-increment so tests
      // that depend on id=1 (e.g. toParam, findEach start/finish) work. The
      // default `id` PK and a custom-named single integer PK are both SERIAL;
      // composite (string[]) and id-less (false) tables have no sequence.
      if (pk === undefined) {
        await _resetAutoIncrement(adapter, ss, table);
      } else if (serialPkName !== null) {
        await _resetAutoIncrement(adapter, ss, table, serialPkName);
      }
      if (warm) await _warmSchemaCache(adapter, table);
      continue;
    }
    // D-Z: always drop the specific table before recreating. Together with
    // dropAllTables clearing the signature cache, this eliminates the need
    // for afterAll(dropAllTables) in useHandlerTransactionalFixtures.
    await ss.dropTable(table, { ifExists: true });
    issuedDdl = true;
    const createOpts: { id?: boolean | { type: string }; primaryKey?: string | string[] } = {};
    // A single-column integer PK is emitted INLINE at its declared offset in the
    // column loop (below) rather than via createTable's string-`primaryKey`
    // option, which always hoists the PK column first. Inline emission lets the
    // PK sit at its Rails-declared position — e.g. `auto_id_tests` declares
    // `t.primary_key :auto_id` LAST, so the reflected column order must keep it
    // last (Rails persistence_test `test_populates_autoincremented_id_pk_...`).
    // `id: false` suppresses the auto-generated `id` column.
    if (pk === false) createOpts.id = false;
    else if (serialPkName !== null) {
      createOpts.id = false;
    } else if (Array.isArray(pk)) {
      createOpts.primaryKey = pk;
      createOpts.id = false;
    }
    const compositePkCols = Array.isArray(pk) && serialPkName === null ? new Set(pk) : null;
    await ss.createTable(table, createOpts, (t) => {
      for (const [colName, spec] of Object.entries(columns)) {
        // Emit the single-column integer PK inline at its declared offset.
        // Preserve the declared INTEGER width across adapters. The default
        // `primary_key` type widens to BIGINT on MySQL, which breaks integer FK
        // references (e.g. fk_test_has_fk.fk_id → fk_test_has_pk.pk_id, errno 150).
        // PG `serial`/`bigserial` → INT4/INT8 serial; MySQL `integer`/`bigint` and
        // SQLite `integer` → auto-increment. (`integer` does NOT auto-increment on
        // PG, hence the per-adapter split.)
        if (colName === serialPkName) {
          t.column(colName, serialIdType(columns[colName], adapter.adapterName), {
            primaryKey: true,
          });
          continue;
        }
        const primitive: AnyPrimitiveColumnSpec = typeof spec === "string" ? spec : spec.type;
        const isArray = typeof spec === "object" && spec.array === true;
        if (PG_ONLY_TYPES.has(primitive) && adapter.adapterName !== "postgres") {
          throw new Error(
            `defineSchema: column "${table}.${colName}" uses PostgreSQL-only type "${primitive}", but adapter is "${adapter.adapterName}". PG-only types: citext, hstore, uuid, interval, oid.`,
          );
        }
        if (isArray && adapter.adapterName !== "postgres") {
          throw new Error(
            `defineSchema: column "${table}.${colName}" uses array:true, which is PostgreSQL-only, but adapter is "${adapter.adapterName}".`,
          );
        }
        const arType = (typeMap as Record<string, string | undefined>)[primitive] ?? primitive;
        const options: Record<string, unknown> = {};
        if (typeof spec === "object") {
          if (spec.limit !== undefined) options["limit"] = spec.limit;
          if (spec.precision !== undefined) options["precision"] = spec.precision;
          if (spec.scale !== undefined) options["scale"] = spec.scale;
          if (spec.null !== undefined) options["null"] = spec.null;
          if (spec.defaultFunction !== undefined) {
            const fn = spec.defaultFunction;
            options["default"] = () => fn;
          } else if (spec.default !== undefined) {
            options["default"] = spec.default;
          }
          if (spec.array !== undefined) options["array"] = spec.array;
          if (spec.primary && pk === undefined) {
            options["primaryKey"] = true;
          }
        }
        // Columns participating in a composite PK are NOT NULL, matching
        // Rails semantics. SQLite otherwise lets NULLs into composite-PK
        // columns (long-known quirk), which would let invalid fixtures
        // persist.
        if (compositePkCols?.has(colName)) {
          options["null"] = false;
        }
        // MySQL DATETIME without precision = DATETIME(0), which rejects fractional
        // seconds. Default to DATETIME(6) so test schemas accept microseconds.
        // Only fires when precision is omitted entirely (undefined); an explicit
        // `precision: null` opts out of the upgrade and emits bare DATETIME —
        // required when the column carries a DEFAULT CURRENT_TIMESTAMP function
        // (mirrors Rails `precision: nil, default: -> { "CURRENT_TIMESTAMP" }`).
        if (
          adapter.adapterName === "mysql" &&
          primitive === "datetime" &&
          options["precision"] === undefined
        ) {
          options["precision"] = 6;
        }
        t.column(colName, arType, options);
      }
    });
    for (const index of indexesOf(raw)) {
      // An expression index (Rails `t.index "(...)"`) is a string column with
      // non-word characters. Rails' schema.rb gates these on
      // `supports_expression_index?`, so skip them on adapters that lack it
      // rather than emitting invalid DDL. (Partial-index `where` needs no gate
      // here — the SchemaCreation visitor drops it where unsupported, mirroring
      // Rails schema_creation.rb.)
      const isExpression = typeof index.columns === "string" && /\W/.test(index.columns);
      if (isExpression && !(await supportsExpressionIndex(adapter))) continue;
      await ss.addIndex(table, index.columns, {
        unique: index.unique,
        where: index.where,
        name: index.name,
      });
    }
    cache.set(table, newSig);
    if (warm) await _warmSchemaCache(adapter, table);
  }

  if (issuedDdl) {
    adapter.clearCacheBang?.();
  }
}
