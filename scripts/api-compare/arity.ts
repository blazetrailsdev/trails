// Arity comparison for api:compare (advisory — never changes the parity %).
//
// The matcher (compare.ts) pairs Ruby↔TS methods by *name* only, so a port can
// have the right name but the wrong signature. These helpers compare the
// *positional* arg ranges: a match means the ranges OVERLAP (not exact). Two
// conventions get one extra slot of Ruby-max tolerance since the port spells
// them out positionally — kwargs → options object, `&block` → callback.
//
// To absorb the port's mixin convention (CLAUDE.md), the TS side is also tried
// with a leading receiver and/or a trailing ported `&block` stripped:
//   - leading receiver: `this:`-typed, a host type (`record: Base`, any `*Host`),
//     a `*Class` receiver (`modelClass`), an `_`-prefixed placeholder, or a
//     conventional receiver name (see RECEIVER_PARAM_NAMES);
//   - trailing callback: a `&block` ported as an explicit `fn`/`callback` param
//     that the Ruby extractor didn't record (bare `yield`).
// Every such strip is tried only as an *additional* candidate form alongside the
// as-declared signature, and a match needs only ONE form to overlap — so a strip
// can only ever gain a match, never manufacture a mismatch.

import type { ParamInfo } from "./types.js";

/** TS host/receiver types — a leading param of one of these is the explicit host
 *  instance and is stripped. Leaf match also covers `Base<T>` / `ns.Relation`.
 *  Any leaf ending in `Host` is also treated as a mixin-host interface (the repo
 *  convention names them `AttributeMethodHost`, `QueryMethodsHost`, …). */
const HOST_PARAM_TYPES = new Set([
  "Base",
  "Model",
  "Relation",
  "CollectionProxy",
  "CollectionAssociation",
  "Association",
  "ThroughAssociation",
  "HasManyAssociation",
  "HasOneAssociation",
  "HasManyThroughAssociation",
  "HasOneThroughAssociation",
  "BelongsToAssociation",
  "SingularAssociation",
  "AbstractAdapter",
  "Reflection",
  "AbstractReflection",
  "MacroReflection",
  "ThroughReflection",
  "RuntimeReflection",
  "JoinDependency",
  "Batch",
  "Result",
  "ActiveRecordError",
  "Pool",
  "ConnectionPool",
  // Core-extension receivers — Ruby core_ext methods on these classes are ported
  // as free functions that take the receiver explicitly, e.g. Ruby
  // `Date#on_weekday?` → TS `onWeekday(date: Date)`. The leading param IS the
  // `self` the Ruby method runs against.
  "Date",
  "Time",
  "DateTime",
  "Numeric",
  "Duration",
  "PlainDate",
  "PlainTime",
  "PlainDateTime",
  "ZonedDateTime",
  "Instant",
]);

/** Leading-param NAMES that conventionally denote the host receiver (often typed
 *  `any` or a host interface). In this port the `this`-mixin convention spells the
 *  receiver positionally (see CLAUDE.md), so a Ruby instance/class method becomes a
 *  free function whose first arg is the instance/class it was invoked on. Since
 *  stripping only ever *gains* a match (we accept the as-declared form too), an
 *  over-broad entry can at worst hide one off-by-one — never manufacture a mismatch.
 *  Kept off the list: genuine value first-args like `name`, `key`, `value`, `type`. */
const RECEIVER_PARAM_NAMES = new Set([
  "record",
  "klass",
  "rel",
  "relation",
  "assoc",
  "_assoc",
  "owner",
  "proxy",
  "builder",
  "scope",
  "conn",
  "connection",
  "pool",
  "batch",
  "reflection",
  // Explicit-receiver spellings observed across the port.
  "host",
  "self",
  "model",
  "modelClass",
  "recordOrClass",
  "subject",
  "target",
  "adapter",
  "node",
  "entry",
  "branch",
  "association",
  "date",
  "time",
  "input",
  "connections",
  "targets",
  "tags",
  "controller",
  "collection",
]);

