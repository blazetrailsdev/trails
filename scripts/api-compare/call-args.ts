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

import type { CallSite, LiteralValue } from "@blazetrails/parity/types";
import { rubyMethodToTsIgnoringSkip, snakeToCamel } from "@blazetrails/parity/conventions";
import { normalizeLiteral } from "./literals.js";
import { normalizeRubyKey } from "./options-keys.js";
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

/** The `LiteralValue` kind each value-carrying descriptor prefix denotes, so the
 *  value goes through literals.ts#normalizeLiteral rather than a second
 *  implementation of it. `num:` maps to `int` because that arm already parses
 *  the token numerically, collapsing `1` and `1.0` onto one key the way TS's
 *  single `number` type does. */
const LITERAL_KINDS: Record<string, LiteralValue["kind"]> = {
  num: "int",
  str: "string",
  sym: "symbol",
  bool: "bool",
};

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

/**
 * The comparison key for one identifier or nested call name.
 *
 * Ruby `new` is the port's `constructor`, exactly as `calls` / `callSeq`
 * already credit `new Foo()` (extract-ts-api.ts#callSiteName). Ruby `self` IS
 * TS `this`, and an ivar/cvar/gvar sigil is Ruby punctuation the port has no
 * spelling for (`@ast` is `this.ast`, which the TS extractor records as
 * `id:ast`).
 *
 * A name carrying a `?` / `!` / `=` keeps its RAW Ruby spelling, uncamelized:
 * those are the marks conventions.ts#rubyMethodToTsIgnoringSkip keys its rename
 * candidates off, and it must see the Ruby name it was written for — handed the
 * camelized `isNumber?` it reads the `is_` prefix as absent and offers the
 * doubled `isIsNumber` its `is_number?` arm exists to refuse
 * (conventions.ts:966). {@link refKeysEqual} does that lookup at comparison
 * time, where the Ruby side is known; a TS identifier can carry none of the
 * three marks, so only the Ruby side is ever spelled this way.
 */
function normalizeRef(rawName: string): string {
  if (rawName === "new") return "constructor";
  const name = rawName.replace(/^[@$]+/, "");
  if (name === "self") return "this";
  return /[?!=]$/.test(name) ? name : snakeToCamel(name);
}

/**
 * Whether a Ruby `ref:` key and a TS one name the same thing.
 *
 * Equal keys aside, a Ruby name carrying a `?` / `!` / `=` has more than one
 * faithful TS spelling, and the repo already has the table that enumerates them
 * (`empty?` → `isEmpty` or `empty`; `save!` → `saveBang`; `table_name=` →
 * `tableName` or `setTableName` — docs/ruby-ts-conventions.md). Asking it is
 * both narrower and more accurate than folding the `is` prefix away on both
 * sides, which would read a plain `is_valid` local as `valid` and hide a
 * genuine rename to it.
 */
function refKeysEqual(rubyKey: string, tsKey: string): boolean {
  if (rubyKey === tsKey) return true;
  const rubyName = rubyKey.slice("ref:".length);
  if (!/[?!=]$/.test(rubyName)) return false;
  return (rubyMethodToTsIgnoringSkip(rubyName) ?? []).includes(tsKey.slice("ref:".length));
}

/**
 * A literal's key, through literals.ts#normalizeLiteral so escapes, numeric
 * underscores and symbol-vs-string spellings are absorbed exactly once.
 *
 * On top of that key, a string that is identifier-shaped camelizes: it is a
 * name the port renames by convention, not a value. A Ruby Symbol is a JS
 * string, and CLAUDE.md ("Symbols vs strings") keeps the leading colon where a
 * body's control flow turns on Symbol-vs-String — so `":dump"` and `"dump"` are
 * the same value here and must compare equal.
 */
function normalizeLiteralArg(kind: LiteralValue["kind"], value: string): string | null {
  const key = normalizeLiteral({ kind, value });
  // A token the numeric arm cannot parse is uncomparable, not the value NaN: the
  // TS extractor records a BigInt literal with its `n` suffix (`123n`), which no
  // Ruby token ever spells, so comparing it would manufacture a shape row.
  if (key === "num:NaN") return null;
  if (key === null || !key.startsWith("str:")) return key;
  const text = key.slice("str:".length);
  const bare = text.startsWith(":") ? text.slice(1) : text;
  return IDENTIFIER_STRING.test(bare) ? `str:${snakeToCamel(bare)}` : key;
}

