import type { DatabaseAdapter } from "../adapter.js";
import { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";
import { setUseTransactionalTests } from "./use-transactional-tests.js";

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
      references?: string;
      null?: boolean;
      default?: unknown;
      primary?: boolean;
      /**
       * PostgreSQL array column (`INTEGER[]`, `TEXT[]`, etc.). PG-only;
       * setting `array: true` against a non-PG adapter throws.
       */
      array?: boolean;
    };

export interface WrappedTableSchema {
  columns: Record<string, ColumnSpec>;
  /**
   * Table-level primary key. `string[]` builds a composite PK constraint
   * over the listed columns (which are also marked NOT NULL, matching
   * Rails semantics — SQLite otherwise lets NULLs slip through composite
   * PKs). `false` builds the table without a PK. A single-string form is
   * intentionally not supported — pass `[name]` for a single-column
   * non-`id` primary key.
   *
   * Required: this is the disambiguator that separates the wrapper shape
   * from the legacy `Record<colName, ColumnSpec>` shape. Without it, a
   * legacy single-column table whose column happens to be named `columns`
   * (with an object ColumnSpec) is structurally indistinguishable from a
   * wrapper. If you don't need to override the PK, use the legacy shape.
   */
  primaryKey: string[] | false;
}
export type TableSchema = Record<string, ColumnSpec> | WrappedTableSchema;
export type Schema = Record<string, TableSchema>;

export interface DefineSchemaOpts {
  dropExisting?: boolean;
  /**
   * Mirror of Rails' `self.use_transactional_tests = false`. When `false`,
   * the global per-test `BEGIN`/`ROLLBACK` wrap (Phase 6.3) is bypassed for
   * tests using this adapter. Required for tests that mutate schema
   * mid-body (migration tests, schema-dump tests, DDL tests) — DDL inside a
   * transaction either commits implicitly (MySQL) or breaks rollback
   * semantics (PG/SQLite savepoint interactions). Defaults to `true`.
   */
  useTransactionalTests?: boolean;
}

/** @internal */
const WRAPPER_KEYS = new Set(["columns", "primaryKey"]);

/** @internal */
function isWrappedSchema(table: TableSchema): table is WrappedTableSchema {
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
  //   1. `primaryKey` is present.
  //   2. `columns` is present and an object map.
  //   3. No other top-level keys.
  if (!table || typeof table !== "object") return false;
  if (!("primaryKey" in table)) return false;
  const pk = (table as { primaryKey?: unknown }).primaryKey;
  // Validate primaryKey is the wrapper-shaped value; otherwise this is a
  // legacy table that happens to have a column called `primaryKey`.
  if (pk !== false && !Array.isArray(pk)) return false;
  if (Array.isArray(pk) && !pk.every((v) => typeof v === "string")) return false;
  const candidate = (table as { columns?: unknown }).columns;
  if (!candidate || typeof candidate !== "object") return false;
  for (const key of Object.keys(table)) {
    if (!WRAPPER_KEYS.has(key)) return false;
  }
  return true;
}

/** @internal */
function columnsOf(table: TableSchema): Record<string, ColumnSpec> {
  return isWrappedSchema(table) ? table.columns : (table as Record<string, ColumnSpec>);
}

