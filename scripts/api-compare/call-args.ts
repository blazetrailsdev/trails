// Call-argument comparison for parity:api (RFC 0095). `parity:api:calls` compares the
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

import type { CallSite, LiteralValue, ParamInfo } from "@blazetrails/parity/types";
import { stripThis } from "./arity.js";
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

/**
 * WHY a site was skipped (RFC 0095). The first two are deliberate exclusions
 * and should stay flat; the last three are population the dimension is LOSING,
 * and a spike in any of them is the signature of the bug PR #6316 fixed — a
 * grammar ambiguity that silently dropped whole call sites, invisible because
 * nothing counted skips by reason.
 */
export type CallArgSkipReason =
  | "excludedCallName"
  | "uncomparableFlag"
  | "opaqueRubyArg"
  | "opaqueTsArg"
  | "unparseableLiteral";

export const CALL_ARG_SKIP_REASONS: readonly CallArgSkipReason[] = [
  "excludedCallName",
  "uncomparableFlag",
  "opaqueRubyArg",
  "opaqueTsArg",
  "unparseableLiteral",
];

/** `shape` — argument count, order, literal values or kwarg keys differ; the
 *  class RFC 0095 §4 gates. `naming` — the two lists differ only in how a
 *  `ref:` identifier is spelled (Rails' `o` ported as `node`); reported only,
 *  because it is the local-identifier dimension surfacing here. */
export type CallArgClass = "shape" | "naming";

/** A `class` rides on the `mismatch` arm only, so a consumer that has narrowed
 *  the verdict reads it without asserting it is there. */
