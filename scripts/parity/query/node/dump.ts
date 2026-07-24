#!/usr/bin/env tsx
/**
 * Usage (from repo root):
 *   tsx scripts/parity/query/node/dump.ts <fixture-dir> <out.json>
 *       [--frozen-at ISO8601_UTC_Z]
 *
 * Applies <fixture-dir>/schema.sql to a fresh SQLite database, dynamic-imports
 * <fixture-dir>/query.ts, calls .toSql() on its default export, and writes a
 * CanonicalQuery JSON to <out.json>.
 *
 * Time is always frozen for deterministic query evaluation. --frozen-at
 * pins the timestamp to a specific ISO 8601 UTC value (trailing Z required,
 * e.g. 2026-01-01T00:00:00.000Z); omitting it uses 2000-01-01T00:00:00.000Z.
 *
 * @blazetrails/{activesupport,activemodel,arel,activerecord} must all be built
 * before running — resolution goes through the published package `main`
 * entries, and the runner compiles through a real sqlite3 adapter connection.
 * In CI mirror the query-parity-trails job and build them in dep order.
 */

import Database from "better-sqlite3";
import FakeTimers from "@sinonjs/fake-timers";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import type { CanonicalQuery } from "../../canonical/query-types.js";
import { assertPackagesBuilt } from "./assert-packages-built.js";

function usage(): never {
  process.stderr.write(
    "Usage: tsx scripts/parity/query/node/dump.ts <fixture-dir> <out.json> [--frozen-at ISO8601_UTC_Z]\n",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): {
  fixtureDir: string;
  outPath: string;
  frozenAt: string | null;
} {
  let fixtureDir: string | null = null;
  let outPath: string | null = null;
  let frozenAt: string | null = null;
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--frozen-at") {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        process.stderr.write("--frozen-at requires a value\n");
        process.exit(1);
      }
      frozenAt = val;
      i += 2;
    } else if (argv[i].startsWith("--")) {
      process.stderr.write(`unknown flag: ${argv[i]}\n`);
      usage();
    } else if (fixtureDir === null) {
      fixtureDir = argv[i++];
    } else if (outPath === null) {
      outPath = argv[i++];
    } else {
      process.stderr.write(`unexpected argument: ${argv[i]}\n`);
      usage();
    }
  }
  if (!fixtureDir || !outPath) usage();
  return { fixtureDir, outPath, frozenAt };
}

// Shape check: ISO 8601 UTC with trailing Z. Matches scripts/parity/canonical/
// query.schema.json and the Ruby runner's regex — any fractional precision is
// accepted by the contract. Semantic validity (calendar-valid date) is enforced
// below via Date.parse().
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DEFAULT_FROZEN_AT = "2000-01-01T00:00:00.000Z";

// Primitive-safe name for error/debug output. Handles null/undefined/strings/numbers
// without throwing (Object.getPrototypeOf(null) throws TypeError; primitives don't
// always carry a meaningful constructor).
function describe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const name = (v as { constructor?: { name?: string } }).constructor?.name;
  return name ?? typeof v;
}

