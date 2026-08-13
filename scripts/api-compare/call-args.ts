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
import { rubyMethodToTsIgnoringSkip, snakeToCamel } from "@blazetrails/parity/conventions";
import { stripThis } from "./arity.js";
import { normalizeLiteral } from "./literals.js";
import { normalizeRubyKey } from "./options-keys.js";
import { JS_ENUMERABLE_ALIASES } from "./enumerable-idioms.js";
import { NO_JS_CALL_FORM } from "./compare.js";
import { RECEIVER_AS_FIRST_ARG } from "./receiver-as-first-arg.js";

/** An identifier-shaped string camelizes; anything else compares byte-for-byte.
 *  LOAD-BEARING: camelizing a SQL fragment (`" GROUP BY "`) would erase the
 *  dimension's sharpest finding, the arel visitor-helper argument order. */
// Leading underscore included: Rails spells plenty of private method names
// `_ensure_no_duplicate_errors`, and those are names the port renames by
// convention exactly as any other identifier-shaped value is.
const IDENTIFIER_STRING = /^_?[a-z][A-Za-z0-9_]*$/;

/** Ruby conversions the extractor records as the CALL with the receiver
 *  dropped, leaving no rename signal on the Ruby side at all — see
 *  {@link refKeysEqual}. */
const RECEIVER_DROPPING_CONVERSIONS = new Set(["toS", "toSym"]);

/** Descriptors that carry no comparable value (RFC 0095 §1). Their presence
 *  anywhere in an argument list — INCLUDING nested inside a `kwargs{}` — makes
 *  the whole site uncomparable. */
const OPAQUE_DESCRIPTORS = new Set(["?", "array", "hash", "str-interp", "ternary"]);

/** The words TS cannot spell as an identifier, so a port of a Ruby local or
 *  parameter with one of these names has to add a trailing underscore
 *  (`default` → `default_`, `null` → `null_`). Deliberately the reserved list
 *  only: a `foo_` local is a rename and must keep reporting. */
