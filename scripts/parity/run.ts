/**
 * Usage: tsx scripts/parity/run.ts
 *          [--type=schema|query]     default: schema
 *          [--side=rails|trails|diff|all]  default: all
 *
 * Orchestrates the schema or query parity pipeline. Output paths:
 *   schema:  scripts/parity/.out/{rails,trails}/         (legacy location — CI
 *            artifacts and schema-parity scripts depend on these exact paths)
 *   query:   scripts/parity/.out/query/{rails,trails}/
 *
 * Modes:
 *   rails  — run ruby dump.rb over every fixture → <rails out dir>
 *   trails — run node dump.ts over every fixture → <trails out dir>
 *   diff   — run diff.ts over the configured rails/trails output dirs
 *   all    — rails + trails in parallel, then diff (default)
 *
 * For --type=query, time is frozen on both sides. PARITY_FROZEN_AT (an
 * ISO-8601 UTC timestamp with trailing Z, e.g. 2026-04-24T00:00:00.000Z)
 * is forwarded to both runners via --frozen-at. If unset, the runners use
 * their own default (2000-01-01T00:00:00.000Z) and parity still holds as
 * long as both sides agree on the default.
 *
 * Must be run from the repo root.
 */

import { readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const FIXTURES_DIR = "scripts/parity/fixtures";
const GEMFILE = "scripts/parity/schema/ruby/Gemfile";

type ParityType = "schema" | "query";
type Side = "rails" | "trails" | "diff" | "all";

interface TypeConfig {
  /** Filter fixtures to the ones this type should run. */
  matches: (name: string) => boolean;
  outRails: string;
  outTrails: string;
  rubyDump: string;
  nodeDump: string;
  diffScript: string;
  /** Extra args appended to every dump invocation (e.g. --frozen-at). */
  extraDumpArgs: string[];
}

function parityTypeConfig(type: ParityType): TypeConfig {
  if (type === "schema") {
    return {
      // Schema fixtures are numeric-prefixed (01-trivial, 02-moderate, ...).
      matches: (name) => /^\d/.test(name),
      outRails: "scripts/parity/.out/rails",
      outTrails: "scripts/parity/.out/trails",
      rubyDump: "scripts/parity/schema/ruby/dump.rb",
      nodeDump: "scripts/parity/schema/node/dump.ts",
      diffScript: "scripts/parity/schema/diff.ts",
      extraDumpArgs: [],
    };
  }
  // Query fixtures for v1 scope are Arel-only (arel-* under scripts/parity/
  // fixtures/). AR-style fixtures (ar-*) are planned for v2 and will land
  // under this same type. scripts/parity/query/diff.ts already seeds from
  // both arel-* and ar-* so flipping this matcher is the only change needed
  // when v2 lands.
  const frozen = process.env.PARITY_FROZEN_AT;
  return {
    matches: (name) => /^arel-/.test(name),
    outRails: "scripts/parity/.out/query/rails",
    outTrails: "scripts/parity/.out/query/trails",
    rubyDump: "scripts/parity/query/ruby/dump.rb",
    nodeDump: "scripts/parity/query/node/dump.ts",
    diffScript: "scripts/parity/query/diff.ts",
    extraDumpArgs: frozen ? ["--frozen-at", frozen] : [],
  };
}

function assertRepoRoot(): void {
  if (!existsSync(FIXTURES_DIR)) {
    process.stderr.write(`parity run: must be run from repo root (${FIXTURES_DIR} not found)\n`);
    process.exit(1);
  }
}

function parseArgs(): { type: ParityType; side: Side } {
  let type: ParityType = "schema";
  let side: Side = "all";
  for (const arg of process.argv.slice(2)) {
    const typeMatch = arg.match(/^--type=(.+)$/);
    const sideMatch = arg.match(/^--side=(.+)$/);
    if (typeMatch) {
      const t = typeMatch[1];
      if (t === "schema" || t === "query") type = t;
      else {
        process.stderr.write(`parity run: unknown --type value: ${t}\n`);
        process.exit(1);
      }
    } else if (sideMatch) {
      const s = sideMatch[1];
      if (s === "rails" || s === "trails" || s === "diff" || s === "all") side = s;
      else {
        process.stderr.write(`parity run: unknown --side value: ${s}\n`);
        process.exit(1);
      }
    } else {
      process.stderr.write(`parity run: unknown argument: ${arg}\n`);
      process.exit(1);
    }
  }
  return { type, side };
}

function fixtures(cfg: TypeConfig): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && cfg.matches(e.name))
    .map((e) => e.name)
    .sort();
}

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  /**
   * When true, buffer the child's stdout/stderr and flush them in one
   * contiguous block on exit. Used when fixtures run in parallel so each
   * fixture's log lines stay grouped instead of interleaving with others.
   */
  buffered?: boolean;
}

function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: opts.buffered ? ["ignore", "pipe", "pipe"] : "inherit",
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });
    // Tagged chunks preserve arrival order across stdout and stderr so an
    // interleaved error message still lines up with the surrounding stdout
    // context when flushed. Flushed per-stream at the end so parent's own
    // stderr stream still gets stderr output (for log filters, tools that
    // split streams, etc.).
    const chunks: Array<{ stream: "out" | "err"; text: string }> = [];
    if (opts.buffered) {
      proc.stdout
        ?.setEncoding("utf8")
        .on("data", (c: string) => chunks.push({ stream: "out", text: c }));
      proc.stderr
        ?.setEncoding("utf8")
        .on("data", (c: string) => chunks.push({ stream: "err", text: c }));
    }
    const flush = () => {
      if (!opts.buffered) return;
      for (const c of chunks) {
        (c.stream === "out" ? process.stdout : process.stderr).write(c.text);
      }
    };
    proc.on("close", (code, signal) => {
      flush();
      if (code === 0) {
        resolve();
        return;
      }
      const command = [cmd, ...args].join(" ");
      const status = code === null ? `signal ${signal}` : `${code}`;
      reject(new Error(`${command} exited ${status}`));
    });
    proc.on("error", (err) => {
      flush();
      reject(err);
    });
  });
}

