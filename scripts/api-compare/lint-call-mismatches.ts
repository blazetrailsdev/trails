#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the advisory call-set parity dimension.
 *
 * `compare.ts` writes output/call-mismatches.json — name-matched (Ruby, TS)
 * method pairs whose ported TS body omits a fidelity-critical call Rails makes
 * (see SIGNIFICANT_CALLS in compare.ts). That artifact is advisory and never
 * affects the parity %, so on its own nothing stops new mismatches from
 * landing. This script turns it into a one-way ratchet, mirroring the
 * `eslint/*-exclude.json` baselines (require-canonical-schema, no-explicit-any,
 * …): a committed baseline lists the currently-known mismatches keyed by
 * `tsFile + rubyName + call`, and CI fails on:
 *
 *   - any NEW mismatch absent from the baseline (the ratchet — no regressions);
 *   - any STALE baseline entry that no longer flags (only-shrink — the baseline
 *     can only get smaller, so a converged call must be removed from it).
 *
 * The baseline (call-mismatches-exclude.json) is where the RFC 0044 per-cluster
 * burndown stories record confirmed behavioral equivalents (one-line `reason`
 * per entry). Removing an entry is how a converged call drops out — once the TS
 * body makes the call (or the cluster story proves equivalence and deletes the
 * row), the stale check forces the baseline to shrink.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-call-mismatches.ts          # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-call-mismatches.ts --write  # reseed baseline
 *
 * `--write` regenerates the baseline from the current artifact, preserving the
 * `reason` of entries that still flag and dropping stale rows. Run it after a
 * burndown story lands a convergence so the committed baseline shrinks.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-deps.ts), async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-exclude.json",
);
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches.json");

const DEFAULT_REASON =
  "Baseline (RFC 0044): pre-existing call-set flag inherited when the ratchet " +
  "landed; pending per-cluster burndown review.";

// One flagged Ruby body call on a matched pair. The artifact groups several
// `missing` calls under one (rubyName, tsFile) record; the baseline is keyed at
// the individual-call grain so burndown stories converge one call at a time.
export interface CallMismatchKey {
  tsFile: string;
  rubyName: string;
  call: string;
}

export interface ExcludeEntry extends CallMismatchKey {
  reason: string;
}

interface ArtifactMismatch {
  tsFile: string;
  rubyName: string;
  missing: string[];
}

interface Artifact {
  mismatches: ArtifactMismatch[];
}

export function keyOf(k: CallMismatchKey): string {
  return `${k.tsFile} ${k.rubyName} ${k.call}`;
}

// A `missing` string reads "ruby_call → tsCand|tsCand"; the ratchet keys on the
// Ruby call name (the part before the arrow), which is what SIGNIFICANT_CALLS
// gates and what a burndown story names when it converges.
export function callOf(missing: string): string {
  return missing.split("→")[0]!.trim();
}

export function flattenArtifact(artifact: Artifact): CallMismatchKey[] {
  const keys: CallMismatchKey[] = [];
  for (const m of artifact.mismatches) {
    for (const missing of m.missing) {
      keys.push({ tsFile: m.tsFile, rubyName: m.rubyName, call: callOf(missing) });
    }
  }
  return keys;
}

export interface DiffResult {
  added: CallMismatchKey[]; // flagged now, not in baseline — the ratchet failure
  stale: ExcludeEntry[]; // in baseline, no longer flags — the only-shrink failure
}

export function diffAgainstBaseline(
  current: CallMismatchKey[],
  baseline: ExcludeEntry[],
): DiffResult {
  const currentKeys = new Set(current.map(keyOf));
  const baselineKeys = new Set(baseline.map(keyOf));
  return {
    added: current.filter((k) => !baselineKeys.has(keyOf(k))),
    stale: baseline.filter((e) => !currentKeys.has(keyOf(e))),
  };
}

function sortEntries<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

// Rebuild the baseline from the live artifact: keep each still-flagging call,
// reusing a prior reason when present, defaulting new ones. Dropped rows are the
// stale entries the gate would otherwise reject.
export function reseed(current: CallMismatchKey[], baseline: ExcludeEntry[]): ExcludeEntry[] {
  const reasons = new Map(baseline.map((e) => [keyOf(e), e.reason]));
  return sortEntries(
    current.map((k) => ({ ...k, reason: reasons.get(keyOf(k)) ?? DEFAULT_REASON })),
  );
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

// A baseline with two rows for the same (tsFile, rubyName, call) is malformed:
// the diff would silently tolerate one of them going stale. Reject it so the
// committed file stays a clean 1:1 record of the flagged calls.
export function findDuplicateKeys(baseline: ExcludeEntry[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const e of baseline) {
    const k = keyOf(e);
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}

export async function loadBaseline(): Promise<ExcludeEntry[]> {
  return readJson<ExcludeEntry[]>(BASELINE_PATH);
}

export async function loadCurrent(): Promise<CallMismatchKey[]> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm exec tsx ` +
        "scripts/api-compare/compare.ts` (or `pnpm api:compare`) first to write it.",
    );
  }
  return flattenArtifact(await readJson<Artifact>(ARTIFACT_PATH));
}

async function main(write: boolean): Promise<number> {
  const baseline = await loadBaseline();
  const current = await loadCurrent();

  const dups = findDuplicateKeys(baseline);
  if (dups.length > 0) {
    console.error(
      `\ncall-mismatches ratchet: ${dups.length} duplicate baseline key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  if (write) {
    const next = reseed(current, baseline);
    await fs.writeFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`Wrote ${BASELINE_PATH}: ${next.length} baselined call mismatches`);
    return 0;
  }

  const { added, stale } = diffAgainstBaseline(current, baseline);

  if (added.length === 0 && stale.length === 0) {
    console.log(`call-mismatches ratchet: OK (${baseline.length} baselined)`);
    return 0;
  }

  if (added.length > 0) {
    console.error(
      `\ncall-mismatches ratchet: ${added.length} NEW mismatch(es) not in the baseline.`,
    );
    console.error(
      "A ported TS body omits a fidelity-critical call Rails makes. Implement the " +
        "call, or — if it is satisfied by a different path — add it to\n  " +
        `${path.relative(ROOT_DIR, BASELINE_PATH)} with a one-line reason.\n`,
    );
    for (const k of sortEntries(added)) {
      console.error(`  + ${k.tsFile}  ${k.rubyName}  ${k.call}`);
    }
  }

  if (stale.length > 0) {
    console.error(
      `\ncall-mismatches ratchet: ${stale.length} STALE baseline entr(ies) that no longer flag.`,
    );
    console.error(
      "The baseline only shrinks. Remove the converged entr(ies) (or run " +
        "`--write` to reseed):\n",
    );
    for (const e of sortEntries(stale)) {
      console.error(`  - ${e.tsFile}  ${e.rubyName}  ${e.call}`);
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
