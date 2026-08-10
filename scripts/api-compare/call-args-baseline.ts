/**
 * Shared machinery for the call-ARGUMENT parity ratchet (RFC 0095, gate:
 * lint-call-args.ts): the row shape, the key grain the baseline is recorded at,
 * and the diff/reseed/sort primitives the gate agrees on.
 *
 * Rows live in the EXISTING per-file shards of call-mismatches-exclude/,
 * alongside the call-set rows for the same source file, carrying `kind: "args"`
 * and the extra `rubyArgs` key component. The call-set key has no argument
 * component, so two differently-wrong argument lists at one call would collapse
 * into a single row without it; the `kind` discriminator is what keeps RFC
 * 0084's row-count debt metric exactly the call-set rows (see
 * call-mismatch-baseline.ts#RowKind for why a second tree was reversed).
 *
 * Only `shape` rows are gated (RFC 0095 §4); `naming` rows stay report-only.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

import { type CallMismatchKey, compareShardKeys, shardKeyOf } from "./call-mismatch-baseline.js";

/** One flagged call site at the grain the baseline records. `rubyArgs` is part
 *  of the key: one call in one method can be wrong two ways at two sites. */
export interface CallArgKey extends CallMismatchKey {
  kind: "args";
  rubyArgs: string[];
}

export interface CallArgExcludeEntry extends CallArgKey {
  reason: string;
}

export interface CallArgArtifact {
  /** The packages the run compared; absent on an artifact predating the field,
   *  which `missingScope` reads as the partial scope it is. */
  packages?: string[];
  /** Sites compared — the report's denominator. */
  compared: number;
  mismatches: (CallArgKey & {
    rubyFile: string;
    tsName: string;
    class: string;
    tsArgs: string[];
  })[];
}

/** The rows the gate ratchets: `shape` only. */
export function gatedRows(artifact: CallArgArtifact): CallArgKey[] {
  return artifact.mismatches
    .filter((m) => m.class === "shape")
    .map((m) => ({
      package: m.package,
      tsFile: m.tsFile,
      rubyName: m.rubyName,
      call: m.call,
      kind: "args" as const,
      rubyArgs: m.rubyArgs,
    }));
}

export function sortKeys<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort(compareShardKeys);
}

/** `added` — flagged now, absent from the baseline (the ratchet failure);
 *  `stale` — baselined but no longer flagging (the only-shrink failure). */
export function diffAgainstBaseline(
  current: CallArgKey[],
  baseline: CallArgExcludeEntry[],
): { added: CallArgKey[]; stale: CallArgExcludeEntry[] } {
  const currentKeys = new Set(current.map(shardKeyOf));
  const baselineKeys = new Set(baseline.map(shardKeyOf));
  return {
    added: current.filter((k) => !baselineKeys.has(shardKeyOf(k))),
    stale: baseline.filter((e) => !currentKeys.has(shardKeyOf(e))),
  };
}

/** Rebuild the baseline from the live artifact: keep each still-flagging row,
 *  reusing a prior reason and seeding new ones with `defaultReason`. */
export function reseed(
  current: CallArgKey[],
  baseline: CallArgExcludeEntry[],
  defaultReason: string,
): CallArgExcludeEntry[] {
  const reasons = new Map(baseline.map((e) => [shardKeyOf(e), e.reason]));
  const byKey = new Map<string, CallArgExcludeEntry>();
  for (const k of current) {
    const key = shardKeyOf(k);
    if (byKey.has(key)) continue;
    byKey.set(key, { ...k, reason: reasons.get(key) ?? defaultReason });
  }
  return sortKeys([...byKey.values()]);
}

/** Baseline keys recorded twice — malformed: the diff would then tolerate one
 *  of the pair going stale forever. */
export function findDuplicateKeys(baseline: CallArgExcludeEntry[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const e of baseline) {
    const k = shardKeyOf(e);
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}