/** @internal */
function primaryKeyOf(table: TableSchema): string[] | false | undefined {
  return isWrappedSchema(table) ? table.primaryKey : undefined;
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

// MySQL/MariaDB accepts native DATETIME columns with "YYYY-MM-DD HH:MM:SS" format
// (no T/Z suffix). AR DateTime.serialize now emits this format, so datetime can
// use the native column type. date/time/json still use "string" (VARCHAR);
// `binary` routes through the native BLOB mapping so encrypted binary
// attributes round-trip (BinaryData-wrapped ciphertext needs a binary column).
// PG-only types are deliberately absent: defineSchema throws when one is used
// against MySQL or SQLite.
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
  date: "string",
  time: "string",
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
 * Per-adapter cache of the last-applied normalized table signatures. Lets
 * `defineSchema` skip DDL when an identical schema is requested again —
 * the Phase 6 hoist (`defineSchema` in `beforeAll` instead of `beforeEach`)
 * relies on this being a no-op when nothing changed.
 *
 * @internal
 */
// WeakMap so short-lived adapter wrappers (createTestAdapter() returns a
// fresh wrapper per call, and withTransactionalFixtures skips the global
// reset between tests) don't accumulate. The no-arg clear below rebinds
// the WeakMap rather than enumerating — outstanding snapshots from
// `_snapshotAppliedSchemaSignaturesForAdapter` are independent Map copies
// so callers holding a snapshot can still restore.
let _appliedSchemaSignatures = new WeakMap<DatabaseAdapter, Map<string, string>>();

/**
 * Snapshot the per-adapter signature cache. Paired with
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
  const cache = _appliedSchemaSignatures.get(adapter);
  return cache ? new Map(cache) : new Map();
}

/** @internal */
export function _restoreAppliedSchemaSignaturesForAdapter(
  adapter: DatabaseAdapter,
  snapshot: Map<string, string>,
): void {
  _appliedSchemaSignatures.set(adapter, new Map(snapshot));
}

/**
 * Drop the cached signature(s) for one adapter (or all adapters when no
 * argument is given). Paired with `resetTestAdapterState` so the signature
 * cache stays synchronized with `dropAllTables`: a shared adapter — which
 * survives across tests under the sidecar shape — would otherwise hold
 * signatures for tables that no longer exist, making a subsequent
 * `defineSchema(sameSpec)` no-op over a missing table.
 *
 * @internal
 */
export function clearAppliedSchemaSignatures(adapter?: DatabaseAdapter): void {
  if (adapter) {
    _appliedSchemaSignatures.delete(adapter);
  } else {
    _appliedSchemaSignatures = new WeakMap();
  }
}

/** @internal */
function getCache(adapter: DatabaseAdapter): Map<string, string> {
  let cache = _appliedSchemaSignatures.get(adapter);
  if (!cache) {
    cache = new Map();
    _appliedSchemaSignatures.set(adapter, cache);
  }
  return cache;
}

/** @internal */
function tableSignature(table: TableSchema): string {
  const columns = columnsOf(table);
  const pk = primaryKeyOf(table);
  const sortedCols: Record<string, ColumnSpec> = {};
  for (const k of Object.keys(columns).sort()) sortedCols[k] = columns[k];
  return JSON.stringify({ columns: sortedCols, primaryKey: pk ?? null });
}

/**
 * Some adapters (notably the test adapter) expose the set of currently
 * created tables. When available, use it to invalidate stale cache entries
 * — e.g. when an external `resetTestAdapterState` dropped tables out from
 * under us. Returns `null` when the adapter doesn't expose this signal, in
 * which case we trust the cache alone.
 *
 * @internal
 */
function adapterKnownTables(adapter: DatabaseAdapter): Set<string> | null {
  const candidate = (adapter as unknown as { tables?: unknown }).tables;
  return candidate instanceof Set ? (candidate as Set<string>) : null;
}

export async function defineSchema(
  adapter: DatabaseAdapter,
  schema: Schema,
  opts?: DefineSchemaOpts,
): Promise<void> {
  const ss = adapter.schemaStatements ? adapter.schemaStatements() : new SchemaStatements(adapter);
  const order = resolveReferences(schema);
  const typeMap =
    adapter.adapterName === "postgres"
      ? COLUMN_TYPE_MAP_PG
      : adapter.adapterName === "mysql"
        ? COLUMN_TYPE_MAP_MYSQL
        : COLUMN_TYPE_MAP_SQLITE;

  const cache = getCache(adapter);
  const known = adapterKnownTables(adapter);

  // Record the per-adapter opt-out flag *before* any DDL runs. Phase 6.3's
  // global `beforeEach` will read this via `getUseTransactionalTests()` to
  // decide whether to wrap the test in BEGIN/ROLLBACK. Default is true; only
  // an explicit `false` opts out.
  setUseTransactionalTests(adapter, opts?.useTransactionalTests !== false);

  if (opts?.dropExisting) {
    for (const table of [...order].reverse()) {
      await ss.dropTable(table, { ifExists: true });
      cache.delete(table);
    }
  }

  for (const table of order) {
    const raw = schema[table];
    const newSig = tableSignature(raw);
    const cachedSig = cache.get(table);
    const stillExists = known ? known.has(table) : cachedSig !== undefined;
    if (cachedSig === newSig && stillExists) {
      continue;
    }
    if (stillExists) {
      await ss.dropTable(table, { ifExists: true });
    } else if (cachedSig !== undefined) {
      // Cache says we created it, but the adapter no longer reports it as
      // present (e.g. resetTestAdapterState wiped state). Forget the stale
      // entry and create fresh.
      cache.delete(table);
    }
    const columns = columnsOf(raw);
    const pk = primaryKeyOf(raw);
    const createOpts: { id?: boolean; primaryKey?: string[] } = {};
    if (pk === false) createOpts.id = false;
    else if (Array.isArray(pk)) {
      createOpts.primaryKey = pk;
      createOpts.id = false;
    }
    const compositePkCols = Array.isArray(pk) ? new Set(pk) : null;
    await ss.createTable(table, createOpts, (t) => {
      for (const [colName, spec] of Object.entries(columns)) {
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
          if (spec.null !== undefined) options["null"] = spec.null;
          if (spec.default !== undefined) options["default"] = spec.default;
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
        if (
          adapter.adapterName === "mysql" &&
          primitive === "datetime" &&
          options["precision"] == null
        ) {
          options["precision"] = 6;
        }
        t.column(colName, arType, options);
      }
    });
    cache.set(table, newSig);
  }
}