async function main(): Promise<void> {
  const {
    fixtureDir: fixtureDirRaw,
    outPath: outPathRaw,
    frozenAt,
  } = parseArgs(process.argv.slice(2));

  if (frozenAt !== null) {
    if (!ISO_UTC_RE.test(frozenAt)) {
      process.stderr.write(
        "--frozen-at must be ISO 8601 UTC with trailing Z (e.g. 2026-01-01T00:00:00.000Z)\n",
      );
      process.exit(1);
    }
    // Shape alone accepts things like 2026-99-99T25:70:70Z — verify the actual
    // Date is valid before we install FakeTimers with NaN.
    if (!Number.isFinite(Date.parse(frozenAt))) {
      process.stderr.write(`--frozen-at is not a valid date: ${frozenAt}\n`);
      process.exit(1);
    }
  }

  assertPackagesBuilt("parity dump (trails)");

  const frozenTs = frozenAt ?? DEFAULT_FROZEN_AT;
  const frozenMs = new Date(frozenTs).getTime();
  const fixtureDirAbs = resolve(fixtureDirRaw);
  const outPathAbs = resolve(outPathRaw);
  const fixtureName = basename(fixtureDirAbs);

  const tmpDir = mkdtempSync(join(tmpdir(), "parity-query-node-"));

  // Freeze time before importing the fixture — the fixture may read Date() at
  // module-evaluation time (e.g. a translated `1.week.ago` analog).
  const clock = FakeTimers.install({ now: frozenMs, toFake: ["Date"] });

  // Imported dynamically, after assertPackagesBuilt() — a static import would
  // resolve (and fail) at module load, replacing the "run pnpm build" hint with
  // a bare module-not-found. Specifiers are the package names, not dist paths,
  // so Node ESM dedupes them with the fixture's own `@blazetrails/arel` import
  // to one module instance — that is what makes `Arel::Table.engine` visible to
  // the fixture's nodes.
  const { getFsAsync, getPathAsync } = await import("@blazetrails/activesupport");
  const { Base } = await import("@blazetrails/activerecord");

  try {
    // 1. Apply schema.sql to a fresh temp SQLite file. We don't currently hand
    //    the DB to the fixture, but applying the schema keeps the pipeline
    //    symmetric with the Ruby side and validates the SQL parses.
    const dbPath = join(tmpDir, "query.db");
    const db = new Database(dbPath);
    try {
      db.exec(readFileSync(join(fixtureDirAbs, "schema.sql"), "utf8"));
    } finally {
      db.close();
    }

    // 2. Establish a real SQLite connection, mirroring the Rails side's
    //    `establish_connection adapter: "sqlite3"`. Importing activerecord is
    //    what points `Arel::Table.engine` at Base, so `Node#toSql()` and
    //    `TreeManager#toSql()` resolve `engine.connection.visitor` to the
    //    sqlite3 visitor. A `{ connection: { visitor } }` stub cannot stand in:
    //    RFC 0007 deleted the connection-less quoters, so a visitor built with
    //    no connection dies on `quoteTableName` (to-sql.ts:1665-1667).
    //
    //    The sqlite3 adapter resolves the database path through the *sync*
    //    `getFs()`, whose node auto-registration is async-only under pure ESM —
    //    warm the registry first or it throws "No filesystem adapter configured".
    await getFsAsync();
    await getPathAsync();
    await Base.establishConnection({ adapter: "sqlite3", database: dbPath });
    void Base.adapter; // checkout wires the dialect visitor (IS DISTINCT FROM → IS NOT)

    // 4. Import query.ts. Fixtures end with `export default <expr>` — see
    //    scripts/parity/translate/arel.ts (generateTs).
    const queryUrl = pathToFileURL(join(fixtureDirAbs, "query.ts")).href;
    const mod = (await import(queryUrl)) as { default: unknown };
    const result = mod.default;

    if (result === null || result === undefined) {
      throw new Error(`[${fixtureName}] query.ts default export is ${result}`);
    }
    if (typeof (result as { toSql?: unknown }).toSql !== "function") {
      const ctor = describe(result);
      throw new Error(
        `[${fixtureName}] query.ts default export is ${ctor}: expected an Arel node or manager with .toSql()`,
      );
    }

    // 5. Extract SQL. Arel node/manager both expose .toSql():
    //    Node#toSql()         packages/arel/src/nodes/node.ts
    //    TreeManager#toSql()  packages/arel/src/tree-manager.ts
    //    Arel inlines bind values into the SQL string — no separate bind array.
    const sqlStr = (result as { toSql(): string }).toSql().trim();
    // Arel arel-* fixtures have no bind params — paramSql equals sql.
    const paramSql = sqlStr;
    const binds: string[] = [];

    // 6. Write CanonicalQuery JSON
    const canonical: CanonicalQuery = {
      version: 1,
      fixture: fixtureName,
      frozenAt: frozenTs,
      sql: sqlStr,
      paramSql,
      binds,
    };

    mkdirSync(dirname(outPathAbs), { recursive: true });
    writeFileSync(outPathAbs, JSON.stringify(canonical, null, 2) + "\n", "utf8");

    const ctor = describe(result);
    process.stdout.write(`[trails] ${fixtureName}\n`);
    process.stdout.write(`  result type : ${ctor}\n`);
    process.stdout.write(`  sql         : ${sqlStr}\n`);
    process.stdout.write(`  frozenAt    : ${frozenTs}\n`);
    process.stdout.write(`  → ${outPathAbs}\n`);
  } finally {
    clock.uninstall();
    // Close the adapter's SQLite handle before removing the temp dir — an open
    // handle makes rmSync of the .db file fail on Windows. Two independent
    // try/catches, matching ar_dump.ts and scripts/parity/schema/node/dump.ts:
    // a throwing close() must not skip removeConnection().
    try {
      const a = Base.adapter as { close?: () => void };
      if (typeof a.close === "function") a.close();
    } catch {
      /* adapter unavailable or already closed */
    }
    try {
      Base.removeConnection();
    } catch {
      /* already removed or never opened */
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(
        `parity dump: warning: failed to remove temp dir ${tmpDir}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `parity dump (trails): ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
