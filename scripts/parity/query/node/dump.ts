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
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CanonicalQuery } from "../../canonical/query-types.js";

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

function assertArelBuilt(): void {
  // These resolve via package "main" → packages/<pkg>/dist/index.js. tsx's own
  // loader doesn't help here: the fixture is a module on disk that Node
  // resolves through the normal package graph, not via the TS source. The
  // runner compiles through a real sqlite3 adapter connection, so the whole
  // activerecord chain has to be built, not just arel.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const missing: string[] = [];
  for (const pkg of ["activesupport", "activemodel", "arel", "activerecord"]) {
    const dist = resolve(scriptDir, `../../../../packages/${pkg}/dist/index.js`);
    if (!existsSync(dist)) missing.push(`@blazetrails/${pkg}`);
  }
  if (missing.length > 0) {
    process.stderr.write(`parity dump (trails): missing dist/ for ${missing.join(", ")}\n`);
    process.stderr.write("Run: pnpm build\n");
    process.exit(1);
  }
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

  assertArelBuilt();

  const frozenTs = frozenAt ?? DEFAULT_FROZEN_AT;
  const frozenMs = new Date(frozenTs).getTime();
  const fixtureDirAbs = resolve(fixtureDirRaw);
  const outPathAbs = resolve(outPathRaw);
  const fixtureName = basename(fixtureDirAbs);

  const tmpDir = mkdtempSync(join(tmpdir(), "parity-query-node-"));

  // Freeze time before importing the fixture — the fixture may read Date() at
  // module-evaluation time (e.g. a translated `1.week.ago` analog).
  const clock = FakeTimers.install({ now: frozenMs, toFake: ["Date"] });

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

    // 2. Establish a real SQLite connection through trails AR. Mirrors the
    //    Rails side's `establish_connection adapter: "sqlite3"`: importing
    //    `@blazetrails/activerecord` sets `Arel::Table.engine` to a
    //    Base-backed engine (base.ts, mirroring
    //    `on_load(:active_record) { Arel::Table.engine = self }`), so both
    //    `Node#toSql()` and `TreeManager#toSql()` resolve
    //    `engine.connection.visitor` to the sqlite3 adapter's visitor — one
    //    that carries real `quoteTableName`/`quoteColumnName`/`quote`.
    //    A hand-rolled `{ connection: { visitor } }` stub cannot: RFC 0007
    //    deleted the connection-less quoters, so a visitor built with no
    //    connection dies on the first `quoteTableName` (to-sql.ts:1665-1667).
    //
    //    Imported as `@blazetrails/activerecord`/`@blazetrails/arel` (not via
    //    dist paths) because scripts/parity is itself a workspace package —
    //    see scripts/parity/package.json. That ensures Node ESM dedupes these
    //    imports with the fixture's `@blazetrails/arel` import to a single
    //    module instance, so the engine wiring is visible to the fixture's
    //    nodes.
    //
    //    The sqlite3 adapter resolves the database path through
    //    ActiveSupport's filesystem adapter *synchronously* (`getFs()` in
    //    `prepareDatabasePath`), but the Node adapter's auto-registration is
    //    async-only under pure ESM. Warm the registry first so the sync
    //    lookup hits the cache instead of throwing "No filesystem adapter
    //    configured".
    const { getFsAsync, getPathAsync } = await import("@blazetrails/activesupport");
    await getFsAsync();
    await getPathAsync();

    const { Base } = await import("@blazetrails/activerecord");
    await Base.establishConnection({ adapter: "sqlite3", database: dbPath });
    // Checking out the connection triggers the adapter's Arel-visitor wiring
    // (e.g. `IS DISTINCT FROM` emits as `IS NOT` via Visitors.SQLite).
    void Base.adapter;

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
    // handle makes rmSync of the .db file fail on Windows.
    try {
      const { Base } = await import("@blazetrails/activerecord");
      const a = Base.adapter as { close?: () => void };
      if (typeof a.close === "function") a.close();
      Base.removeConnection();
    } catch {
      /* connection never established, or already closed */
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