export type CallArgResult =
  | {
      verdict: "skip";
      class?: undefined;
      /** Why the site is uncomparable — the tally's key (RFC 0095). */
      reason: CallArgSkipReason;
      /** The normalized lists the verdict was reached on — what a row reports. */
      rubyArgs: string[];
      tsArgs: string[];
    }
  | {
      verdict: "match";
      class?: undefined;
      reason?: undefined;
      rubyArgs: string[];
      tsArgs: string[];
    }
  | {
      verdict: "mismatch";
      class: CallArgClass;
      reason?: undefined;
      rubyArgs: string[];
      tsArgs: string[];
    };

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
function normalizeLiteralArg(kind: LiteralValue["kind"], value: string): string | ArgFailure {
  const key = normalizeLiteral({ kind, value });
  // A token the numeric arm cannot parse is uncomparable, not the value NaN: the
  // TS extractor records a BigInt literal with its `n` suffix (`123n`), which no
  // Ruby token ever spells, so comparing it would manufacture a shape row.
  if (key === "num:NaN" || key === null) return UNPARSEABLE_LITERAL;
  if (!key.startsWith("str:")) return key;
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
function normalizeKwargs(descriptor: string): string | ArgFailure {
  const body = descriptor.slice("kwargs{".length, -1);
  const pairs: string[] = [];
  for (const pair of splitPairs(body)) {
    const eq = pair.indexOf("=");
    if (eq === -1) return OPAQUE;
    const value = normalizeArgOrFailure(pair.slice(eq + 1));
    if (typeof value !== "string") return value;
    pairs.push(`${normalizeRubyKey(pair.slice(0, eq))}=${value}`);
  }
  return `kwargs{${pairs.sort().join(",")}}`;
}

/** Why a descriptor has no comparison key. `opaque` is the deliberate
 *  exclusion of a form the two languages cannot agree on;
 *  `unparseableLiteral` is a token {@link normalizeLiteralArg} could not read,
 *  and the two are tallied apart so a normalization regression in the second is
 *  visible rather than absorbed into the first (RFC 0095). */
interface ArgFailure {
  failure: "opaque" | "unparseableLiteral";
}

const OPAQUE: ArgFailure = { failure: "opaque" };
const UNPARSEABLE_LITERAL: ArgFailure = { failure: "unparseableLiteral" };

/**
 * The canonical comparison key for one argument descriptor, or null when the
 * descriptor is opaque and the site therefore uncomparable.
 *
 * `id:` and `call:` collapse into one `ref:` bucket on both sides: Ripper cannot
 * tell a local read from a zero-arg self-send, the same information loss the
 * weak-call set already works around (extract-ruby-api.rb#inert_receiver?).
 */
function normalizeArgOrFailure(descriptor: string): string | ArgFailure {
  if (OPAQUE_DESCRIPTORS.has(descriptor)) return OPAQUE;
  if (descriptor === "nil") return "nil";
  if (descriptor.startsWith("kwargs{")) return normalizeKwargs(descriptor);
  if (descriptor.startsWith("binop:") || descriptor.startsWith("unary")) return OPAQUE;

  const sep = descriptor.indexOf(":");
  if (sep === -1) return OPAQUE;
  const kind = descriptor.slice(0, sep);
  const value = descriptor.slice(sep + 1);
  if (kind === "id" || kind === "call") return `ref:${normalizeRef(value)}`;
  if (kind === "const") return `const:${value}`;
  const literalKind = LITERAL_KINDS[kind];
  return literalKind === undefined
    ? OPAQUE
    : normalizeLiteralArg(literalKind, unescapeDescriptorText(value));
}

export function normalizeArg(descriptor: string): string | null {
  const key = normalizeArgOrFailure(descriptor);
  return typeof key === "string" ? key : null;
}

/** Normalize a whole argument list, or the failure of its first uncomparable
 *  member — which reason it was is the tally's key (RFC 0095). */
function normalizeArgsOrFailure(args: string[]): string[] | ArgFailure {
  const out: string[] = [];
  for (const arg of args) {
    const key = normalizeArgOrFailure(arg);
    if (typeof key !== "string") return key;
    out.push(key);
  }
  return out;
}

/** Normalize a whole argument list, or null when any member is opaque. */
export function normalizeArgs(args: string[]): string[] | null {
  const keys = normalizeArgsOrFailure(args);
  return Array.isArray(keys) ? keys : null;
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
  // A list carrying the SAME refs in a different order is the reordering this
  // comment promises, not a rename: `inject_join(list, collector, join_str)`
  // ported as `injectJoin(nodes, connector, collector)` (to_sql.rb:897) reads
  // ref-for-ref as two renames and is the argument-ORDER defect RFC 0095 exists
  // to catch. Only the gated class sees it, so it must not fall through to
  // `naming`.
  return isPermutation(rubyArgs, tsArgs) ? "shape" : "naming";
}

/** Whether the two lists hold the same argument keys in a different order.
 *  Greedy, not a set difference: {@link argKeysEqual} is not transitive (a Ruby
 *  `empty?` matches both `isEmpty` and `empty`), so a key must be consumed by
 *  the partner it matched. */
function isPermutation(rubyArgs: string[], tsArgs: string[]): boolean {
  const remaining = [...tsArgs];
  for (const rubyArg of rubyArgs) {
    const i = remaining.findIndex((tsArg) => argKeysEqual(rubyArg, tsArg));
    if (i === -1) return false;
    remaining.splice(i, 1);
  }
  return true;
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

/** Ruby's reflective self-name pseudo-variables, which Ripper hands the
 *  extractor as a plain identifier read. Both denote the name of the enclosing
 *  method — `__callee__` the name it was CALLED through (so an alias reports the
 *  alias), `__method__` the name it was defined as — and neither has a TS
 *  spelling, so the port passes the name as a literal. */
const CALLEE_REFS = new Set(["ref:__callee__", "ref:__method__"]);

/** The resolved-`__callee__` key: the enclosing Ruby method's own name, which
 *  the extractor already knows because it keys every row by it. */
const CALLEE_PREFIX = "callee:";

/** Rewrite a normalized Ruby argument list's `__callee__` / `__method__` reads
 *  to the enclosing method's name (RFC 0099).
 *
 * `check_if_method_has_arguments!(__callee__, args)` is the single largest
 * same-shape block in the argument dimension: the value is statically knowable
 * and the port passes it as `checkIfMethodHasArgumentsBang("eager_load", …)`,
 * which is the faithful port and not a shape divergence.
 *
 * Applied to the VERDICT's lists only — a row still REPORTS the raw
 * `ref:__callee__` it always did, so resolving the value does not re-key the
 * baseline rows of the sites that still diverge for an unrelated reason and make
 * them read as new ones.
 */
function resolveCalleeRefs(args: string[], enclosingRubyName: string | undefined): string[] {
  if (enclosingRubyName === undefined) return args;
  return args.map((arg) => (CALLEE_REFS.has(arg) ? CALLEE_PREFIX + enclosingRubyName : arg));
}

/** Every key a faithful port of `__callee__` can spell: the enclosing method's
 *  name as an identifier read, or — the shape the port actually uses, since TS
 *  has no `__callee__` — as a string/symbol literal of the same name. Both go
 *  through the Ruby→TS name conventions, so `eager_load` also matches
 *  `"eagerLoad"`, and a `?`/`!`/`=` name matches each spelling the table
 *  sanctions. */
function calleeKeys(enclosingRubyName: string): string[] {
  const names = [enclosingRubyName, ...tsCallNameKeys(enclosingRubyName)];
  const keys = names.map((name) => `ref:${name}`);
  for (const name of names) {
    const literal = normalizeLiteralArg("string", name);
    if (typeof literal === "string") keys.push(literal);
  }
  return keys;
}

/**
 * Drop the `nil`s TS must write to reach a block that Ruby wrote as a trailing
 * block (RFC 0099).
 *
 * `sqlite3_adapter.rb:561` declares
 * `alter_table(table_name, foreign_keys = …, check_constraints = …, **options)`
 * and every caller writes `alter_table(table_name) do |definition|`. TS has no
 * block syntax, so the callback is a trailing PARAMETER and the port has to pad
 * every defaulted parameter it skips over — `alterTable(tableName, null, null,
 * null, (definition) => …)`. That padding is forced by the language and carries
 * no information: the callee applies exactly the default expressions Ruby would.
 *
 * Narrow on purpose. Both sides must actually carry a block, the padding must be
 * a pure `nil` TAIL past the arguments Rails passes, and — {@link
 * padsDefaultedParams} — the TS callee must genuinely default those parameters.
 * A `nil` the callee reads as a value is a real divergence and still reads as
 * one.
 */
function stripBlockTailPadding(
  ruby: CallSite,
  ts: CallSite,
  rubyArgs: string[],
  tsArgs: string[],
  calleeSigs: ParamInfo[][] | undefined,
): string[] {
  if (!ruby.flags.includes("block") || !ts.flags.includes("block")) return tsArgs;
  if (tsArgs.length <= rubyArgs.length) return tsArgs;
  if (!tsArgs.slice(rubyArgs.length).every((arg) => arg === "nil")) return tsArgs;
  if (!padsDefaultedParams(calleeSigs, rubyArgs.length, tsArgs.length)) return tsArgs;
  return tsArgs.slice(0, rubyArgs.length);
}

/** Whether some TS signature of the callee declares every parameter in
 *  `[from, to)` with a default or a `?` — the check that keeps
 *  {@link stripBlockTailPadding} from swallowing a `nil` the callee treats as a
 *  value. An unresolved callee (no signature in the package) answers no: the
 *  padding is only provably inert when the declaration says so. */
function padsDefaultedParams(
  calleeSigs: ParamInfo[][] | undefined,
  from: number,
  to: number,
): boolean {
  return (calleeSigs ?? []).some((raw) => {
    const sig = stripThis(raw);
    for (let i = from; i < to; i++) {
      if (sig[i]?.kind !== "optional") return false;
    }
    return true;
  });
}

/** Two argument keys naming the same value. Only `ref:` keys have more than one
 *  spelling; a literal key is already canonical. */
function argKeysEqual(rubyKey: string, tsKey: string): boolean {
  if (rubyKey.startsWith(CALLEE_PREFIX)) {
    return calleeKeys(rubyKey.slice(CALLEE_PREFIX.length)).includes(tsKey);
  }
  if (rubyKey.startsWith("ref:") && tsKey.startsWith("ref:")) return refKeysEqual(rubyKey, tsKey);
  return rubyKey === tsKey;
}

function argsEqual(rubyArgs: string[], tsArgs: string[]): boolean {
  return (
    rubyArgs.length === tsArgs.length && rubyArgs.every((arg, i) => argKeysEqual(arg, tsArgs[i]))
  );
}

/** Every TS spelling a Ruby call name can faithfully take, through the same
 *  table {@link refKeysEqual} asks — so a `?` / `!` / `=` name pairs against the
 *  spelling the port actually chose. `new` is `constructor`, exactly as the
 *  call-set gate credits `new Foo()` (extract-ts-api.ts#callSiteName). */
function tsCallNameKeys(rubyName: string): string[] {
  if (rubyName === "new") return ["constructor"];
  if (/[?!=]$/.test(rubyName)) return rubyMethodToTsIgnoringSkip(rubyName) ?? [];
  return [snakeToCamel(rubyName)];
}

/**
 * How well two same-named call sites' argument lists agree, for
 * {@link pairCallSites}. Higher is a better pairing. Ordered so that an exact
 * argument-list agreement always outranks a mere arity agreement, which in turn
 * outranks any number of positional key matches — a 3-argument list agreeing on
 * all 3 must never outrank the 4-argument list that agrees on all 4.
 *
 * An opaque list has no keys to score; its arity is still known, so it competes
 * on that alone rather than being excluded from the assignment.
 */
function argSimilarity(ruby: CallSite, ts: CallSite): number {
  const rubyArgs = normalizeArgs(ruby.args);
  const tsArgs = normalizeArgs(stripMixinReceiver(ruby.args, ts.args));
  const sameArity = ruby.args.length === ts.args.length ? 1 : 0;
  if (rubyArgs === null || tsArgs === null) return sameArity * 1_000;
  if (argsEqual(rubyArgs, tsArgs)) return 1_000_000;
  let matches = 0;
  for (let i = 0; i < Math.min(rubyArgs.length, tsArgs.length); i++) {
    if (argKeysEqual(rubyArgs[i], tsArgs[i])) matches++;
  }
  return sameArity * 1_000 + matches;
}

/**
 * Pair the call sites of one already name-matched (Ruby, TS) method pair: each
 * Ruby site named `x` against the TS site whose name is a faithful spelling of
 * `x` and whose ARGUMENT LIST agrees with it best (RFC 0099). No new METHOD
 * matching is introduced — the method pair is the one checkCalls already
 * received; this is only which site within the two bodies compares against
 * which.
 *
 * Source order is the wrong pairing as soon as a body calls one name twice.
 * `sqlite3_adapter.rb:477` constructs `SQLite3Adapter::Version` once and the
 * port constructs `Version` three times (a `"0.0.0"` guard arm among them);
 * zipping by index compares Rails' single construction against whichever
 * occurrence happens to come first and manufactures a shape row for a body that
 * is correct. Both streams stay in source order for TIE-BREAKING only, so a
 * body whose occurrences are indistinguishable pairs exactly as before.
 *
 * A Ruby site with no unconsumed TS counterpart is dropped rather than
 * reported: "the port makes no such call" is the call-set gate's finding
 * (call-mismatches.json), and re-reporting it here as an argument mismatch
 * would double-count one divergence in two artifacts. The assignment is still
 * maximal — a candidate whose two endpoints are both free is always taken — so
 * within one name it consumes exactly the min(Ruby, TS) sites the source-order
 * zip did, and nothing that used to be compared silently stops being compared.
 */
export function pairCallSites(
  rubySites: readonly CallSite[],
  tsSites: readonly CallSite[],
): { ruby: CallSite; ts: CallSite }[] {
  const candidates: { rubyIdx: number; tsIdx: number; score: number }[] = [];
  rubySites.forEach((ruby, rubyIdx) => {
    const keys = new Set(tsCallNameKeys(ruby.name));
    tsSites.forEach((ts, tsIdx) => {
      if (!keys.has(ts.name)) return;
      candidates.push({ rubyIdx, tsIdx, score: argSimilarity(ruby, tsSites[tsIdx]) });
    });
  });
  // Greedy over the globally best-scoring candidate, ties broken by source
  // order on the Ruby then the TS side — so the verdict never depends on the
  // order the candidates were enumerated in.
  candidates.sort((a, b) => b.score - a.score || a.rubyIdx - b.rubyIdx || a.tsIdx - b.tsIdx);
  const takenRuby = new Set<number>();
  const takenTs = new Set<number>();
  const matched = new Map<number, number>();
  for (const { rubyIdx, tsIdx } of candidates) {
    if (takenRuby.has(rubyIdx) || takenTs.has(tsIdx)) continue;
    takenRuby.add(rubyIdx);
    takenTs.add(tsIdx);
    matched.set(rubyIdx, tsIdx);
  }
  return rubySites.flatMap((ruby, rubyIdx) => {
    const tsIdx = matched.get(rubyIdx);
    return tsIdx === undefined ? [] : [{ ruby, ts: tsSites[tsIdx] }];
  });
}

/** Compare one name-matched pair of call sites, mirroring
 *  literals.ts#compareLiteral's verdict shape. "skip" whenever the two
 *  languages cannot agree on the site at all — a splat / double-splat /
 *  block-pass on either side, an opaque descriptor anywhere in either list, or
 *  a call name the call-set gate already excludes. A `block` flag is NOT a
 *  skip: both extractors drop the block from the argument list and flag the
 *  site, so the remaining arguments still compare.
 *
 *  `enclosingRubyName` is the Ruby method whose body both sites are in — the
 *  value of `__callee__` / `__method__` there ({@link resolveCalleeRefs}).
 *  `calleeSigs` are the TS signatures of the method being CALLED, which
 *  {@link stripBlockTailPadding} reads to tell inert padding from a value. */
export function compareCallArgs(
  ruby: CallSite,
  ts: CallSite,
  enclosingRubyName?: string,
  calleeSigs?: ParamInfo[][],
): CallArgResult {
  const skipped = (reason: CallArgSkipReason): CallArgResult => ({
    verdict: "skip",
    reason,
    rubyArgs: [],
    tsArgs: [],
  });
  if (isSkippedCallName(ruby.name)) return skipped("excludedCallName");
  if (hasUncomparableFlag(ruby) || hasUncomparableFlag(ts)) return skipped("uncomparableFlag");

  const rubyArgs = normalizeArgsOrFailure(ruby.args);
  if (!Array.isArray(rubyArgs)) {
    return skipped(rubyArgs.failure === "opaque" ? "opaqueRubyArg" : "unparseableLiteral");
  }
  const normalizedTs = normalizeArgsOrFailure(stripMixinReceiver(ruby.args, ts.args));
  if (!Array.isArray(normalizedTs)) {
    return skipped(normalizedTs.failure === "opaque" ? "opaqueTsArg" : "unparseableLiteral");
  }
  const tsArgs = stripBlockTailPadding(ruby, ts, rubyArgs, normalizedTs, calleeSigs);

  const compared = resolveCalleeRefs(rubyArgs, enclosingRubyName);
  if (argsEqual(compared, tsArgs)) return { verdict: "match", rubyArgs, tsArgs };
  return { verdict: "mismatch", class: classify(compared, tsArgs), rubyArgs, tsArgs };
}
