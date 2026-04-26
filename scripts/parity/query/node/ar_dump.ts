#!/usr/bin/env tsx
/**
 * Usage (from repo root):
 *   tsx scripts/parity/query/node/ar_dump.ts <fixture-dir> <out.json>
 *       [--frozen-at ISO8601_UTC_Z]
 *
 * Like scripts/parity/query/node/dump.ts but for ActiveRecord query
 * fixtures: applies schema.sql, calls Base.establishConnection(dbPath),
 * dynamic-imports query.ts (which in turn imports the models module,
 * typically via an ESM specifier like `./models.js` even though the
 * source file is `models.ts` — this is the Node/ESM TypeScript
 * convention, and tsx rewrites the `.js` back to the real `.ts`),
 * and calls .toSql() on the default export — expected to be an AR
 * Relation.
 *
 * Time is always frozen. --frozen-at behaves identically to the arel runner.
 *
 * @blazetrails/{arel,activesupport,activemodel,activerecord} must all
 * be built before running — resolution goes through package `main`
 * entries.
 */

import Database from "better-sqlite3";
import FakeTimers from "@sinonjs/fake-timers";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CanonicalQuery } from "../../canonical/query-types.js";
import { Base, modelRegistry } from "@blazetrails/activerecord";
import { Visitors } from "@blazetrails/arel";

function usage(): never {
  process.stderr.write(
    "Usage: tsx scripts/parity/query/node/ar_dump.ts <fixture-dir> <out.json> [--frozen-at ISO8601_UTC_Z]\n",
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
    } else if (argv[i]!.startsWith("--")) {
      process.stderr.write(`unknown flag: ${argv[i]}\n`);
      usage();
    } else if (fixtureDir === null) {
      fixtureDir = argv[i++]!;
    } else if (outPath === null) {
      outPath = argv[i++]!;
    } else {
      process.stderr.write(`unexpected argument: ${argv[i]}\n`);
      usage();
    }
  }
  if (!fixtureDir || !outPath) usage();
  return { fixtureDir, outPath, frozenAt };
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DEFAULT_FROZEN_AT = "2000-01-01T00:00:00.000Z";

function describe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const name = (v as { constructor?: { name?: string } }).constructor?.name;
  return name ?? typeof v;
}

