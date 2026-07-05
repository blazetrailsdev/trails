import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

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
  /**
   * Sort order, mirroring Rails' `t.index order:`. A scalar (`"desc"`) applies
   * to every column; a per-column map (`{ rating: "desc" }`) targets one. Only
   * emitted where the adapter supports index sort order (all three do); the
   * dumper collapses a uniform map back to the scalar Rails form.
   */
  order?: string | Record<string, string>;
  /**
   * Sub-part prefix length, mirroring Rails' `t.index length:`. Scalar or
   * per-column map. MySQL-only DDL — other adapters drop the option (matching
   * Rails' `quoted_columns_for_index`).
   */
  length?: number | Record<string, number>;
  /**
   * Emit a `NULLS NOT DISTINCT` unique index (Rails `nulls_not_distinct:`).
   * PostgreSQL ≥ 15 only; unsupported adapters drop the clause.
   */
  nullsNotDistinct?: boolean;
  /** Index access method, mirroring Rails' `t.index using:` (e.g. `"btree"`). */
  using?: string;
  /** Index type keyword, mirroring Rails' `t.index type:` (e.g. MySQL `"fulltext"`). */
  type?: string;
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
 * The `createTable({ id: { type } })` value for a single-column serial PK,
 * preserving the declared INTEGER width across adapters:
 *   - PG: `integer` → `serial` (INT4), `big_integer` → `bigserial` (INT8).
 *   - MySQL: `integer` → INT, `big_integer` → BIGINT (both AUTO_INCREMENT).
 *   - SQLite: always `integer` — only `INTEGER PRIMARY KEY` aliases the rowid,
 *     so a `bigint` declaration would lose auto-increment.
 *
 * @internal
 */
export function serialIdType(spec: ColumnSpec | undefined, adapterName: string): string {
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

/**
 * Whether the adapter supports expression indexes. The getter reads
 * `databaseVersion` synchronously (SQLite ≥ 3.9, MySQL ≥ 8.0.13, never MariaDB),
 * which throws before the version cache is populated — so prime it via the
 * async `getDatabaseVersion()` first. A missing/throwing getter is treated as
 * unsupported, so we skip the expression index rather than emit invalid DDL.
 *
 * @internal
 */
export async function supportsExpressionIndex(adapter: DatabaseAdapter): Promise<boolean> {
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
export const COLUMN_TYPE_MAP_PG: Record<AnyPrimitiveColumnSpec, string> = {
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

// MySQL/MariaDB accepts native DATETIME/DATE/TIME/JSON columns. AR serializes
// Temporal.PlainTime values for TIME columns, so time attributes round-trip
// with the correct type. Without native TIME, an introspected TIME-as-VARCHAR
// resolves to StringType and multiparameter time assignment yields a raw string
// (same problem that "date: string" caused before PR #4141 fixed it for DATE).
// json maps to the native MySQL JSON column: mysql2 emits `json` via
// MysqlSchemaCreation#typeToSql and registers `json` -> JsonType in its type
// map (abstract-mysql-adapter.ts), so introspected canonical json columns
// (e.g. admin_users.json_options) resolve to JsonType and round-trip on
// mysql:8 — the same StringType deviation that afflicted DATE/TIME. `binary`
// routes through the native BLOB mapping so encrypted binary attributes
// round-trip (BinaryData-wrapped ciphertext needs a binary column). PG-only
// types are deliberately absent: defineSchema throws when one is used against
// MySQL or SQLite.
/** @internal */
export const COLUMN_TYPE_MAP_MYSQL: Record<PrimitiveColumnSpec, string> = {
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
};

// SQLite has type affinity rules but accepts native datetime/date/time/json
// type names — they store as TEXT/BLOB under the hood while preserving the
// declared type for schema reflection (so the type registry resolves to
// SQLiteDateTimeType/DateType/TimeType/JsonType on load). datetime/date/time/
// json all now inherit the native names from COLUMN_TYPE_MAP_MYSQL; `binary`
// inherits the BLOB mapping likewise.
/** @internal */
export const COLUMN_TYPE_MAP_SQLITE: Record<PrimitiveColumnSpec, string> = {
  ...COLUMN_TYPE_MAP_MYSQL,
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
