/**
 * Shared machinery for the call-ARGUMENT parity ratchet (RFC 0095, gate:
 * lint-call-args.ts): the row shape, the key grain the baseline is recorded at,
 * and the diff/reseed/sort primitives the gate agrees on.
 *
 * This mirrors call-mismatch-baseline.ts (the call-SET ratchet, RFC 0047) and
 * deliberately does NOT reuse its key: that key is
 * `package + tsFile + rubyName + call`, which has no argument component, so two
 * differently-wrong argument lists at the same call would collapse into one
 * row. RFC 0084 also measures that baseline's ROW COUNT as the call-set debt
 * metric, and folding a second dimension into it corrupts the measurement. So
 * the two trees stay separate, and only the dimension-neutral pieces are shared
 * — baseline-json.ts, gate-regen.ts, and the partial-scope guard in
 * call-mismatch-baseline.ts.
 *
 * Only `shape` rows are gated (RFC 0095 §4); `naming` rows stay report-only.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

/** One flagged call site at the grain the baseline records. `rubyArgs` is part
 *  of the key: one call in one method can be wrong two ways at two sites. */
export interface CallArgKey {
  package: string;
  tsFile: string;
  rubyName: string;
  call: string;
  rubyArgs: string[];
}

export interface CallArgExcludeEntry extends CallArgKey {
  reason: string;
}

export interface CallArgRow extends CallArgKey {
  rubyFile: string;
  tsName: string;
  class: string;
  tsArgs: string[];
}

export interface CallArgArtifact {
  /** The packages the run compared; absent on an artifact predating the field,
   *  which `missingScope` reads as the partial scope it is. */
  packages?: string[];
  /** Total sites compared, for the report's denominator. */
  compared: number;
  mismatches: CallArgRow[];
}

export function keyOf(k: CallArgKey): string {
  return `${k.package} ${k.tsFile} ${k.rubyName} ${k.call} ${k.rubyArgs.join(",")}`;
}

/** The artifact rows the gate ratchets: `shape` only. */
export function gatedRows(artifact: CallArgArtifact): CallArgRow[] {
  return artifact.mismatches.filter((m) => m.class === "shape");
}

/** `added` — flagged now, absent from the baseline (the ratchet failure);
 *  `stale` — baselined but no longer flagging (the only-shrink failure). */
export function diffAgainstBaseline(
  current: CallArgKey[],
  baseline: CallArgExcludeEntry[],
): { added: CallArgKey[]; stale: CallArgExcludeEntry[] } {
  const currentKeys = new Set(current.map(keyOf));
  const baselineKeys = new Set(baseline.map(keyOf));
  return {
    added: current.filter((k) => !baselineKeys.has(keyOf(k))),
    stale: baseline.filter((e) => !currentKeys.has(keyOf(e))),
  };
}

/** Total order on baseline entries: ascending UTF-16 code-unit order of
 *  `keyOf`. Deliberately NOT `localeCompare`, for the reason spelled out in
 *  call-mismatch-baseline.ts#compareKeys. */
export function compareKeys(a: CallArgKey, b: CallArgKey): number {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function sortKeys<T extends CallArgKey>(entries: T[]): T[] {
  return [...entries].sort(compareKeys);
}

/** Rebuild the baseline from the live artifact: keep each still-flagging row,
 *  reusing a prior reason when present and seeding new ones with
 *  `defaultReason`. Dropped rows are the stale entries the gate rejects. */
export function reseed(
  current: CallArgKey[],
  baseline: CallArgExcludeEntry[],
  defaultReason: string,
): CallArgExcludeEntry[] {
  const reasons = new Map(baseline.map((e) => [keyOf(e), e.reason]));
  const byKey = new Map<string, CallArgExcludeEntry>();
  for (const k of current) {
    const key = keyOf(k);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      package: k.package,
      tsFile: k.tsFile,
      rubyName: k.rubyName,
      call: k.call,
      rubyArgs: k.rubyArgs,
      reason: reasons.get(key) ?? defaultReason,
    });
  }
  return sortKeys([...byKey.values()]);
}

/** Baseline keys recorded twice — malformed: the diff would then tolerate one
 *  of the pair going stale forever. */
export function findDuplicateKeys(baseline: CallArgExcludeEntry[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const e of baseline) {
    const k = keyOf(e);
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}