function assertBuilt(): void {
  // All four packages contribute to the AR query surface; if any dist/ is
  // missing, model load will fail with a cryptic module-not-found error.
  // Check all four up-front with a clear hint.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const missing: string[] = [];
  for (const pkg of ["activesupport", "activemodel", "arel", "activerecord"]) {
    const dist = resolve(scriptDir, `../../../../packages/${pkg}/dist/index.js`);
    if (!existsSync(dist)) missing.push(`@blazetrails/${pkg}`);
  }
  if (missing.length > 0) {
    process.stderr.write(`parity ar_dump (trails): missing dist/ for ${missing.join(", ")}\n`);
    process.stderr.write(
      `Run: pnpm --filter @blazetrails/activesupport --filter @blazetrails/activemodel --filter @blazetrails/arel --filter @blazetrails/activerecord build\n`,
    );
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
    if (!Number.isFinite(Date.parse(frozenAt))) {
      process.stderr.write(`--frozen-at is not a valid date: ${frozenAt}\n`);
      process.exit(1);
    }
  }

  assertBuilt();

  const frozenTs = frozenAt ?? DEFAULT_FROZEN_AT;
  const frozenMs = new Date(frozenTs).getTime();
  const fixtureDirAbs = resolve(fixtureDirRaw);
  const outPathAbs = resolve(outPathRaw);
  const fixtureName = basename(fixtureDirAbs);

  const tmpDir = mkdtempSync(join(tmpdir(), "parity-ar-node-"));
  const clock = FakeTimers.install({ now: frozenMs, toFake: ["Date"] });

  try {
    // 1. Apply schema.sql to a fresh temp SQLite file.
    const dbPath = join(tmpDir, "query.db");
    const db = new Database(dbPath);
    try {
      db.exec(readFileSync(join(fixtureDirAbs, "schema.sql"), "utf8"));
    } finally {
      db.close();
    }

    // 2. Connect via trails AR — the models module's class definitions
    //    inherit from Base and read Base.adapter lazily, so the connection
    //    must exist before any model method is invoked. establishConnection
    //    registers the connection pool; accessing Base.adapter immediately
    //    after checks out the connection and triggers _wireArelVisitor, which
    //    sets the adapter-specific Arel visitor (e.g. Visitors.SQLite) on the
    //    process-global registry. Without this eager access Relation#toSql()
    //    would use the default generic visitor since it never touches
    //    Base.adapter itself, producing incorrect boolean/date literals.
    await Base.establishConnection(dbPath);
    void Base.adapter; // trigger _wireArelVisitor so the correct Arel visitor is active
    // Regression coverage: fixtures ar-09/ar-11/ar-19/ar-29 each produce a
    // distinct wrong literal under the generic visitor (TRUE/FALSE, FOR UPDATE)
    // vs the correct SQLite literal (1/0, empty lock). Their PASS status in CI
    // acts as the integration test for this visitor-wiring invariant.

    // 3. Import query.ts. Fixtures end with `export default <relation>`
    //    and typically `import { Book } from "./models.js"` (ESM convention
    //    — the `.js` specifier resolves to the `models.ts` source via tsx)
    //    to reference model classes — that side-effect-loads the models
    //    module which registers the classes against the current
    //    Base.adapter.
    const queryUrl = pathToFileURL(join(fixtureDirAbs, "query.ts")).href;
    const mod = (await import(queryUrl)) as { default: unknown };
    const result = mod.default;

    // 3b. Pre-warm the schema cache for all registered model classes so that
    //     toSql() can emit column-aliased SQL for eager_load. Rails loads schema
    //     synchronously; trails' schema cache is populated async from the DB on
    //     first access. Without this step, JoinDependency sees an empty schema
    //     cache and falls back to only the primary key.
    for (const [name, klass] of modelRegistry) {
      try {
        await (klass as unknown as { loadSchema(): Promise<void> }).loadSchema();
      } catch (err) {
        process.stderr.write(
          `parity ar_dump: warning: schema pre-warm failed for ${name}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }

    if (result === null || result === undefined) {
      throw new Error(`[${fixtureName}] query.ts default export is ${result}`);
    }
    if (typeof (result as { toSql?: unknown }).toSql !== "function") {
      throw new Error(
        `[${fixtureName}] query.ts default export is ${describe(result)}: expected an AR Relation with .toSql()`,
      );
    }

    // 4. Extract SQL — two forms:
    //    a) Inlined: toSql() with all values embedded as literals.
    //    b) Parameterized: compileWithBinds extracts date values as bind
    //       params (? placeholders), matching the execution path Rails uses
    //       for INSERT/UPDATE and how AR actually passes values to the driver.
    const sqlStr = (result as { toSql(): string }).toSql().trim();

    const rel = result as { arel?(): { ast: unknown } };
    let paramSql = sqlStr;
    let binds: string[] = [];
    if (typeof rel.arel === "function") {
      const manager = rel.arel();
      if (manager && typeof (manager as { ast: unknown }).ast !== "undefined") {
        // paramSql/binds are informational-only; wrap the entire extraction so any
        // unexpected visitor or bind-processing error falls back to sql / empty binds.
        try {
          // Use the adapter-wired dialect visitor (e.g. Visitors.SQLite for SQLite)
          // so boolean literals, DISTINCT, etc. match the actual execution dialect.
          const adapterVisitor = (Base.adapter as { arelVisitor?: unknown }).arelVisitor;
          const visitorCtor =
            adapterVisitor != null ? (adapterVisitor as object).constructor : Visitors.ToSql;
          const visitor = new (visitorCtor as new () => InstanceType<typeof Visitors.ToSql>)();
          const [ps, bs] = (
            visitor as unknown as { compileWithBinds(node: unknown): [string, unknown[]] }
          ).compileWithBinds((manager as { ast: unknown }).ast);
          // Resolve QueryAttribute/BindParam wrappers to their DB value first.
          const resolvedBinds = (bs as unknown[]).map((b) => {
            if (b != null && typeof b === "object" && "valueForDatabase" in b) {
              const vfd = (b as { valueForDatabase?: unknown }).valueForDatabase;
              return typeof vfd === "function" ? (vfd as () => unknown).call(b) : vfd;
            }
            return b;
          });

          // Use the visitor's own quoting for re-inlining non-Date scalars so the
          // SQL literal style (e.g. boolean 1/0 on SQLite) matches the dialect.
          const quotingVisitor = visitor as unknown as { quote?: (v: unknown) => string };
          const quoteBindValue = (v: unknown): string => {
            if (typeof quotingVisitor.quote === "function") return quotingVisitor.quote(v);
            if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
            if (v == null) return "NULL";
            return String(v);
          };

          // Build a consistent paramSql where ONLY Date values become `?`; all
          // other bind values are re-inlined using the visitor's quoting rules.
          // This keeps `? count = binds.length` and matches adapter-specific rendering.
          let placeholderIdx = 0;
          const dateBind: Date[] = [];
          let mismatch = false;
          const processedParamSql = ps.replace(/\?/g, () => {
            if (placeholderIdx >= resolvedBinds.length) {
              mismatch = true;
              return "?";
            }
            const v = resolvedBinds[placeholderIdx++];
            if (v instanceof Date) {
              dateBind.push(v);
              return "?";
            }
            return quoteBindValue(v);
          });
          if (placeholderIdx !== resolvedBinds.length) mismatch = true;

          if (mismatch || dateBind.length === 0) {
            // No datetime binds (or placeholder/bind count diverged): keep paramSql
            // identical to sql so there's no whitespace/quoting drift in output.
            paramSql = sqlStr;
            binds = [];
          } else {
            paramSql = processedParamSql.trim();
            binds = dateBind.map((b) => b.toISOString());
          }
        } catch {
          paramSql = sqlStr;
          binds = [];
        }
      }
    }

    // 5. Write CanonicalQuery JSON
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
    // Explicitly close the adapter's SQLite handle before removing the
    // temp dir. Base.removeConnection() drops the pool reference but may
    // leave the underlying better-sqlite3 handle open, causing EBUSY /
    // EPERM on Windows when rmSync tries to delete the .db file. Pattern
    // mirrors scripts/parity/schema/node/dump.ts:152-153.
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
        `parity ar_dump: warning: failed to remove temp dir ${tmpDir}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `parity ar_dump (trails): ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