// Bound concurrency so we don't fork 53 bundler or tsx processes at once.
// Default 4 — safe for Ruby bundler memory and reasonable on 2-core CI runners.
// Override with PARITY_CONCURRENCY for local tuning; must be a positive integer.
function parseConcurrency(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 4;
  const trimmed = raw.trim();
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || String(parsed) !== trimmed) {
    process.stderr.write(
      `parity run: PARITY_CONCURRENCY must be a positive integer (got ${JSON.stringify(raw)})\n`,
    );
    process.exit(1);
  }
  return parsed;
}

const CONCURRENCY = parseConcurrency(process.env.PARITY_CONCURRENCY);

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  // Fail-fast: as soon as any worker errors, stop pulling new items from the
  // queue. In-flight work finishes (we can't kill spawned children here), but
  // no further fixtures are scheduled, so a broken fixture doesn't spawn 50
  // more Ruby/tsx processes before the error surfaces. Query mode wraps each
  // dump in try/catch inside the worker so this branch never triggers there.
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      if (firstError !== undefined) return;
      const item = queue.shift();
      if (item === undefined) return;
      try {
        await worker(item);
      } catch (err) {
        if (firstError === undefined) firstError = err;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
}

function dumpOne(cfg: TypeConfig, label: "rails" | "trails", fixture: string): Promise<void> {
  const fixtureDir = join(FIXTURES_DIR, fixture);
  const outDir = label === "rails" ? cfg.outRails : cfg.outTrails;
  const outFile = join(outDir, `${fixture}.json`);
  // Buffered so each fixture's verbose dump output prints as one contiguous
  // block — otherwise concurrent workers interleave lines and CI logs become
  // unreadable.
  if (label === "rails") {
    return run(
      "bundle",
      ["exec", "ruby", cfg.rubyDump, fixtureDir, outFile, ...cfg.extraDumpArgs],
      { env: { BUNDLE_GEMFILE: GEMFILE }, buffered: true },
    );
  }
  return run("pnpm", ["exec", "tsx", cfg.nodeDump, fixtureDir, outFile, ...cfg.extraDumpArgs], {
    buffered: true,
  });
}

async function runRails(cfg: TypeConfig): Promise<void> {
  rmSync(cfg.outRails, { recursive: true, force: true });
  mkdirSync(cfg.outRails, { recursive: true });
  await runPool(fixtures(cfg), (fixture) => dumpOne(cfg, "rails", fixture));
}

async function runTrails(cfg: TypeConfig): Promise<void> {
  rmSync(cfg.outTrails, { recursive: true, force: true });
  mkdirSync(cfg.outTrails, { recursive: true });
  await runPool(fixtures(cfg), (fixture) => dumpOne(cfg, "trails", fixture));
}

async function runDiff(cfg: TypeConfig): Promise<void> {
  for (const dir of [cfg.outRails, cfg.outTrails]) {
    if (!existsSync(dir)) {
      process.stderr.write(
        `parity run: ${dir} does not exist — run --side=rails and --side=trails first\n`,
      );
      process.exit(1);
    }
  }
  await run("pnpm", [
    "exec",
    "tsx",
    cfg.diffScript,
    "--rails-dir",
    cfg.outRails,
    "--trails-dir",
    cfg.outTrails,
  ]);
}

// For query parity: if either runner fails on a single fixture, we still want
// the other fixtures dumped so the diff step can surface the one-sided failure
// as a KNOWN-GAP (or FAIL) rather than exit 1 here and block the whole run.
async function runAllFixturesBestEffort(cfg: TypeConfig, label: "rails" | "trails"): Promise<void> {
  const outDir = label === "rails" ? cfg.outRails : cfg.outTrails;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await runPool(fixtures(cfg), async (fixture) => {
    try {
      await dumpOne(cfg, label, fixture);
    } catch (err) {
      process.stdout.write(
        `parity run: [${label}/${fixture}] dump failed — diff step will classify as gap/fail\n`,
      );
      process.stdout.write(`  ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });
}

async function main(): Promise<void> {
  assertRepoRoot();
  const { type, side } = parseArgs();
  const cfg = parityTypeConfig(type);

  // Schema type keeps fail-fast within each side (its runners are expected to
  // succeed on every fixture). Query type is best-effort so the diff can
  // classify known gaps properly.
  const railsFn =
    type === "query" ? () => runAllFixturesBestEffort(cfg, "rails") : () => runRails(cfg);
  const trailsFn =
    type === "query" ? () => runAllFixturesBestEffort(cfg, "trails") : () => runTrails(cfg);

  if (side === "rails") {
    await railsFn();
  } else if (side === "trails") {
    await trailsFn();
  } else if (side === "diff") {
    await runDiff(cfg);
  } else {
    const results = await Promise.allSettled([railsFn(), trailsFn()]);
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    if (errors.length > 0) throw new Error(errors.join("\n"));
    await runDiff(cfg);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`parity run: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
