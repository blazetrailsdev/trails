// Call-argument comparison for api:compare (RFC 0095). `api:calls` compares the
// SET OF CALL NAMES a body makes; a port can call `where` where Rails calls
// `where`, pass a completely different argument list, and every gate stays
// green. This module pairs one Ruby call site against the matched TS one and
// diffs the argument descriptors the two extractors emit
// (extract-ruby-api.rb#describe_args, extract-ts-api.ts#describeArgs).
//
// Advisory, like literals.ts: a verdict here never changes the parity %. The
// exclusions below are not tuning — they are the forms the two languages
// genuinely cannot agree on (RFC 0095 §2), and the spike measured what happens
// without them (the nested-opaque leak alone was 8 of 17 noise rows, and 94 of
// 604 activerecord rows).

import type { CallSite } from "@blazetrails/parity/types";
import { snakeToCamel } from "@blazetrails/parity/conventions";
import { JS_ENUMERABLE_ALIASES } from "./enumerable-idioms.js";
import { NO_JS_CALL_FORM } from "./compare.js";

/** An identifier-shaped string camelizes; anything else compares byte-for-byte.
 *  LOAD-BEARING: camelizing a SQL fragment (`" GROUP BY "`) would erase the
 *  dimension's sharpest finding, the arel visitor-helper argument order. */
const IDENTIFIER_STRING = /^[a-z][A-Za-z0-9_]*$/;

/** Descriptors that carry no comparable value (RFC 0095 §1). Their presence
 *  anywhere in an argument list — INCLUDING nested inside a `kwargs{}` — makes
 *  the whole site uncomparable. */
const OPAQUE_DESCRIPTORS = new Set(["?", "array", "hash", "str-interp", "ternary"]);

/** Per-site flags that make the argument list's arity unknowable on that side. */
const UNCOMPARABLE_FLAGS = new Set(["splat", "blockpass", "zsuper"]);

/** The leading receiver the `this`-typed-function mixin idiom adds
 *  (`deleteThroughRecords(this, records)` for `delete_through_records(records)`).
 *  That is the settled port shape for Ruby `include`, not a divergence. */
const MIXIN_RECEIVER = "id:this";

export type CallArgVerdict = "match" | "mismatch" | "skip";

/** `shape` — argument count, order, literal values or kwarg keys differ; the
 *  class RFC 0095 §4 gates. `naming` — the two lists differ only in how a
 *  `ref:` identifier is spelled (Rails' `o` ported as `node`); reported only,
 *  because it is the local-identifier dimension surfacing here. */
export type CallArgClass = "shape" | "naming";

export interface CallArgResult {
  verdict: CallArgVerdict;
  /** Present only on a `mismatch`. */
  class?: CallArgClass;
  /** The normalized lists the verdict was reached on — what a row reports. */
  rubyArgs: string[];
  tsArgs: string[];
}

/** Ruby `new` is the port's `constructor`, exactly as `calls` / `callSeq`
 *  already credit `new Foo()` (extract-ts-api.ts#callSiteName).
 *
 *  A Ruby predicate carries its `?` and its port carries the `is` prefix
 *  conventions.ts#rubyMethodToTsIgnoringSkip offers (`empty?` → `isEmpty`), and
 *  BOTH of that rule's candidates (`isEmpty`, `empty`) are faithful — so the
 *  predicate marker is dropped on each side rather than translated onto one
 *  spelling, which would make the other read as a rename it is not. */
function normalizeRef(rawName: string): string {
  if (rawName === "new") return "constructor";
  // Ruby `self` IS TS `this`, and an ivar/cvar/gvar sigil is Ruby punctuation
  // the port has no spelling for (`@ast` is `this.ast`, recorded as `id:ast`).
  const name = rawName.replace(/^[@$]+/, "");
  if (name === "self") return "this";
  const camel = snakeToCamel(name.endsWith("?") ? name.slice(0, -1) : name);
  return /^is[A-Z]/.test(camel) ? camel.charAt(2).toLowerCase() + camel.slice(3) : camel;
}

/** A Ruby Symbol is a JS string, and CLAUDE.md ("Symbols vs strings") keeps the
 *  leading colon where a body's control flow turns on Symbol-vs-String — so
 *  `":dump"` and `"dump"` are the same value here and must compare equal. */
function normalizeStringValue(value: string): string {
  const bare = value.startsWith(":") ? value.slice(1) : value;
  return IDENTIFIER_STRING.test(bare) ? `str:${snakeToCamel(bare)}` : `str:${value}`;
}

/** Split a `kwargs{…}` body on its TOP-LEVEL commas — a value can itself be a
 *  `kwargs{…}`, whose commas are not separators. */
function splitPairs(body: string): string[] {
  const pairs: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      pairs.push(body.slice(start, i));
      start = i + 1;
    }
  }
  pairs.push(body.slice(start));
  return pairs;
}

/** Keys camelize through the same pipeline option keys do; values recurse. Order
 *  is not significant — a Ruby hash literal and a TS object literal carry the
 *  same kwargs whatever order they are written in — so the pairs are sorted. */