/** Trailing-param NAMES that conventionally denote a ported Ruby block (`&block`).
 *  The Ruby extractor only records a block param when it's declared in the
 *  signature — methods that bare-`yield` show zero block params, so the TS port's
 *  explicit trailing callback has nothing to match against. Dropping it only ever
 *  *gains* a match (same guarantee as receiver stripping). Genuine trailing value
 *  args (`options`, `value`) are intentionally absent. */
const TRAILING_CALLBACK_NAMES = new Set([
  "fn",
  "cb",
  "callback",
  "block",
  "blk",
  "compute",
  "yielder",
  "next",
]);

function leafTypeName(type: string | undefined): string | null {
  if (!type) return null;
  // Strip generics/arrays, take the leaf of any qualifier: `ns.Base<T>[]` → `Base`.
  const base = type.replace(/<[^>]*>/g, "").replace(/\[\]/g, "");
  return base.split(/::|\./).pop()?.trim() || null;
}

/** Drop a leading `this:`-typed mixin receiver param (literally named `this`). */
function stripThis(params: ParamInfo[]): ParamInfo[] {
  return params.length > 0 && params[0].name === "this" ? params.slice(1) : params;
}

/** Is this leading param an explicit receiver — a known/`*Host` type, a `*Class`
 *  receiver, or a conventional receiver name? */
function isReceiverParam(first: ParamInfo): boolean {
  const leaf = leafTypeName(first.type);
  if (leaf && (HOST_PARAM_TYPES.has(leaf) || leaf.endsWith("Host"))) return true;
  if (RECEIVER_PARAM_NAMES.has(first.name)) return true;
  // `*Class` receivers (`modelClass`, `recordClass`) — the explicit `typeof Base`.
  if (/Class$/.test(first.name)) return true;
  // `_`-prefixed placeholder — the TS "intentionally unused" convention, used for
  // a receiver/state the body ignores (e.g. `present?(_value)`, `(_l, _t)`).
  if (first.name.startsWith("_")) return true;
  return false;
}

/** Drop a leading explicit-receiver param — known host type or conventional name. */
function stripHostParam(params: ParamInfo[]): ParamInfo[] {
  if (params.length === 0) return params;
  const isReceiver = isReceiverParam(params[0]);
  return isReceiver ? params.slice(1) : params;
}

/** Drop a trailing callback param — a ported Ruby `&block` the Ruby extractor
 *  didn't record (bare `yield`). Only ever invoked as an extra candidate form. */
function stripTrailingCallback(params: ParamInfo[]): ParamInfo[] {
  if (params.length === 0) return params;
  const last = params[params.length - 1];
  return TRAILING_CALLBACK_NAMES.has(last.name) ? params.slice(0, -1) : params;
}

export interface Arity {
  min: number;
  max: number; // Infinity when a rest/splat param is present
  /** True when optional kwargs (`key: default`) or `**opts` are present — adds 1 max-slot slack. */
  hasKeywords: boolean;
  hasBlock: boolean;
}

export interface ArityRange {
  min: number;
  max: number;
}

export interface ArityMatch {
  ok: boolean;
  rubyRange: ArityRange;
  tsRange: ArityRange;
}

/** Accepted positional-arg range (TS side drops a leading `this:`).
 *
 * Required keywords (`key:`) count toward min — Ruby arity treats them as
 * required arguments and the TS port supplies them via a required options
 * object. Optional keywords (`key: default`) and `**opts` only set
 * `hasKeywords`, which adds one max-slot of slack so a trailing TS options
 * object counts. Block params are excluded from the count but set `hasBlock`
 * for the same slack treatment. */
export function positionalArity(params: ParamInfo[], side: "ruby" | "ts"): Arity {
  const list = side === "ts" ? stripThis(params) : params;

  let required = 0;
  let optional = 0;
  let hasRest = false;
  let hasKeywords = false;
  let hasBlock = false;
  for (const p of list) {
    switch (p.kind) {
      case "required":
        required++;
        break;
      case "optional":
        optional++;
        break;
      case "rest":
        hasRest = true;
        break;
      case "keyword":
        // Required keyword (`key:`, no default) counts as a real required arg.
        // Optional keyword (`key: default`) only adds slack via hasKeywords.
        if (p.default === undefined) {
          required++;
        } else {
          hasKeywords = true;
        }
        break;
      case "keyword_rest":
        hasKeywords = true;
        break;
      case "block":
        hasBlock = true;
        break;
    }
  }

  return {
    min: required,
    max: hasRest ? Infinity : required + optional,
    hasKeywords,
    hasBlock,
  };
}