const JS_RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

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
 *
 * Two further families are TOOLING residue rather than port debt (RFC 0096):
 *
 * - `to_s` and `to_sym`. The Ruby extractor describes `table_name.to_s`
 *   (postgresql/schema_statements.rb:436-437, :439) as the CALL, dropping the
 *   receiver, so the key is `ref:toS` and the receiver's name is not on the
 *   Ruby side at all. The faithful port is either `toString()` or — because a
 *   TS string is already a string — the bare local, and no rename is
 *   detectable either way — and `toString` is itself identifier-shaped, so the
 *   one test covers both spellings. `shard.to_sym`
 *   (connection_handling.rb:103, :254) records the same way as `ref:toSym`,
 *   and a Ruby Symbol IS a JS string (CLAUDE.md, "Symbols vs strings"), so the
 *   port is the bare local and the receiver is again unrecoverable. The list is
 *   named rather than "any `ref:` matches any `ref:`": a genuine rename between
 *   two ordinary identifiers still reports.
 * - A Ruby name that is a JS reserved word. `default` and `null`
 *   (postgresql/schema_statements.rb#extract_default_function,
 *   abstract/schema_statements.rb#change_column_null) cannot be TS
 *   identifiers, so the port spells them `default_` / `null_` and
 *   {@link snakeToCamel} does not fold the trailing underscore back. Only the
 *   reserved words qualify, so an unrelated `foo_` local still reports.
 */
function refKeysEqual(rubyKey: string, tsKey: string): boolean {
  if (rubyKey === tsKey) return true;
  const rubyName = rubyKey.slice("ref:".length);
  const tsName = tsKey.slice("ref:".length);
  if (RECEIVER_DROPPING_CONVERSIONS.has(rubyName)) return IDENTIFIER_STRING.test(tsName);
  if (JS_RESERVED_WORDS.has(rubyName) && tsName === `${rubyName}_`) return true;
  if (!/[?!=]$/.test(rubyName)) return false;
  return (rubyMethodToTsIgnoringSkip(rubyName) ?? []).includes(tsName);
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

/** A receiver descriptor with an agreeable cross-language spelling: a bare
 *  local/ivar (`id:`) or constant (`const:`) ref, which the port passes through
 *  under the same identifier. Anything else — a chain (`call:`), a literal, an
 *  opaque `?` — falls back to {@link alignBuiltinReceiver}'s strip. */
const SIMPLE_RECEIVER = /^(?:id|const):/;

/**
 * Drop the leading argument that IS the Ruby receiver, for the built-ins TS
 * cannot define on a receiver at all (RFC 0099 — see
 * receiver-as-first-arg.ts for what qualifies and, more importantly, what
 * does not). `name.to_s.camelize` is `camelize(name)`; the remaining arguments
 * then compare pairwise, so `truncate(text, 10)` against `text.truncate(20)`
 * still reads as the divergence it is.
 *
 * A SIMPLE receiver — a plain `id:`/`const:` ref the extractor records as
 * `CallSite.recv` — is COMPARED rather than dropped: it is PREPENDED to the
 * Ruby list so `camelize(a)` where Rails wrote `b.camelize` reads as the
 * divergence it is, instead of matching on the call name alone.
 *
 * A CHAINED receiver keeps the strip, and the sites this exists for are why:
 * the Ruby extractor describes `name.to_s.camelize`'s receiver as the inner
 * CALL (`call:to_s`), never as `name`, while the port — correctly, since a TS
 * string is already a string — writes `camelize(name)`. There is no spelling of
 * that receiver the two sides could agree on, so comparing it would re-flag
 * every row this table exists to retire.
 *
 * Same only-when-it-explains-the-length guard as {@link stripMixinReceiver}:
 * a port that also passes a genuine extra argument still reads as one.
 */
function alignBuiltinReceiver(
  ruby: CallSite,
  rubyArgs: string[],
  tsArgs: string[],
): { rubyArgs: string[]; tsArgs: string[] } {
  if (tsArgs.length !== rubyArgs.length + 1 || !RECEIVER_AS_FIRST_ARG.has(ruby.name)) {
    return { rubyArgs, tsArgs };
  }
  if (ruby.recv !== undefined && SIMPLE_RECEIVER.test(ruby.recv)) {
    return { rubyArgs: [ruby.recv, ...rubyArgs], tsArgs };
  }
  return { rubyArgs, tsArgs: tsArgs.slice(1) };
}

/** The two leading-receiver forms, in the one place the comparator handles them:
 *  the mixin `this` the port adds to a ported module function, and the Ruby
 *  receiver of a built-in TS cannot define on a receiver. Neither can apply to
 *  the same site — a name on the built-in table is never a ported mixin — so
 *  the order is immaterial. */
function alignReceiverArgs(
  ruby: CallSite,
  tsArgs: string[],
): { rubyArgs: string[]; tsArgs: string[] } {
  return alignPortedReceiver(
    ruby,
    alignBuiltinReceiver(ruby, ruby.args, stripMixinReceiver(ruby.args, tsArgs)),
  );
}

/**
 * The explicit receiver argument the ported free-function idiom adds
 * (RFC 0099). Ruby `klass.sti_name` is `stiName(klass)` in
 * `inheritance.ts:844` — a Ruby module/class method ported as a top-level
 * function whose FIRST parameter is the receiver, the same shape
 * {@link stripMixinReceiver} handles when the port spells that parameter
 * `this`.
 *
 * Only an `id:` receiver qualifies — a `const:` receiver is the CLASS a
 * `Foo.new(x)` construction names, which the TS side already spells as the
 * `new Foo(x)` callee rather than an argument.
 *
 * The receiver is COMPARED, not stripped: it is prepended to the Ruby list, so
 * `stiName(other)` where Rails wrote `klass.sti_name` still reads as the
 * divergence it is, and only when the extra argument is exactly one — a port
 * that also passes a genuine extra argument keeps reporting.
 */
function alignPortedReceiver(
  ruby: CallSite,
  aligned: { rubyArgs: string[]; tsArgs: string[] },
): { rubyArgs: string[]; tsArgs: string[] } {
  if (aligned.rubyArgs !== ruby.args) return aligned;
  if (ruby.recv === undefined || !/^id:/.test(ruby.recv)) return aligned;
  if (aligned.tsArgs.length !== aligned.rubyArgs.length + 1) return aligned;
  return { rubyArgs: [ruby.recv, ...aligned.rubyArgs], tsArgs: aligned.tsArgs };
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
  if (rubyKey.startsWith("kwargs{") && tsKey.startsWith("kwargs{")) {
    return kwargsKeysEqual(rubyKey, tsKey);
  }
  return rubyKey === tsKey || keptSymbolColon(rubyKey, tsKey);
}

/**
 * Two `kwargs{…}` descriptors carrying the same keys with equal values.
 *
 * A kwargs value is an argument key like any other — `shard: shard.to_sym`
 * (connection_handling.rb:103) is the same `ref:toSym` residue whether it sits
 * at a positional slot or inside the hash — so the values compare through
 * {@link argKeysEqual} rather than by the raw string equality that would class
 * a nested-only difference as a `shape` row.
 */
function kwargsKeysEqual(rubyKey: string, tsKey: string): boolean {
  const ruby = kwargPairs(rubyKey);
  const ts = kwargPairs(tsKey);
  if (ruby.size !== ts.size) return false;
  for (const [key, rubyValue] of ruby) {
    const tsValue = ts.get(key);
    if (tsValue === undefined || !argKeysEqual(rubyValue, tsValue)) return false;
  }
  return true;
}

/** The key→value pairs of an already-normalized `kwargs{…}` descriptor. A
 *  fragment carrying no `=` keys itself, so it can only ever match the
 *  identical fragment. */
function kwargPairs(descriptor: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const pair of splitPairs(descriptor.slice("kwargs{".length, -1))) {
    const eq = pair.indexOf("=");
    if (eq === -1) pairs.set(pair, pair);
    else pairs.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return pairs;
}

/**
 * Whether the TS key is the Ruby one written in the colon-kept Symbol spelling
 * (RFC 0099). A Ruby Symbol is a JS string and CLAUDE.md ("Symbols vs strings")
 * keeps the leading colon, so `:"restrict_dependent_destroy.has_many"`
 * (has_many_association.rb#handle_dependency) is the port's
 * `":restrict_dependent_destroy.has_many"`.
 *
 * {@link normalizeLiteralArg} already absorbs the colon for an
 * IDENTIFIER-shaped value, on its way through the camelization every such name
 * takes; a value that camelization does not apply to — a dotted i18n key —
 * reached comparison with the colon still on it. Reconciled here rather than in
 * the key so the strip is only ever the one direction the convention runs:
 * `":x"` is `:x`, and a Ruby `":x"` STRING is not silently the same value as
 * the Ruby string `"x"`.
 */
function keptSymbolColon(rubyKey: string, tsKey: string): boolean {
  return rubyKey.startsWith("str:") && tsKey === `str::${rubyKey.slice("str:".length)}`;
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

/** The descriptor of a `&blk` block-pass the Ruby site's argument list dropped
 *  — `&block` is `blockarg=ref:block` (extract-ruby-api.rb#describe_args) —
 *  or undefined at a site that passes no block. */
function rubyBlockArg(ruby: CallSite): string | undefined {
  return ruby.flags.find((flag) => flag.startsWith("blockarg="))?.slice("blockarg=".length);
}

/** Where the TS site passes the block the Ruby site block-passed, or -1 when it
 *  passes no such argument.
 *
 *  TS has no `&`, so the port forwards the block as an ordinary argument —
 *  `associatedTable(key, block)` (predicate-builder.ts:79) for
 *  `predicate_builder.rb:100`'s `associated_table(key, &block)` — which the TS
 *  extractor cannot tell from a value argument. The Ruby-side descriptor is
 *  what names it. */
function tsBlockArgIndex(ruby: CallSite, ts: CallSite): number {
  const blockArg = rubyBlockArg(ruby);
  return blockArg === undefined ? -1 : ts.args.lastIndexOf(blockArg);
}

/** The TS argument list with the forwarded block dropped, so that a
 *  block-passing Ruby site scores against its block-carrying TS counterpart on
 *  the arguments the two actually share ({@link tsBlockArgIndex}). */
function stripForwardedBlockArg(ruby: CallSite, ts: CallSite): string[] {
  const index = tsBlockArgIndex(ruby, ts);
  return index === -1 ? ts.args : ts.args.filter((_, i) => i !== index);
}

/**
 * Whether a candidate pairs a block-passing Ruby site with the TS site that
 * carries the block, and a block-less Ruby site with one that does not — the
 * {@link pairCallSites} tie-break that keeps two occurrences of a name
 * differing only in a block from being interchangeable.
 *
 * `predicate_builder.rb:100` calls `associated_table(key, &block)` and `:108`
 * calls `associated_table(key)`; both describe as `(key)`, because the
 * block-pass is a flag rather than an argument, so both agree exactly with both
 * of the port's two sites and source order strands the block-less Ruby site
 * against the block-carrying TS one. The block is the only thing that
 * distinguishes them, so it is what the tie is broken on.
 */
function blockAffinity(ruby: CallSite, ts: CallSite): number {
  const rubyCarries = rubyBlockArg(ruby) !== undefined || ruby.flags.includes("block");
  const tsCarries = tsBlockArgIndex(ruby, ts) !== -1 || ts.flags.includes("block");
  return rubyCarries === tsCarries ? 1 : 0;
}

/**
 * How well two same-named call sites' argument lists agree, for
 * {@link pairCallSites}. Higher is a better pairing. Ordered so that an exact
 * argument-list agreement always outranks a mere arity agreement, which in turn
 * outranks any number of positional key matches — a 3-argument list agreeing on
 * all 3 must never outrank the 4-argument list that agrees on all 4.
 *
 * An opaque list has no keys to score, so it scores as if every position agreed
 * — below an exact agreement, above any PARTIAL one of the same arity. That is
 * the honest reading (the site is uncomparable, not divergent) and it is
 * load-bearing: `attributes.rb:245`'s single `Attribute.from_database` against
 * the port's three, one of which passes an uncomparable `?? null`, would
 * otherwise abandon the uncomparable-but-plausible site for the one that scores
 * a single positional hit — turning a skip into a manufactured shape row.
 *
 * Arity is read off the STRIPPED lists, the ones the verdict is reached on.
 * On the raw lists it is backwards for every {@link RECEIVER_AS_FIRST_ARG}
 * name: the port's correct site there always carries one argument MORE than
 * Rails' (the receiver), so a raw comparison hands the arity bonus to the site
 * that happens to have the same raw count — the wrong one — and the greedy
 * assignment takes it whenever the key matches tie.
 */
function argSimilarity(ruby: CallSite, ts: CallSite): number {
  const aligned = alignReceiverArgs(ruby, stripForwardedBlockArg(ruby, ts));
  const sameArity = aligned.rubyArgs.length === aligned.tsArgs.length ? 1 : 0;
  const rubyArgs = normalizeArgs(aligned.rubyArgs);
  const tsArgs = normalizeArgs(aligned.tsArgs);
  if (rubyArgs === null || tsArgs === null) {
    return sameArity * 1_000 + Math.min(aligned.rubyArgs.length, aligned.tsArgs.length);
  }
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
 *
 * Greedy over the globally best-scoring candidate, ties broken by
 * {@link blockAffinity} and then by source order on the Ruby then the TS side,
 * so the verdict never depends on the order the candidates were enumerated in.
 */
export function pairCallSites(
  rubySites: readonly CallSite[],
  tsSites: readonly CallSite[],
): { ruby: CallSite; ts: CallSite }[] {
  const candidates: { rubyIdx: number; tsIdx: number; score: number; block: number }[] = [];
  rubySites.forEach((ruby, rubyIdx) => {
    const keys = new Set(tsCallNameKeys(ruby.name));
    tsSites.forEach((ts, tsIdx) => {
      if (!keys.has(ts.name)) return;
      candidates.push({
        rubyIdx,
        tsIdx,
        score: argSimilarity(ruby, ts),
        block: blockAffinity(ruby, ts),
      });
    });
  });
  candidates.sort(
    (a, b) => b.score - a.score || b.block - a.block || a.rubyIdx - b.rubyIdx || a.tsIdx - b.tsIdx,
  );
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

/**
 * The Ruby sites the argument gate compares, given the TS body they will pair
 * against.
 *
 * A `weak` site — one whose receiver `extract-ruby-api.rb#inert_receiver?` read
 * as a literal or a plain local (`xs.map`, `opts.fetch`) — is dropped, because a
 * name that collides with an unrelated ported method says nothing about the
 * port. But that is a receiver heuristic, not a verdict: a local can hold a
 * ported object, and `table.foreign_key(...)` (schema_definitions.rb:242) is
 * weak even though `table` is a `TableDefinition` — so `add_to` → `foreign_key`
 * compared nothing while `schema-definitions.ts:842` made exactly that call.
 *
 * So a weak site is RESTORED when both hold (RFC 0099):
 *
 * - `declaredNearby(name)` — the file being compared declares a method of that
 *   name, so the receiver is a ported collaborator sitting right there
 *   (`foreign_key`, `grouped_records`, `transform_value`, `selected_shard`)
 *   rather than an Enumerable/String builtin, which no ported file declares.
 * - the TS body still has an unconsumed same-named site once every non-weak
 *   Ruby site has claimed one — the port makes that call, so there is a real
 *   pair to compare.
 *
 * Sites are consumed in source order and the surviving list stays in source
 * order, so the pairing {@link pairCallSites} then performs is unchanged for any
 * body that had no spare TS site.
 */
export function comparableRubySites(
  rubySites: readonly CallSite[],
  tsSites: readonly CallSite[],
  declaredNearby: (rubyName: string) => boolean,
): CallSite[] {
  const budget = new Map<string, number>();
  for (const ts of tsSites) budget.set(ts.name, (budget.get(ts.name) ?? 0) + 1);
  const consume = (name: string): boolean => {
    for (const key of tsCallNameKeys(name)) {
      const left = budget.get(key) ?? 0;
      if (left > 0) {
        budget.set(key, left - 1);
        return true;
      }
    }
    return false;
  };
  for (const ruby of rubySites) {
    if (!ruby.flags.includes("weak")) consume(ruby.name);
  }
  return rubySites.filter(
    (ruby) => !ruby.flags.includes("weak") || (declaredNearby(ruby.name) && consume(ruby.name)),
  );
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
/**
 * The Symbol-vs-String discriminator, on call ARGUMENTS (RFC 0099).
 *
 * `compareLiteral` already enforces it on PARAMETER DEFAULTS, off
 * `ParamInfo.symbolDiscriminated` — which extract-ruby-api.rb:201 sets on a
 * parameter whose method body branches on `Symbol === x`. Arguments had no
 * equivalent, so a colon-less TS string silently matched a Ruby Symbol
 * everywhere: `normalizeLiteralArg` folds `":short"` and `"short"` onto the
 * same key, by design, because at a NON-discriminated position they are the
 * same value.
 *
 * At a discriminated position they are not. CLAUDE.md ("Symbols vs strings")
 * requires the port to keep the leading colon there — it is the discriminator
 * Ruby gets from the type — so a bare string is a body that bypassed the
 * branch. This runs on the RAW descriptors, after the normalized lists have
 * already matched: the normalized keys cannot express the difference.
 *
 * Deliberately narrow. The callee's params are the ones the enclosing Ruby FILE
 * defines, so only a same-file callee arms the strict arm, and a site whose
 * argument lists {@link alignReceiverArgs} had to re-align is skipped because
 * the Ruby positions no longer index the callee's params. Making every Ruby
 * Symbol argument strict was measured at +191 rows over 1047, overwhelmingly
 * ports of names that are not discriminated at all — the "wave of false rows"
 * RFC 0099 rules out.
 */
function symbolDiscriminatedAt(params: ParamInfo[] | undefined, index: number): boolean {
  const positional = (params ?? []).filter((p) => p.kind === "required" || p.kind === "optional");
  return positional[index]?.symbolDiscriminated === true;
}

function symbolDiscriminatedKwarg(params: ParamInfo[] | undefined, key: string): boolean {
  return (params ?? []).some(
    (p) => p.kind === "keyword" && p.name === key && p.symbolDiscriminated,
  );
}

/** A Ruby Symbol descriptor is `sym:<name>`; the port keeps the colon, so the
 *  only faithful TS spelling is the string `":<name>"` — `str::<name>` raw. */
function colonKeptSymbolMatches(rubyRaw: string, tsRaw: string): boolean {
  const name = unescapeDescriptorText(rubyRaw.slice("sym:".length));
  if (!tsRaw.startsWith("str:")) return false;
  const text = unescapeDescriptorText(tsRaw.slice("str:".length));
  if (!text.startsWith(":")) return false;
  const bare = text.slice(1);
  return bare === name || bare === snakeToCamel(name);
}

/**
 * Whether every Symbol argument at a Symbol-discriminated position of the
 * callee kept its leading colon. Returns true when nothing is discriminated,
 * which is the overwhelming majority of sites.
 */
function symbolSpellingsHold(
  rubyRaw: string[],
  tsRaw: string[],
  calleeRubyParams: ParamInfo[] | undefined,
): boolean {
  if (calleeRubyParams === undefined) return true;
  let positional = 0;
  for (let i = 0; i < rubyRaw.length; i++) {
    const rubyArg = rubyRaw[i];
    const tsArg = tsRaw[i];
    if (tsArg === undefined) continue;
    if (rubyArg.startsWith("kwargs{")) {
      for (const pair of splitPairs(rubyArg.slice("kwargs{".length, -1))) {
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        const key = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        if (!value.startsWith("sym:")) continue;
        if (!symbolDiscriminatedKwarg(calleeRubyParams, key)) continue;
        const tsValue = kwargValue(tsArg, key);
        if (tsValue === undefined || !colonKeptSymbolMatches(value, tsValue)) return false;
      }
      continue;
    }
    const index = positional++;
    if (!rubyArg.startsWith("sym:")) continue;
    if (!symbolDiscriminatedAt(calleeRubyParams, index)) continue;
    if (!colonKeptSymbolMatches(rubyArg, tsArg)) return false;
  }
  return true;
}

/** The raw value the TS `kwargs{…}` descriptor carries for `key`, camelized the
 *  same way {@link normalizeKwargs} camelizes the Ruby side. */
function kwargValue(tsArg: string, rubyKey: string): string | undefined {
  if (!tsArg.startsWith("kwargs{")) return undefined;
  const want = normalizeRubyKey(rubyKey);
  for (const pair of splitPairs(tsArg.slice("kwargs{".length, -1))) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (normalizeRubyKey(pair.slice(0, eq)) === want) return pair.slice(eq + 1);
  }
  return undefined;
}

export function compareCallArgs(
  ruby: CallSite,
  ts: CallSite,
  enclosingRubyName?: string,
  calleeSigs?: ParamInfo[][],
  calleeRubyParams?: ParamInfo[],
): CallArgResult {
  const skipped = (reason: CallArgSkipReason): CallArgResult => ({
    verdict: "skip",
    reason,
    rubyArgs: [],
    tsArgs: [],
  });
  if (isSkippedCallName(ruby.name)) return skipped("excludedCallName");
  if (hasUncomparableFlag(ruby) || hasUncomparableFlag(ts)) return skipped("uncomparableFlag");

  const aligned = alignReceiverArgs(ruby, ts.args);
  const rubyArgs = normalizeArgsOrFailure(aligned.rubyArgs);
  if (!Array.isArray(rubyArgs)) {
    return skipped(rubyArgs.failure === "opaque" ? "opaqueRubyArg" : "unparseableLiteral");
  }
  const normalizedTs = normalizeArgsOrFailure(aligned.tsArgs);
  if (!Array.isArray(normalizedTs)) {
    return skipped(normalizedTs.failure === "opaque" ? "opaqueTsArg" : "unparseableLiteral");
  }
  const tsArgs = stripBlockTailPadding(ruby, ts, rubyArgs, normalizedTs, calleeSigs);

  const compared = resolveCalleeRefs(rubyArgs, enclosingRubyName);
  if (argsEqual(compared, tsArgs)) {
    const alignedRuby = aligned.rubyArgs === ruby.args ? aligned.rubyArgs : undefined;
    if (
      alignedRuby === undefined ||
      symbolSpellingsHold(alignedRuby, aligned.tsArgs, calleeRubyParams)
    ) {
      return { verdict: "match", rubyArgs, tsArgs };
    }
    return { verdict: "mismatch", class: "shape", rubyArgs, tsArgs };
  }
  return { verdict: "mismatch", class: classify(compared, tsArgs), rubyArgs, tsArgs };
}
