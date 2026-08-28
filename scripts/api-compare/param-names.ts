// Parameter-NAME comparison for parity:api (advisory — never changes the parity %).
//
// arity.ts compares how MANY positional args a matched pair takes; this module
// compares what they are CALLED. CLAUDE.md makes that a first-class fidelity
// rule — "a local or parameter keeps the Rails identifier, camelCased — Ruby
// `stmt` is `stmt`, not `statement`" — but nothing measured it, so a port that
// kept the count and renamed every parameter scored 100%. Two successive arel
// audits had to find the renames by hand (12 in PR #7123, 4 more in PR #7148);
// this is that hand-run diff, folded in beside the check that already
// half-implements it.
//
// Only same-length pairs are compared: the TS side is tried in the same
// candidate forms arity.ts uses (as-declared, minus a leading receiver, minus a
// trailing ported `&block`), and a pair that lines up under NO form is an arity
// finding, not a naming one.

import type { ParamInfo } from "@blazetrails/parity/types";
import { snakeToCamel } from "@blazetrails/parity/conventions";
import { isReceiverParam, stripThis } from "./arity.js";

/** Trailing-param names denoting a ported Ruby block — the same convention
 *  arity.ts strips, kept in step with it (see TRAILING_CALLBACK_NAMES there). */
const TRAILING_CALLBACK_NAMES = new Set(["fn", "cb", "callback", "block", "blk", "compute"]);

/** Ruby parameter names whose camelCased spelling TypeScript cannot use
 *  verbatim: a reserved word is a syntax error in a parameter position, so the
 *  rename is not drift. Rails' own `aliaz` (`arel/nodes/count.rb:7`) is the
 *  same workaround one language earlier — Ruby spells it `aliaz` because
 *  `alias` is a Ruby keyword — which is why that pair never reaches this set. */
const RESERVED_RUBY_PARAM_NAMES = new Set([
  // ECMAScript reserved words, which are not valid binding identifiers.
  ...`break case catch class const continue debugger default delete do else enum
      export extends false finally for function if import in instanceof new null
      return super switch this throw true try typeof var void while with`.split(/\s+/),
  // Reserved only in strict mode — which every module is.
  ...`implements interface let package private protected public static yield`.split(/\s+/),
]);

/** TS names a Ruby splat/kwarg group is conventionally collapsed into. The port
 *  bundles `*args` / `**opts` / a kwarg group into one object rather than
 *  spelling Ruby's name (see arity.ts `collapseKeywordsIntoOptionsObject`), so
 *  the name difference is the convention, not a rename. */
const COLLAPSED_GROUP_NAMES = new Set(["options", "opts", "args", "rest", "kwargs", "params"]);

export interface ParamNameMismatch {
  /** 0-based position in the aligned positional list. */
  position: number;
  /** The Ruby parameter name, camelCased — what the TS name should be. */
  ruby: string;
  /** The TS parameter identifier, minus a leading `_`. */
  ts: string;
}

/** The Ruby params that occupy a positional slot in the port — everything but a
 *  `&block`, which arity.ts excludes from the count for the same reason. */
function rubyPositional(params: ParamInfo[]): ParamInfo[] {
  return params.filter((p) => p.kind !== "block");
}

/** The identifier to compare: a leading `_` is the "intentionally unused"
 *  convention on both sides — Ruby's `_new_value_before_type_cast`
 *  (`attribute_methods/dirty.rb`) and TS's `_value` mean the same thing — so it
 *  is not part of the name on either. */
export function bareIdentifier(name: string): string {
  return name.replace(/^_+/, "");
}

/** Does this side carry an actual identifier to compare? A Ruby anonymous
 *  splat (`def validate_constraint(**)`) is recorded under the sigil itself, and
 *  a TS destructured parameter (`{ prepare = false }`) is a pattern rather than
 *  a name — neither has a spelling a rename could be read off. */
function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

