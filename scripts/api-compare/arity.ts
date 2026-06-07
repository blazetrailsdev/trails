// Arity comparison for api:compare (advisory — never changes the parity %).
//
// The matcher (compare.ts) pairs Ruby↔TS methods by *name* only, so a port can
// have the right name but the wrong signature. These helpers compare the
// *positional* arg ranges: a match means the ranges OVERLAP (not exact). Two
// conventions get one extra slot of Ruby-max tolerance since the port spells
// them out positionally — kwargs → options object, `&block` → callback — and a
// leading host/receiver param (`this:`-typed or `record: Base`) is stripped
// from the TS side only to *gain* a match (we try with and without and accept
// if EITHER overlaps), so stripping never manufactures a mismatch.

import type { ParamInfo } from "./types.js";

/** TS host/receiver types — a leading param of one of these is the explicit host
 *  instance and is stripped. Leaf match also covers `Base<T>` / `ns.Relation`. */
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
]);

/** Leading-param NAMES that conventionally denote the host receiver (often typed
 *  `any`). Kept tight so genuine first-args (`modelClass`, `key`) stay flagged;
 *  since stripping only *gains* a match, an over-broad entry can at worst hide one. */
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

/** Drop a leading explicit-receiver param — known host type or conventional name. */
function stripHostParam(params: ParamInfo[]): ParamInfo[] {
  if (params.length === 0) return params;
  const first = params[0];
  const leaf = leafTypeName(first.type);
  const isReceiver = (leaf && HOST_PARAM_TYPES.has(leaf)) || RECEIVER_PARAM_NAMES.has(first.name);
  return isReceiver ? params.slice(1) : params;
}

export interface Arity {
  min: number;
  max: number; // Infinity when a rest/splat param is present
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

/** Accepted positional-arg range (TS side drops a leading `this:`). Keyword/block
 *  params don't count positionally; their presence is reported for the slack. */
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

/** Do the ranges overlap, granting Ruby one extra max slot per trailing kwargs/block convention? */
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

/** Matches when the ranges overlap either as-declared or with the TS leading
 *  receiver stripped (stripping only helps). `tsRange` is as-declared (minus
 *  `this:`) so a flagged mismatch shows the real TS signature. */
export function arityMatches(ruby: ParamInfo[], ts: ParamInfo[]): ArityMatch {
  const r = positionalArity(ruby, "ruby");
  const tAsDeclared = positionalArity(ts, "ts");
  const tReceiverStripped = positionalArity(stripHostParam(stripThis(ts)), "ts");

  const ok = rangesOverlap(r, tAsDeclared) || rangesOverlap(r, tReceiverStripped);

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