function normalizeKwargs(descriptor: string): string | null {
  const body = descriptor.slice("kwargs{".length, -1);
  const pairs: string[] = [];
  for (const pair of splitPairs(body)) {
    const eq = pair.indexOf("=");
    if (eq === -1) return null; // `**splat`
    const value = normalizeArg(pair.slice(eq + 1));
    if (value === null) return null;
    pairs.push(`${snakeToCamel(pair.slice(0, eq))}=${value}`);
  }
  return `kwargs{${pairs.sort().join(",")}}`;
}

/** The canonical comparison key for one argument descriptor, or null when the
 *  descriptor is opaque and the site therefore uncomparable. */
export function normalizeArg(descriptor: string): string | null {
  if (OPAQUE_DESCRIPTORS.has(descriptor)) return null;
  if (descriptor === "nil") return "nil";
  if (descriptor.startsWith("kwargs{")) return normalizeKwargs(descriptor);
  if (descriptor.startsWith("binop:") || descriptor.startsWith("unary")) return null;

  const sep = descriptor.indexOf(":");
  if (sep === -1) return null;
  const kind = descriptor.slice(0, sep);
  const value = descriptor.slice(sep + 1);
  switch (kind) {
    // Ripper cannot tell a local read from a zero-arg self-send, so `id:` and
    // `call:` collapse into one bucket on both sides — the same information
    // loss the weak-call set already works around
    // (extract-ruby-api.rb#inert_receiver?).
    case "id":
    case "call":
      return `ref:${normalizeRef(value)}`;
    case "sym":
    case "str":
      return normalizeStringValue(value);
    // int/float share one key, as literals.ts#normalizeLiteral does: TS's single
    // `number` type makes `1` and `1.0` the identical value.
    case "num":
      return `num:${Number(value.replace(/_/g, ""))}`;
    case "bool":
      return `bool:${value}`;
    case "const":
      return `const:${value}`;
    default:
      return null;
  }
}

/** Normalize a whole argument list, or null when any member is opaque. */
export function normalizeArgs(args: string[]): string[] | null {
  const out: string[] = [];
  for (const arg of args) {
    const key = normalizeArg(arg);
    if (key === null) return null;
    out.push(key);
  }
  return out;
}

/** Names excluded exactly as the call-set gate excludes them (compare.ts):
 *  `super`, which the module-mixin port structurally drops, the NO_JS_CALL_FORM
 *  names whose faithful port emits no call at all, and the Enumerable/Object
 *  idioms whose JS analogue is a different call with different arguments.
 *
 *  Both tables are read at CALL time, not module-evaluation time: compare.ts is
 *  the consumer of this module, so a top-level read of its exports would be an
 *  import-cycle TDZ hazard. */
function isSkippedCallName(name: string): boolean {
  return name === "super" || NO_JS_CALL_FORM.has(name) || JS_ENUMERABLE_ALIASES.has(name);
}

function hasUncomparableFlag(site: CallSite): boolean {
  return site.flags.some((flag) => UNCOMPARABLE_FLAGS.has(flag));
}

/** A mismatch differing only in `ref:` spellings is `naming`; everything else —
 *  a different count, a reordering, a changed literal, a changed kwarg key — is
 *  `shape`. */
function classify(rubyArgs: string[], tsArgs: string[]): CallArgClass {
  if (rubyArgs.length !== tsArgs.length) return "shape";
  for (let i = 0; i < rubyArgs.length; i++) {
    if (rubyArgs[i] === tsArgs[i]) continue;
    if (!rubyArgs[i].startsWith("ref:") || !tsArgs[i].startsWith("ref:")) return "shape";
  }
  return "naming";
}

/** Compare one name-matched pair of call sites, mirroring
 *  literals.ts#compareLiteral's verdict shape. "skip" whenever the two
 *  languages cannot agree on the site at all — a splat / double-splat /
 *  block-pass on either side, an opaque descriptor anywhere in either list, or
 *  a call name the call-set gate already excludes. A `block` flag is NOT a
 *  skip: both extractors drop the block from the argument list and flag the
 *  site, so the remaining arguments still compare. */
export function compareCallArgs(ruby: CallSite, ts: CallSite): CallArgResult {
  const empty: CallArgResult = { verdict: "skip", rubyArgs: [], tsArgs: [] };
  if (isSkippedCallName(ruby.name)) return empty;
  if (hasUncomparableFlag(ruby) || hasUncomparableFlag(ts)) return empty;

  const rubyArgs = normalizeArgs(ruby.args);
  const tsArgs = normalizeArgs(stripMixinReceiver(ruby.args, ts.args));
  if (rubyArgs === null || tsArgs === null) return empty;

  const verdict = argsEqual(rubyArgs, tsArgs) ? "match" : "mismatch";
  return {
    verdict,
    ...(verdict === "mismatch" ? { class: classify(rubyArgs, tsArgs) } : {}),
    rubyArgs,
    tsArgs,
  };
}

/** Drop the leading `this` the mixin idiom adds — only when doing so is what
 *  makes the two lists the same length, so a genuine extra argument still
 *  reads as one. */
function stripMixinReceiver(rubyArgs: string[], tsArgs: string[]): string[] {
  if (tsArgs.length === rubyArgs.length + 1 && tsArgs[0] === MIXIN_RECEIVER) {
    return tsArgs.slice(1);
  }
  return tsArgs;
}

function argsEqual(rubyArgs: string[], tsArgs: string[]): boolean {
  return rubyArgs.length === tsArgs.length && rubyArgs.every((arg, i) => arg === tsArgs[i]);
}
