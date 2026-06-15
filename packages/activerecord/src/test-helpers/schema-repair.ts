/**
 * Per-file canonical-schema repair for the shared per-worker test database.
 *
 * ## The flake this kills
 *
 * Every test FILE in a vitest worker shares ONE database (the sqlite
 * template-clone keyed per worker slot, or the PG/MySQL per-worker slot DB).
 * Files run sequentially within a worker, and `test-setup-dy.ts` resets between
 * them via `reconstructFromSchema` — but because the worker DB is stamped
 * `schemaUpToDate`, that reset takes the fast path and only **TRUNCATEs rows**
 * (`DatabaseTasks.truncateTables`). It never restores table **shape**.
 *
 * So when file A redefines a canonical table to a bespoke shape — e.g.
 * `defineSchema({ topics: { title: "string" } })`, which drops the real
 * `topics` and recreates it without `author_name`, `written_on`, … — the
 * truncate-only reset leaves that drifted shape in the shared DB. A later
 * PASSIVE file B in the same worker (one that never redefines `topics` and
 * relies on the per-worker canonical preload) then reads the drifted table and
 * fails with `no such column: topics.author_name` / `column "…" does not
 * exist` / `Cannot read properties of null (reading 'id')`. Which file is the
 * victim depends only on worker scheduling + host load, so a different random
 * subset fails every run.
 *
 * ## The fix
 *
 * At the start of each file, `test-setup-dy.ts` calls {@link repairWorkerSchema}.
 * It reads the CURRENT physical column layout of every table in one catalog
 * query, compares each canonical table against `TEST_SCHEMA`, and drop-recreates
 * any whose declared columns are missing (the shape a prior file drifted). It is
 * stateless — the contamination travels through the on-disk DB, not process
 * memory (vitest `isolate` gives each file a fresh module/global context, so a
 * cross-file in-memory marker would not survive), so reading the live schema is
 * the only reliable signal.
 *
 * Cost is proportional to drift, not to the suite: one catalog read per file,
 * then DDL only for tables that actually drifted (usually none).
 *
 * Scope: only canonical-table SHAPE drift is repaired here. Leaked bespoke
 * tables (created via raw `createTable` and never dropped) are a separate, less
 * common class already targeted by the `require-table-teardown` ESLint ratchet;
 * dropping unknown tables here would risk clobbering a file's legitimately-owned
 * scratch table, so it is deliberately left out.
 */

import type { DatabaseAdapter } from "../adapter.js";
import { columnsOf, type Schema } from "./define-schema.js";

/** Tables the test harness must never touch — migration + environment state. */
const PROTECTED_TABLES = new Set(["schema_migrations", "ar_internal_metadata"]);

/**
 * Read every user table's column-name set in a single catalog query. Returns a
 * map of table name → lowercased column-name set. Adapter-specific SQL; case is
 * normalized because PG/MySQL information_schema and driver row keys vary in
 * case. Returns null for an unrecognized adapter (repair then no-ops).
 */
async function readPhysicalColumns(
  adapter: DatabaseAdapter,
): Promise<Map<string, Set<string>> | null> {
  let sql: string;
  switch (adapter.adapterName) {
    case "sqlite":
      sql =
        "SELECT m.name AS tbl, p.name AS col " +
        "FROM sqlite_master m JOIN pragma_table_info(m.name) p " +
        "WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'";
      break;
    case "postgres":
      sql =
        "SELECT table_name AS tbl, column_name AS col " +
        "FROM information_schema.columns WHERE table_schema = current_schema()";
      break;
    case "mysql":
      sql =
        "SELECT table_name AS tbl, column_name AS col " +
        "FROM information_schema.columns WHERE table_schema = DATABASE()";
      break;
    default:
      return null;
  }

  const rows = await adapter.execute(sql);
  const byTable = new Map<string, Set<string>>();
  for (const row of rows) {
    // The SQL aliases to tbl/col; a driver may upper-case the alias keys.
    const tbl = String((row.tbl ?? row.TBL) as string);
    const col = String((row.col ?? row.COL) as string);
    if (!tbl || !col) continue;
    let set = byTable.get(tbl);
    if (!set) byTable.set(tbl, (set = new Set()));
    set.add(col);
  }
  return byTable;
}

/**
 * The canonical table names whose physical shape has drifted: a canonical table
 * that is missing entirely, or missing at least one of its declared columns.
 * Exported for the unit test.
 */
export function driftedTables(physical: Map<string, Set<string>>, canonical: Schema): string[] {
  const drifted: string[] = [];
  for (const [table, spec] of Object.entries(canonical)) {
    if (PROTECTED_TABLES.has(table)) continue;
    const actual = physical.get(table);
    if (!actual) {
      drifted.push(table);
      continue;
    }
    // Case-insensitive both ways: PG/MySQL information_schema and driver row
    // keys vary in case, so normalize the physical set here rather than relying
    // on the caller to pre-lowercase.
    const actualLc = new Set([...actual].map((c) => c.toLowerCase()));
    const declared = Object.keys(columnsOf(spec)).map((c) => c.toLowerCase());
    if (declared.some((c) => !actualLc.has(c))) drifted.push(table);
  }
  return drifted;
}

/**
 * Restore the canonical shape of every table whose live layout has drifted from
 * `canonical`, returning the repaired table names (empty when nothing drifted).
 *
 * Each drifted table is dropped and recreated from `canonical[table]` via the
 * EXPLICIT-adapter `defineSchema` overload (no eager schema-cache warm; the next
 * read warms on demand). Run at file start, before any test code, so the DB the
 * file sees always matches `TEST_SCHEMA` regardless of what a sibling left.
 */
export async function repairWorkerSchema(
  adapter: DatabaseAdapter,
  canonical: Schema,
): Promise<string[]> {
  const physical = await readPhysicalColumns(adapter);
  if (!physical) return [];

  const drifted = driftedTables(physical, canonical);
  if (drifted.length === 0) return [];

  const { defineSchema } = await import("./define-schema.js");
  for (const table of drifted) {
    await defineSchema(adapter, { [table]: canonical[table] }, { dropExisting: true });
  }
  return drifted;
}
