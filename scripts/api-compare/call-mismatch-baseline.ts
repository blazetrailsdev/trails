/**
 * Shared machinery for the call-set parity ratchet (RFC 0047, wide gate:
 * lint-call-mismatches-wide.ts): the artifact/baseline row shapes, the key
 * grain the baselines are recorded at, and the diff/reseed/sort primitives the
 * gate, `api:build` and the unreviewed ratchet all agree on.
 *
 * `compare.ts --wide-calls` writes output/call-mismatches-wide.json — name-matched
 * (Ruby, TS) method pairs whose ported TS body omits a call Rails' body makes.
 * That artifact is advisory and never affects the parity %, so on its own
 * nothing stops new mismatches from landing. The wide gate turns it into a
 * one-way ratchet, mirroring the `eslint/*-exclude.json` baselines
 * (no-explicit-any, rails-error-parity, …): a committed baseline lists the
 * currently-known mismatches keyed by `package + tsFile + rubyName + call`, and
 * CI fails on:
 *
 *   - any NEW mismatch absent from the baseline (the ratchet — no regressions);
 *   - any STALE baseline entry that no longer flags (only-shrink — the baseline
 *     can only get smaller, so a converged call must be removed from it).
 *
 * RFC 0084 folded the narrow RFC 0044 gate into the wide one. That gate ratcheted
 * a second artifact (output/call-mismatches.json) against a curated
 * SIGNIFICANT_CALLS allowlist; the wide population strictly subsumed it, so it
 * cost a duplicate artifact, a second CI step and the two-artifact
 * `API_COMPARE_FORCE` trap for no signal the wide gate did not already carry.
 * Its reviewed reasons moved into the wide baseline shards. What survives here
 * is the machinery both gates shared — no CLI: this module is a library.
 *
 * ── Gate ONLY from a full, fresh artifact (RFC 0044 determinism) ────────────
 * This gate was environment-non-deterministic: a stale local ts-api cache
 * served call-less manifests, so a local `pnpm api:compare` reported FEWER
 * call mismatches than CI for the same commit. The dangerous move is reseeding
 * from that artifact: a `--write` rebuilds the baseline from whatever the local
 * run produced, silently DROPPING entries CI still flags and turning a
 * green-locally baseline red on the merge train (PR #4020). (A stale local
 * *gate*, by contrast, fails LOUDLY — the dropped entries surface as STALE
 * baseline rows — so it is `--write`, not the gate, that desyncs.)
 *
 * The fix is in three parts:
 *   1. the stale-cache root cause is closed upstream by the self-busting
 *      extractor schema token (PR #4044), so a warm local run now matches CI;
 *   2. reseed ONLY through the canonical path, which force-rebuilds every
 *      cache first so the artifact can't be a warm-cache under-report:
 *
 *        pnpm api:calls:wide:reseed
 *
 *   3. as a backstop, the artifact records the `packages` it compared and the
 *      gate ABORTS (gate AND `--write`) unless that set covers every
 *      api-compare package — catching a partial-scope artifact (an unfetched
 *      vendor source, a `--package`-filtered run, or one predating the field)
 *      before it can reseed or pass a gate CI would fail. See {@link missingScope}.
 *
 * Hard rules: no node:* imports, no process.* , async fs only.
 */

import { PACKAGES } from "./config.js";
import { NARROW_DEFAULT_REASON as DEFAULT_REASON } from "./missing-rails-call-tags.js";

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
  /** `@missingRailsCall` tags on a compared method whose call no longer flags
   *  (RFC 0083). Optional so an artifact predating the field still loads; the
   *  wide gate fails on a non-empty list, the tag's only-shrink half. */
  staleTags?: StaleTag[];
}

export interface StaleTag {
  package: string;
  tsFile: string;
  tsName: string;
  call: string;
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
  return missing.split("→")[0].trim();
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

/**
 * Total order on baseline entries: ascending UTF-16 code-unit order of
 * `keyOf` (`package tsFile rubyName call`). Deliberately NOT `localeCompare`:
 * ICU collation is locale- and ICU-version-dependent and treats punctuation as
 * secondary, so `permit!` vs `permit_any_in_array` (and any other key pair
 * differing only in `!`/`_`/`?`) sorts differently depending on who runs
 * `--write`. That made a reseed driven by one package rewrite the entry order
 * of untouched packages' baseline files. Code-unit order has none of that
 * environment dependence, and `keyOf` is unique per entry (findDuplicateKeys
 * enforces it), so the order is total — no tie-break needed.
 */
export function compareKeys(a: CallMismatchKey, b: CallMismatchKey): number {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function sortEntries<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort(compareKeys);
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