/** Do the ranges overlap, granting Ruby one extra max slot per optional-kwargs/block convention? */
function rangesOverlap(r: Arity, t: Arity): boolean {
  const slack = (r.hasKeywords ? 1 : 0) + (r.hasBlock ? 1 : 0);
  const rubyMax = r.max === Infinity ? Infinity : r.max + slack;
  return t.min <= rubyMax && r.min <= t.max;
}

/** Nothing to compare: both sides take zero positional args (reader/predicate ↔ getter). */
export function shouldSkipArity(ruby: ParamInfo[], ts: ParamInfo[]): boolean {
  const r = positionalArity(ruby, "ruby");
  const t = positionalArity(ts, "ts");
  return r.min === 0 && r.max === 0 && t.min === 0 && t.max === 0;
}

/** Matches when the ranges overlap under ANY combination of TS-side strips: a
 *  leading receiver (`this:`/host/`*Class`) and/or a trailing ported `&block`
 *  callback. Each strip only ever *gains* a match, so trying every combination
 *  never manufactures a mismatch. `tsRange` is reported as-declared (minus
 *  `this:`) so a flagged mismatch still shows the real TS signature. */
export function arityMatches(ruby: ParamInfo[], ts: ParamInfo[]): ArityMatch {
  const r = positionalArity(ruby, "ruby");
  const tAsDeclared = positionalArity(ts, "ts");

  const base = stripThis(ts);
  const forms = [
    base,
    stripHostParam(base),
    stripTrailingCallback(base),
    stripTrailingCallback(stripHostParam(base)),
  ];
  const ok = forms.some((f) => rangesOverlap(r, positionalArity(f, "ts")));

  return {
    ok,
    rubyRange: { min: r.min, max: r.max },
    tsRange: { min: tAsDeclared.min, max: tAsDeclared.max },
  };
}

export type ArityVerdict =
  | { matched: true }
  | { matched: false; tsParams: ParamInfo[]; rubyRange: ArityRange; tsRange: ArityRange };

/**
 * Verdict for a Ruby method against EVERY TS signature recorded for its name
 * (see compare.ts `tsParamsByName`). Matches if ANY candidate overlaps — that's
 * what lets the real implementation win over a 0-arg re-export binding exposed
 * under the same name; otherwise reports the first candidate's ranges.
 */
export function matchArityAgainst(ruby: ParamInfo[], candidates: ParamInfo[][]): ArityVerdict {
  let first: { m: ArityMatch; params: ParamInfo[] } | null = null;
  for (const c of candidates) {
    const m = arityMatches(ruby, c);
    if (m.ok) return { matched: true };
    first ??= { m, params: c };
  }
  if (!first) return { matched: true }; // no candidates — nothing to flag
  return {
    matched: false,
    tsParams: first.params,
    rubyRange: first.m.rubyRange,
    tsRange: first.m.tsRange,
  };
}

/** Render a parameter list as a readable signature, e.g. `(a, b = …, *rest, **opts)`. */
export function renderSig(params: ParamInfo[], side: "ruby" | "ts"): string {
  const list = side === "ts" ? stripThis(params) : params;
  const parts = list.map((p) => {
    switch (p.kind) {
      case "optional":
        return `${p.name} = …`;
      case "rest":
        return `*${p.name}`;
      case "keyword":
        return p.default !== undefined ? `${p.name}: …` : `${p.name}:`;
      case "keyword_rest":
        return `**${p.name}`;
      case "block":
        return `&${p.name}`;
      default:
        return p.name;
    }
  });
  return `(${parts.join(", ")})`;
}
