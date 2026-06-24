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
 * ── Reseed ONLY from a full, fresh artifact (RFC 0044 determinism) ──────────
 * This gate was environment-non-deterministic: a stale local ts-api cache
 * served call-less manifests, so a local `pnpm api:compare` reported FEWER
 * call mismatches than CI for the same commit. The dangerous move is reseeding
 * from that artifact: `--write` rebuilds the baseline from whatever the local
 * run produced, silently DROPPING entries CI still flags and turning a
 * green-locally baseline red on the merge train (PR #4020). (A stale local
 * *gate*, by contrast, fails LOUDLY — the dropped entries surface as STALE
 * baseline rows — so it is `--write`, not the gate, that desyncs.)
 *
 * The fix is in three parts:
 *   1. the stale-cache root cause is closed upstream by the self-busting
 *      extractor schema token (PR #4044), so a warm local run now matches CI;
 *   2. reseed ONLY through the canonical path below, which force-rebuilds every
 *      cache first so the artifact can't be a warm-cache under-report:
 *
 *        pnpm api:calls:reseed  # API_COMPARE_FORCE=1 api:compare && this --write
 *
 *   3. as a backstop, the artifact records the `packages` it compared and this
 *      script ABORTS (gate AND `--write`) unless that set covers every
 *      api-compare package — catching a partial-scope artifact (an unfetched
 *      vendor source, a `--package`-filtered run, or one predating the field)
 *      before it can reseed or pass a gate CI would fail.
 *
 * Bottom line: do NOT `--write` by hand from a possibly-stale env; run
 * `pnpm api:calls:reseed`.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-deps.ts), async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, PACKAGES, ROOT_DIR } from "./config.js";

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-exclude.json",
);
// Ratchets the full-surface artifact only. compare.ts also writes a
// `-privates-only` variant under `--privates`, but private-method body-call
// fidelity is intentionally NOT gated — privates are advisory-only throughout
// the compare tooling, and gating them would ratchet internal-method bodies
// that have no Rails public-contract obligation.
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches.json");

const DEFAULT_REASON =
  "Baseline (RFC 0044): pre-existing call-set flag inherited when the ratchet " +
  "landed; pending per-cluster burndown review.";

// One flagged Ruby body call on a matched pair. The artifact groups several
// `missing` calls under one (package, rubyName, tsFile) record; the baseline is
// keyed at the individual-call grain so burndown stories converge one call at a
// time. `package` is part of the key because two packages can share a relative
// `tsFile` + `rubyName` + `call` (today the artifact is all-activerecord, but
// keying without it would silently collapse such rows into one).
export interface CallMismatchKey {
  package: string;
  tsFile: string;
  rubyName: string;
  call: string;
}

export interface ExcludeEntry extends CallMismatchKey {
  reason: string;
}

interface ArtifactMismatch {
  package: string;
  tsFile: string;
  rubyName: string;
  missing: string[];
}

export interface Artifact {
  // The packages this artifact's run actually compared (compare.ts writes it
  // sorted). Optional so an artifact predating the field doesn't crash the
  // loader — but its ABSENCE is itself a partial-scope signal (see
  // missingScope): a current compare.ts always emits it.
  packages?: string[];
  mismatches: ArtifactMismatch[];
}

// Packages that SHOULD have been compared but are absent from the artifact's
// `packages` — the signature of a partial-scope run: an unfetched vendor
// source, a `--package`-filtered run, or an artifact predating the field. A
// non-empty result means the artifact covers a narrower surface than CI and
// must not be reseeded or gated from. `expected` defaults to the full
// api-compare package set. (This is a coverage check, not a freshness one:
// a stale ts-api cache leaves every package PRESENT but under-reports its
// calls — that mode is closed upstream by the extractor schema token (#4044)
// and, for reseeds, by the force-rebuild api:calls:reseed path.)
export function missingScope(artifact: Artifact, expected: readonly string[] = PACKAGES): string[] {
  const present = new Set(artifact.packages ?? []);
  return expected.filter((p) => !present.has(p)).sort();
}

export function keyOf(k: CallMismatchKey): string {
  return `${k.package} ${k.tsFile} ${k.rubyName} ${k.call}`;
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
      keys.push({
        package: m.package,
        tsFile: m.tsFile,
        rubyName: m.rubyName,
        call: callOf(missing),
      });
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
export function reseed(
  current: CallMismatchKey[],
  baseline: ExcludeEntry[],
  defaultReason: string = DEFAULT_REASON,
): ExcludeEntry[] {
  const reasons = new Map(baseline.map((e) => [keyOf(e), e.reason]));
  // Collapse to one entry per key: the artifact can carry several `missing`
  // rows whose Ruby call name (the key grain) coincides — e.g. one call mapped
  // to two TS candidates — which flattenArtifact emits as duplicate keys. The
  // baseline is a 1:1 record (findDuplicateKeys rejects dups), so dedupe here.
  const byKey = new Map<string, ExcludeEntry>();
  for (const k of current) {
    const key = keyOf(k);
    if (byKey.has(key)) continue;
    byKey.set(key, { ...k, reason: reasons.get(key) ?? defaultReason });
  }
  return sortEntries([...byKey.values()]);
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

export async function loadArtifact(): Promise<Artifact> {
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
  return readJson<Artifact>(ARTIFACT_PATH);
}

export async function loadCurrent(): Promise<CallMismatchKey[]> {
  return flattenArtifact(await loadArtifact());
}

async function main(write: boolean): Promise<number> {
  const baseline = await loadBaseline();
  const artifact = await loadArtifact();
  const current = flattenArtifact(artifact);

  const dups = findDuplicateKeys(baseline);
  if (dups.length > 0) {
    console.error(
      `\ncall-mismatches ratchet: ${dups.length} duplicate baseline key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  // Determinism guard (RFC 0044): a partial-scope artifact covers fewer
  // packages than CI, so both reseeding and gating from it desync local vs CI.
  // Fail loud rather than silently shrink the baseline or pass a gate CI fails.
  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\ncall-mismatches ratchet: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "It covers fewer packages than CI (an unfetched vendor source, a " +
        "`--package`-filtered run, or a stale artifact); reseeding or gating " +
        "from it would desync local vs CI. Regenerate the full surface:\n" +
        "  pnpm api:calls:reseed   (or `API_COMPARE_FORCE=1 pnpm api:compare` " +
        "then re-run this).\n",
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
      console.error(`  + ${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}`);
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
