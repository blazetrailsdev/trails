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
 * @blazetrails/arel must be built (packages/arel/dist/index.js) before running —
 * resolution goes through the published package `main` entry. In CI mirror the
 * schema-parity-trails job: `pnpm --filter @blazetrails/arel build` first.
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
  // @blazetrails/arel resolves via package "main" → packages/arel/dist/index.js.
  // tsx's own loader doesn't help here: the fixture is a module on disk that
  // Node resolves through the normal package graph, not via the TS source.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const arelDist = resolve(scriptDir, "../../../../packages/arel/dist/index.js");
  if (!existsSync(arelDist)) {
    process.stderr.write(
      `parity dump (trails): @blazetrails/arel is not built (missing ${arelDist}).\n`,
    );
    process.stderr.write("Run: pnpm --filter @blazetrails/arel build\n");
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

    // 2. Import query.ts. Fixtures end with `export default <expr>` — see
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

    // 3. Extract SQL. Arel node/manager both expose .toSql():
    //    Node#toSql()         packages/arel/src/nodes/node.ts
    //    TreeManager#toSql()  packages/arel/src/tree-manager.ts
    //    Arel inlines bind values into the SQL string — no separate bind array.
    const sqlStr = (result as { toSql(): string }).toSql().trim();
    const binds: string[] = [];

    // 4. Write CanonicalQuery JSON
    const canonical: CanonicalQuery = {
      version: 1,
      fixture: fixtureName,
      frozenAt: frozenTs,
      sql: sqlStr,
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
