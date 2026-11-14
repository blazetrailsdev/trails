#!/usr/bin/env npx tsx
/**
 * CI gate for the bump ledger (RFC 0191 § 3), run in `rails-comparison` after
 * the API comparison writes output/body-hashes.json. Reds on:
 *
 *   - a row whose pin matches the active digest (stale: the pair was re-pinned);
 *   - a row with no matched pair (no pin, or a kind its pair no longer has);
 *   - a row added by a PR that does not change its source's `ref` in
 *     `vendor/sources.lock.json`;
 *   - on a PR that does change a `ref`, any difference from the seed: the
 *     base's pins diffed against the head's digests (the dry run's
 *     `pairSeed`), less what the PR re-pinned or pruned. The base's pins were
 *     taken at the old ref, so no old tree is fetched;
 *   - a PR forked before the `ref` it is tested against that edits
 *     `scripts/api-compare/body-pins.json`: its pins were taken at the old ref.
 *
 * The base is `HEAD^1` on a GitHub merge checkout (the PR head is `HEAD^2`),
 * else `--base <rev>` (default `origin/main`) merged with HEAD.
 *
 * Hard rules: no node:* imports, no process.* outside the entry guard, async
 * fs only, no third-party runtime deps.
 */

import { execFile } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { SOURCES } from "../../vendor/sources.js";
import { ROOT_DIR } from "./config.js";
import { type BodyPin, MANIFEST_PATH, keyOf, loadArtifact, loadManifest } from "./body-pins.js";
import {
  type LedgerProblem,
  type LedgerRow,
  addedRows,
  checkRows,
  ledgerPath,
  liveRows,
  loadLedgers,
  seedDiff,
  sourceOf,
} from "./bump-ledger.js";

const LOCK = "vendor/sources.lock.json";
const PINS = path.relative(ROOT_DIR, MANIFEST_PATH);

async function git(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)("git", args, {
      cwd: ROOT_DIR,
      maxBuffer: 1 << 28,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function showJson<T>(rev: string, file: string, fallback: T): Promise<T> {
  const text = await git(["show", `${rev}:${file}`]);
  return text === null ? fallback : (JSON.parse(text) as T);
}

type Lock = { sources: Record<string, { ref: string }> };

export interface Revisions {
  base: string;
  head: string;
  fork: string | null;
}

async function revisions(baseBranch: string): Promise<Revisions | null> {
  const second = await git(["rev-parse", "--verify", "-q", "HEAD^2"]);
  if (second !== null) {
    const fork = await git(["merge-base", "HEAD^1", "HEAD^2"]);
    return { base: "HEAD^1", head: "HEAD^2", fork: fork?.trim() ?? null };
  }
  const fork = await git(["merge-base", baseBranch, "HEAD"]);
  if (fork === null) return null;
  return { base: fork.trim(), head: "HEAD", fork: fork.trim() };
}

function describe(p: LedgerProblem): string {
  const where = `${p.row.package}  ${p.row.rubyFile}:${p.row.rubyName}`;
  switch (p.problem) {
    case "stale":
      return `  stale      ${where} — its pin matches the active digest; delete the row`;
    case "unmatched":
      return `  unmatched  ${where} — no pin names this pair`;
    case "kind":
      return `  unmatched  ${where} — kind "${p.row.kind}" does not match the pair`;
    case "unbumped":
      return `  added      ${where} — this PR does not change ${sourceOf(p.row.package)}'s ref in ${LOCK}`;
    case "seed":
      return `  seed       ${where} (${p.row.kind} ${p.row.from} → ${p.row.to}) — differs from the recomputed seed`;
  }
}

async function main(baseBranch: string): Promise<number> {
  const ledgers = await loadLedgers();
  const errors: string[] = [];
  const revs = await revisions(baseBranch);

  if (revs?.fork != null && revs.fork !== revs.base) {
    const forkLock = await showJson<Lock>(revs.fork, LOCK, { sources: {} });
    const baseLock = await showJson<Lock>(revs.base, LOCK, { sources: {} });
    const moved = Object.keys(baseLock.sources).filter(
      (s) => forkLock.sources[s]?.ref !== baseLock.sources[s].ref,
    );
    const touched = await git(["diff", "--name-only", revs.fork, revs.head, "--", PINS]);
    if (moved.length > 0 && touched !== null && touched.trim() !== "") {
      errors.push(
        `body-pins: this PR edits ${PINS} but forked before ${moved.join(", ")} moved its ref ` +
          `in ${LOCK}. Its pins were taken at the old ref: rebase onto main and re-pin.`,
      );
    }
  }

  const artifact = await loadArtifact();
  const pins = await loadManifest();
  const problems: LedgerProblem[] = [];
  for (const rows of ledgers.values()) problems.push(...checkRows(rows, pins, artifact.hashes));

  if (revs !== null) {
    const baseLock = await showJson<Lock>(revs.base, LOCK, { sources: {} });
    const headLock = await showJson<Lock>("HEAD", LOCK, { sources: {} });
    const { pairSeed } = await import("../parity/bump-dry-run/ledger.js");
    for (const s of SOURCES) {
      const file = path.relative(ROOT_DIR, ledgerPath(s.name));
      const head = ledgers.get(s.name) ?? [];
      const from = baseLock.sources[s.name]?.ref;
      const to = headLock.sources[s.name]?.ref;
      if (from === to) {
        const base = await showJson<LedgerRow[]>(revs.base, file, []);
        for (const row of addedRows(base, head)) problems.push({ row, problem: "unbumped" });
        continue;
      }
      if (from === undefined || to === undefined) continue;
      const names = new Set(s.packages.map((p) => p.name));
      const basePins = (await showJson<BodyPin[]>(revs.base, PINS, [])).filter((p) =>
        names.has(p.package),
      );
      const hashes = artifact.hashes.filter((h) => names.has(h.package));
      const current = new Map(hashes.map((h) => [keyOf(h), h.digest]));
      const seed = liveRows(pairSeed(basePins, hashes, from, to), pins, current);
      problems.push(...seedDiff(head, seed));
    }
  }

  if (problems.length > 0) {
    errors.push(
      `bump-ledger gate: ${problems.length} problem row(s) in scripts/parity/bump-ledger/:\n` +
        problems.map(describe).join("\n"),
    );
  }
  if (errors.length > 0) {
    console.error(`\n${errors.join("\n\n")}\n`);
    return 1;
  }
  const total = [...ledgers.values()].reduce((n, r) => n + r.length, 0);
  console.log(`bump-ledger gate: OK (${total} ledger row(s))`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const args = process.argv.slice(2);
  const i = args.indexOf("--base");
  process.exit(await main(i >= 0 ? args[i + 1] : "origin/main"));
}

void runAsScript();
