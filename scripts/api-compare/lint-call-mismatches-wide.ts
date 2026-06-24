#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the WIDE call-set parity dimension (RFC 0047).
 *
 * This is the wide sibling of lint-call-mismatches.ts. The narrow gate ratchets
 * output/call-mismatches.json, produced over the curated SIGNIFICANT_CALLS
 * allowlist (RFC 0044). This one ratchets output/call-mismatches-wide.json,
 * produced when compare.ts runs with `--wide-calls` / `API_COMPARE_WIDE_CALLS=1`
 * (WIDE_SIGNIFICANT_CALLS — every ported call name except `super`). The two
 * artifacts and baselines are entirely separate, so widening the population
 * never perturbs the narrow 0044 gate.
 *
 * Same only-shrink contract: a committed baseline
 * (call-mismatches-wide-exclude.json) lists the currently-known wide mismatches
 * keyed by `package + tsFile + rubyName + call`, each with a one-line `reason`,
 * and CI fails on:
 *
 *   - any NEW wide mismatch absent from the baseline (the ratchet);
 *   - any STALE baseline entry that no longer flags (only-shrink).
 *
 * The wide population is large and dominated by bucket-(b) confirmed
 * equivalents and bucket-(c) tooling noise (see RFC 0047 README). The baseline
 * seeds with the whole current population and shrinks as the per-cluster
 * convergence stories land — removing an entry is how a converged call drops out.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts          # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts --write  # reseed baseline
 *
 * `--write` regenerates the baseline from the current wide artifact, preserving
 * the `reason` of entries that still flag and dropping stale rows.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts), async fs.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import {
  type Artifact,
  type CallMismatchKey,
  type ExcludeEntry,
  diffAgainstBaseline,
  findDuplicateKeys,
  flattenArtifact,
  keyOf,
  reseed,
} from "./lint-call-mismatches.js";

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-wide-exclude.json",
);
// Gates the full-surface wide artifact only — privates are advisory-only
// throughout the compare tooling (mirrors lint-call-mismatches.ts).
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches-wide.json");

const DEFAULT_REASON =
  "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed; " +
  "bucket (b) equivalent or (c) noise pending per-cluster burndown review.";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

async function loadBaseline(): Promise<ExcludeEntry[]> {
  return readJson<ExcludeEntry[]>(BASELINE_PATH);
}

async function loadCurrent(): Promise<CallMismatchKey[]> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm exec tsx ` +
        "scripts/api-compare/compare.ts --wide-calls` (or `pnpm api:compare --wide-calls`) first to write it.",
    );
  }
  return flattenArtifact(await readJson<Artifact>(ARTIFACT_PATH));
}

function sortKeys<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

async function main(write: boolean): Promise<number> {
  const baseline = await loadBaseline();
  const current = await loadCurrent();

  const dups = findDuplicateKeys(baseline);
  if (dups.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${dups.length} duplicate baseline key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  if (write) {
    const next = reseed(current, baseline, DEFAULT_REASON);
    await fs.writeFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`Wrote ${BASELINE_PATH}: ${next.length} baselined wide call mismatches`);
    return 0;
  }

  const { added, stale } = diffAgainstBaseline(current, baseline);

  if (added.length === 0 && stale.length === 0) {
    console.log(`wide call-mismatches ratchet: OK (${baseline.length} baselined)`);
    return 0;
  }

  if (added.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${added.length} NEW wide mismatch(es) not in the baseline.`,
    );
    console.error(
      "A ported TS body omits a call Rails makes (wide population). Implement the " +
        "call, or — if it is satisfied by a different path — add it to\n  " +
        `${path.relative(ROOT_DIR, BASELINE_PATH)} with a one-line reason.\n`,
    );
    for (const k of sortKeys(added)) {
      console.error(`  + ${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}`);
    }
  }

  if (stale.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${stale.length} STALE baseline entr(ies) that no longer flag.`,
    );
    console.error(
      "The baseline only shrinks. Remove the converged entr(ies) (or run " +
        "`--write` to reseed):\n",
    );
    for (const e of sortKeys(stale)) {
      console.error(`  - ${e.package}  ${e.tsFile}  ${e.rubyName}  ${e.call}`);
    }
  }

  return 1;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(process.argv.includes("--write"));
  process.exit(code);
}

void runAsScript();