/** Split a `kwargs{…}` body on its TOP-LEVEL commas — a value can itself be a
 *  `kwargs{…}`, whose commas are not separators. A `,` inside a `str:` payload
 *  is not one either, and never reaches here: both extractors percent-escape
 *  the four grammar delimiters (extract-ruby-api.rb#escape_descriptor_text,
 *  extract-ts-api.ts#escapeDescriptorText). */
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

/**
 * Undo the extractors' delimiter escaping, once the descriptor has been split
 * down to a single payload.
 *
 * The descriptor grammar is a FLAT string split on `,` `=` `{` `}`, and a string
 * value can contain every one of them — `injectJoin(list, collector, ", ")`.
 * Unescaped, that comma splits a `kwargs{…}` into a fragment with no `=` and the
 * whole call site is silently dropped as uncomparable, losing exactly the
 * SQL-fragment arguments RFC 0095 §2 calls load-bearing.
 *
 * Percent- rather than backslash-escaped, because a `str:` payload's backslash
 * is NOT free: literals.ts#normalizeLiteral canonicalizes `\n` and friends, so a
 * backslash escape here would consume the marker that arm reads and `"\\n"`
 * would stop comparing equal to a real newline.
 */
function unescapeDescriptorText(text: string): string {
  return text.replace(/%(25|2C|3D|7B|7D)/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/** Keys go through options-keys.ts#normalizeRubyKey — the same pipeline the
 *  option-key diff uses, which is camelization PLUS the renames it cannot derive
 *  (Ruby's `:constructor` option is `constructorFn`, since `constructor` is
 *  reserved as a JS property name). Values recurse, so an opaque nested value
 *  makes the whole descriptor uncomparable. Order is not
 *  significant — a Ruby hash literal and a TS object literal carry the same
 *  kwargs whatever order they are written in — so the pairs are sorted. A pair
 *  with no `=` is the `**splat` marker, which has no comparable arity. */
function normalizeKwargs(descriptor: string): string | null {
  const body = descriptor.slice("kwargs{".length, -1);
  const pairs: string[] = [];
  for (const pair of splitPairs(body)) {
    const eq = pair.indexOf("=");
    if (eq === -1) return null;
    const value = normalizeArg(pair.slice(eq + 1));
    if (value === null) return null;
    pairs.push(`${normalizeRubyKey(pair.slice(0, eq))}=${value}`);
  }
  return `kwargs{${pairs.sort().join(",")}}`;
}

/**
 * The canonical comparison key for one argument descriptor, or null when the
 * descriptor is opaque and the site therefore uncomparable.
 *
 * `id:` and `call:` collapse into one `ref:` bucket on both sides: Ripper cannot
 * tell a local read from a zero-arg self-send, the same information loss the
 * weak-call set already works around (extract-ruby-api.rb#inert_receiver?).
 */
export function normalizeArg(descriptor: string): string | null {
  if (OPAQUE_DESCRIPTORS.has(descriptor)) return null;
  if (descriptor === "nil") return "nil";
  if (descriptor.startsWith("kwargs{")) return normalizeKwargs(descriptor);
  if (descriptor.startsWith("binop:") || descriptor.startsWith("unary")) return null;

  const sep = descriptor.indexOf(":");
  if (sep === -1) return null;
  const kind = descriptor.slice(0, sep);
  const value = descriptor.slice(sep + 1);
  if (kind === "id" || kind === "call") return `ref:${normalizeRef(value)}`;
  if (kind === "const") return `const:${value}`;
  const literalKind = LITERAL_KINDS[kind];
  return literalKind === undefined
    ? null
    : normalizeLiteralArg(literalKind, unescapeDescriptorText(value));
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
    if (argKeysEqual(rubyArgs[i], tsArgs[i])) continue;
    if (!rubyArgs[i].startsWith("ref:") || !tsArgs[i].startsWith("ref:")) return "shape";
  }
  return "naming";
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

/** Two argument keys naming the same value. Only `ref:` keys have more than one
 *  spelling; a literal key is already canonical. */
function argKeysEqual(rubyKey: string, tsKey: string): boolean {
  if (rubyKey.startsWith("ref:") && tsKey.startsWith("ref:")) return refKeysEqual(rubyKey, tsKey);
  return rubyKey === tsKey;
}

function argsEqual(rubyArgs: string[], tsArgs: string[]): boolean {
  return (
    rubyArgs.length === tsArgs.length && rubyArgs.every((arg, i) => argKeysEqual(arg, tsArgs[i]))
  );
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
