// Literal parameter-default + constant comparison for api:compare (advisory —
// never changes parity). Diffs a default/constant's literal *value* after
// normalization absorbing cross-language noise (numeric underscores,
// symbol→string, nil↔null/undefined, escapes); a non-literal is uncomparable.

import type { LiteralValue, ParamInfo } from "./types.js";
import { snakeToCamel } from "./conventions.js";

/** Canonicalize so Ruby raw source escapes (`\e`, `\r\n`) and TS resolved control chars compare equal. */
function canonString(s: string): string {
  const real: Record<string, string> = { "\x1b": "<e>", "\r": "<r>", "\n": "<n>", "\t": "<t>" };
  return s
    .replace(/[\x1b\r\n\t]/g, (c) => real[c])
    .replace(/\\e|\\033|\\x1[bB]|\\u001[bB]/g, "<e>")
    .replace(/\\([rnt])/g, (_, c) => `<${c}>`);
}

/** Canonical comparison key, or null when uncomparable (`expr`); int/float parse numerically. */
export function normalizeLiteral(lit: LiteralValue): string | null {
  switch (lit.kind) {
    case "int":
    case "float":
      // int/float share one key: TS's single `number` type makes `1` and `1.0`
      // the identical value, so distinguishing them only manufactures noise.
      return `num:${Number(String(lit.value).replace(/_/g, ""))}`;
    case "string":
    case "symbol":
      return `str:${canonString(String(lit.value ?? ""))}`;
    case "bool":
      return `bool:${lit.value}`;
    case "nil":
      return "nil";
    case "array":
      return "arr";
    case "hash":
      return "hash";
    default:
      return null; // expr — not a literal
  }
}

export type LiteralVerdict = "match" | "mismatch" | "skip";

/** Compare two literals. "skip" when either side is non-literal (`expr`), or
 *  when exactly one side is `nil`: Rails uses `nil` as a sentinel and computes
 *  the committed value in the body (`validate_each(..., precision: nil)`), so it
 *  has no value to compare. `nil`↔`nil` (incl. TS undefined/null) still matches. */
export function compareLiteral(ruby: LiteralValue, ts: LiteralValue): LiteralVerdict {
  const r = normalizeLiteral(ruby);
  const t = normalizeLiteral(ts);
  if (r === null || t === null) return "skip";
  if ((r === "nil") !== (t === "nil")) return "skip";
  return r === t ? "match" : "mismatch";
}

/** Human-readable rendering of a literal for the mismatch report. */
export function displayLiteral(lit: LiteralValue): string {
  switch (lit.kind) {
    case "string":
    case "symbol":
      return JSON.stringify(lit.value ?? "");
    case "nil":
      return "nil";
    case "array":
      return "[]";
    case "hash":
      return "{}";
    default:
      return String(lit.value);
  }
}

export interface LiteralDefaultResult {
  compared: number;
  skipped: number;
  mismatches: { name: string; rubyValue: string; tsValue: string }[];
}

/** Compare a Ruby method's literal defaults against the matched TS signatures.
 *  Params match by name (snake_case → camelCase) not position — the `this`-mixin
 *  receiver shifts positions. A TS param with no default is skipped silently. */
export function compareDefaults(
  rubyParams: ParamInfo[],
  tsCandidates: ParamInfo[][],
): LiteralDefaultResult {
  const tsByName = new Map<string, LiteralValue>();
  for (const cand of tsCandidates) {
    for (const p of cand) {
      if (p.literal && !tsByName.has(p.name)) tsByName.set(p.name, p.literal);
    }
  }

  const result: LiteralDefaultResult = { compared: 0, skipped: 0, mismatches: [] };
  for (const rp of rubyParams) {
    if (!rp.literal) continue;
    const tl = tsByName.get(snakeToCamel(rp.name)) ?? tsByName.get(rp.name);
    if (!tl) continue;
    const verdict = compareLiteral(rp.literal, tl);
    if (verdict === "skip") {
      result.skipped++;
      continue;
    }
    result.compared++;
    if (verdict === "mismatch") {
      result.mismatches.push({
        name: rp.name,
        rubyValue: displayLiteral(rp.literal),
        tsValue: displayLiteral(tl),
      });
    }
  }
  return result;
}

/** Match a Ruby constant name to a TS one — SCREAMING_SNAKE passes through; also
 *  accept the camelized form for a lowercase Ruby constant ported as camelCase. */
export function constantNameMatches(rubyName: string, tsName: string): boolean {
  return rubyName === tsName || snakeToCamel(rubyName.toLowerCase()) === tsName;
}
