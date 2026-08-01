/**
 * Deviation-catalog filter for the codegen conformance scorer (RFC 0086).
 *
 * `pnpm codegen:score` classifies clean generated defs as matched / reordered /
 * divergent / missing against the hand-written port. Most of the divergent and
 * missing rows are already *known* deviations, catalogued years-deep in the
 * api-compare gates:
 *
 *   - `SKIP` / `SCOPED_SKIP_GROUPS` (conventions.ts) — Ruby methods api:compare
 *     never expects a TS counterpart for, i.e. an expected `missing`.
 *   - `call-mismatches-exclude.json` + the split `call-mismatches-wide-exclude/`
 *     tree — Ruby body calls whose absence from the TS body is reviewed and
 *     accepted, i.e. an expected skeleton `divergent`.
 *
 * Subtracting those leaves the *residue*: divergences nobody has signed off on.
 * That residue is what the convergence guard ratchets (guard.ts), so a newly
 * ported method that silently renames, inlines, or drops a Rails call trips a
 * gate instead of drowning in the 267-row raw baseline.
 *
 * Hard rules: no node:* imports, no process.* here (this module is pure — the
 * caller loads the JSON), async fs only.
 */

import { SKIP, SCOPED_SKIP_GROUPS, isScopedSkip } from "../api-compare/conventions.js";
import { methodName } from "./naming.js";
import { normalizeName } from "./score.js";

/** One entry of `call-mismatches-exclude.json` / the wide exclude tree. */
export interface ExcludeEntry {
  package: string;
  tsFile: string;
  rubyName: string;
  call: string;
  reason: string;
}

export interface Catalog {
  /** Ruby methods with no expected TS surface, keyed by their TS name. */
  skips: Map<string, string>;
  /** Scoped skips: TS name → the Ruby names (with reason) skipped per file. */
  scopedSkips: Map<string, { rubyName: string; reason: string }[]>;
  /** `<tsFile> <tsName>` → skeleton call token → reason. */
  excludedCalls: Map<string, Map<string, string>>;
}

/** The skeleton token `skeletonTokens` would emit for a Ruby call name. */
export function callToken(rubyCall: string): string {
  return `ref:${normalizeName(methodName(rubyCall))}`;
}

function excludeKey(tsFile: string, tsName: string): string {
  return `${tsFile} ${tsName}`;
}

export function buildCatalog(excludes: readonly ExcludeEntry[]): Catalog {
  const skips = new Map<string, string>();
  for (const rubyName of SKIP) {
    skips.set(methodName(rubyName), `api-compare SKIP: ${rubyName}`);
  }

  const scopedSkips = new Map<string, { rubyName: string; reason: string }[]>();
  for (const group of SCOPED_SKIP_GROUPS) {
    for (const rubyName of group.names) {
      const ts = methodName(rubyName);
      const list = scopedSkips.get(ts) ?? [];
      list.push({ rubyName, reason: `api-compare SCOPED_SKIP: ${rubyName}` });
      scopedSkips.set(ts, list);
    }
  }

  const excludedCalls = new Map<string, Map<string, string>>();
  for (const entry of excludes) {
    const key = excludeKey(entry.tsFile, methodName(entry.rubyName));
    const calls = excludedCalls.get(key) ?? new Map<string, string>();
    calls.set(callToken(entry.call), entry.reason);
    excludedCalls.set(key, calls);
  }

  return { skips, scopedSkips, excludedCalls };
}

/**
 * Why a `missing` row is expected, or undefined when it is residue. `rubyFile`
 * is the Rails path the def was generated from (`active_record/persistence.rb`),
 * matching the scoping key `SCOPED_SKIP_GROUPS` uses.
 */
export function catalogueMissing(
  catalog: Catalog,
  tsName: string,
  rubyFile: string,
): string | undefined {
  const flat = catalog.skips.get(tsName);
  if (flat) return flat;
  for (const scoped of catalog.scopedSkips.get(tsName) ?? []) {
    if (isScopedSkip(scoped.rubyName, rubyFile)) return scoped.reason;
  }
  return undefined;
}

/**
 * Multiset difference of two skeletons, in both directions — the tokens that
 * make the bodies diverge. `reordered` never reaches here (same multiset), so a
 * non-empty result is exactly the divergence to explain.
 */
export function skeletonDiff(generated: string, port: string): string[] {
  const remaining = new Map<string, number>();
  for (const t of port.split(" ").filter(Boolean)) {
    remaining.set(t, (remaining.get(t) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const t of generated.split(" ").filter(Boolean)) {
    const n = remaining.get(t) ?? 0;
    if (n > 0) remaining.set(t, n - 1);
    else out.push(t);
  }
  for (const [t, n] of remaining) {
    for (let i = 0; i < n; i++) out.push(t);
  }
  return out;
}

/**
 * Why a `divergent` row is expected, or undefined when it is residue.
 *
 * A divergence is catalogued only when *every* differing token is a call the
 * exclude lists already accept for this (tsFile, method). One unexplained token
 * — a dropped `if`, an extra `throw`, an un-excluded call — keeps the whole row
 * in the residue: partial credit would let a real regression ride in behind a
 * reviewed one.
 */
export function catalogueDivergent(
  catalog: Catalog,
  tsFile: string,
  tsName: string,
  generatedSkeleton: string,
  portSkeleton: string,
): string | undefined {
  const diff = skeletonDiff(generatedSkeleton, portSkeleton);
  if (diff.length === 0) return undefined;
  const calls = catalog.excludedCalls.get(excludeKey(tsFile, tsName));
  if (!calls) return undefined;
  const reasons: string[] = [];
  for (const token of diff) {
    const reason = calls.get(token);
    if (!reason) return undefined;
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return reasons.join(" | ");
}