/** Is this position's difference one of the recognised legitimate ones? */
function isLegitimateDifference(ruby: ParamInfo, ts: ParamInfo): boolean {
  if (!isIdentifier(ruby.name) || !isIdentifier(bareIdentifier(ts.name))) return true;
  if (RESERVED_RUBY_PARAM_NAMES.has(bareIdentifier(snakeToCamel(ruby.name)))) return true;
  const isGroup = ruby.kind === "rest" || ruby.kind === "keyword" || ruby.kind === "keyword_rest";
  return isGroup && COLLAPSED_GROUP_NAMES.has(bareIdentifier(ts.name));
}

/** Every TS candidate form that lines up with `rubyList` position-for-position.
 *  Empty when none does — a length disagreement is arity's finding. */
export function alignedTsForms(rubyList: ParamInfo[], ts: ParamInfo[]): ParamInfo[][] {
  if (rubyList.length === 0) return [];
  return tsForms(ts).filter((f) => f.length === rubyList.length);
}

/** The TS candidate forms, in the order arity.ts tries them. */
function tsForms(ts: ParamInfo[]): ParamInfo[][] {
  const base = stripThis(ts);
  const noReceiver = base.length > 0 && isReceiverParam(base[0]) ? base.slice(1) : base;
  const stripCallback = (list: ParamInfo[]): ParamInfo[] =>
    list.length > 0 && TRAILING_CALLBACK_NAMES.has(list[list.length - 1].name)
      ? list.slice(0, -1)
      : list;
  return [base, noReceiver, stripCallback(base), stripCallback(noReceiver)];
}

/**
 * Positions where the TS parameter is not the Ruby one, camelCased. Empty when
 * the pair matches, when a legitimate difference explains every position, or
 * when no candidate form aligns with the Ruby list — length disagreement is
 * arity's finding, and reporting it twice would double-charge one divergence.
 */
export function compareParamNames(ruby: ParamInfo[], ts: ParamInfo[]): ParamNameMismatch[] {
  const rubyList = rubyPositional(ruby);
  let best: ParamNameMismatch[] | null = null;
  // Several forms can align — `with_node(node)` against `withNode(node, block)`
  // lines up both as receiver-stripped `(block)` and as callback-stripped
  // `(node)`. The strips exist to ABSORB the port's conventions, so the reading
  // that absorbs the most is the honest one; taking the first would invent a
  // rename out of the very convention the strip is there to recognise.
  for (const form of alignedTsForms(rubyList, ts)) {
    const mismatches: ParamNameMismatch[] = [];
    for (let position = 0; position < rubyList.length; position++) {
      const rubyParam = rubyList[position];
      const tsParam = form[position];
      const expected = bareIdentifier(snakeToCamel(rubyParam.name));
      const actual = bareIdentifier(tsParam.name);
      if (expected === actual) continue;
      if (isLegitimateDifference(rubyParam, tsParam)) continue;
      mismatches.push({ position, ruby: expected, ts: actual });
    }
    if (mismatches.length === 0) return [];
    if (best === null || mismatches.length < best.length) best = mismatches;
  }
  return best ?? [];
}

export interface ParamNameVerdict {
  /** Did ANY candidate line up positionally? A pair that never aligns is an
   *  arity finding and is left out of the compared denominator entirely. */
  aligned: boolean;
  rows: ParamNameMismatch[];
}

/**
 * Verdict for a Ruby signature against every TS signature recorded for its name
 * in the matched file (overloads and a get/set pair share one name). Clean if
 * ANY candidate names its parameters the Rails way; otherwise the candidate
 * with the FEWEST differing positions is reported, so a flagged row shows the
 * real implementation rather than an overload signature recorded beside it.
 */
export function matchParamNamesAgainst(
  ruby: ParamInfo[],
  candidates: ParamInfo[][],
): ParamNameVerdict {
  const rubyList = rubyPositional(ruby);
  let best: ParamNameMismatch[] | null = null;
  for (const c of candidates) {
    // A candidate that lines up with NO form is not this method's signature at
    // all (a 0-arg re-export binding sharing the name); letting it count as
    // clean would clear a real rename on the implementation beside it.
    if (alignedTsForms(rubyList, c).length === 0) continue;
    const rows = compareParamNames(ruby, c);
    if (rows.length === 0) return { aligned: true, rows: [] };
    if (best === null || rows.length < best.length) best = rows;
  }
  return best === null ? { aligned: false, rows: [] } : { aligned: true, rows: best };
}
