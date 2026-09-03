#!/usr/bin/env npx tsx
/**
 * Method-centric API comparison.
 *
 * Compares Ruby Rails API surface with our TypeScript API by matching
 * individual methods, not class/module wrappers. The file IS the module —
 * if Ruby's `Sanitization` module defines `sanitize_sql`, we look for
 * `sanitizeSql` anywhere in the expected TS file, regardless of whether
 * there's a `Sanitization` class/interface wrapping it.
 *
 * This prevents agents from gaming the metric with empty interfaces.
 *
 * Usage:
 *   npx tsx scripts/api-compare/compare.ts \
 *     [--package activerecord] [--missing] [--files] [--incomplete] [--closure] \
 *     [--inheritance] [--arity] [--params] [--public-only | --privates-only] [--calls]
 *
 * `--closure` scopes the per-file detail table to the AR/AM require closure
 * (ar-closure.ts, RFC 0092) and prints its own totals line under the table, so
 * a support-gem burndown sees only the files ActiveRecord/ActiveModel require.
 * Whole-package and Data-layer/AR-closure summaries are unchanged either way.
 *
 * The default reports the full surface (public + private). `--public-only`
 * drops Rails-private/internal methods on both sides for a contract-only
 * view; `--privates-only` is the inverse. The JSON artifact is always
 * written to output/api-comparison*.json regardless of flags.
 *
 * The advisory arity check compares the positional-arg ranges of name-matched
 * methods (it never affects the parity %). A one-line summary always prints and
 * output/arity-mismatches.json is always written; `--arity` adds the
 * per-method breakdown. A justified deviation can be suppressed with a
 * reasoned arity-exclude.json entry (arity-exclude.ts); lint-arity-excludes.ts
 * then fails that entry once it goes stale.
 *
 * The advisory parameter-NAME check (RFC 0126, param-names.ts) runs beside it on
 * the same pairs: where arity asks how many args a method takes, this asks what
 * they are CALLED, since CLAUDE.md makes the camelCased Rails identifier the
 * required spelling. A `params N/M` figure prints next to `arity` and
 * output/ambiguous-parents.json carries the inheritance edges the walk followed
 * to NOTHING, per package and omitting packages at zero, so the file IS the
 * remainder lint-ambiguous-parents.ts gates only-shrink (RFC 0126).
 *
 * output/param-name-mismatches.json is always written; `--params` adds the
 * per-position breakdown. lint-param-names.ts gates it against an only-shrink
 * per-package/per-file mark (param-name-mark.json).
 *
 * Three further advisory checks run on the same name-matched pairs, each
 * one-line-summarized and always written to its own artifact, none affecting
 * the parity %: option-keys (output/options-key-mismatches.json), literal
 * defaults/constants (output/literal-mismatches.json), and — under
 * `--calls` (or `API_COMPARE_CALLS=1`) — call-set parity
 * (output/call-mismatches.json). The last is a coarse body-fidelity
 * signal: Ruby body calls absent from the matched TS body's call-set, admitting
 * every ported call name except `super` and the NO_JS_CALL_FORM names
 * (SIGNIFICANT_CALLS). It is ratcheted by lint-call-mismatches.ts
 * against the split call-mismatches-exclude/ baseline directory (one file
 * per source) — see RFC 0047. RFC 0084 folded the narrow RFC 0044 gate (a
 * curated significant-call allowlist over a second artifact) into this one,
 * whose population strictly subsumed it.
 *
 * Source-hash pinning (RFC 0025): every name-matched pair's normalized Rails
 * body digest is written to output/body-hashes.json, and the summary reports
 * pinned/unpinned counts per package (advisory; parity % unchanged). The pin
 * lifecycle is: port → verify → pin → (Rails bump) → drift report → re-verify
 * → re-pin. A committed manifest (body-pins.json) opts specific pairs in;
 * `tsx body-pins.ts --pin <ruby-file>` (or `--pin-all` for the bulk floor)
 * pins/re-pins them at the current digest, and lint-body-pins.ts (CI gate)
 * fails on DRIFT (pinned digest ≠ current vendored digest — upstream Rails
 * changed) and STALE pins (the method was removed/renamed). The digest is
 * body-only and whitespace/comment-insensitive (extract-ruby-api.rb#body_digest),
 * so pure formatting churn doesn't fire. See body-pins.ts for the full flow.
 *
 * Each host class's expected method set is expanded with the instance
 * methods of every module it `include`s (and class methods of modules it
 * `extend`s), recursively. This catches mixin wiring gaps where the
 * mixin's methods live in a sibling TS file but aren't actually reachable
 * on the host — e.g. arel #814: `Predications` methods existed in
 * `predications.ts` but `NodeExpression` didn't mix them in, so
 * `(node).eq(...)` failed at runtime despite a "100%" compare result.
 */

import * as fs from "fs";
import * as path from "path";
import { EXTERNAL_DECL_FILE, PKG_DECL_PREFIX } from "@blazetrails/parity/types";
import type {
  ApiManifest,
  CallSite,
  ClassInfo,
  MethodInfo,
  PackageInfo,
  ParamInfo,
} from "@blazetrails/parity/types";
import {
  DIR_TO_PACKAGES,
  TEST_SUPPORT_PACKAGES,
  OUTPUT_DIR,
  PACKAGE_DIR_OVERRIDES,
  PACKAGES,
  ROOT_DIR,
  SCRIPT_DIR,
  isTestHelperFile,
  packageSrcDir,
} from "./config.js";
import { SpellChecker } from "../../packages/did-you-mean/src/spell-checker.js";
import { operatorSpelling } from "./operator-order-spelling.js";
import { DATA_LAYER_PACKAGES, filterFilesToClosure, writeArClosure } from "./ar-closure.js";
import {
  TS_CLASS_RENAMES,
  isArityOverridden,
  isRubyOnlyClass,
  isScopedSkip,
  rubyFileToTs,
  rubyFileCrossPackageOverride,
  crossPackageRubyFiles,
  rubyMethodToTs,
} from "@blazetrails/parity/conventions";
import {
  isForwardingRubyEntry,
  matchArityAgainst,
  renderSig,
  shouldSkipArity,
  stripThis,
  type ArityRange,
} from "./arity.js";
import { isNestedConstructorHomonym, matchParamNamesAgainst } from "./param-names.js";
import {
  ARITY_EXCLUDE_PATH,
  arityExcludeKeyOf,
  arityExcludeKeys,
  parseArityExcludes,
} from "./arity-exclude.js";
import {
  INHERITANCE_EXCLUDE_PATH,
  inheritanceExcludeKeyOf,
  inheritanceExcludeKeys,
  parseInheritanceExcludes,
} from "./inheritance-exclude.js";
import { matchOptionKeysAgainst } from "./options-keys.js";
// call-args.ts imports NO_JS_CALL_FORM back from this module and reads it at
// CALL time for exactly that reason (see its isSkippedCallName): the pair is a
// cycle, and only a module-evaluation-time read of either side would break.
import {
  CALL_ARG_SKIP_REASONS,
  compareCallArgs,
  comparableRubySites,
  pairCallSites,
  type CallArgClass,
  type CallArgSkipReason,
} from "./call-args.js";
import { callOf } from "./call-mismatch-baseline.js";
import {
  compareDefaults,
  compareLiteral,
  constantNameMatches,
  displayLiteral,
} from "./literals.js";
import { isSourceUnported } from "@blazetrails/parity/unported-files";
import {
  buildIncludeGraph,
  includeGraphCallSets,
  includeGraphEntities,
  includeGraphHosts,
  type GraphEntity,
} from "./include-graph.js";
import {
  JS_ENUMERABLE_ALIASES,
  jsEnumerableAliases,
  NEGATED_ALIASES,
  partitionNegatedCalls,
  requiresNegatedAlias,
} from "./enumerable-idioms.js";

// `super` is captured by both extractors (extract-ruby-api.rb records
// super/zsuper; extract-ts-api.ts records a bare super(...) callee) and
// significantMissingCalls() has a dedicated, asymmetry-aware branch for it, but
// it is deliberately NOT significant. Rails mixes modules with `include` (Ruby's
// super walks the ancestor chain into the included module), but trails ports
// modules as `this`-typed functions assigned to the class (see CLAUDE.md
// "Module mixins") — there is no class-inheritance `super` to chain to, so the
// omission is structural, not a fidelity gap. The capability is retained for an
// opt-in, curated caller via the `significant` parameter.
//
// Only names the Ruby extractor actually records are useful: its walk_for_calls
// (extract-ruby-api.rb) drops callees starting with `_` or not matching
// /\A[a-z]/, so e.g. `_run_save_callbacks` can never match — the
// non-underscore `run_callbacks` path covers callback dispatch instead.

// The significant set (RFC 0047): admits EVERY ported Ruby call name as
// significant, except `super` (which the module-mixin port structurally drops —
// see the comment above). Computed under `--calls` /
// `API_COMPARE_CALLS=1`, this is a membership predicate rather than an
// allowlist, so `checkCalls` flags every name-matched omission, writing
// call-mismatches.json — gated by its own ratcheting baseline (the split
// call-mismatches-exclude/ dir + lint-call-mismatches.ts). The population
// is ~72% Enumerable/Object/accessor noise (bucket c) plus confirmed equivalents
// (bucket b); the baseline seeds large and shrinks as the per-cluster convergence
// stories land. The existing noise-suppression gates inside significantMissingCalls
// (isPortedWithArgs, mapCall, "TS makes NONE of the mapped candidates") still
// apply, so this is not the raw missing-call diff.
//
// Ruby calls whose FAITHFUL JS port emits no call at all — the receiver is
// consumed by a native language construct (a template literal, a for-of loop, a
// truthiness test, the `in` operator). No entry in JS_ENUMERABLE_ALIASES can match
// one of these in a faithful port, because there is no callee to record: the
// gate would baseline every occurrence forever, diluting its signal exactly the way
// `super` is excluded for (see SIGNIFICANT_CALLS below). These are
// therefore suppressed from the significant set (RFC 0025). Each name is
// justified by the non-call construct it becomes.
//
// A name qualifies ONLY because no JS call form exists at all. There is no
// second group any more: `key?` / `has_key?` sat here because the only JS call
// form was `Map#has` and a ported options hash is an object literal, whose
// membership test was the `in` operator or `x.k !== undefined` — a shape the
// gate cannot tell from a dropped guard. `@blazetrails/ruby-compat`'s `hasKey`
// (the port of `rb_hash_has_key`, `vendor/ruby/hash.c:3671`) is that missing
// call form, so RFC 0129 discharged both entries and the ports call it.
//
// The seven that remain are NOT candidates, and ruby-compat cannot make them
// so: each becomes a language CONSTRUCT with no callee, not a call some package
// could supply. `to_s` / `to_str` are a template literal and implicit String
// coercion; `each` is a `for…of`; `present?` / `blank?` are truthiness tests;
// `catch` is a clause, never a callee (see below); and `synchronize` is a mutex
// acquisition JS has nothing to acquire (see below) — a Ruby `Mutex` is
// deferred by RFC 0129 and is the only thing that could ever revisit it.
//
// DELIBERATELY NOT suppressed — `size`, `empty?`, `first`, `last`: these read as
// plain Array/property idioms (`xs.length`, `xs.length === 0`, `xs[0]`, `xs.at(-1)`)
// but on an ActiveRecord::Relation/association receiver they are real methods with
// query-triggering bodies — `Relation#size` is `loaded? ? records.length : count(:all)`
// and `#empty?` is `loaded? ? records.empty? : !exists?` (relation.rb), `#first`/`#last`
// dispatch to `find_nth_with_limit`/`find_last` (finder_methods.rb; trails ports these
// as `performFirst`/`performLast`). A single global set has no receiver-type
// distinction, so suppressing them would make a TS port that rewrites a relation
// `.first`/`.size` into indexing a preloaded array (dropping the query trigger)
// permanently invisible to the gate — exactly the fidelity gap it exists to
// catch. Same reason `delete` (Map#delete), `merge`, `fetch` — all real JS call
// forms — stay in.
//
// MEASURED, 2026-08-08 (RFC 0092 `positional-idiom-analogues`): the question
// "can the comparator tell an Array/Hash receiver from a Relation/association
// one?" was put to the data, and the answer is no beyond what is already done.
// The comparator's only receiver signal is the extractor's inert-receiver
// filter (RFC 0083 `weakCalls` / {@link dropWeakCalls}), which drops a call
// name when EVERY occurrence in the Ruby body sat on a local variable or a
// literal. It is already applied to the population these rows come from, and
// it has already taken everything it can prove: of the 106 activerecord
// call-mismatch rows for `first`/`last`/`any?`/`size`/`include?`, **zero** are
// weak. What survives is ivars (`@stack.last`, `@inserts.first`), bare
// self-calls (23 of the 36 `any?` rows have no receiver at all), constants and
// method chains — and those same arms carry the real query triggers:
// `scope.first` (`associations/singular_association.rb:52`), `records.first` /
// `records.last` (`relation/finder_methods.rb:584,637`), `target.first`
// (`associations/has_many_association.rb:36`), `group_values.any?`
// (`relation/calculations.rb:223,446`), `default_scopes.any?`
// (`scoping/default.rb:56,157`). An ivar or a reader can hold either an Array
// or a Relation, so no receiver-token rule separates them; the audit's
// token proxy misclassifies in both directions. A property-analogue table or a
// `NO_JS_CALL_FORM` entry for these names would therefore buy ~90 row deletions
// at the price of making a dropped query trigger permanently invisible, so the
// tables are deliberately left alone and those rows go to the reason-text
// route (per-row human review), not to a mechanism. See the matching note in
// enumerable-idioms.ts.
export const NO_JS_CALL_FORM = new Set([
  "to_s", // template literal / implicit String() coercion — `${x}`
  "each", // for...of loop — no .forEach callee
  "present?", // truthiness (`x != null && x !== ""`)
  "blank?", // truthiness (`!x`)
  "to_str", // implicit String coercion — same family as `to_s`
  "synchronize", // the block runs bare — JS has no mutex to acquire
  "catch", // `try { … } catch (e) { … }` — a clause, never a callee
]);

// `catch` qualifies on the same ground as `synchronize`. Ruby's `catch(:tag)`
// is Kernel's non-local-exit construct, and its faithful port is JS's own
// non-local-exit construct: a `try` statement with a `catch` CLAUSE that
// re-raises anything but the sentinel (`isAbortSignal(e)` — activesupport's
// port of `throw :abort`). A clause is syntax, not a call expression, so the
// TS body emits no callee and no alias could ever match it, however faithfully
// the catch is spelled at the Rails call site.

// `synchronize` is the strongest member of that set rather than a marginal one.
// Every Ruby occurrence is a mutex acquisition — `Mutex#synchronize`,
// `MonitorMixin#synchronize`, or a wrapper that delegates straight to one
// (`queue.rb:80`, `asynchronous_queries_tracker.rb:18`) — and JS has no mutex,
// so a faithful port emits the guarded body with no callee at all. There is no
// TS body that could ever satisfy the call, which is what separates a
// NO_JS_CALL_FORM name from a baselined omission: the gate would otherwise
// carry a row per guarded method forever, with nothing to converge onto.

/**
 * The JS iteration callee an Enumerable iterator's faithful port would name if
 * it named one at all. It is the anchor {@link LOOP_SKELETON_NAMES} is derived
 * through, and it is a JS construct name rather than a Ruby one, so the derived
 * population still comes entirely from the two existing tables.
 */
const JS_ITERATION_CALLEE = "forEach";

/**
 * The skeleton-stream names that stand for the SAME construct as a native
 * loop, on either side: Ruby's block iterators and the JS iteration callee.
 *
 * Derived, not hand-maintained (RFC 0084) — a Ruby name qualifies when it is
 * both an Enumerable idiom whose JS analogue is the iteration callback
 * ({@link JS_ENUMERABLE_ALIASES}) and one whose faithful port emits no call at
 * all ({@link NO_JS_CALL_FORM}), which is exactly the pairing that makes
 * `xs.each { ... }` a `ref:each` on the Ruby side and a bare `loop` on the TS
 * side of the same ported body.
 */
const LOOP_SKELETON_NAMES = new Set(
  [...JS_ENUMERABLE_ALIASES]
    .filter(([ruby, aliases]) => NO_JS_CALL_FORM.has(ruby) && aliases.includes(JS_ITERATION_CALLEE))
    .flatMap(([ruby, aliases]) => [ruby, ...aliases]),
);

/**
 * Fold a skeleton stream's block-iteration tokens onto `loop`, so Ruby's
 * `xs.each { |x| save(x) }` (`ref:each ref:save`) and its faithful `for (const
 * x of xs) this.save(x)` port (`loop ref:save`) read as the same sequence.
 *
 * Applied where the two streams are COMPARED, never in the extractors: they
 * emit raw names by design (extract-ts-api.ts:extractSkeleton), and the Ruby↔TS
 * conventions live here. The one function runs over both sides, since {@link LOOP_SKELETON_NAMES} carries the
 * Ruby name and the JS analogue alike.
 */
/**
 * Ruby's `catch(:tag) { ... }` / `throw :tag` are ordinary `Kernel` calls, so
 * the extractor emits them as `ref:catch` / `ref:throw`; their only faithful TS
 * lowering is a `try` whose handler re-tests the tag and rethrows, which emits
 * `try` / `throw`. Folding the pair onto the construct the port is forced to
 * use is what lets a line-for-line body read as one — the residual `if` the TS
 * tag test contributes is a real extra arm and is left flagged (RFC 0113).
 */
const CONSTRUCT_SKELETON_NAMES = new Map([
  ["catch", "try"],
  ["throw", "throw"],
]);

export function foldSkeletonTokens(skeleton: string[]): string[] {
  return skeleton.map((token) => {
    if (!token.startsWith("ref:")) return token;
    const name = token.slice("ref:".length);
    if (LOOP_SKELETON_NAMES.has(name)) return "loop";
    return CONSTRUCT_SKELETON_NAMES.get(name) ?? token;
  });
}

// The significant set (RFC 0047): admits EVERY ported Ruby call name as
// significant, except `super` (which the module-mixin port structurally drops —
// see the comment at the top of this section) and the NO_JS_CALL_FORM names
// (whose faithful port is a non-call construct, so no alias can ever match).
export const SIGNIFICANT_CALLS: { has(value: string): boolean } = {
  has: (value) => value !== "super" && !NO_JS_CALL_FORM.has(value),
};

/**
 * Drop the extractor's inert-receiver call names (RFC 0083) from a Ruby
 * call-set. A name only reaches `weakCalls` when EVERY occurrence in the body
 * sat on a local variable or a literal (`xs.first`, `opts.fetch`) — a single
 * `owner.save` keeps `save`.
 */
export function dropWeakCalls(
  calls: readonly string[] | undefined,
  weakCalls: readonly string[] | undefined,
): readonly string[] {
  if (!calls) return [];
  if (!weakCalls || weakCalls.length === 0) return calls;
  const weak = new Set(weakCalls);
  return calls.filter((c) => !weak.has(c));
}

// Re-exported from the shared idiom table so existing importers (compare.test.ts,
// the redundancy guard) keep resolving these names from compare.ts.
export { JS_ENUMERABLE_ALIASES, jsEnumerableAliases, NEGATED_ALIASES, partitionNegatedCalls };

/**
 * Narrow a Ruby PREDICATE's candidate list against the rest of the body it was
 * read from (RFC 0084 `extractor-predicate-and-closure-order-artifacts`).
 *
 * `rubyMethodToTs` maps `find_target?` to BOTH spellings a port may use —
 * `["isFindTarget", "findTarget"]` — because trails prefixes some ported
 * predicates with `is` and leaves others bare, and the conventions table cannot
 * know which. That either-spelling candidate is safe on its own and wrong the
 * moment the SAME body also calls the plain `find_target`: the bare spelling is
 * then the plain call's port, and letting the predicate claim it makes the two
 * distinct Ruby calls resolve to one TS name. `CollectionAssociation#load_target`
 * is the worked case — Rails calls `find_target?` then `merge_target_lists` then
 * `find_target` (collection_association.rb:272-279), trails calls
 * `findTargetNeeded` then `mergeTargetLists` then `findTarget`
 * (collection-association.ts), and the predicate claiming `findTarget` reported
 * a call-ORDER inversion in a body whose order matches Rails exactly.
 *
 * So: when the body makes the plain call too, drop from the predicate's
 * candidates every name the plain call also maps to. The `is`-prefixed spelling
 * always survives — conventions.ts emits one only for a `?`-suffixed name, and
 * `plain` never ends in `?` — so a genuinely dropped predicate is still
 * flagged; this only stops one Ruby call from being credited to another's port.
 *
 * Deliberately narrow: the pairing is a predicate against its OWN bare sibling,
 * exact-string. Two DIFFERENT Ruby predicates whose candidate lists overlap are
 * not disambiguated here, because nothing says which of them owns the shared
 * spelling — there is no `plain` to reserve it for. That case is handled where
 * it actually costs something, the order check, by dropping the shared name
 * from both ({@link ambiguousTsNames}).
 */
export function narrowPredicateCandidates(
  rubyCall: string,
  mapped: readonly string[],
  rubyCalls: readonly string[],
  mapCall: (rubyCall: string) => string[] | null = rubyMethodToTs,
): string[] {
  if (!rubyCall.endsWith("?")) return [...mapped];
  const plain = rubyCall.slice(0, -1);
  if (!rubyCalls.includes(plain)) return [...mapped];
  const claimed = new Set(mapCall(plain) ?? []);
  const narrowed = mapped.filter((c) => !claimed.has(c));
  return narrowed.length === 0 ? [...mapped] : narrowed;
}

/**
 * The TS call a Ruby name is spelled as when {@link significantMissingCalls}'s
 * ported-with-args gate SUPPRESSES it — i.e. the name maps to no ported TS
 * method that takes arguments, so the gate never asks whether the TS body makes
 * it, and it never consumes the TS name it actually ports.
 *
 * That is fine while the spelling is unique to it, and wrong the moment a
 * SIBLING Ruby call in the same body maps to the same TS name: the sibling is
 * then credited with the suppressed call's port and stops flagging, so the real
 * omission can be recorded in no register at all (RFC 0106 Open Question 1).
 * `GeneratedRelationMethods#generate_method` is the worked case — Rails calls
 * `method_defined?(method)` (delegation.rb:76) and
 * `RESERVED_METHOD_NAMES.include?(method.to_s)` (delegation.rb:78), trails
 * spells the memo guard `this._methods.has(name)` (relation/delegation.ts), and
 * `include?`'s `has` alias claimed it.
 *
 * Entries are here rather than in {@link JS_ENUMERABLE_ALIASES} because that
 * table's contract is that an alias can only ever SILENCE a flag; these
 * spellings exist to take a name away from a sibling, which can raise one.
 *
 * `method_defined?` — `Module#method_defined?(name)` asks whether a name is
 * installed on a method table; trails' generated-method tables are `Map`s, so
 * the port is `table.has(name)`, the same JS callee `include?`/`key?` alias to.
 */
export const SUPPRESSED_CALL_TS_SPELLINGS = new Map<string, string[]>([
  ["method_defined?", ["has"]],
]);

/**
 * The TS call names in `tsCalls` already spoken for by a Ruby call the
 * ported-with-args gate suppresses, so no OTHER Ruby call in the same body may
 * be credited with them (see {@link SUPPRESSED_CALL_TS_SPELLINGS}).
 *
 * Deliberately keyed on that gate ALONE. The other suppression —
 * {@link NO_JS_CALL_FORM} — is the set of names whose faithful port emits no
 * callee at all, so those calls have no TS spelling to consume and claiming one
 * for them would manufacture rows against ports that are correct.
 */
export function suppressedCallClaims(
  rubyCalls: readonly string[],
  tsCalls: Set<string>,
  isPortedWithArgs: (tsName: string) => boolean,
  mapCall: (rubyCall: string) => string[] | null = rubyMethodToTs,
  significant: { has(value: string): boolean } = SIGNIFICANT_CALLS,
  aliasCall: (rubyCall: string) => string[] = jsEnumerableAliases,
): Set<string> {
  const claimed = new Set<string>();
  for (const rc of rubyCalls) {
    if (!significant.has(rc)) continue;
    const mapped = mapCall(rc);
    if (!mapped || mapped.length === 0) continue;
    if (mapped.some(isPortedWithArgs)) continue;
    for (const c of [
      ...mapped,
      ...aliasCall(rc),
      ...(SUPPRESSED_CALL_TS_SPELLINGS.get(rc) ?? []),
    ]) {
      if (tsCalls.has(c)) claimed.add(c);
    }
  }
  return claimed;
}

/**
 * Core of the advisory calls-parity check (pure, exported for tests). For a
 * name-matched pair, returns the fidelity-critical Ruby body calls that are
 * absent from the TS body's call-set, formatted as `ruby_call → tsCand|tsCand`.
 *
 * Three gates keep it high-signal (a GENERAL missing-call diff is ~72% noise —
 * Ruby Enumerable/Object idioms that translate to native JS and collide with
 * ported names):
 *   1. only calls in `significant` (SIGNIFICANT_CALLS);
 *   2. only calls whose mapped TS candidate is a ported method that TAKES
 *      arguments somewhere (`isPortedWithArgs`) — excludes zero-arg attribute
 *      readers, which Ruby records as calls but TS accesses as `this.x`;
 *   3. flagged only when the TS body makes NONE of the mapped candidates, nor
 *      any JS-native analogue of the Ruby call (`aliasCall`, e.g. `some` for
 *      `any?`).
 *
 * `bodyRubyCalls` is the body's call list BEFORE `dropWeakCalls` — the
 * disambiguation above is about what the Ruby body NAMES, and a call the weak
 * filter drops (an inert receiver, `reflection.validate?`) still names a TS
 * spelling that another call would otherwise be credited with.
 */
export function significantMissingCalls(
  rubyName: string,
  rubyCalls: readonly string[],
  tsCalls: Set<string>,
  isPortedWithArgs: (tsName: string) => boolean,
  mapCall: (rubyCall: string) => string[] | null = rubyMethodToTs,
  significant: { has(value: string): boolean } = SIGNIFICANT_CALLS,
  aliasCall: (rubyCall: string) => string[] = jsEnumerableAliases,
  negatedTsCalls: Set<string> = new Set(),
  bodyRubyCalls: readonly string[] = rubyCalls,
): string[] {
  const missing: string[] = [];
  const claimed = suppressedCallClaims(
    bodyRubyCalls.filter((rc) => rc !== rubyName),
    tsCalls,
    isPortedWithArgs,
    mapCall,
    significant,
    aliasCall,
  );
  const unclaimed = (calls: Set<string>) =>
    claimed.size === 0 ? calls : new Set([...calls].filter((c) => !claimed.has(c)));
  const availableTsCalls = unclaimed(tsCalls);
  const availableNegatedTsCalls = unclaimed(negatedTsCalls);
  for (const rc of rubyCalls) {
    if (rc === rubyName) continue; // self/recursive call
    if (!significant.has(rc)) continue;
    if (rc === "super") {
      // super bypasses the ported-with-args gate (it isn't a ported method
      // that takes args), and matches either TS spelling of a super-chain:
      //   - bare `super(...)` (constructor) → extractor records "super";
      //   - `super.<method>()` (a non-constructor override) → extractor
      //     records the method name, and Ruby's bare `super` in method `m`
      //     chains to the parent `m`, so `super.<m>()` (mapped to its camelCase
      //     TS name) is the faithful port.
      // Flag only when the TS body does NEITHER — a genuinely dropped chain.
      const selfTs = mapCall(rubyName) ?? [];
      const chained = tsCalls.has("super") || selfTs.some((c) => tsCalls.has(c));
      if (!chained) missing.push(`super → super|${[...selfTs].join("|")}`);
      continue;
    }
    const raw = mapCall(rc);
    if (!raw || raw.length === 0) continue;
    const mapped = narrowPredicateCandidates(rc, raw, bodyRubyCalls, mapCall);
    if (!mapped.some(isPortedWithArgs)) continue;
    if (mapped.some((c) => availableTsCalls.has(c))) continue;
    // A NEGATED alias (`exclude? → includes`, `none? → every`) is matched
    // against the negated call-set: a bare `xs.includes(y)` where Rails wrote
    // `exclude?`, or a bare `xs.every(p)` where it wrote `none?`, is the
    // inverted condition and must not silence the ratchet. The marker covers a
    // `!` on the call or inside its callback, so the de-Morgan port
    // `every((t) => !t.isDirty())` still counts (see NEGATED_ALIASES).
    const aliasMatched = aliasCall(rc).some((c) =>
      requiresNegatedAlias(rc, c) ? availableNegatedTsCalls.has(c) : availableTsCalls.has(c),
    );
    if (aliasMatched) continue;
    missing.push(`${rc} → ${mapped.join("|")}`);
  }
  return missing;
}

/**
 * The TS names that TWO OR MORE of a body's Ruby calls could be ported as, so
 * no position in the TS sequence can be attributed to either of them (RFC 0084
 * `extractor-predicate-and-closure-order-artifacts`).
 *
 * The class is a predicate and its plain sibling in one body:
 * `define_autosave_validation_callbacks` calls `reflection.validate?`
 * (autosave_association.rb:221) and then `validate validation_method` (:231),
 * and trails spells the first `reflection.validate` — so the TS name `validate`
 * occurs twice with two different meanings, and `callSeq` (deduplicated at
 * first occurrence, like Ruby's `calls.uniq`) keeps only the predicate's
 * position. Charging the plain call with that position reported an inversion
 * against a body whose order matches Rails.
 *
 * Wired into the ORDER comparison ONLY, and the asymmetry with the membership
 * check is the semantics of the two, not an oversight. A position is one
 * indivisible fact that has to be attributed to exactly one call, so an
 * ambiguous name carries no usable position. Membership is a SET comparison on
 * both sides — Ruby's `calls.uniq` against the TS `Set` — and neither side
 * records multiplicity, so it cannot demand that two Ruby calls be satisfied by
 * two distinct TS names even in principle: a body calling one method twice is
 * already indistinguishable from one calling it once. Narrowing there would
 * only manufacture rows for a demand the artifact cannot express.
 */
export function ambiguousTsNames(
  rubyCalls: readonly string[],
  mapCall: (rubyCall: string) => string[] | null = rubyMethodToTs,
): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const rc of new Set(rubyCalls)) {
    for (const c of mapCall(rc) ?? []) {
      (owners.get(c) ?? owners.set(c, new Set()).get(c)!).add(rc);
    }
  }
  return new Set([...owners].filter(([, rcs]) => rcs.size > 1).map(([c]) => c));
}

/**
 * Marker prefix on an ORDER-only call-parity flag (RFC 0084). The baseline keys
 * on the text left of the arrow (`callOf`), so the prefix is what makes an
 * order-only row distinguishable from a dropped-call row in the exclude tree
 * and in review, and greppable as a class.
 */
export const ORDER_PREFIX = "order:";

/**
 * Order-only divergence between a Ruby body and its matched TS body: both make
 * the same significant calls, but not in the same sequence. A set diff cannot
 * see this, and CLAUDE.md's "same branches, in the same order, with the same
 * guards and early returns" makes it a fidelity requirement — the shape is a
 * matched / reordered / divergent split over the ratchet's whole population.
 *
 * Only calls that pass the same gates as {@link significantMissingCalls} AND are
 * present in the TS body count: a dropped call is that check's finding, not
 * this one's, so the two never double-report the same divergence. `super` is
 * excluded for the same reason it is not significant — the mixin port
 * structurally drops or respells it, so its position says nothing.
 *
 * `tsCalls` must be the body's OWN source-ordered call sequence
 * (`MethodInfo.callSeq`), never the delegation/helper-union set: a wrapper
 * resolving in place of the implementation has no meaningful order of its own,
 * which is the `resolvePortFn` cross-file-fallback false-positive class the
 * codegen scorer hit on `relation.rb::computeCacheKey`.
 *
 * Compared over a SINGLE candidate declaration's sequence only — two
 * declarations under one name have no combined order — and the `rubyCalls` /
 * `tsCalls` sequences must both be deduplicated at first occurrence, since a
 * name's position is its first one.
 *
 * Both sequences are recorded in EVALUATION order by the extractors
 * (extract-ruby-api.rb#walk_call_in_order, extract-ts-api.ts#collectCalls):
 * a call's arguments come before the call itself, so a body that hoists a
 * nested argument into a local — which an `await` forces on the TS side —
 * reads as the same sequence as the nested spelling, and only a real
 * reordering flags here.
 *
 * At most one flag per body, naming the first inversion — `order:b,a → a,b`
 * reads "TS calls b before a; Rails calls a before b" — so the row is a stable
 * baseline key rather than a whole-sequence string that churns on every edit.
 *
 * A TS name that carries no position for the call under test is skipped here;
 * the membership check still sees it. Two causes, settled in ONE filter — the
 * union computed below — rather than two overlapping ones:
 *   - two of the body's Ruby calls could both be ported as it, so no position
 *     can be attributed to either ({@link ambiguousTsNames});
 *   - one of the body's Ruby calls is SUPPRESSED by the ported-with-args gate
 *     and the name is the spelling it ports ({@link suppressedCallClaims}), so
 *     the position belongs to a call this check never reaches. That is the
 *     same indivisible-position fact as an ambiguous name, arriving by a
 *     different route: the second owner is invisible to the gate rather than
 *     visible-and-tied (RFC 0106 Open Question 1). `significantMissingCalls`
 *     honours the same claims by withholding them from `tsCalls`.
 *
 * `bodyRubyCalls` is the body's call list BEFORE `dropWeakCalls` — the
 * disambiguation above is about what the Ruby body NAMES, and a call the weak
 * filter drops (an inert receiver, `reflection.validate?`) still names a TS
 * spelling that another call would otherwise be credited with.
 */
export function reorderedCalls(
  rubyName: string,
  rubyCalls: readonly string[],
  tsCalls: readonly string[],
  isPortedWithArgs: (tsName: string) => boolean,
  mapCall: (rubyCall: string) => string[] | null = rubyMethodToTs,
  significant: { has(value: string): boolean } = SIGNIFICANT_CALLS,
  bodyRubyCalls: readonly string[] = rubyCalls,
  aliasCall: (rubyCall: string) => string[] = jsEnumerableAliases,
): string[] {
  const unpositioned = new Set([
    ...ambiguousTsNames(bodyRubyCalls, mapCall),
    ...suppressedCallClaims(
      bodyRubyCalls.filter((rc) => rc !== rubyName),
      new Set(tsCalls),
      isPortedWithArgs,
      mapCall,
      significant,
      aliasCall,
    ),
  ]);
  const rubySeq: string[] = [];
  for (const rc of rubyCalls) {
    if (rc === rubyName) continue;
    if (rc === "super") continue;
    if (!significant.has(rc)) continue;
    const raw = mapCall(rc);
    if (!raw || raw.length === 0) continue;
    const mapped = narrowPredicateCandidates(rc, raw, bodyRubyCalls, mapCall);
    if (!mapped.some(isPortedWithArgs)) continue;
    const hit = mapped.find((c) => tsCalls.includes(c) && !unpositioned.has(c));
    if (hit === undefined) continue;
    if (rubySeq.includes(hit)) continue;
    rubySeq.push(hit);
  }
  if (rubySeq.length < 2) return [];
  for (const [i, name] of rubySeq.entries()) {
    for (const later of rubySeq.slice(i + 1)) {
      if (tsCalls.indexOf(later) < tsCalls.indexOf(name)) {
        return [`${ORDER_PREFIX}${later},${name} → ${name},${later}`];
      }
    }
  }
  return [];
}

/**
 * The signature populations `resolvePortedWithArgsSigs` reads, plus the
 * option-key side-map recorded from the same members.
 */
export interface TsPortedWithArgsMaps {
  /**
   * Every signature seen for a TS name, from THIS package only — no dep
   * packages. Arity's pool is global (see `tsParamsByName` in main); this gate's
   * must not be widened back to match it.
   */
  paramsByNameInPkg: Map<string, ParamInfo[][]>;
  /**
   * Per-(file, name) counterpart, package-only: relative paths collide across
   * packages (`attribute-methods.ts` exists in both activemodel and
   * activerecord), so a same-file map that also held dep-package files would
   * still let a dep signature open the gate. Feeds the ported-with-args gate
   * and the literal-default check.
   */
  paramsByFileNameInPkg: Map<string, Map<string, ParamInfo[][]>>;
  /**
   * The same signatures keyed by DECLARING CLASS too (`<owner>#<name>`), for
   * the parameter-NAME check alone: a file-scoped pool lets two sibling classes
   * lend each other a signature (`OutputBuffer#capture(*args)`, buffers.rb:72,
   * scored against `StreamingBuffer#capture`, buffers.rb:126).
   */
  paramsByFileOwnerNameInPkg: Map<string, Map<string, ParamInfo[][]>>;
  /**
   * Signature objects (by identity) belonging to a `set` accessor. A Ruby
   * writer is its own method (`where_clause=`) but conventions.ts maps it onto
   * the bare camel name, so a get/set pair pools two signatures under one name.
   * The ported-with-args gate must not read the writer's parameter as proof
   * that the READER — the method a Ruby `where_clause` CALL maps to — takes
   * arguments; that is what made adding a writer Rails already has surface call
   * mismatches on bodies nobody touched. Arity keeps the signature; only this
   * gate subtracts it. See MethodInfo.writer.
   */
  writerSigs: Set<readonly ParamInfo[]>;
  /**
   * Per-(file, name) resolved options-object keys (null = uncheckable),
   * package-only for the same collision reason as `paramsByFileNameInPkg`.
   * Scoped per-FILE — unlike arity's global pool — so a sibling adapter's
   * same-named method (e.g. PostgreSQL `createDatabase`) can't lend its keys to
   * a different adapter's Ruby method and manufacture a cross-adapter
   * `missingInTs` artifact (`create_database :charset`). The mixin
   * re-export/real-type split is preserved because the option-key check runs
   * against the file the method actually MATCHED in.
   */
  optionKeysByFileName: Map<string, Map<string, (string[] | null)[]>>;
}

export function newTsPortedWithArgsMaps(): TsPortedWithArgsMaps {
  return {
    paramsByNameInPkg: new Map(),
    paramsByFileNameInPkg: new Map(),
    paramsByFileOwnerNameInPkg: new Map(),
    writerSigs: new Set(),
    optionKeysByFileName: new Map(),
  };
}

/**
 * Record one package-scoped TS member into the ported-with-args populations.
 *
 * The `isTestHelperFile` guard lives HERE, with the population it protects: a
 * test helper standing in for a Ruby method must not open the calls gate for a
 * body that never calls it (see config.ts#isTestHelperFile). Held on `main()`'s
 * owner-map block instead — where a revert probe once put it — every gate, every
 * `scripts/api-compare/` test and the `call-mismatches.json` artifact itself
 * stay byte-identical, which is why this half is exported and pinned by a test
 * rather than left as a closure over `main()`'s locals.
 */
export function recordTsPortedWithArgs(
  maps: TsPortedWithArgsMaps,
  m: MethodInfo,
  file: string,
  owner: string,
): void {
  if (isTestHelperFile(file)) return;
  const pkgSigs = maps.paramsByNameInPkg.get(m.name) ?? [];
  pkgSigs.push(m.params);
  maps.paramsByNameInPkg.set(m.name, pkgSigs);
  const pkgByName = maps.paramsByFileNameInPkg.get(file) ?? new Map<string, ParamInfo[][]>();
  pkgByName.set(m.name, [...(pkgByName.get(m.name) ?? []), m.params]);
  maps.paramsByFileNameInPkg.set(file, pkgByName);
  const pkgByOwnerName =
    maps.paramsByFileOwnerNameInPkg.get(file) ?? new Map<string, ParamInfo[][]>();
  const ownerKey = `${owner}#${m.name}`;
  pkgByOwnerName.set(ownerKey, [...(pkgByOwnerName.get(ownerKey) ?? []), m.params]);
  maps.paramsByFileOwnerNameInPkg.set(file, pkgByOwnerName);
  if (m.writer) maps.writerSigs.add(m.params);
  if (m.optionKeys !== undefined) {
    const byName = maps.optionKeysByFileName.get(file) ?? new Map<string, (string[] | null)[]>();
    byName.set(m.name, [...(byName.get(m.name) ?? []), m.optionKeys]);
    maps.optionKeysByFileName.set(file, byName);
  }
}

/**
 * Signature candidates the ported-with-args gate (gate 2 above) resolves a
 * mapped TS name against: the same file's signatures when that file defines the
 * name, else the ones from the SAME PACKAGE only.
 *
 * It used to consult a pool built package + dependency wide, which made the
 * gate effectively global: one same-named method taking a parameter ANYWHERE in
 * the package or its deps opened the gate in every file, so porting a single
 * widely-called method (`Relation#first`) tripped unrelated bodies (arel's
 * `first`) at once. Arity's pool stays global on purpose — mixin re-export
 * bindings hide the real signature in another file — but this gate must not be
 * widened back to match it.
 *
 * Both scopes are asked for the Rails-private `_` spelling of the name too, and
 * only after the name's own spelling has come up empty there (RFC 0126). trails
 * ports a Rails private method as `_foo` — the convention
 * `eslint/rails-private-methods.json` is generated from, and the one
 * conventions.ts#rubyMethodToTs already offers as a call CANDIDATE — so without
 * it a file's own `_query` is invisible here and the package pool's unrelated
 * `query` answers in its place, which is the same-file preference above being
 * defeated by a prefix. A name that already carries the prefix is never
 * stripped, so a Ruby `_foo` resolves against the TS `_foo` alone.
 */
export function resolvePortedWithArgsSigs(
  byFileName: ReadonlyMap<string, ReadonlyMap<string, ParamInfo[][]>>,
  byNameInPkg: ReadonlyMap<string, ParamInfo[][]>,
  tsFile: string,
  name: string,
  writerSigs: ReadonlySet<readonly ParamInfo[]> = new Set(),
): ParamInfo[][] {
  const readers = (sigs: ParamInfo[][]): ParamInfo[][] => sigs.filter((s) => !writerSigs.has(s));
  const spellings = name.startsWith("_") ? [name] : [name, `_${name}`];
  for (const n of spellings) {
    const sameFile = byFileName.get(tsFile)?.get(n);
    if (sameFile && sameFile.length > 0) return readers(sameFile);
  }
  for (const n of spellings) {
    const inPkg = byNameInPkg.get(n);
    if (inPkg && inPkg.length > 0) return readers(inPkg);
  }
  return [];
}

/**
 * Largest own-call-set a TS body may have and still read as a pure delegating
 * wrapper: the self-named delegate call, the receiver accessor that produces the
 * delegate, and at most one guard/bookkeeping call (`clearDataSourceCacheBang`,
 * an `await`ed version probe). Above that the body is doing real work of its own,
 * so its omissions are its own.
 */
const DELEGATION_MAX_CALLS = 3;

/**
 * Whether a matched TS body is a pure delegating wrapper — `return
 * this.pgSchemaStatements().indexes(tableName)` — rather than the port itself.
 *
 * This exists because of how Ruby `include` attribution lands in the gate.
 * A Rails module mixed into a class (`PostgreSQL::SchemaStatements` into
 * `PostgreSQLAdapter`) has its methods attributed to the INCLUDING class's file
 * (postgresql_adapter.rb), so the gate name-matches them against
 * postgresql-adapter.ts. But trails ports those bodies into a sibling collaborator
 * (postgresql/schema-statements-class.ts) whose filename has no Rails counterpart,
 * so it is never itself paired; the adapter only keeps a one-line delegation. The
 * gate was therefore charging the wrapper with the whole mixin's Rails call set —
 * a pure attribution artifact, and the bulk of the +353 entries #5334's include
 * resolution added to the baseline.
 *
 * The extractor records call NAMES only, no body structure, so the wrapper shape
 * is inferred from the call-set: it contains the method's OWN name (the delegate
 * call) and is no larger than DELEGATION_MAX_CALLS. A self-recursive body can
 * also match, which is harmless — unioning its own calls into its own call-set
 * is a no-op.
 */
export function isDelegatingWrapper(tsName: string, tsCalls: Set<string>): boolean {
  return tsCalls.has(tsName) && tsCalls.size <= DELEGATION_MAX_CALLS;
}

/**
 * How many hops of same-file helper extraction the TS call-set follows
 * (`indexes` → `buildIndexRows` → `indexRowToDefinition`). Three covers the
 * extraction depth ports actually use — a body, the helper it factors out, and
 * that helper's own leaf helper — without letting a whole file's call graph
 * collapse into one call-set, which would silence real omissions in large files.
 *
 * It counts hops of RESOLVABLE same-file names, so the call-set reaches one
 * level further than the name count suggests: the third helper's own calls are
 * unioned in (they are its call-set), they are just not walked through. Depth 3
 * therefore admits `indexRowToDefinition`'s `columnNamesFromColumnNumbers`, and
 * stops before that leaf's callees.
 *
 * Three is deliberate, not the largest defensible value. Sweeping this constant
 * over the whole artifact (RFC 0083) shows the closure saturating at depth
 * 8: 3693 rows at 0, 3332 at 1, 3276 at 2, 3251 at 3, 3243 at 4, 3236 at 5 and
 * 6, 3230 at 8, and 12 and 40 identical to 8. The mean effective call-set per
 * body saturates on the same schedule — 2.35 (depth 0) → 6.77 (depth 3) → 9.00
 * (depth 8) → 9.05 (depth 12 = depth 40). Absolute row counts drift with the
 * ported surface; the fixed point does not.
 *
 * Moving 3 → 8 was evaluated and REJECTED. It is sound in the way the
 * DELEGATION_MAX_CALLS cap is not — the closure never leaves the file, so it
 * cannot credit a sibling adapter with a delegate's work — but it silences
 * about 15 keys (~0.5%) and adds none, and most of those are omissions worth
 * keeping: `relation.ts`'s `to_sql` and `exec_main_query` missing
 * `apply_join_dependency`, its `update_all` / `delete_all` / `ids` missing
 * `arel_columns`, its `exec_queries` missing `preload_associations`, plus
 * `migration.ts#migrate` missing `with_connection`. Those sit in files large
 * enough (`relation.ts` alone carries ~420 rows) that a helper several hops
 * away discharging the call is precisely the case the cap exists to catch.
 * Depth 3 is where extraction-shaped false positives are already gone but a
 * body is still held to the calls it makes.
 */
export const SAME_FILE_CLOSURE_DEPTH = 3;

/**
 * Call names the extractor synthesizes from a syntactic form instead of reading
 * them off a named callee, so a same-file member carrying the name is NOT what
 * the body called and must not be walked into.
 *
 * `new Requested({...})` records the call as `constructor` — the name every
 * class in the file declares, whichever class was constructed. Resolving it in
 * the same-file closure unions an unrelated constructor's call-set (and, three
 * hops out, everything that constructor reaches) into this body's effective
 * calls, so editing that constructor changes THIS body's `missing` set with its
 * own body byte-identical: `lookup_context.rb`'s `detail_args_for_any` stopped
 * flagging `details_cache_key` because `LookupContext`'s constructor was edited
 * to reach `detailsKey` (RFC 0025
 * `extractor-missing-set-perturbed-by-unrelated-edits`).
 *
 * `length` used to be listed here for the same reason from the other end — an
 * `xs.length` read bridged 29 relation.ts bodies into `Relation#length` and, three
 * hops on, into `toArray`'s `withConnection` (`relation/delegation.rb:101`; RFC
 * 0107). It is gone because the FOREIGN_READ_PREFIX marker now covers it and
 * every other read off a non-`this` receiver, by receiver rather than by name:
 * removing the entry moves no row in the whole artifact, and keeping it would
 * silence a genuine call to a same-file helper that happens to be spelled
 * `length`.
 */
const SYNTHETIC_CALL_NAMES: ReadonlySet<string> = new Set(["constructor"]);

/**
 * The same-file methods a TS body reaches transitively, up to `depth` hops.
 *
 * `sameFileCalls` resolves a method name to its call-set ONLY when that method
 * is defined in the same TS file as the body under comparison — that scoping is
 * what makes the closure sound (unlike the package-wide `delegateCalls` map,
 * which an unrelated same-named method can satisfy). `tsName` seeds the visited
 * set, so self-recursion and longer cycles terminate. Names in
 * SYNTHETIC_CALL_NAMES are never resolved or expanded.
 *
 * Neither are the names a body recorded ONLY off another object
 * (FOREIGN_READ_PREFIX) — read or invoked: `details.locale` and
 * `details.digest(x)` name members of `details`, not the same-file methods
 * `locale` / `digest`, so resolving one would union an unrelated
 * method's call-set — and everything it reaches — into a body that never
 * called it, making this body's `missing` set move when that method is edited
 * (RFC 0108; the constructor half of the same receiver-blindness is
 * SYNTHETIC_CALL_NAMES). `foreignReads` answers that population per OWNER —
 * the body itself is `tsName` — because a name foreign to this body may well
 * be a genuine `this.` call in the helper one hop out.
 */
export function reachedSameFileMethods(
  tsName: string,
  tsCalls: Iterable<string>,
  sameFileCalls: (name: string) => Iterable<string> | undefined,
  depth = SAME_FILE_CLOSURE_DEPTH,
  foreignReads: (owner: string) => Iterable<string> | undefined = () => undefined,
): Set<string> {
  const reached = new Set<string>();
  const visited = new Set<string>([tsName]);
  const foreignOf = new Map<string, Set<string>>();
  const foreign = (owner: string): Set<string> => {
    let set = foreignOf.get(owner);
    if (set === undefined) {
      set = new Set(foreignReads(owner) ?? []);
      foreignOf.set(owner, set);
    }
    return set;
  };
  let frontier: Array<[name: string, owner: string]> = [...tsCalls].map((n) => [n, tsName]);
  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const next: Array<[string, string]> = [];
    for (const [name, owner] of frontier) {
      if (SYNTHETIC_CALL_NAMES.has(name)) continue;
      if (foreign(owner).has(name)) continue;
      if (visited.has(name)) continue;
      visited.add(name);
      const calls = sameFileCalls(name);
      if (calls === undefined) continue; // not defined in this file
      reached.add(name);
      for (const c of calls) next.push([c, name]);
    }
    frontier = next;
  }
  return reached;
}

/**
 * The call-set `checkCalls` should actually hold a matched TS body to: its own,
 * plus the calls of every same-file helper it reaches (see
 * reachedSameFileMethods) — extracting a helper moves calls out of the body but
 * not out of the port, and charging the body for them is the most common false
 * positive the gate produces.
 *
 * On top of that, a delegating wrapper (see isDelegatingWrapper) also gets the
 * same-named DELEGATE's calls unioned in so the port gets compared instead of
 * the forwarder.
 *
 * The closure is name-based, not purpose-based: it holds a body to "some helper
 * I reach also calls X", so a helper that calls X for an UNRELATED reason
 * discharges the flag. That is the same imprecision `delegateCalls` carries,
 * at a smaller radius — bounded to one file and to calls the body actually
 * makes, which is what makes it worth trading for the extraction false
 * positives. The cost lands on rows a human had already investigated, so a
 * reseed prints every hand-reviewed row it drops (see droppedReviewed) instead
 * of letting one vanish into a 400-row diff.
 *
 * `delegateCalls` resolves a method name to every call made by that name anywhere
 * in the package (and its deps) — deliberately coarser than the per-(file, name)
 * scoping the primary population uses, so an unrelated same-named method can
 * satisfy a call. That imprecision is confined to bodies that
 * `isDelegatingWrapper` has already established contain no ported logic to hold to
 * account; the alternative is baselining a whole mixin's Rails call set against a
 * one-line `return`. It is transparency, not suppression: when the delegate ALSO
 * omits the Ruby call, the flag survives.
 */
export function effectiveTsCalls(
  tsName: string,
  tsCalls: Set<string>,
  delegateCalls: (name: string) => Iterable<string> | undefined,
  sameFileCalls: (name: string) => Iterable<string> | undefined = () => undefined,
  // Pass the closure in when the caller already computed it (checkCalls also
  // needs the reached names to union their NEGATED calls) — walking it twice
  // per matched pair is pure waste.
  reached: Set<string> = reachedSameFileMethods(tsName, tsCalls, sameFileCalls),
): Set<string> {
  const wrapper = isDelegatingWrapper(tsName, tsCalls);
  if (reached.size === 0 && !wrapper) return tsCalls;
  const merged = new Set(tsCalls);
  for (const name of reached) for (const c of sameFileCalls(name) ?? []) merged.add(c);
  if (wrapper) for (const c of delegateCalls(tsName) ?? []) merged.add(c);
  return merged;
}

const DETAIL_PACKAGES = new Set([
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
  "abstractcontroller",
  "actionpackversion",
  "actionview",
]);

// Files intentionally excluded from comparison live in unported-files/.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MethodResult {
  rubyName: string;
  tsName: string;
  rubyModule: string;
}

interface MoveResult {
  tsName: string;
  rubyName: string;
  rubyModule: string;
  expectedFile: string;
  actualFile: string;
}

interface FileResult {
  rubyFile: string;
  expectedTsFile: string;
  tsFileExists: boolean;
  /**
   * If set, the expected TS file does not exist but methods cluster at
   * this sibling path (cross-file misplacement detection). Reported with
   * a `↦` marker and counted in the package's `misplacedFiles` tally.
   */
  misplacedAt?: string;
  matched: number;
  missing: number;
  total: number;
  missingMethods: MethodResult[];
  /**
   * The subset of `missingMethods` whose TS name IS declared in this file, but
   * only as a bodyless signature — see `declarationOnlyInFile`.
   */
  declarationOnly: MethodResult[];
  moves: MoveResult[];
}

interface PackageResult {
  package: string;
  totalMethods: number;
  matched: number;
  missing: number;
  percent: number;
  totalFiles: number;
  filesExist: number;
  misplacedFiles: number;
  excludedFiles: string[];
  files: FileResult[];
  inheritance: InheritanceResult;
  /** Inheritance edges the walk followed to NOTHING — see `output/ambiguous-parents.json`. */
  ambiguousParents: number;
  arity: ArityResult;
  paramNames: ParamNameResult;
  optionKeys: OptionKeyResult;
  literals: LiteralResult;
  calls: CallResult;
  callArgs: CallArgsResult;
  bodyHashes: BodyHashRecord[];
}

// Source-hash pinning (RFC 0025): the current normalized Ruby body digest for
// one name-matched (Ruby, TS) pair. Keyed by (package, rubyFile, rubyName) —
// the same identity the pin manifest (body-pins.json) uses. Written to
// output/body-hashes.json; lint-body-pins.ts diffs the committed pins against
// it to report upstream body drift. Advisory — never affects the parity %.
interface BodyHashRecord {
  rubyFile: string;
  rubyName: string;
  tsFile: string;
  tsName: string;
  digest: string;
}

interface CallResult {
  compared: number;
  mismatched: number;
  mismatches: CallMismatch[];
  staleTags: StaleCallTag[];
  suppressed: SuppressedCall[];
  skeletons: CallSkeleton[];
}

/**
 * The ordered control + call skeleton of one name-matched (Ruby, TS) pair, both
 * sides run through {@link foldSkeletonTokens} and otherwise UNCOLLAPSED — no
 * `effectiveTsCalls` delegation union, no
 * `includeGraphCalls` merge, no dedup. Those are set operations by
 * construction, and a sequence needs its own merge rule; RFC 0113 decided it
 * (`report-arms.ts:ArmVerdict`, which carries why the two rejected options
 * were rejected): project each stream onto its CONTROL tokens — if / loop /
 * try / throw — take the multiset difference for a `count` verdict, and let
 * the projection's order decide only when the multisets agree. Both unions
 * above stay out of this artifact deliberately: the rule reads the reaches only
 * to discard them, so carrying the body's own stream and nothing else remains
 * the honest shape. Recorded for every compared pair, not just the flagged
 * ones: this is the population the arms report reads, not a mismatch list.
 * Signal only (RFC 0084) — written to its own output/call-skeletons.json, so
 * call-mismatches.json and its ratchet read exactly what they read before, and
 * nothing gates on it yet.
 */
export interface CallSkeleton {
  rubyFile: string;
  rubyName: string;
  tsFile: string;
  tsName: string;
  ruby: string[];
  ts: string[];
}

/** A flag a `@missingRailsCall` tag suppressed. Reported in the artifact
 *  because the mismatch list no longer carries it and `parity:api:build` reconciles
 *  tags against that list: without this, the next parity:api:build run would read the
 *  call as satisfied, drop the tag it just honoured, and hand the flag straight
 *  back to the ratchet. */
export interface SuppressedCall {
  tsFile: string;
  rubyName: string;
  tsName: string;
  /** See `CallMismatch.tsClass`. */
  tsClass?: string;
  /** See `CallMismatch.tsDeclFile`. */
  tsDeclFile?: string;
  call: string;
  /** The tag's reason, carried so the report can group the receipts by the
   *  permanence claim it opens with (RFC 0099). `""` when the artifact the
   *  entry was read from predates the reasons. */
  reason?: string;
}

/** The separator {@link callTagKey} joins on, shared with the readers that take
 *  a key apart — a character no TS file path, class or method name contains. */
const TAG_KEY_SEP = "\u0000";

/** Identity of the declaration a `@missingRailsCall` tag is written on. Keyed
 *  by (tsFile, tsClass, tsName), so a tag justifies the deviation for exactly
 *  the method that carries it — never for a same-named method in another file,
 *  and never for a sibling class's method in the SAME file (`NullPool#checkout`
 *  next to `ConnectionPool#checkout`). `tsClass` is `""` for a top-level
 *  function and `"*"` when the owning class could not be resolved. */
export function callTagKey(tsFile: string, tsClass: string, tsName: string): string {
  return [tsFile, tsClass, tsName].join(TAG_KEY_SEP);
}

/**
 * The TS class that owns `tsName` in the file a pair matched, given every
 * class in that file declaring the name and the Ruby entity the pair came
 * from. One declaration needs no disambiguation; several are resolved in the
 * steps below, each of which must name exactly ONE owner or fall through — an
 * unresolved (`undefined`) result records nothing rather than pairing wrongly
 * (see ambiguousTsOwner):
 *
 *  1. the Ruby class's own short name
 *     (`ActiveRecord::ConnectionAdapters::NullPool` → `NullPool`), which the
 *     naming rules make the TS class name too;
 *  2. the include graph: Ruby flattens a mixin's methods onto the INCLUDING
 *     class, so the Ruby module never names the TS owner — `FinderMethods#first`
 *     lands in relation.ts, whose `Relation` records `extends: ["FinderMethods"]`
 *     and whose sibling `ExplainProxy` does not (`hosts`, see includeGraphHosts);
 *  3. the SEAT (`OwnerSeat`), for the file that ports both halves of one name:
 *     persistence.ts spells `Persistence::ClassMethods#_update_record`
 *     (persistence.rb:687-692) as the free export and the instance half
 *     (`:900-916`) as `InstanceMethods`, so the class seat is the one owner
 *     that is not the instance seat.
 *
 * Step 3 runs only where the RUBY file poses a seat question — the same name on
 * both the singleton and the instance half. Where every Ruby owner sits on one
 * seat the several TS declarations are not the two halves of anything, and
 * picking one by seat is the mispairing this resolution exists to avoid:
 * time-ext.ts's single `toTime` body answers `Time#to_time`, `Date#to_time` and
 * `DateTime#to_time` alike (RFC 0108).
 *
 *  0. reader vs WRITER. Ruby's `name` / `name=` pair both translate to the TS
 *     name `name` (conventions.ts), spelled as a plain member for the reader
 *     and a `set name` accessor for the writer, so a file holding both declares
 *     the name on two owners. Pairing by name alone let the class's `set`
 *     accessor answer for the Ruby READER — `mime_negotiation.rb:85`'s
 *     `set_header k, v` held to `set formats`'s
 *     `set_header "action_dispatch.request.formats", …` (`:137`), and the
 *     `variant` reader's argument-less `ArrayInquirer.new` (`:100`) held to the
 *     error `variant=` raises (`:96`). Keep only the owners whose writer-ness
 *     matches the Ruby method's, so a writer pairs with the `set` accessor and
 *     a reader never does (RFC 0108). Runs first: the Ruby class's own short
 *     name (step 1) names the class the accessor sits on either way.
 *
 *  4. one BODY declared twice. The trails mixin convention (CLAUDE.md "Module
 *     mixins") exports a top-level function and re-exports the very same
 *     function through a grouping object — `export function toTime()` beside
 *     `export const TimeExt = { toTime }` — so the file's owners are `""` and
 *     `TimeExt` for one body. Where every owner declaring the name records the
 *     SAME call-set the comparison is identical whichever is picked, so pick
 *     one (`callSetOf`; the sorted first, which is the free export). Owners
 *     whose call-sets differ are two bodies and stay unresolved. Equality of
 *     the recorded sets is the whole test, so two genuinely different bodies
 *     recording the same set (both empty, say) also resolve — harmless while
 *     the resolved owner only gates `ambiguousTsOwner` / `ownerRecordsNothing`
 *     and the comparison itself unions the file's declarations (checkCalls),
 *     but a reader that consumed the owner's OWN set would need more here.
 */
export function resolveTsOwner(
  owners: ReadonlySet<string> | undefined,
  rubyModule: string,
  {
    hosts,
    seatOf,
    rubySeat,
    rubySeats = new Set(),
    callSetOf,
    writerOf,
    rubyIsWriter,
  }: TsOwnerResolution = {},
): string | undefined {
  if (!owners || owners.size === 0) return undefined;
  if (owners.size === 1) return [...owners][0];
  if (writerOf && rubyIsWriter !== undefined) {
    const kept = [...owners].filter((o) => writerOf(o) === rubyIsWriter);
    if (kept.length > 0 && kept.length < owners.size) {
      if (kept.length === 1) return kept[0];
      owners = new Set(kept);
    }
  }
  const short = rubyModule.split("::").at(-1) ?? rubyModule;
  if (owners.has(short)) return short;
  if (hosts) {
    const via = [...owners].filter((o) => hosts.has(o));
    if (via.length === 1) return via[0];
  }
  if (seatOf && rubySeats.size > 1) {
    const exact = [...owners].filter((o) => seatOf(o) === rubySeat);
    if (exact.length === 1) return exact[0];
    const compatible = [...owners].filter((o) => (seatOf(o) ?? rubySeat) === rubySeat);
    if (compatible.length === 1) return compatible[0];
  }
  if (callSetOf) {
    const sorted = [...owners].sort();
    const keys = sorted.map((o) => {
      const sets = callSetOf(o);
      return sets === undefined ? undefined : JSON.stringify(sets);
    });
    if (keys[0] !== undefined && keys.every((k) => k === keys[0])) return sorted[0];
  }
  return undefined;
}

/**
 * Which half of its host a member sits on: Ruby's singleton/instance split,
 * which TS spells as `static` vs prototype and Rails spells as an `X::ClassMethods`
 * module beside the bare `X` (`persistence.rb:687-692` vs `:900-916`).
 */
export type OwnerSeat = "class" | "instance";

/** What `resolveTsOwner` needs to pick one of a file's several declarations of
 *  a name: the include-graph hosts of the Ruby module (see includeGraphHosts),
 *  the seat each TS owner declares the name on, and the seat the Ruby method
 *  itself sits on. All optional — absent, the resolution is name-only, as it
 *  was before RFC 0108. */
export interface TsOwnerResolution {
  hosts?: ReadonlySet<string>;
  seatOf?: (tsOwner: string) => OwnerSeat | undefined;
  rubySeat?: OwnerSeat;
  /** The seats of EVERY Ruby owner declaring the name in this Ruby file. The
   *  seat arm runs only when they differ — see resolveTsOwner. */
  rubySeats?: ReadonlySet<OwnerSeat>;
  /** The call-sets the file records for each TS owner declaring the name, for
   *  the one-body-two-declarations arm — see resolveTsOwner step 4. */
  callSetOf?: (tsOwner: string) => readonly string[][] | undefined;
  /** Whether each TS owner declares the name as a `set` accessor — the port's
   *  spelling of Ruby's `name=` writer. See resolveTsOwner step 0. */
  writerOf?: (tsOwner: string) => boolean;
  /** Whether the Ruby method under comparison is the `name=` writer rather than
   *  the same-named reader. Absent leaves the writer arm off. */
  rubyIsWriter?: boolean;
}

/** The seat a Ruby owner FQN states, if any: `ActiveRecord::Persistence::ClassMethods`
 *  is the singleton half of `ActiveRecord::Persistence`. A method the extractor
 *  bucketed as a class method (`def self.foo`) is the class seat wherever it
 *  lives, which is what `klass` carries. */
export function rubyOwnerSeat(rubyModule: string, klass: boolean): OwnerSeat {
  if (klass) return "class";
  return (rubyModule.split("::").at(-1) ?? rubyModule) === "ClassMethods" ? "class" : "instance";
}

/**
 * The seat a TS owner declares `tsName` on. The trails grouping names come
 * first: an object literal named `ClassMethods` / `InstanceMethods` holds the
 * halves that could not both be free exports (persistence.ts), and its members
 * are prototype members of the grouping either way, so `isStatic` would read
 * every one of them as the instance seat.
 *
 * `undefined` for a top-level function (`""`), which is neither — the port
 * spells both a `ClassMethods` body and an instance mixin body that way.
 */
export function tsOwnerSeat(
  tsOwner: string,
  staticOwners: ReadonlySet<string> | undefined,
  instanceOwners: ReadonlySet<string> | undefined,
): OwnerSeat | undefined {
  if (tsOwner === "ClassMethods") return "class";
  if (tsOwner === "InstanceMethods") return "instance";
  const isStatic = staticOwners?.has(tsOwner) ?? false;
  const isInstance = instanceOwners?.has(tsOwner) ?? false;
  if (isStatic === isInstance) return undefined;
  return isStatic ? "class" : "instance";
}

/**
 * True when a file declares `tsName` on several owners and the one this pair
 * resolved to has no body to compare AND some same-named sibling might wrongly
 * stand in for it.
 *
 * The extractor records a call set for every member that HAS a body, empty
 * bodies included (`extractCalls` returns `undefined` only for a missing body
 * node — an interface member, an ambient `declare`, an abstract signature). So
 * a missing entry means "this owner is a bodyless DECLARATION", never "this
 * owner's body makes no calls".
 *
 * A bodyless declaration beside the body is the settled trails mixin shape
 * (CLAUDE.md "Module mixins"): `export function forgetAttributeAssignments()`
 * at top level, re-declared on `interface Dirty` so the host types it. The
 * guard's original reading — "the resolved owner records nothing, so compare
 * nothing" — dropped every such pair, 68 of them measured across the compared
 * packages (`activemodel dirty.ts forget_attribute_assignments`,
 * `activerecord relation.ts exec_explain`, `activesupport callbacks.ts
 * run_callbacks`, …). None was visible to either call gate and none was
 * represented by a baseline row.
 *
 * `MethodInfo.bodyless` is that marker, and `resolveTsOwner`'s retry over
 * {@link ownersWithBodies} already prefers a bodied owner where one resolves —
 * but only when the full population came out ambiguous, so a pair that resolves
 * cleanly TO the declaration still lands here. The relaxation is therefore
 * exactly the shape left over: the resolved owner is bodyless AND the file's
 * single recorded body is the TOP-LEVEL function (owner `""`).
 *
 * Both halves are load-bearing. Without the marker the test would relax for an
 * owner that has a body the maps merely failed to key. And a single body is not
 * enough on its own: `relation.ts` declares `first` on the `Relation` interface
 * that types its mixins (body in `relation/finder-methods.ts`) and on
 * `ExplainProxy`, whose one-line body is the file's only one — pairing
 * `FinderMethods#first` with it reports `find_nth` / `find_nth_with_limit`
 * missing, the exact mispairing this guard exists to prevent. A CLASS body is a
 * sibling that can stand in wrongly; the top-level function is not any class's
 * own copy but the one body every declaration in the file re-declares
 * (RFC 0126).
 */
export function ownerRecordsNothing(
  byFileNameOwner: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, unknown[]>>>,
  tsFile: string,
  tsName: string,
  tsClass: string | undefined,
  owners: ReadonlySet<string> | undefined,
  bodylessOwners: ReadonlySet<string> | undefined = undefined,
): boolean {
  if (tsClass === undefined || (owners?.size ?? 0) <= 1) return false;
  const byOwner = byFileNameOwner.get(tsFile)?.get(tsName);
  if (byOwner?.get(tsClass) !== undefined) return false;
  return !(bodylessOwners?.has(tsClass) === true && byOwner?.size === 1 && byOwner.has(""));
}

/**
 * The owners of `tsName` a matched pair may be held to: the ones whose
 * declaration has a BODY, wherever the file declares at least one.
 *
 * The extractor records a member for every exported interface, type alias and
 * object-literal const, so a Rails-matched file that also exports its host type
 * (`export interface AttributeMethodHost { attributeMethodPatternsCache(): … }`)
 * declares the name twice: once on the type, once as the real
 * `export function`. A declaration carries no `calls` / `callArgs`, so the
 * second owner made the pairing ambiguous and the call gates recorded NOTHING —
 * every baselined row for the method then read as STALE, and deleting it (the
 * one sanctioned remedy) retired a live divergence nobody fixed. Whether a type
 * is exported is not a fact about the port's fidelity, so the bodyless
 * declarations drop out and the body answers (RFC 0126).
 *
 * Consulted only by `resolveOwner`, and only as a SECOND pass after the full
 * population came back ambiguous: preferring a body up front answers questions
 * the full population already answers correctly, which is how
 * `FinderMethods#first` came to be held to `ExplainProxy#first`.
 *
 * All-bodyless is left alone: there is no body to prefer, and the population is
 * the same one the resolution saw before. An owner NAME that declares the same
 * method both ways — `class Relation` and the `interface Relation` that types
 * its mixins — has a body and stays.
 */
/**
 * Is `name`'s ONLY declaration in `tsFile` a bodyless one (RFC 0126)?
 *
 * `parity:api` credits a Ruby method against a TS name wherever that name is
 * declared, and an `interface`/`type` signature is a declaration. So
 * `packages/arel/src/crud.ts` — four bare signatures mirroring `crud.rb`'s four
 * module bodies — scored 4/4, and a Rails developer opening the two files side
 * by side found nothing to compare. A signature is a shape claim, not a port,
 * so it earns no matched credit.
 *
 * The settled trails mixin shapes are unaffected: an `Included<>` interface and
 * the `this`-typed functions it types live in the SAME file, so the name has a
 * bodied declaration there and this returns false. Only a file whose whole
 * declaration of the name is a signature — the body inlined onto some other
 * class — comes back true.
 */
/**
 * How the misplaced-file cluster answers for a Ruby method (RFC 0126).
 *
 * The cross-file fallback credits a method to the sibling file its Ruby file's
 * members cluster at when the conventional path does not exist. That credit has
 * to make the same body/signature distinction the expected file's direct-match
 * arm makes, or a cluster whose only declaration of the name is a bodyless
 * signature scores as a port — the very hole {@link declarationOnlyInFile}
 * closes on the conventional path.
 *
 * `"declaration-only"` is returned only when the cluster DOES declare a
 * candidate and every one of them is bodyless; a cluster that declares none is
 * `"absent"`, an ordinary miss.
 */
export type MisplacedClusterVerdict =
  | { kind: "match"; tsName: string }
  | { kind: "declaration-only"; tsName: string }
  | { kind: "absent" };

export function misplacedClusterVerdict(
  tsCandidates: readonly string[],
  actualMethods: ReadonlySet<string>,
  misplacedFile: string,
  bodylessOwnersByFile: ReadonlyMap<string, Map<string, Set<string>>>,
  bodiedOwnersByFile: ReadonlyMap<string, Map<string, Set<string>>>,
): MisplacedClusterVerdict {
  const inCluster = tsCandidates.filter((c) => actualMethods.has(c));
  if (inCluster.length === 0) return { kind: "absent" };
  const tsName = inCluster.find(
    (c) => !declarationOnlyInFile(misplacedFile, c, bodylessOwnersByFile, bodiedOwnersByFile),
  );
  return tsName === undefined
    ? { kind: "declaration-only", tsName: inCluster[0] }
    : { kind: "match", tsName };
}

/**
 * Is the only declaration of `name` in `tsFile` a bodyless one?
 *
 * `rubyNotes` and `aliasNamesByFile` are the alias arm: Ruby's
 * `alias :build_having_clause :build_where_clause`
 * (`relation/query_methods.rb:1654`) synthesizes an entry with no body of its
 * own, and TS spells it as a second binding to the same function
 * (`buildHavingClause: buildWhereClause`). The bodyless marker exists to stop a
 * real declaration from silently retiring its method's call-parity rows; an
 * alias entry has no calls to retire, so the faithful alias IS the port. See
 * `MethodInfo.aliasOf`.
 */
export function declarationOnlyInFile(
  tsFile: string,
  name: string,
  bodylessOwnersByFile: ReadonlyMap<string, Map<string, Set<string>>>,
  bodiedOwnersByFile: ReadonlyMap<string, Map<string, Set<string>>>,
  rubyNotes?: string,
  aliasNamesByFile?: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (bodylessOwnersByFile.get(tsFile)?.has(name) !== true) return false;
  if (rubyNotes === "alias" && aliasNamesByFile?.get(tsFile)?.has(name) === true) return false;
  return bodiedOwnersByFile.get(tsFile)?.has(name) !== true;
}

export function ownersWithBodies(
  owners: ReadonlySet<string> | undefined,
  bodylessOwners: ReadonlySet<string> | undefined,
  bodiedOwners: ReadonlySet<string> | undefined = undefined,
): ReadonlySet<string> | undefined {
  if (owners === undefined || bodylessOwners === undefined) return owners;
  const withBody = [...owners].filter(
    (o) => !bodylessOwners.has(o) || (bodiedOwners?.has(o) ?? false),
  );
  if (withBody.length === 0 || withBody.length === owners.size) return owners;
  return new Set(withBody);
}

/**
 * The file a matched member is DECLARED in, when that is not the file the pair
 * matched under.
 *
 * `extract-ts-api.ts` attributes a class to the file that exports it, so
 * `cache.rb`'s `Store` — which trails splits into `cache/store.ts` — is
 * harvested as the entity `cache.ts:Store` while every member keeps its own
 * declaring path. compare.ts matches, and the baseline keys, on `cache.ts`;
 * `parity:api:build` has to open `cache/store.ts` to write the tag, so the
 * artifact carries the declaring path (RFC 0106).
 *
 * With no resolved owner, every owner in the file must agree — two classes
 * declaring the name in different files say nothing about which one this pair
 * is, exactly as `ambiguousTsOwner` treats the call sets.
 */
export function declFileFor(
  byFileNameOwner: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, string>>>,
  tsFile: string,
  tsName: string,
  tsClass: string | undefined,
): string | undefined {
  const byOwner = byFileNameOwner.get(tsFile)?.get(tsName);
  if (byOwner === undefined) return undefined;
  if (tsClass !== undefined) return byOwner.get(tsClass);
  const files = new Set(byOwner.values());
  return files.size === 1 ? [...files][0] : undefined;
}

/**
 * The ONE TS call-site list `checkCallArgs` compares a Ruby body against, or
 * `undefined` when the file gives no unambiguous answer.
 *
 * The whole-file map holds one entry per DECLARATION, so the trails mixin
 * convention (CLAUDE.md "Module mixins") — `export function toTime()` beside
 * `export const TimeExt = { toTime }`, one body declared twice — always records
 * two entries and used to be dropped by a bare `length !== 1` guard, before the
 * resolved owner was ever consulted (RFC 0108). Prefer the owner-scoped list
 * under the resolved owner: a single body re-exported through a grouping object
 * records the same sites under each owner, so either is the body's own.
 *
 * Unresolved owner, or an owner declaring the name more than once, is the
 * guard's original case and still records nothing.
 */
export function ownerCallArgSites<T>(
  byFileNameOwner: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, readonly T[][]>>>,
  byFileName: ReadonlyMap<string, ReadonlyMap<string, readonly T[][]>>,
  tsFile: string,
  tsName: string,
  tsClass: string | undefined,
): readonly T[] | undefined {
  if (tsClass !== undefined) {
    const owned = byFileNameOwner.get(tsFile)?.get(tsName)?.get(tsClass);
    if (owned !== undefined) return owned.length === 1 ? owned[0] : undefined;
  }
  const sites = byFileName.get(tsFile)?.get(tsName);
  return sites?.length === 1 ? sites[0] : undefined;
}

/**
 * True when the TS file declares `tsName` on SEVERAL owners and
 * `resolveTsOwner` could not say which one this Ruby entity ported to.
 *
 * `ownerRecordsNothing` only covers the resolved case; unresolved, the call
 * gates fell back to the whole-FILE union and compared a Ruby body against
 * whichever same-named member happened to carry calls. `relation.rb`'s
 * `ExplainProxy#first` / `#last` (`:24-30`) are one-line
 * `exec_explain { @relation.first(limit) }` sitting in relation.ts next to the
 * `Relation` overloads of the same names, so `FinderMethods#first`
 * (`relation/finder_methods.rb:100-108`) was held to the proxy's body and
 * reported `find_nth` / `find_nth_with_limit` / `find_last` / `limit` missing.
 * Record nothing instead — the same answer `ownerRecordsNothing` gives.
 */
export function ambiguousTsOwner(
  owners: ReadonlySet<string> | undefined,
  tsClass: string | undefined,
): boolean {
  return tsClass === undefined && (owners?.size ?? 0) > 1;
}

/**
 * True when SEVERAL Ruby owners in one file declare `rubyName` but the TS file
 * ports it as a single member, so nothing says which Ruby method that member
 * is.
 *
 * `persistence.rb` defines `_update_record` twice — `ClassMethods` (`:687-692`)
 * and the instance (`:900-916`) — and persistence.ts exports one
 * `_updateRecord` (the ClassMethods half; the instance half rides
 * `InstanceMethods` under a distinct implementation name). The gate paired the
 * Ruby INSTANCE body with the TS ClassMethods one, so making the instance body
 * call `attributesForUpdate` exactly as `persistence.rb:901` does could not
 * retire the row. Bidirectional too: a genuine omission in either body is
 * masked by the other.
 *
 * Resolved, and so NOT ambiguous, when exactly one of the Ruby owners sits on
 * the seat the single TS member is declared on (`RubyOwnerResolution`): it is
 * then that member's counterpart, and every other owner's counterpart is
 * elsewhere or nowhere, so this arm compares and the others record nothing.
 * Several owners sharing that seat says no more than the bare count did —
 * routing/mapper.rb declares `add_route` on `Base`, `Resources` and `Scoping`,
 * all instance (RFC 0108).
 */
export function ambiguousRubyOwner(
  rubyOwners: ReadonlySet<string> | undefined,
  tsOwners: ReadonlySet<string> | undefined,
  { rubySeat, tsSeat, rubyOwnersOnTsSeat }: RubyOwnerResolution = {},
): boolean {
  if ((rubyOwners?.size ?? 0) <= 1 || (tsOwners?.size ?? 0) > 1) return false;
  if (tsSeat !== undefined && rubyOwnersOnTsSeat === 1) return rubySeat !== tsSeat;
  return true;
}

/** The seat data `ambiguousRubyOwner` resolves a many-to-one pairing with: the
 *  seat of the Ruby method under comparison, the seat the single TS member is
 *  declared on, and how many of the file's Ruby owners of that name sit on it. */
export interface RubyOwnerResolution {
  rubySeat?: OwnerSeat;
  tsSeat?: OwnerSeat;
  rubyOwnersOnTsSeat?: number;
}

/** A Ruby `name=` writer, as opposed to an operator method that merely ends in
 *  `=` (`==`, `<=`, `!=`) — those port to a named method, never a `set` accessor. */
const RUBY_WRITER_NAME = /^[A-Za-z_]\w*=$/;

/**
 * True when a Ruby WRITER resolved to the TS READER's body.
 *
 * `rubyMethodToTs` offers `foo=` both the bare camel name and `setFoo`, bare
 * first (conventions.ts). The bare name is the READER, so when the port spells
 * the writer as the awaitable `setFoo()` — CLAUDE.md's sanctioned shape for a
 * writer whose Rails body blocks on I/O — but the file has no `setFoo` the
 * gate can see, the writer's Ruby call set is compared against the reader's
 * body and every call the writer makes reads as missing (`current_scope=` →
 * `currentScope`, losing `set_current_scope`). A reader body is not the
 * writer's counterpart at all, so record nothing.
 */
export function writerPairedWithReader(
  rubyName: string,
  tsName: string,
  siblingRubyNames: ReadonlySet<string>,
): boolean {
  if (!rubyName.endsWith("=")) return false;
  const base = rubyName.slice(0, -1);
  if (!siblingRubyNames.has(base)) return false;
  return (rubyMethodToTs(base) ?? []).includes(tsName);
}

/**
 * True when a Ruby PREDICATE resolved to the TS declaration that ports its
 * NON-predicate twin.
 *
 * `docs/ruby-ts-conventions.md` drops a predicate's trailing `?`, so `foo?` and
 * `foo` produce the same TS spelling. When Ruby has both, the bare camel name
 * is the TWIN's — `ActionController::Parameters#deep_merge?`
 * (`strong_parameters.rb:1027`) is the DeepMergeable hook asking whether a
 * value merges recursively, while `strong-parameters.ts:295`'s `deepMerge` is
 * the port of `ActiveSupport::DeepMergeable#deep_merge`
 * (`deep_mergeable.rb:29`). Scoring the predicate's signature against that
 * declaration reports its parameter as a rename (`otherHash` → `other`) with
 * nothing to converge: the predicate is simply unported, and renaming the
 * parameter would adopt the identifier of a method the body does not
 * implement. So the pair is not compared for parameter NAMES, the same way
 * {@link writerPairedWithReader} withholds a reader's body from a writer.
 */
export function predicatePairedWithBareTwin(
  rubyName: string,
  tsName: string,
  twinRubyNames: ReadonlySet<string>,
): boolean {
  if (!rubyName.endsWith("?")) return false;
  const base = rubyName.slice(0, -1);
  if (!twinRubyNames.has(base)) return false;
  return (rubyMethodToTs(base) ?? []).includes(tsName);
}

/**
 * Method names a Ruby file's entities inherit from `include`d modules that live
 * in ANOTHER gem.
 *
 * `flattenIncludedMethodInfos` resolves an `include` against `rubyPkg` alone,
 * so `Parameters`'s `include ActiveSupport::DeepMergeable`
 * (`strong_parameters.rb:161`) contributes nothing to actioncontroller's
 * expected surface — correctly, since that mixin is activesupport's to port.
 * But the names it contributes are still what decides whether a predicate's
 * bare camel spelling is free, so {@link predicatePairedWithBareTwin} needs
 * them. Names only, one level, fully-qualified include sites only: this answers
 * "is that spelling already some other Ruby method's" and nothing else, so it
 * never moves a matched/missing figure.
 */
export function crossPackageIncludedMethodNames(
  entities: readonly ClassInfo[],
  pkg: string,
  ruby: ApiManifest,
): Set<string> {
  const names = new Set<string>();
  for (const entity of entities) {
    for (const inc of [...(entity.includes ?? []), ...(entity.extends ?? [])]) {
      if (!inc.includes("::")) continue;
      for (const [otherPkg, otherRubyPkg] of Object.entries(ruby.packages)) {
        if (otherPkg === pkg) continue;
        const mod = otherRubyPkg.modules[inc] as unknown as ClassInfo | undefined;
        if (!mod) continue;
        for (const m of [...mod.instanceMethods, ...mod.classMethods]) names.add(m.name);
      }
    }
  }
  return names;
}

/** The tags that justify deviations for `owner`'s copy of a method. A resolved
 *  owner reads ONLY its own class's tags, so a tag on a sibling class cannot
 *  silence a flag raised against this one. With no owner resolved the tags of
 *  the file's single tagged class — or, ambiguously, their union — apply. */
export function tagsForOwner(
  byClass: ReadonlyMap<string, ReadonlyMap<string, string>> | undefined,
  owner: string | undefined,
): ReadonlyMap<string, string> | undefined {
  if (!byClass || byClass.size === 0) return undefined;
  if (owner !== undefined) return byClass.get(owner);
  if (byClass.size === 1) return [...byClass.values()][0];
  const union = new Map<string, string>();
  for (const calls of byClass.values()) for (const [c, reason] of calls) union.set(c, reason);
  return union;
}

/** Record one declaration's tagged calls (call → the reason that justified it,
 *  `""` for an artifact predating the reasons) under (file, name, owner). The
 *  two families are recorded identically, so they share one writer. */
export function recordTaggedCalls(
  byFileName: Map<string, Map<string, Map<string, Map<string, string>>>>,
  file: string,
  name: string,
  owner: string,
  calls: string[],
  reasons: Record<string, string> | undefined,
  scope: "package" | "dep" = "package",
): void {
  // Tags on a DEP package's members are never consulted here — only the
  // package under comparison has pairs — and the map is keyed by the relative
  // tsFile alone, so a dep tag on a same-basename file (every package ships a
  // `gem-version.ts`) would land under this package's file and read as stale.
  if (scope === "dep") return;
  const byName = byFileName.get(file) ?? new Map<string, Map<string, Map<string, string>>>();
  const byClass = byName.get(name) ?? new Map<string, Map<string, string>>();
  const tagged = byClass.get(owner) ?? new Map<string, string>();
  for (const c of calls) tagged.set(c, reasons?.[c] ?? "");
  byClass.set(owner, tagged);
  byName.set(name, byClass);
  byFileName.set(file, byName);
}

/** Drop the flagged calls a tag on this declaration justifies, recording each
 *  one in `used` (a suppression is what makes a tag non-stale). A tag for one
 *  call never silences another: `tags` is matched against each flag's own call
 *  name. */
export function suppressTaggedCalls(
  missing: string[],
  tags: ReadonlyMap<string, string> | ReadonlySet<string>,
  used: Set<string>,
): string[] {
  return missing.filter((m) => {
    const call = callOf(m);
    if (!tags.has(call)) return true;
    used.add(call);
    return false;
  });
}

/**
 * Apply one declaration's `@missingRailsCall` tags to EVERY flag its pair
 * raised — the dropped-call ones and the ORDER-only ones alike — returning what
 * survives plus the suppressions bought, each with the reason that justified it.
 *
 * The order flags used to be appended AFTER suppression ran, so a tag migrated
 * from an `order:` baseline row suppressed nothing: `parity:api:calls` reported
 * that one row's call twice at once, as a STALE tag (it never suppressed) and as
 * a NEW mismatch (the flag came back), and the row could not leave the baseline
 * (RFC 0106). An order-only divergence is a divergence like any other, so it
 * takes a receipt like any other.
 */
export function applyCallTags(
  flagged: readonly string[],
  tags: ReadonlyMap<string, string>,
  used: Set<string>,
): { kept: string[]; suppressed: { call: string; reason: string }[] } {
  const suppressed = flagged
    .filter((m) => tags.has(callOf(m)))
    .map((m) => ({ call: callOf(m), reason: tags.get(callOf(m)) ?? "" }));
  return { kept: suppressTaggedCalls([...flagged], tags, used), suppressed };
}

/** The union of every owner's suppressions for one (tsFile, tsName) — the set
 *  {@link staleCallTags} asks about a top-level function, whose tag is recorded
 *  under the `""` owner while the pair that suppressed with it may have
 *  resolved a real one. `undefined` when no owner consulted a tag there, which
 *  is what tells {@link staleCallTags} the declaration was never compared. */
export function usedForAnyOwner(
  used: Map<string, Set<string>>,
  tsFile: string,
  tsName: string,
): Set<string> | undefined {
  const union = new Set<string>();
  let seen = false;
  for (const [key, calls] of used) {
    const [file, , name] = key.split(TAG_KEY_SEP);
    if (file !== tsFile || name !== tsName) continue;
    seen = true;
    for (const c of calls) union.add(c);
  }
  return seen ? union : undefined;
}

/** Every tagged call on a COMPARED (tsFile, tsClass, tsName) that never
 *  suppressed a flag — the tag's stale half. Sorted for a deterministic
 *  artifact. A pair whose owning class stayed unresolved recorded its
 *  suppressions under the `"*"` class, so both keys are consulted.
 *
 *  A TOP-LEVEL function (`tsClass === ""`) needs every owner consulted, not
 *  just those two: one exported function can be the TS side of two pairs — the
 *  module-scoped Ruby method, whose owner resolves to the class the file
 *  mirrors (`Inflector.safe_constantize`), and an unowned one — and only the
 *  owned pair raises the flags the tag suppresses. Keying its staleness on the
 *  `""` set alone reports a tag that IS suppressing as stale while the
 *  artifact simultaneously lists the same call as suppressed. A real owner is
 *  still matched exactly, so a sibling class's tag never borrows another's
 *  suppression. */
export function staleCallTags(
  tagsByFileName: Map<string, Map<string, Map<string, Map<string, string>>>>,
  used: Map<string, Set<string>>,
  declFileByFileNameOwner: ReadonlyMap<
    string,
    ReadonlyMap<string, ReadonlyMap<string, string>>
  > = new Map(),
): StaleCallTag[] {
  const out: StaleCallTag[] = [];
  for (const [tsFile, byName] of tagsByFileName) {
    for (const [tsName, byClass] of byName) {
      for (const [tsClass, calls] of byClass) {
        const anyOwner = tsClass === "" ? usedForAnyOwner(used, tsFile, tsName) : undefined;
        const hit =
          anyOwner ??
          used.get(callTagKey(tsFile, tsClass, tsName)) ??
          used.get(callTagKey(tsFile, "*", tsName));
        if (hit === undefined) continue;
        const tsDeclFile = declFileFor(declFileByFileNameOwner, tsFile, tsName, tsClass);
        for (const call of calls.keys()) {
          if (!hit.has(call)) out.push({ tsFile, tsClass, tsDeclFile, tsName, call });
        }
      }
    }
  }
  return out.sort((a, b) =>
    `${a.tsFile} ${a.tsClass} ${a.tsName} ${a.call}` <
    `${b.tsFile} ${b.tsClass} ${b.tsName} ${b.call}`
      ? -1
      : 1,
  );
}

/** A `@missingRailsCall` tag (RFC 0083) on a COMPARED method whose call is no
 *  longer flagged — the tag's only-shrink half, mirroring the baseline dir's
 *  STALE entries: once the TS body makes the call, the justification must go.
 *  Tags on methods no pair matched are NOT reported: nothing compared them, so
 *  "no longer flagged" would be unknowable rather than true. */
export interface StaleCallTag {
  tsFile: string;
  /** The class that declares the tagged member (`""` for a top-level
   *  function) — the `callTagKey` identity the suppression side is keyed by.
   *  Without it two declarations of one name reachable from `tsFile` share a
   *  retirement key, so retiring a stale tag on one deletes the reviewed
   *  receipt on the other (RFC 0106). */
  tsClass: string;
  /** The file the declaration actually lives in, when trails split the Rails
   *  class into a subdirectory module and it differs from `tsFile`. See
   *  `CallMismatch.tsDeclFile`. */
  tsDeclFile?: string;
  tsName: string;
  call: string;
}

// Advisory signature comparison: for a name-matched (ruby, ts) pair whose
// positional-arg ranges don't overlap. Never affects the parity %.
interface ArityMismatch {
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  rubySig: string;
  tsSig: string;
  rubyRange: ArityRange;
  tsRange: ArityRange;
}

// Advisory parameter-NAME comparison: for a name-matched pair whose signatures
// line up positionally but whose parameters are spelled differently. One row per
// differing POSITION. Never affects the parity %.
interface ParamNameMismatch {
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  position: number;
  rubyParam: string;
  tsParam: string;
}

interface ParamNameResult {
  /** Pairs whose parameter names were actually compared (i.e. aligned). */
  compared: number;
  /** Pairs with at least one differing position. */
  mismatchedPairs: number;
  mismatches: ParamNameMismatch[];
}

interface ArityResult {
  /** Pairs whose arity was actually compared (skips excluded). */
  compared: number;
  /** Pairs dropped because the RUBY entry is a forwarding-macro placeholder
   *  (`delegate`/unresolved `alias`, see arity.ts `isForwardingRubyEntry`).
   *  Reported so the shrunken `compared` denominator is auditable rather than
   *  silently absorbing the skip. */
  forwardingSkipped: number;
  mismatched: number;
  /** Mismatching pairs suppressed by a reasoned arity-exclude.json entry. */
  excluded: number;
  mismatches: ArityMismatch[];
}

// Advisory option-key comparison: for a name-matched pair where Ruby consumed
// option symbols and TS exposed a checkable options type. Never affects parity.
interface OptionKeyMismatch {
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  missingInTs: string[];
  extraInTs: string[];
}

interface OptionKeyResult {
  compared: number;
  mismatched: number;
  mismatches: OptionKeyMismatch[];
}

// Advisory: a name-matched method's TS body omits calls Rails makes to other
// ported methods. `missing` entries read "ruby_call → tsCandidate|tsCandidate".
interface CallMismatch {
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  /** The class declaring `tsName` in `tsFile`, when the file's declarations of
   *  that name resolve to one (see `resolveTsOwner`). `parity:api:build` mints
   *  the tag on that declaration alone. */
  tsClass?: string;
  /** The file `tsName` is DECLARED in, when trails split it out of the file
   *  the Ruby path mirrors — `cache.rb`'s `Store` members live in
   *  `cache/store.ts` while the row stays keyed `cache.ts`. Absent when the
   *  declaration is in `tsFile` itself. See `declFileFor`. */
  tsDeclFile?: string;
  missing: string[];
  /** The Ruby body's `callReceivers` (RFC 0129) for the flagged calls alone —
   *  what the ruby-compat report (report-ruby-compat.ts) reads to tell which
   *  row a flagged `fetch` belongs to. */
  receivers?: Record<string, string[]>;
}

/**
 * Advisory (RFC 0095): one call site whose ARGUMENTS differ between the Ruby
 * body and the matched TS one. `parity:api:calls` compares the set of call NAMES, so a
 * port that calls `injectJoin` where Rails calls `inject_join` and reorders its
 * arguments reads as identical to it. `call` is the Ruby call name; `class`
 * splits the population the way RFC 0095's rollout gates it — `shape` (count,
 * order, literal values, kwarg keys) and the report-only `naming`.
 */
interface CallArgMismatch {
  rubyFile: string;
  tsFile: string;
  rubyName: string;
  tsName: string;
  call: string;
  class: CallArgClass;
  rubyArgs: string[];
  tsArgs: string[];
}

interface CallArgsResult {
  compared: number;
  mismatched: number;
  /** Sites the comparison could not reach, by reason (RFC 0095). The last three
   *  reasons are population the dimension is losing, so a normalization change
   *  that shrinks the comparable set is countable rather than silent. */
  skipped: Record<CallArgSkipReason, number>;
  mismatches: CallArgMismatch[];
  /** `@missingRailsArgs` tags on a COMPARED pair that suppressed nothing —
   *  the tag's only-shrink half, read by lint-call-args.ts. */
  staleTags: StaleCallTag[];
  /** The mismatches those tags DID suppress, each with its reason — the
   *  permanence report's population (RFC 0099). */
  suppressed: SuppressedCall[];
}

function emptySkipTally(): Record<CallArgSkipReason, number> {
  return Object.fromEntries(CALL_ARG_SKIP_REASONS.map((r) => [r, 0])) as Record<
    CallArgSkipReason,
    number
  >;
}

// Advisory: a default's or constant's literal value differs for a matched pair.
interface LiteralMismatch {
  rubyFile: string;
  tsFile: string;
  name: string;
  rubyValue: string;
  tsValue: string;
  kind: "default" | "constant";
}

interface LiteralResult {
  compared: number;
  skipped: number;
  mismatched: number;
  mismatches: LiteralMismatch[];
}

interface InheritanceMismatch {
  rubyFqn: string;
  rubyFile: string;
  tsFile: string;
  tsName: string;
  rubySuper: string | null;
  tsSuper: string | null;
  tsChain: string[];
  reason: "super-mismatch" | "ts-class-missing";
}

interface InheritanceResult {
  checked: number;
  matched: number;
  /** Mismatches suppressed by a reasoned inheritance-exclude.json entry, and
   *  dropped from `checked` — reported so the shrunken denominator is
   *  auditable rather than silently absorbing the deviation. */
  excluded: number;
  mismatches: InheritanceMismatch[];
}

// Ruby builtin types whose TS equivalent cannot meaningfully extend them
// (e.g. `class X < String`, `class X < Struct.new(...)`, `class X < Module`
// for Ruby metaprogramming primitives). Treat the TS side's choice of
// base class as always matching when Ruby uses one of these.
const RUBY_UNEXTENDABLE_BUILTINS = new Set([
  "String",
  "Struct",
  "Array",
  "Hash",
  "Numeric",
  "Integer",
  "Float",
  "Set",
  "Delegator",
  "SimpleDelegator",
  "Module",
]);

// Ruby builtin exception classes → TS `Error` is the accepted equivalent.
const RUBY_ERROR_BUILTINS = new Set([
  "StandardError",
  "RuntimeError",
  "Exception",
  "ArgumentError",
  "TypeError",
  "NotImplementedError",
  "NameError",
  "NoMethodError",
  "IndexError",
  "KeyError",
  "RangeError",
  "IOError",
  "LoadError",
]);

function shortName(fqn: string | undefined | null): string | null {
  if (!fqn) return null;
  // Ruby uses `::` as the namespace separator; TS extractor stores the
  // raw superclass expression, so `extends globalThis.Error` ends up as
  // `globalThis.Error` — strip either separator to reach the leaf name.
  const parts = fqn.split(/::|\./);
  return parts[parts.length - 1] || null;
}

// Trails rename prefixes/suffixes used to disambiguate when a Rails class
// name would collide with a built-in, a TS keyword, or another identifier
// already in scope. Each entry lets `<ruby>` match `<prefix><ruby>` /
// `<ruby><suffix>` on the TS side so the inheritance check sees through the
// alias.
// - `Abstract<X>`: parent import-aliased so an adapter can shadow its name
//   (e.g. PG's `TableDefinition extends TableDefinition`).
// - `Base<X>`: TS-added intermediate base class (`BaseLogSubscriber`,
//   `BaseAbsenceValidator`) — Rails has a single class Trails splits in two.
// - `ActiveModel<X>`: ActiveRecord's `Type::Date` collides with the JS
//   `Date` constructor, so we import the ActiveModel type aliased.
// - `<X>Type` suffix: Trails suffixes attribute-type classes to avoid
//   clashing with the value they represent (e.g. `Json` value vs
//   `JsonType` the cast type).
export const TS_PARENT_ALIASES: { transform: (ruby: string) => string }[] = [
  { transform: (r) => `Abstract${r}` },
  { transform: (r) => `Base${r}` },
  { transform: (r) => `ActiveModel${r}` },
  { transform: (r) => `${r}Type` },
  // `Numeric<X>Type`: ActiveModel's `Helpers::Numeric` is mixed into
  // Integer/Float/Decimal via the `applyNumericMixin(ValueType)` HOC. The
  // returned class is bound to a local const `NumericValueType` that the
  // extractor sees as the immediate TS superclass; conceptually it is
  // `ValueType` with the Numeric helper applied.
  { transform: (r) => `Numeric${r}Type` },
];

export function nameMatches(rubyName: string, tsName: string): boolean {
  if (rubyName === tsName) return true;
  if (RUBY_ERROR_BUILTINS.has(rubyName) && tsName === "Error") return true;
  for (const { transform } of TS_PARENT_ALIASES) {
    if (tsName === transform(rubyName)) return true;
  }
  return false;
}

/**
 * Ruby inheritance is preserved on the TS side if Ruby's immediate
 * superclass appears *anywhere* in TS's ancestor chain. This accepts
 * Trails' common pattern of inserting an abstract intermediate class
 * (e.g. `TableDefinition extends AbstractTableDefinition extends TableDefinition`).
 */
// Rails classes where the TS port adds an abstract intermediate above
// what Rails treats as the root. Accept null-ruby-super + TS extending
// that intermediate as a matched deviation rather than a fidelity gap.
//
// Keyed by ts class name → ts superclass name that should be accepted.
// - Arel Table/Attribute: Rails has no super (plain object or
//   `Struct.new(...)`), TS roots them at `Node` for uniform AST walking.
// - ActiveModel ValueType: Rails' `Value` has no super, TS adds an
//   abstract `Type` above so subclasses can declare `abstract cast`.
// - AR LockingType / Serialized: Rails uses `DelegateClass(Type::Value)`
//   — a dynamic parent our extractor can't resolve (comes through as
//   null). TS extends `ValueType` directly, which matches the intent.
const TS_ROOT_INTERMEDIATE = new Map<string, string>([
  ["Table", "Node"],
  ["Attribute", "Node"],
  ["ValueType", "Type"],
  ["LockingType", "ValueType"],
  ["Serialized", "ValueType"],
  ["TimeZoneConverter", "ValueType"],
  // `ActiveRecord::Base` has no Ruby super; TS `Base` extends `Model`
  // so the ActiveModel mixin surface is type-visible on subclasses.
  ["Base", "Model"],
  // `ActionController::MimeResponds::Collector` is a plain class in Rails
  // that `include AbstractController::Collector`; TS extends the
  // ActionDispatch `Collector` (re-aliased as `DispatchCollector`) to share
  // the negotiation pipeline.
  ["Collector", "DispatchCollector"],
  // `core_ext/name_error.rb` reopens Ruby's core `NameError`, so the Ruby
  // side records no superclass. TS has no NameError, and trails uses
  // `ReferenceError` as the analogue throughout, so the port declares it.
  ["NameError", "ReferenceError"],
  // `ActiveSupport::Messages::Codec` has no Ruby super; it `include Metadata`
  // and then overrides `use_message_serializer_for_metadata?` with a body that
  // calls `super`. Ruby's include puts the module in the ancestor chain, so TS
  // `Codec extends Metadata` reproduces both the chain and that `super`.
  ["Codec", "Metadata"],
]);

/**
 * Resolve the TS class that corresponds to a Ruby class. Tries, in order:
 *
 *   1. The direct short-name match in the expected file.
 *   2. The Trails rename aliases (`Abstract<X>`, `Base<X>`,
 *      `ActiveModel<X>`, `<X>Type`) in the same file.
 *   3. Explicit per-class renames (TS_CLASS_RENAMES).
 *
 * When both (1) and (2) hit, prefer whichever declares a superclass —
 * TS files sometimes keep a query-value helper under the plain Ruby
 * name while the real Rails-shape class lives under the alias
 * (`oid/range.ts`: the bounds helper `Range` + the OID cast type
 * `RangeType extends ValueType<Range>`).
 */
export function resolveTsClassForRuby(
  short: string,
  expectedFile: string,
  tsByFileName: Map<string, ClassInfo>,
): ClassInfo | undefined {
  const direct = tsByFileName.get(`${expectedFile}::${short}`);
  const aliasMatches = TS_PARENT_ALIASES.map(({ transform }) =>
    tsByFileName.get(`${expectedFile}::${transform(short)}`),
  ).filter((c): c is ClassInfo => Boolean(c));

  let resolved = direct;
  if (!resolved) {
    resolved = aliasMatches[0];
  } else if (!resolved.superclass) {
    const withSuper = aliasMatches.find((c) => Boolean(c.superclass));
    if (withSuper) resolved = withSuper;
  }
  if (!resolved) {
    const rename = TS_CLASS_RENAMES[short];
    if (rename) resolved = tsByFileName.get(`${expectedFile}::${rename}`);
  }
  return resolved;
}

/**
 * The per-file "which class is this file about?" selection used by the
 * inheritance check: the shortest fqn, RUBY_ONLY_CLASSES excluded. A shim we
 * deliberately do not port must not become the one class a file contributes
 * to that check, or the real class in the file is never checked at all —
 * `I18n::JSON` (key_value.rb:8, two segments) would otherwise win over
 * `I18n::Backend::KeyValue` (:68, three) and key_value.rb would contribute
 * nothing.
 *
 * This used to return a second map (`folding`) that named a file's lexical
 * parent so nested classes could be dropped from the population. They are no
 * longer dropped — see {@link collectRubyEntities} — so nothing selects a
 * lexical parent any more.
 */
export function primaryClassesPerFile(classes: Record<string, ClassInfo>): Map<string, string> {
  const inheritance = new Map<string, string>();
  const shorter = (fqn: string, existing: string | undefined) =>
    !existing || fqn.split("::").length < existing.split("::").length;

  for (const [fqn, cls] of Object.entries(classes)) {
    if (!cls.file) continue;
    if (isRubyOnlyClass(fqn)) continue;
    if (shorter(fqn, inheritance.get(cls.file))) inheritance.set(cls.file, fqn);
  }
  return inheritance;
}

export function superclassesMatch(
  rubySuper: string | null,
  tsChain: string[],
  tsName: string,
): boolean {
  // `class X < ::Foo` records the absolute marker; TS names never carry it.
  rubySuper = rubySuper?.replace(/^::/, "") ?? null;
  if (!rubySuper && tsChain.length === 0) return true;
  // Ruby builtins have no faithful TS superclass; accept whatever TS uses.
  if (rubySuper && RUBY_UNEXTENDABLE_BUILTINS.has(rubySuper)) return true;
  // Rails-idiomatic "plain object" classes extend Arel.Node in TS.
  const expectedIntermediate = TS_ROOT_INTERMEDIATE.get(tsName);
  if (!rubySuper && expectedIntermediate && tsChain.includes(expectedIntermediate)) return true;
  if (!rubySuper || tsChain.length === 0) return false;
  return tsChain.some((ancestor) => nameMatches(rubySuper, ancestor));
}

/**
 * Comparison bucket a method participates in.
 *   - "all":     default — public + private combined (full surface).
 *                Reported by `pnpm parity:api` with no flags.
 *   - "public":  `--public-only` — drops `internal: true` on both sides
 *                for a contract-only view (matches the historical
 *                default's numbers).
 *   - "private": `--privates-only` — Ruby `private`/`protected` and TS
 *                `private`/`protected`/`#`-prefixed methods only.
 * Exported so compare.test.ts can pin the filter semantics.
 */
export type CompareMode = "public" | "all" | "private";

export function methodInMode(m: MethodInfo, mode: CompareMode): boolean {
  if (mode === "all") return true;
  if (mode === "private") return m.internal === true;
  return m.internal !== true;
}

/**
 * Whether a TS method should be included in the per-file lookup index for a
 * given mode. This is the TS-side counterpart to methodInMode (which filters
 * the Ruby side).
 *
 *   public: only public TS methods — internal helpers must not satisfy Ruby
 *           public method coverage (would inflate scores).
 *   private: ALL TS methods — Rails private methods implemented as exported
 *            TS functions (e.g. exported for wiring) still count as matched.
 *   all:    ALL TS methods — full combined surface, same widening as private.
 */
export function tsShouldIncludeInIndex(m: MethodInfo, mode: CompareMode): boolean {
  return mode === "public" ? !m.internal : true;
}

function nearestNamespaceMatch(
  incName: string,
  contextFqn: string,
  candidates: readonly string[],
): string | undefined {
  const parts = contextFqn.split("::");
  for (let i = parts.length; i > 0; i--) {
    const candidate = `${parts.slice(0, i).join("::")}::${incName}`;
    if (candidates.includes(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Resolve a bare include name (e.g. `"Quoting"`) to the best-matching FQN(s)
 * from the perspective of `contextFqn` (the including class or module).
 *
 * Ruby's constant lookup walks enclosing namespaces outward. Given
 * `ActiveRecord::ConnectionAdapters::AbstractAdapter` including `"Quoting"`,
 * Ruby resolves to `ActiveRecord::ConnectionAdapters::Quoting` — NOT to
 * `ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting` even though both
 * have the same short name. This scoped resolution avoids the false-positive
 * where PostgreSQL-specific methods inflate AbstractAdapter's missing count.
 *
 * A partially-qualified name gets the same walk, keyed on its last segment:
 * `include PostgreSQL::Quoting` inside `module ActiveRecord::ConnectionAdapters`
 * names `ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting`. With no prefix
 * match it falls back to the verbatim name, which is the top-level reading.
 *
 * If only one FQN matches an unqualified short name, that single candidate is
 * returned regardless of context. When multiple candidates exist,
 * namespace-prefix walking picks the nearest enclosing match; if none of the
 * candidates share a namespace prefix with the context the verbatim name is
 * returned — the top-level reading, matching the qualified-name arm.
 *
 * Returns exactly one FQN, because Ruby's constant lookup binds exactly one:
 * lexical scope, then the ancestry chain, then top-level, then `NameError`.
 * The return type is `string` rather than `string[]` to keep that structural.
 *
 * The ANCESTRY step is deliberately not implemented, on a measurement. Ruby
 * binds `class Sub < Base; include Foo` to `Base::Foo` when `Sub`'s own
 * namespaces do not answer `Foo`, and `ClassInfo.superclass` is on the
 * entities both callers iterate, so the step is buildable. Swept over the real
 * `output/rails-api.json` — every `includes`/`extends` site on every class and
 * module of all 15 packages, 784 sites — 280 resolve to a name absent from
 * `rubyPkg.modules` (the case where a missed binding costs expected surface),
 * and for ZERO of them does a walk up the `superclass` chain, trying each
 * ancestor's namespace prefixes, find a module the lexical walk missed. The 11
 * sites where an ancestor's namespace does answer the name — `Arel::Nodes::In`
 * including `FetchAttribute`, `PostgreSQL::TableDefinition` including
 * `ColumnMethods`, `Rails::Command::CredentialsCommand` including
 * `Helpers::Editor` — are every one of them already bound by the lexical walk,
 * because the ancestor shares the includer's own enclosing namespace. So the
 * step would move no method onto any host, and adding it is unexercised
 * machinery. Same disposition PR #5354 gave the ambiguous-fallback arm below;
 * re-measure before building it, rather than assuming it is still empty.
 *
 * Every consumer of `moduleFqnByShort` resolves through here —
 * `flattenIncludedMethodInfos` (expected surface) and `buildModuleIncluderFqns`
 * (where that surface may be implemented). A broader lookup in either one lets
 * a method count as implemented in a file Ruby's constant lookup never binds.
 * That is why the last arm no longer returns the *whole* candidate list
 * ("original behavior, safe fallback"): safe against false negatives, but each
 * extra candidate donates its methods to the expected surface and its
 * includers' files to the search set, so a wrong one is a false match.
 * Measured over the real manifests, that arm never fired — 26 ambiguous
 * unqualified include sites across all 13 packages, every one resolved by the
 * namespace walk — so dropping it moved no method counts. Same false-positive
 * shape PR #5344 removed from the includer graph, where 21 methods were
 * counting as implemented in files Ruby's lookup never reaches.
 *
 * This is the RUBY side, and it needs no declaring-file hint the way the TS
 * superclass/mixin sites do (`resolveEntityByDeclaringFile`). A duplicated
 * short name here is disambiguated by the enclosing namespace, which is
 * exactly how Ruby itself binds it — `ConnectionAdapters::PostgreSQL::Quoting`
 * beats `ConnectionAdapters::Quoting` for a context inside `PostgreSQL::`
 * regardless of which `.rb` either lives in. The TS sites have no namespaces
 * to walk, which is why they need the file.
 */
export function resolveModuleName(
  incName: string,
  contextFqn: string,
  moduleFqnByShort: Map<string, string[]>,
): string {
  // A leading `::` is Ruby's absolute-reference marker, not a namespace
  // qualifier: `include ::Foo` names top-level `Foo` regardless of context.
  if (incName.startsWith("::")) return incName.slice(2);
  if (incName.includes("::")) {
    const candidates = moduleFqnByShort.get(incName.split("::").pop()!) ?? [];
    return nearestNamespaceMatch(incName, contextFqn, candidates) ?? incName;
  }
  const candidates = moduleFqnByShort.get(incName);
  if (!candidates || candidates.length === 0) return incName;
  if (candidates.length === 1) return candidates[0];

  // No prefix match — take the top-level reading, the same fall-through the
  // qualified-name arm above uses.
  return nearestNamespaceMatch(incName, contextFqn, candidates) ?? incName;
}

/**
 * Build the direct `include`/`extend` graph: module FQN → FQNs that mix it in.
 *
 * Downstream this becomes "TS files a module's methods may legitimately live
 * in", so a wrong edge here is a false match, not just noise. `include` names
 * resolve through `resolveModuleName` — the same Ruby constant lookup
 * `flattenIncludedMethodInfos` uses, and the reason both live in this file.
 * The two must never diverge: this builder once resolved unqualified names
 * against the raw short-name map, which made `Rack::Response::Helpers`'
 * `response.ts` an implementation site for `Rack::Request`'s headers even
 * though `class Rack::Request; include Helpers` binds its own nested module.
 */
export function buildModuleIncluderFqns(
  entities: { fqn: string; info: ClassInfo }[],
  moduleFqnByShort: Map<string, string[]>,
): Map<string, Set<string>> {
  const moduleIncluderFqns = new Map<string, Set<string>>();
  for (const { fqn, info } of entities) {
    for (const inc of [...(info.includes || []), ...(info.extends || [])]) {
      const modFqn = resolveModuleName(inc, fqn, moduleFqnByShort);
      const includers = moduleIncluderFqns.get(modFqn) || new Set<string>();
      includers.add(fqn);
      moduleIncluderFqns.set(modFqn, includers);
    }
  }
  return moduleIncluderFqns;
}

/**
 * Flatten `include`/`extend`-reachable methods onto a host entity.
 *
 * Ruby's `include Mod` flattens Mod's instance methods onto the including
 * class's lookup chain; `extend Mod` flattens them as singleton (class)
 * methods. The api-compare manifest records each entity's *own* declared
 * methods only, so without this expansion `Base.includes = ["Querying"]`
 * doesn't surface `Querying`'s methods as part of `Base`'s expected TS
 * surface — and a Rails class can pass api-compare with the mixin's
 * methods living in some other TS file but never reachable on the host.
 *
 * Only the host's *own* `extend` lands as class methods. Ruby `extend`
 * affects only the receiver's singleton class and does not propagate
 * through `include` chains, so a module's `extend X` (e.g. `module M;
 * extend ActiveSupport::Concern; end`) does NOT give `X`'s methods to
 * a class that does `include M`. (Rails' "class methods via include"
 * pattern is ASC's nested `ClassMethods` submodule, which compare.ts
 * folds into the parent module before this helper runs.) Nested
 * `include` chains do propagate, so a module that includes another
 * module contributes those chained methods to the host as instance
 * methods (or class methods if the host got them via `extend`).
 *
 * Cycles are guarded by `visited`. Modules outside the package are
 * silently skipped — stdlib like `Comparable`/`Enumerable` falls through.
 *
 * `entityFqn` drives namespace-scoped include resolution (see
 * `resolveModuleName`): `AbstractAdapter` including `"Quoting"` resolves
 * only to `ConnectionAdapters::Quoting`, not to adapter-specific siblings.
 */
export function flattenIncludedMethodInfos(
  entity: ClassInfo,
  entityFqn: string,
  rubyPkg: PackageInfo,
  moduleFqnByShort: Map<string, string[]>,
  pkg?: string,
): { instance: MethodInfo[]; klass: MethodInfo[] } {
  const instance: MethodInfo[] = [...entity.instanceMethods];
  const klass: MethodInfo[] = [...entity.classMethods];
  const visited = new Set<string>();

  const walk = (incName: string, asClassMethods: boolean, contextFqn: string): void => {
    const fqn = resolveModuleName(incName, contextFqn, moduleFqnByShort);
    if (visited.has(fqn)) return;
    visited.add(fqn);
    const mod = rubyPkg.modules[fqn] as unknown as ClassInfo | undefined;
    if (!mod) return;
    // A module whose source file we've explicitly declined to port should
    // not contribute its methods to includers either — otherwise an
    // unported mixin (e.g. Railties::ControllerRuntime, included into
    // ActionController via an `on_load` block, not into Railtie itself)
    // leaks expected methods onto the host. See UNPORTED_FILES.
    if (mod.file && isSourceUnported(mod.file, pkg)) return;
    const sink = asClassMethods ? klass : instance;
    for (const m of mod.instanceMethods) sink.push(mod.file ? { ...m, mixinFile: mod.file } : m);
    for (const inc of mod.includes ?? []) walk(inc, asClassMethods, fqn);
  };

  for (const inc of entity.includes ?? []) walk(inc, false, entityFqn);
  for (const ext of entity.extends ?? []) walk(ext, true, entityFqn);
  return { instance, klass };
}

/**
 * Is this flattened mixin method already credited in the file mirroring the
 * mixin's OWN Ruby file, and therefore not a gap in the host's file?
 *
 * Ruby's `include` flattens a module's methods onto every host, and
 * `flattenIncludedMethodInfos` reproduces that — so `PostgreSQL::Quoting#escape_bytea`
 * is expected in `connection_adapters/postgresql/quoting.rb` (where trails
 * ports it, and where it matches) and again in
 * `connection_adapters/postgresql_adapter.rb`, where trails does not repeat it
 * because Rails does not either. The host copy is a duplicate expectation: the
 * same method counted twice in the denominator and once in the numerator.
 *
 * The credit is deliberately narrow. It applies only when the mixin's own Ruby
 * file has a bucket of its own in this run (so the method IS being measured
 * somewhere) and one of its TS candidates really is present in that bucket's
 * mirrored TS file. An unported mixin method is credited nowhere and still
 * lands as missing on the host, which is how `encrypted_attributes?` stayed
 * visible while the other 18 `EncryptableRecord` methods on `base.rb` did not.
 *
 * The host expectation is credited, not dropped: the method stays in the host
 * file's denominator and is reported as a move to the mixin's own TS file, the
 * same accounting the include-chain and misplaced-file arms already use.
 */
export function mixinMethodCreditedToOwnFile(
  rm: { rubyName: string; rubyModule: string; mixinFile?: string },
  hostRubyFile: string,
  pkg: string,
  rubyFileHasBucket: (rubyFile: string) => boolean,
  tsMethodsByFile: ReadonlyMap<string, Set<string>>,
): { tsName: string; tsFile: string } | null {
  const mixinFile = rm.mixinFile;
  if (mixinFile === undefined || mixinFile === hostRubyFile) return null;
  if (!rubyFileHasBucket(mixinFile)) return null;
  const candidates = rubyMethodToTsForFqn(rm.rubyModule, rm.rubyName);
  if (candidates === null) return null;
  const tsFile = rubyFileToTs(mixinFile, pkg);
  const mixinTsMethods = tsMethodsByFile.get(tsFile);
  if (mixinTsMethods === undefined) return null;
  const tsName = candidates.find((c) => mixinTsMethods.has(c));
  return tsName === undefined ? null : { tsName, tsFile };
}

/**
 * Is this method defined by a *reopening* of the class in another Ruby file,
 * and ported to the TS file mirroring that reopening?
 *
 * Ruby reopens a class across many files but the extractor stamps ONE `file` on
 * the entity, so a class's whole surface buckets under whichever reopening came
 * first. `core_ext/object/acts_like.rb` is the first core_ext file to reopen
 * `Object`, so `blank?` (`core_ext/object/blank.rb:14`), `duplicable?`
 * (`core_ext/object/duplicable.rb:26`) and `instance_values`
 * (`core_ext/object/instance_variables.rb:19`) all land in its bucket — and
 * `RUBY_FILE_TS_OVERRIDES` maps a Ruby file to exactly ONE TS file, so at most
 * one of those three arms could ever be measured against the file trails
 * actually ports it to.
 *
 * So credit each arm to its own reopening's TS file, the same accounting
 * `mixinMethodCreditedToOwnFile` gives an included method. Narrow by
 * construction: the credit only lands when the reopening's mirrored TS file
 * exists in this run AND really defines one of the method's TS candidates. An
 * unported reopening arm (`acts_like?`, duck typing in JS) is credited nowhere
 * and still reports missing.
 */
export function reopeningMethodCreditedToOwnFile(
  rm: { rubyName: string; rubyModule: string; definedInFile?: string },
  hostRubyFile: string,
  pkg: string,
  tsMethodsByFile: ReadonlyMap<string, Set<string>>,
): { tsName: string; tsFile: string } | null {
  const definedInFile = rm.definedInFile;
  if (definedInFile === undefined || definedInFile === hostRubyFile) return null;
  const candidates = rubyMethodToTsForFqn(rm.rubyModule, rm.rubyName);
  if (candidates === null) return null;
  const tsFile = rubyFileToTs(definedInFile, pkg);
  const reopeningTsMethods = tsMethodsByFile.get(tsFile);
  if (reopeningTsMethods === undefined) return null;
  const tsName = candidates.find((c) => reopeningTsMethods.has(c));
  return tsName === undefined ? null : { tsName, tsFile };
}

/** A Ruby class or module, paired with the fully-qualified name it was found under. */
export interface RubyEntity {
  fqn: string;
  info: ClassInfo;
}

/**
 * The Rails-side population a package contributes: every class, plus every
 * module that carries something (an empty module has no surface to measure).
 *
 * **Nested classes are included.** A class nested inside a same-file parent —
 * `Preloader::Association::LoaderQuery` in preloader/association.rb — used to
 * be skipped here, which dropped it from the population ENTIRELY rather than
 * merely from file pairing: its methods never reached the coverage
 * denominator, so an unported nested class scored as nothing missing (926
 * Ruby methods across 187 classes repo-wide, 518 of them on a class that does
 * have a TS counterpart). Pairing is per FILE and deduped by method name
 * (`dedupeRubyMethodInto`), so a nested class is measured against the same TS
 * file its parent pairs with, and a name both define is still counted once.
 *
 * A `ClassMethods` submodule is folded into its parent module's class methods
 * first — Ruby's `included do extend ClassMethods end` shape — and then
 * dropped, since the parent now accounts for it. That fold MUTATES the parent
 * entry in `rubyPkg`, matching how the caller has always consumed it.
 */
export function collectRubyEntities(rubyPkg: PackageInfo): RubyEntity[] {
  const allRuby: RubyEntity[] = [];

  for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
    allRuby.push({ fqn, info: info as unknown as ClassInfo });
  }

  const classMethodModuleFqns = new Set<string>();
  for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
    if (!fqn.endsWith("::ClassMethods")) continue;
    const parentFqn = fqn.replace(/::ClassMethods$/, "");
    const parentMod = rubyPkg.modules[parentFqn] as unknown as ClassInfo | undefined;
    if (parentMod) {
      const mod = info as unknown as ClassInfo;
      for (const m of mod.instanceMethods) {
        if (!parentMod.classMethods.some((pm: MethodInfo) => pm.name === m.name)) {
          parentMod.classMethods.push(m);
        }
      }
      classMethodModuleFqns.add(fqn);
    }
  }

  for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
    const mod = info as unknown as ClassInfo;
    if (classMethodModuleFqns.has(fqn)) continue;
    if (
      mod.instanceMethods.length === 0 &&
      mod.classMethods.length === 0 &&
      mod.includes.length === 0 &&
      mod.extends.length === 0
    ) {
      continue;
    }
    allRuby.push({ fqn, info: mod });
  }

  return allRuby;
}

/**
 * Split an entity's methods out of its home-file bucket for every file that
 * reopens it.
 *
 * Ruby reopens a class/module across many files, but the extractor stamps ONE
 * `file` on the entity — where its first method was defined — so by default
 * every later file's methods are measured against that file's TS counterpart.
 * For `ActiveSupport::Inflector` that means `inflector/methods.rb`'s 20 methods
 * are looked for in `inflector/inflections.ts` and reported missing forever.
 * A reopening file gets its own bucket instead, holding only the methods it
 * defines. Splits carry no `includes`/`extends`: the include-flattened methods
 * belong to the home bucket, not to every file the entity is reopened in.
 *
 * The Ruby extractor records a per-METHOD `file`, so every reopening is
 * splittable, and the split is unconditional (RFC 0126). It used to need an
 * explicit `RUBY_FILE_TS_OVERRIDES` mapping, which made the unmapped
 * reopenings invisible twice over: `module ARTest` opens in
 * `test/support/config.rb` and reopens in `connection.rb`, so all seven of its
 * methods were held against `config.ts` — `connection_name`,
 * `test_configuration_hashes` and `connect` read as MISSING although
 * `support/connection.ts` ports and exports each — and `connection.rb` never
 * appeared as a compared file at all, inflating `files N/N`.
 *
 * A reopening file declared unported (UNPORTED_FILES) is split for the same
 * reason with the opposite outcome: only a file that owns a bucket can be
 * excluded by `isSourceUnported`, which the caller consults per bucket. Without
 * the split, `version.rb`'s `.version` would sit in `active_record.rb`'s bucket
 * and read as missing however the exclusion is spelled.
 */
export function splitOverriddenFileBuckets(entity: RubyEntity): RubyEntity[] {
  const home = entity.info.file || "unknown.rb";
  const allMethods = [...entity.info.instanceMethods, ...entity.info.classMethods];
  const splitFiles = new Set(
    allMethods.map((m) => m.file).filter((f): f is string => f !== undefined && f !== home),
  );
  if (splitFiles.size === 0) return [entity];

  const inSplit = (m: MethodInfo) => m.file !== undefined && splitFiles.has(m.file);
  const out: RubyEntity[] = [
    {
      fqn: entity.fqn,
      info: {
        ...entity.info,
        instanceMethods: entity.info.instanceMethods.filter((m) => !inSplit(m)),
        classMethods: entity.info.classMethods.filter((m) => !inSplit(m)),
      },
    },
  ];
  for (const file of splitFiles) {
    out.push({
      fqn: entity.fqn,
      info: {
        ...entity.info,
        file,
        includes: [],
        extends: [],
        instanceMethods: entity.info.instanceMethods.filter((m) => m.file === file),
        classMethods: entity.info.classMethods.filter((m) => m.file === file),
      },
    });
  }
  return out;
}

/**
 * `rubyMethodToTs`, plus the OPERATOR spellings pinned per declaring Ruby class
 * in `OPERATOR_SPELLING_BY_FQN` (`operator-order-spelling.ts`).
 *
 * `rubyMethodToTs` returns `null` for every member of `OPERATORS` — they carry
 * no canonical camelCase spelling — so an operator is dropped from the expected
 * set entirely: a faithful port (`Arel::Math#+` → `math.ts` `add`) earns no
 * matched credit, and an unported one is invisible rather than missing. The
 * pinned table is the safe subset: each entry was verified against BOTH the
 * Rails source position and the TS member, so a pinned operator is a real,
 * locatable port. An operator with no entry keeps the old behaviour — still
 * `null`, still neither expected nor reported missing — so no total can fall.
 */
export function rubyMethodToTsForFqn(
  fqn: string,
  name: string,
  siblingRubyNames?: ReadonlySet<string>,
): string[] | null {
  return operatorSpelling(fqn, name) ?? rubyMethodToTs(name, siblingRubyNames);
}

/**
 * Dedup expected Ruby methods by Ruby method name (NOT first TS
 * candidate). Two distinct Ruby methods can produce the same first TS
 * candidate (`is_number?` and `number?` both → `"isNumber"`); keying
 * by the TS candidate would silently drop the second method from the
 * expected set. Caller supplies a per-file `seen` map (keyed by method
 * name); this helper just records the first sighting and ignores
 * subsequent ones, matching the original per-file dedup behavior with
 * a different key. Skips methods with no TS-candidate mapping
 * (operators, SKIP list).
 */
export function dedupeRubyMethodInto(
  seen: Map<string, SeenRubyMethod>,
  rm: MethodInfo,
  itemFqn: string,
  rubyFile?: string,
): void {
  if (rubyMethodToTsForFqn(itemFqn, rm.name) === null) return;
  if (isRubyOnlyClass(itemFqn)) return;
  if (rubyFile !== undefined && isScopedSkip(rm.name, rubyFile)) return;
  const key = rm.name;
  if (!seen.has(key)) {
    seen.set(key, {
      rubyName: rm.name,
      rubyModule: itemFqn,
      umbrellaConfig: rm.umbrellaConfig,
      notes: rm.notes,
      mixinFile: rm.mixinFile,
      definedInFile: rm.file,
    });
  }
}

/** One deduped Ruby method expected from a Ruby file (see `dedupeRubyMethodInto`). */
export interface SeenRubyMethod {
  rubyName: string;
  rubyModule: string;
  umbrellaConfig?: boolean;
  /** The Ruby extractor's classification — `"class_attribute"` for an `mattr_accessor`/`class_attribute`-generated reader. */
  notes?: string;
  /** Set when the first sighting came in through `include`/`extend` — see `mixinMethodCreditedToOwnFile`. */
  mixinFile?: string;
  /** The Ruby file that actually defines it — see `reopeningMethodCreditedToOwnFile`. */
  definedInFile?: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Pick the best candidate sibling TS file for a Ruby file whose
 * expected TS path doesn't exist. Returns the path, or null if no
 * cluster meets all three thresholds:
 *
 * 1. Absolute floor (`MISPLACED_MIN_HITS`, currently 3) — at least
 *    this many of the Ruby file's candidate method names appear.
 *    Filters out 1- or 2-method noise hits.
 * 2. Coverage floor (`bestCount * 2 >= rubyMethodCount`) — the
 *    cluster covers at least 50% of the Ruby file's expected methods.
 * 3. Separation (`bestCount >= secondCount * 2`) — the leader has at
 *    least 2× the runner-up's hits. Without this, a Ruby file whose
 *    methods are evenly scattered across many TS files (generic names
 *    like `name`/`value`/`run`) would arbitrarily latch onto whichever
 *    file iterated first.
 *
 * All three together rule out the `deprecator.rb ↦ migration.ts`
 * pattern observed during development: 3 hits but only 43% coverage
 * and no separation from the noise floor.
 *
 * The package barrel (`index.ts`) is dropped from the vote before any of the
 * three run. It re-exports the whole package, so it contains a candidate for
 * essentially every name and clears all three thresholds whenever a real file
 * would — and then the bucket's methods are compared against whichever
 * same-named symbol the barrel happens to re-export, which is unrelated to the
 * port (PR #6225: `core_ext/object/acts_like.rb` landed on
 * `activesupport/src/index.ts`, so Ruby `Object#as_json` was compared against
 * `TimeWithZone#asJson`). A barrel is a re-export site, never a port location;
 * a bucket that genuinely lives there is spelled out in
 * `RUBY_FILE_TS_OVERRIDES`, which is the direct-match path and does not come
 * through here.
 *
 * A bucket registered in `NAME_COLLISION_CLUSTERS` is dropped before the vote
 * for the same reason the barrel is: its hits are a coincidence of method
 * names, not a port.
 */
export const MISPLACED_MIN_HITS = 3;

/**
 * True for the package barrel — `index.ts` at the package `src` root. Paths in
 * `fileHits` are package-src relative, so the barrel is exactly `"index.ts"`;
 * directory barrels keep their vote, since some of them (`encryption/index.ts`)
 * carry ported bodies rather than only re-exports.
 */
function isPackageBarrel(file: string): boolean {
  return file === "index.ts";
}

/**
 * Buckets whose cluster is a pure name collision: every hit is a TS method that
 * belongs to an unrelated entity and happens to share a Ruby name, so the
 * bucket has no port at all and must read as missing rather than partly ported.
 * Keyed `<package>:<ruby file>`. Only-shrink: a row leaves when the file is
 * ported, never when a better justification is found for keeping it.
 *
 * Currently empty.
 */
export const NAME_COLLISION_CLUSTERS: ReadonlySet<string> = new Set([]);

/**
 * Whether a Ruby file has SOME real TS counterpart the compare can point at:
 * either its mirrored `expectedTsFile` exists, or the misplaced-cluster vote
 * found the sibling file its port actually landed in.
 *
 * Cross-file credit — the include chain, the mixin/reopening arms, the umbrella
 * config arm — is gated on this. Those arms all say "the member is ported, just
 * in another file", which is only meaningful when this Ruby file is ported at
 * all. Without the gate a Ruby file with a 0-line port accumulates `matched`
 * from unrelated files that happen to define a TS name equal to one of its Ruby
 * member names — `active_support/execution_wrapper.rb` read as `matched: 2`
 * with no `ExecutionWrapper` anywhere in the tree, and every `helpers/tags/*.rb`
 * bucket read as ~36 matched off the ActionView helper modules. `matched` must
 * mean "a TS member the compare can point at in a file that maps to this Ruby
 * file"; an unmapped file's members are missing, and read as missing.
 *
 * Every credit arm after the same-file direct match is cross-file — the include
 * chain, the mixin/reopening arms, the misplaced-cluster fallback and the
 * umbrella-config arm — so `main` short-circuits all of them to `missing` when
 * this returns false.
 */
export function rubyFileHasTsCounterpart(
  tsFileExists: boolean,
  misplacedActualFile: string | null,
): boolean {
  return tsFileExists || misplacedActualFile !== null;
}

export function selectMisplacedFile(
  fileHits: Map<string, number>,
  rubyMethodCount: number,
  bucketKey?: string,
): string | null {
  if (bucketKey !== undefined && NAME_COLLISION_CLUSTERS.has(bucketKey)) return null;
  let bestFile: string | null = null;
  let bestCount = 0;
  let secondCount = 0;
  for (const [f, c] of fileHits) {
    if (isPackageBarrel(f)) continue;
    if (c > bestCount) {
      secondCount = bestCount;
      bestFile = f;
      bestCount = c;
    } else if (c > secondCount) {
      secondCount = c;
    }
  }
  if (!bestFile) return null;
  if (bestCount < MISPLACED_MIN_HITS) return null;
  if (bestCount * 2 < rubyMethodCount) return null;
  if (bestCount < secondCount * 2) return null;
  return bestFile;
}

/**
 * Build a name → ClassInfo[] map for `pkg`, unioning in entities from every
 * @blazetrails/* dependency so the inheritance walker can cross package
 * boundaries (e.g. AR Base extends AM Model).
 */
/**
 * api-compare keys of a package's `@blazetrails/*` deps (incl. peer deps), from
 * its package.json. Inheritance/mixin walks cross these boundaries (AR `Base
 * extends` AM `Model`), so the entity index and the arity candidate pool both
 * key on this set. Returns [] if package.json can't be read.
 */
export function blazetrailsDepKeys(pkg: string): string[] {
  const dirName = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
  const pkgJsonPath = path.join(ROOT_DIR, "packages", dirName, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return [];
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as Record<
      string,
      Record<string, string>
    >;
    const allDeps = {
      ...(pkgJson["dependencies"] ?? {}),
      ...(pkgJson["peerDependencies"] ?? {}),
    };
    const keys: string[] = [];
    for (const dep of Object.keys(allDeps)) {
      if (!dep.startsWith("@blazetrails/")) continue;
      const depDir = dep.replace("@blazetrails/", "");
      // A single npm package may map to multiple api-compare keys
      // (e.g. actionpack → actiondispatch + actioncontroller).
      for (const depKey of DIR_TO_PACKAGES[depDir] ?? [depDir]) {
        if (depKey !== pkg && !TEST_SUPPORT_PACKAGES.has(depKey)) keys.push(depKey);
      }
    }
    // A test-support package shares its container's npm package, so the
    // container never shows up as a dependency — add it explicitly, or helpers
    // that extend a Rails class (FakeAdapter → AbstractAdapter) resolve
    // against nothing.
    if (TEST_SUPPORT_PACKAGES.has(pkg) && dirName !== pkg) keys.push(dirName);
    return keys;
  } catch {
    return []; // Non-fatal: fall back to same-package only.
  }
}

/**
 * Index the package's TS entities by short name, then its blazetrails deps',
 * so a superclass / include-edge walk can cross a package boundary.
 *
 * `foreign` is filled with every entity a DEP package contributed — the
 * candidates {@link resolveEntityByDeclaringFile} must not rank by path.
 */
export function buildEntitiesByName(
  pkg: string,
  ts: ApiManifest,
  foreign?: Set<ClassInfo>,
  pkgOf?: Map<ClassInfo, string>,
): Map<string, ClassInfo[]> {
  const map = new Map<string, ClassInfo[]>();

  const isFixture = (e: ClassInfo) =>
    (e.file ?? "").includes("__fixtures__") || (e.file ?? "").startsWith("tsc-wrapper/");

  const addPkg = (pkgKey: string) => {
    const p = ts.packages[pkgKey];
    if (!p) return;
    for (const entity of [...Object.values(p.classes), ...Object.values(p.modules)]) {
      if (isFixture(entity)) continue;
      pkgOf?.set(entity, pkgKey);
      if (pkgKey !== pkg) foreign?.add(entity);
      const list = map.get(entity.name) ?? [];
      list.push(entity);
      map.set(entity.name, list);
    }
  };

  // Always include the current package first so same-package candidates beat
  // cross-package ones in the proximity tie-breaker.
  addPkg(pkg);
  for (const depKey of blazetrailsDepKeys(pkg)) addPkg(depKey);

  return map;
}

/**
 * Pick the entity a superclass / include-edge short name refers to.
 *
 * TS records both by their BARE short name, and sibling adapter directories
 * declare same-named entities (`SchemaStatements` lives under
 * `connection-adapters/abstract/`, `postgresql/` and `sqlite3/`). The extractor
 * therefore also records the file the name resolved to — `superclassFile` for
 * an `extends` clause, `extendsFiles[name]` for an `include()`/`extend()` edge
 * — and an exact match on it wins outright. `declFile` is absent only when the
 * symbol resolved outside the package's `src` (a dep package, a mixin-factory
 * call), and then we fall back to file-path proximity: most shared leading
 * directory segments with the child, self excluded.
 *
 * Proximity only decides when it actually separates the candidates. Several
 * candidates sharing ZERO leading segments with the child are not ranked at
 * all, and the old `candidates[0]` fallback bound whichever one the extractor
 * happened to enumerate first — order-dependent, silent, and wrong: naming the
 * CSP mixin `Request` (its Rails name) in `http/content-security-policy.ts`
 * flipped `testing/test-request.ts`'s parent off `http/request.ts` and dropped
 * `test_request.rb` from 13 matched methods to 9 with no warning (PR #5405).
 * So an unseparated tie resolves to nothing, the way `includeGraphEntities`
 * drops an edge name that resolves to more than one entity, and `onAmbiguous`
 * reports it (RFC 0126). A tie at a POSITIVE score keeps its winner: those
 * candidates do share a directory prefix with the child, which is the signal
 * this heuristic exists to read; only a tie at zero is pure enumeration order.
 *
 * `declFile` also arrives in two RESOLVED-but-not-here spellings, which the
 * heuristic must not confuse with an absent one (RFC 0126). `external:` says
 * the name bound a TypeScript lib global or a node_modules type, so no package
 * entity is it and the walk follows nothing — silently, because a
 * `class X extends Error` in an ambiguity warning is noise nobody can act on.
 * `pkg:<package>:<path>` says it bound another workspace package, and
 * `packageOf` is what separates that package's `model.ts` from this one's.
 *
 * `isForeign` marks a candidate a DEP package contributed. A dep's path is
 * relative to ITS OWN src dir, so a shared prefix with the child is a
 * coincidence: activemodel and activerecord both port `attribute_methods.rb`
 * to `attribute-methods.ts`, and so with `validations.ts`, `callbacks.ts`,
 * `serialization.ts`, `attributes.ts` and every other file the two gems both
 * carry. Ranking that coincidence lets a dep's same-named entity take the
 * child's parent slot, and the inheritance walk then pools the DEP's method
 * names under the package's identically-named key — where `directMatch` reads
 * them, so a Ruby method this gem does not port reads as matched because the
 * other gem ports a same-named one. A foreign candidate therefore scores zero
 * and wins only when nothing else is in the running, which is the arm the
 * cross-package walk exists for (`AR::Base extends AM::Model`, AR
 * `type/text.ts` extends AM `type/string.ts`).
 */
export function resolveEntityByDeclaringFile(
  candidates: ClassInfo[],
  childFile: string,
  declFile?: string,
  onAmbiguous?: (candidates: ClassInfo[]) => void,
  isForeign?: (candidate: ClassInfo) => boolean,
  packageOf?: (candidate: ClassInfo) => string | undefined,
): ClassInfo | null {
  if (candidates.length === 0) return null;
  if (declFile === EXTERNAL_DECL_FILE) return null;
  if (declFile?.startsWith(PKG_DECL_PREFIX)) {
    const [depPkg, ...rest] = declFile.slice(PKG_DECL_PREFIX.length).split(":");
    const depFile = rest.join(":");
    return (
      candidates.find((c) => packageOf?.(c) === depPkg && c.file === depFile) ??
      candidates.find((c) => packageOf?.(c) === depPkg) ??
      null
    );
  }
  if (candidates.length === 1) return candidates[0];
  if (declFile) {
    const exact = candidates.find((c) => c.file === declFile);
    if (exact) return exact;
  }
  const childParts = (childFile || "").split("/");
  let best: ClassInfo | null = null;
  let bestScore = -1;
  let bestCount = 0;
  for (const c of candidates) {
    if (c.file === childFile) continue; // skip self
    const parts = (c.file || "").split("/");
    let shared = 0;
    if (isForeign?.(c) !== true) {
      for (let i = 0; i < Math.min(childParts.length, parts.length); i++) {
        if (childParts[i] === parts[i]) shared++;
        else break;
      }
    }
    if (shared > bestScore) {
      bestScore = shared;
      best = c;
      bestCount = 1;
    } else if (shared === bestScore) {
      bestCount++;
    }
  }
  if (bestScore === 0 && bestCount > 1) {
    onAmbiguous?.(candidates.filter((c) => c.file !== childFile));
    return null;
  }
  return best;
}

export function main() {
  const args = process.argv.slice(2);
  const pkgIndex = args.indexOf("--package");
  let filterPkg: string | null = null;
  if (pkgIndex !== -1) {
    const value = args[pkgIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error("--package requires a package name (e.g. --package activerecord)");
      process.exit(1);
    }
    if (!PACKAGES.includes(value)) {
      const suggestions = new SpellChecker({ dictionary: PACKAGES }).correct(value);
      const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      console.error(`--package: unknown package "${value}".${hint}`);
      console.error(`Available: ${PACKAGES.join(", ")}`);
      process.exit(1);
    }
    filterPkg = value;
  }
  const showMissing = args.includes("--missing");
  const showFiles = args.includes("--files");
  const showIncomplete = args.includes("--incomplete");
  const showClosureOnly = args.includes("--closure");
  const showInheritance = args.includes("--inheritance");
  // Arity is always computed (summary + artifact); --arity adds the breakdown.
  const showArity = args.includes("--arity");
  const showParams = args.includes("--params");
  // Comparison bucket:
  //   default        → public + private combined (full surface)
  //   --public-only  → public API only (historical default; matches
  //                    older coverage numbers and external API contracts)
  //   --privates-only→ private/protected only (Ruby `private`/`protected`,
  //                    TS `private`/`protected`, `#`-prefixed fields)
  //   --privates     → no-op alias for the new default; pre-flip CI
  //                    invocations and docs continue to work without
  //                    edits. Combining --privates with --public-only or
  //                    --privates-only is rejected as ambiguous.
  const privatesOnly = args.includes("--privates-only");
  const publicOnly = args.includes("--public-only");
  const privatesAlias = args.includes("--privates");
  if (privatesOnly && publicOnly) {
    console.error("Error: --public-only and --privates-only are mutually exclusive — pick one.");
    process.exit(1);
  }
  if (privatesAlias && (privatesOnly || publicOnly)) {
    console.error(
      "Error: --privates (alias for the default full-surface mode) cannot be combined with --public-only or --privates-only.",
    );
    process.exit(1);
  }
  const mode: CompareMode = privatesOnly ? "private" : publicOnly ? "public" : "all";
  const methodMatchesMode = (m: MethodInfo): boolean => methodInMode(m, mode);

  // Opt-in calls knob (RFC 0047): widen the calls-check `significant` set to
  // all ported names except `super`, writing the separate call-mismatches
  // artifact gated by lint-call-mismatches.ts.
  const callsGate = args.includes("--calls") || process.env.API_COMPARE_CALLS === "1";
  const callsSignificant = SIGNIFICANT_CALLS;

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-api.json");

  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-api.json — run extract-ruby-api.rb first");
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error("Missing ts-api.json — run extract-ts-api.ts first");
    process.exit(1);
  }

  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: ApiManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  // Reasoned arity suppressions (RFC 0072). Read sync to match this module's
  // other manifest reads; arity-exclude.ts's async loader serves the gate.
  const arityExcludes = arityExcludeKeys(
    parseArityExcludes(fs.readFileSync(ARITY_EXCLUDE_PATH, "utf-8")),
  );
  const appliedArityExcludes = new Set<string>();

  // Reasoned inheritance suppressions (RFC 0072) — a ported class whose TS
  // superclass deliberately differs, each with its justification.
  const inheritanceExcludes = inheritanceExcludeKeys(
    parseInheritanceExcludes(fs.readFileSync(INHERITANCE_EXCLUDE_PATH, "utf-8")),
  );
  const appliedInheritanceExcludes = new Set<string>();

  const results: PackageResult[] = [];

  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const tsPkg = ts.packages[pkg];

    // Build per-file method index from TS: file → Set<methodName>.
    // See tsShouldIncludeInIndex for the inclusion semantics.
    const tsShouldInclude = (m: MethodInfo) => tsShouldIncludeInIndex(m, mode);
    const tsMethodsByFile = new Map<string, Set<string>>();

    // Param side-map for the advisory arity check (tsMethodsByFile carries only
    // names): every signature seen for a TS name, GLOBAL across this package and
    // its deps (populated below) by design. The
    // mixin convention (CLAUDE.md `static x = x`) puts a method's real signature
    // in its source file while the aggregator class Ruby maps to holds only a
    // 0-arg re-export binding (`_writeAttribute: ReadonlyAttributes._write…`);
    // pooling all signatures and matching ANY (see matchArityAgainst) finds the
    // true arity and keeps those bindings/overloads from false-positiving.
    const tsParamsByName = new Map<string, ParamInfo[][]>();
    // The package-only signature populations the calls-parity ported-with-args
    // gate reads — see TsPortedWithArgsMaps for what each one is scoped to.
    const portedWithArgsMaps = newTsPortedWithArgsMaps();
    const {
      paramsByNameInPkg: tsParamsByNameInPkg,
      paramsByFileNameInPkg: tsParamsByFileNameInPkg,
      paramsByFileOwnerNameInPkg: tsParamsByFileOwnerNameInPkg,
      writerSigs: tsWriterSigs,
      optionKeysByFileName: tsOptionKeysByFileName,
    } = portedWithArgsMaps;
    // Body call-sets scoped per (file, name) for the advisory calls-parity check.
    const tsCallsByFileName = new Map<string, Map<string, string[][]>>();
    const tsCallSeqByFileName = new Map<string, Map<string, string[][]>>();
    const tsSkeletonByFileName = new Map<string, Map<string, string[][]>>();
    const tsCallArgsByFileName = new Map<string, Map<string, CallSite[][]>>();
    // The same two populations narrowed by declaring class (file → name → owner
    // → sets), consulted when one file declares the name on SEVERAL owners and
    // `resolveTsOwner` names the one this Ruby entity ported to. Without it a
    // Ruby body pairs against whichever same-named member happens to carry a
    // call set — `query_cache.rb`'s `ConnectionPoolConfiguration#query_cache`
    // (:187) against the `attr_accessor` port (query-cache.ts:330) rather than
    // the getter (:305) that makes its calls.
    const tsCallsByFileNameOwner = new Map<string, Map<string, Map<string, string[][]>>>();
    const tsCallArgsByFileNameOwner = new Map<string, Map<string, Map<string, CallSite[][]>>>();
    // (file → name → declaring class → tagged calls), so a tag on one class
    // never speaks for a same-named sibling; a top-level function is `""`.
    const tsMissingCallTagsByFileName = new Map<
      string,
      Map<string, Map<string, Map<string, string>>>
    >();
    // The call-ARGUMENT twin (RFC 0099): the `@missingRailsArgs` tags, keyed
    // identically, read by `checkCallArgs`.
    const tsMissingArgTagsByFileName = new Map<
      string,
      Map<string, Map<string, Map<string, string>>>
    >();
    // (file → name → every class declaring it), `resolveTsOwner`'s population.
    const tsOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    // (file → name → owner → the file the member is DECLARED in), recorded only
    // where it differs from the entity's own file — see `declFileFor`.
    const tsDeclFileByFileNameOwner = new Map<string, Map<string, Map<string, string>>>();
    // The same population split by the SEAT each owner declares the name on
    // (file → name → owners), so `resolveTsOwner` can pair a Ruby
    // `X::ClassMethods` owner with the static declaration and the bare `X`
    // owner with the prototype one (RFC 0108).
    const tsStaticOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    const tsInstanceOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    // The owners that declare the name as a `set` accessor (file → name →
    // owners) — the port's spelling of Ruby's `name=` writer, so
    // `resolveTsOwner` can keep a Ruby reader off it (RFC 0108).
    const tsWriterOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    // (file → name → owners) split by declaration shape — see `MethodInfo.bodyless`
    // and `ownersWithBodies`.
    const tsBodylessOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    const tsBodiedOwnersByFileName = new Map<string, Map<string, Set<string>>>();
    const tsAliasNamesByFileName = new Map<string, Set<string>>();
    // Same call-sets unioned by NAME across this package and its deps (the same
    // scope tsParamsByName uses). Consulted ONLY by the delegation-transparency
    // gate (see effectiveTsCalls), never as the primary population — the
    // per-file scoping above is what keeps same-named methods on unrelated
    // classes from cross-satisfying.
    const tsCallsByName = new Map<string, Set<string>>();
    // Same population as tsCallsByName, but the calls the extractor saw NEGATED
    // (`!xs.includes(y)`), with the marker prefix stripped.
    const tsNegatedCallsByName = new Map<string, Set<string>>();
    // Per-file name → partitioned call-set, memoized: the same-file closure
    // (see effectiveTsCalls) walks it once per matched pair.
    type PartitionedCalls = ReturnType<typeof partitionNegatedCalls>;
    const sameFilePartitions = new Map<string, Map<string, PartitionedCalls>>();
    const sameFilePartition = (file: string) => {
      const cached = sameFilePartitions.get(file);
      if (cached) return cached;
      const byName = new Map<string, PartitionedCalls>();
      for (const [name, sets] of tsCallsByFileName.get(file) ?? []) {
        byName.set(name, partitionNegatedCalls(sets.flat()));
      }
      sameFilePartitions.set(file, byName);
      return byName;
    };
    const portedWithArgsSigs = (tsFile: string, name: string): ParamInfo[][] =>
      resolvePortedWithArgsSigs(
        tsParamsByFileNameInPkg,
        tsParamsByNameInPkg,
        tsFile,
        name,
        tsWriterSigs,
      );
    const includeGraph = buildIncludeGraph(
      tsPkg ? [...Object.values(tsPkg.classes), ...Object.values(tsPkg.modules)] : [],
      tsPkg?.fileFunctions ?? {},
    );
    const graphEntities = new Map<string, GraphEntity[]>();
    const includeGraphCalls = (tsFile: string, tsName: string): PartitionedCalls => {
      let entities = graphEntities.get(tsFile);
      if (!entities) {
        entities = includeGraphEntities(tsFile, includeGraph);
        graphEntities.set(tsFile, entities);
      }
      return includeGraphCallSets(entities, tsName, includeGraph);
    };
    // (file → Ruby module short name → the file's owners that mix it in),
    // memoized: `resolveTsOwner` asks once per matched pair.
    const graphHosts = new Map<string, Map<string, Set<string>>>();
    const includeHosts = (tsFile: string, rubyModule: string): ReadonlySet<string> => {
      const short = rubyModule.split("::").at(-1) ?? rubyModule;
      const byModule = graphHosts.get(tsFile) ?? new Map<string, Set<string>>();
      let hosts = byModule.get(short);
      if (!hosts) {
        hosts = includeGraphHosts(tsFile, short, includeGraph);
        byModule.set(short, hosts);
        graphHosts.set(tsFile, byModule);
      }
      return hosts;
    };
    const recordTsParams = (
      m: MethodInfo,
      file = m.file ?? "",
      scope: "package" | "dep" = "package",
      owner = "",
    ) => {
      if (scope === "package") {
        const owners = tsOwnersByFileName.get(file) ?? new Map<string, Set<string>>();
        owners.set(m.name, (owners.get(m.name) ?? new Set<string>()).add(owner));
        tsOwnersByFileName.set(file, owners);
        if (m.file !== undefined && m.file !== file) {
          const byName =
            tsDeclFileByFileNameOwner.get(file) ?? new Map<string, Map<string, string>>();
          const byOwner = byName.get(m.name) ?? new Map<string, string>();
          byOwner.set(owner, m.file);
          byName.set(m.name, byOwner);
          tsDeclFileByFileNameOwner.set(file, byName);
        }
        if (m.aliasOf !== undefined) {
          const aliasNames = tsAliasNamesByFileName.get(file) ?? new Set<string>();
          aliasNames.add(m.name);
          tsAliasNamesByFileName.set(file, aliasNames);
        }
        const byShape = m.bodyless === true ? tsBodylessOwnersByFileName : tsBodiedOwnersByFileName;
        const shapeOwners = byShape.get(file) ?? new Map<string, Set<string>>();
        shapeOwners.set(m.name, (shapeOwners.get(m.name) ?? new Set<string>()).add(owner));
        byShape.set(file, shapeOwners);
        if (m.writer === true) {
          const writerOwners = tsWriterOwnersByFileName.get(file) ?? new Map<string, Set<string>>();
          writerOwners.set(m.name, (writerOwners.get(m.name) ?? new Set<string>()).add(owner));
          tsWriterOwnersByFileName.set(file, writerOwners);
        }
        // A top-level function (`owner === ""`) states no seat — see tsOwnerSeat.
        if (owner !== "") {
          const bySeat =
            m.isStatic === true ? tsStaticOwnersByFileName : tsInstanceOwnersByFileName;
          const seatOwners = bySeat.get(file) ?? new Map<string, Set<string>>();
          seatOwners.set(m.name, (seatOwners.get(m.name) ?? new Set<string>()).add(owner));
          bySeat.set(file, seatOwners);
        }
      }
      const sigs = tsParamsByName.get(m.name) ?? [];
      sigs.push(m.params);
      tsParamsByName.set(m.name, sigs);
      if (scope === "package") recordTsPortedWithArgs(portedWithArgsMaps, m, file, owner);
      if (m.missingRailsCalls !== undefined) {
        recordTaggedCalls(
          tsMissingCallTagsByFileName,
          file,
          m.name,
          owner,
          m.missingRailsCalls,
          m.missingRailsCallReasons,
          scope,
        );
      }
      if (m.missingRailsArgs !== undefined) {
        recordTaggedCalls(
          tsMissingArgTagsByFileName,
          file,
          m.name,
          owner,
          m.missingRailsArgs,
          m.missingRailsArgsReasons,
          scope,
        );
      }
      // A relative path is not unique across packages — activemodel and
      // activerecord both port attribute_methods.rb to attribute-methods.ts —
      // so the file-keyed BODY maps below take this package's members only, or
      // a dep's same-named body joins the union the call gates compare against.
      // The by-NAME pools stay dep-wide (RFC 0126).
      if (m.callSeq !== undefined && scope === "package") {
        const byName = tsCallSeqByFileName.get(file) ?? new Map<string, string[][]>();
        byName.set(m.name, [...(byName.get(m.name) ?? []), m.callSeq]);
        tsCallSeqByFileName.set(file, byName);
      }
      if (m.callArgs !== undefined && scope === "package") {
        const byName = tsCallArgsByFileName.get(file) ?? new Map<string, CallSite[][]>();
        byName.set(m.name, [...(byName.get(m.name) ?? []), m.callArgs]);
        tsCallArgsByFileName.set(file, byName);
        const byOwner =
          tsCallArgsByFileNameOwner.get(file) ?? new Map<string, Map<string, CallSite[][]>>();
        const sets = byOwner.get(m.name) ?? new Map<string, CallSite[][]>();
        sets.set(owner, [...(sets.get(owner) ?? []), m.callArgs]);
        byOwner.set(m.name, sets);
        tsCallArgsByFileNameOwner.set(file, byOwner);
      }
      if (m.skeleton !== undefined && scope === "package") {
        const byName = tsSkeletonByFileName.get(file) ?? new Map<string, string[][]>();
        byName.set(m.name, [...(byName.get(m.name) ?? []), m.skeleton]);
        tsSkeletonByFileName.set(file, byName);
      }
      if (m.calls !== undefined) {
        if (scope === "package") {
          const byName = tsCallsByFileName.get(file) ?? new Map<string, string[][]>();
          byName.set(m.name, [...(byName.get(m.name) ?? []), m.calls]);
          tsCallsByFileName.set(file, byName);
          const byOwner =
            tsCallsByFileNameOwner.get(file) ?? new Map<string, Map<string, string[][]>>();
          const sets = byOwner.get(m.name) ?? new Map<string, string[][]>();
          sets.set(owner, [...(sets.get(owner) ?? []), m.calls]);
          byOwner.set(m.name, sets);
          tsCallsByFileNameOwner.set(file, byOwner);
        }
        const { calls, negated } = partitionNegatedCalls(m.calls);
        const union = tsCallsByName.get(m.name) ?? new Set<string>();
        for (const c of calls) union.add(c);
        tsCallsByName.set(m.name, union);
        const negatedUnion = tsNegatedCallsByName.get(m.name) ?? new Set<string>();
        for (const c of negated) negatedUnion.add(c);
        tsNegatedCallsByName.set(m.name, negatedUnion);
      }
    };

    if (tsPkg) {
      const addMethods = (cls: ClassInfo) => {
        const file = cls.file || "";
        const methods = tsMethodsByFile.get(file) || new Set();
        for (const m of [...cls.instanceMethods, ...cls.classMethods]) {
          if (tsShouldInclude(m)) {
            methods.add(m.name);
            recordTsParams(m, file, "package", cls.name);
          }
        }
        tsMethodsByFile.set(file, methods);
      };

      for (const cls of Object.values(tsPkg.classes)) addMethods(cls);
      for (const mod of Object.values(tsPkg.modules)) addMethods(mod);

      // Include file-level functions (top-level exports not in any class/interface)
      if (tsPkg.fileFunctions) {
        for (const [file, fns] of Object.entries(tsPkg.fileFunctions)) {
          const methods = tsMethodsByFile.get(file) || new Set();
          for (const fn of fns) {
            if (tsShouldInclude(fn)) {
              methods.add(fn.name);
              recordTsParams(fn, file);
            }
          }
          tsMethodsByFile.set(file, methods);
        }
      }
    }

    // A Ruby file whose port lives in a SIBLING package
    // (`RUBY_FILE_CROSS_PACKAGE_OVERRIDES` — trails' one `railtie.rb` per
    // framework ports to `packages/trailties/src/trailties/<framework>.ts`).
    // Index that file's members under this package's key for the Ruby file, so
    // the row is scored against the real port rather than a file that will
    // never exist here.
    for (const rubyFile of crossPackageRubyFiles(pkg)) {
      const cross = rubyFileCrossPackageOverride(rubyFile, pkg)!;
      const foreign = ts.packages[cross.pkg];
      if (!foreign) continue;
      const key = rubyFileToTs(rubyFile, pkg);
      const methods = tsMethodsByFile.get(key) || new Set<string>();
      for (const ent of [...Object.values(foreign.classes), ...Object.values(foreign.modules)]) {
        if (ent.file !== cross.tsFile) continue;
        for (const m of [...ent.instanceMethods, ...ent.classMethods]) {
          if (tsShouldInclude(m)) {
            methods.add(m.name);
            recordTsParams(m, key, "package", ent.name);
          }
        }
      }
      for (const fn of foreign.fileFunctions?.[cross.tsFile] ?? []) {
        if (tsShouldInclude(fn)) {
          methods.add(fn.name);
          recordTsParams(fn, key);
        }
      }
      tsMethodsByFile.set(key, methods);
    }

    // Also pool signatures from dep packages: the inherited-method walk below
    // adds dep-parent method NAMES to tsMethodsByFile (so a Ruby method can
    // match an inherited dep method), and without the signature here its arity
    // would be silently skipped. Matching is unchanged; only the pool grows.
    for (const depKey of blazetrailsDepKeys(pkg)) {
      const depPkg = ts.packages[depKey];
      if (!depPkg) continue;
      for (const ent of [...Object.values(depPkg.classes), ...Object.values(depPkg.modules)]) {
        for (const m of [...ent.instanceMethods, ...ent.classMethods]) {
          if (tsShouldInclude(m)) recordTsParams(m, m.file ?? "", "dep", ent.name);
        }
      }
      for (const fns of Object.values(depPkg.fileFunctions ?? {})) {
        for (const fn of fns) if (tsShouldInclude(fn)) recordTsParams(fn, fn.file ?? "", "dep");
      }
    }

    // Propagate inherited methods transitively: follows both class `superclass`
    // and interface/module `extends` chains.
    let ambiguousParentCount = 0;
    if (tsPkg) {
      // Key by short name → entity for superclass/extends resolution.
      // Includes dep-package entities so walks can cross package boundaries
      // (e.g. AR Base extends AM Model).
      const foreignEntities = new Set<ClassInfo>();
      const entityPackages = new Map<ClassInfo, string>();
      const entitiesByName = buildEntitiesByName(pkg, ts, foreignEntities, entityPackages);

      const entityKey = (e: ClassInfo) => `${e.file}:${e.name}`;

      const ambiguousParents = new Map<string, number>();

      const resolveParent = (name: string, childFile: string, declFile?: string) =>
        resolveEntityByDeclaringFile(
          entitiesByName.get(name) || [],
          childFile,
          declFile,
          (cands) => ambiguousParents.set(name, cands.length),
          (c) => foreignEntities.has(c),
          (c) => entityPackages.get(c),
        );

      const inheritedCache = new Map<string, Set<string>>();
      const getInherited = (entity: ClassInfo, visited: Set<string>): Set<string> => {
        const key = entityKey(entity);
        const cached = inheritedCache.get(key);
        if (cached) return cached;
        if (visited.has(key)) return new Set();
        visited.add(key);

        const methods = new Set<string>();
        for (const m of [...entity.instanceMethods, ...entity.classMethods]) {
          if (tsShouldInclude(m)) methods.add(m.name);
        }

        if (entity.superclass) {
          const parent = resolveParent(entity.superclass, entity.file || "", entity.superclassFile);
          if (parent) {
            for (const m of getInherited(parent, visited)) methods.add(m);
          }
        }

        for (const ext of entity.extends || []) {
          const parent = resolveParent(ext, entity.file || "", entity.extendsFiles?.[ext]);
          if (parent) {
            for (const m of getInherited(parent, visited)) methods.add(m);
          }
        }

        inheritedCache.set(key, methods);
        return methods;
      };

      for (const entity of [...Object.values(tsPkg.classes), ...Object.values(tsPkg.modules)]) {
        if (!entity.file) continue;
        const allMethods = getInherited(entity, new Set());
        const fileMethods = tsMethodsByFile.get(entity.file) || new Set();
        for (const m of allMethods) {
          fileMethods.add(m);
        }
        tsMethodsByFile.set(entity.file, fileMethods);
      }

      ambiguousParentCount = ambiguousParents.size;
      if (ambiguousParents.size > 0) {
        const names = [...ambiguousParents.keys()].sort((a, b) => a.localeCompare(b));
        console.warn(
          `[parity:api] ${pkg}: ${names.length} ambiguous parent name(s) — every candidate ` +
            `shares zero leading path segments with the child, so the inheritance walk ` +
            `followed none: ${names.join(", ")}`,
        );
      }
    }

    // Collect all Ruby classes and modules with their methods
    const allRuby = collectRubyEntities(rubyPkg);

    const inheritanceClassPerFile = primaryClassesPerFile(
      rubyPkg.classes as unknown as Record<string, ClassInfo>,
    );

    // Build module FQN → short name mapping for include resolution.
    // Ruby `include Predications` uses the short name, but the module FQN
    // might be `Arel::Predications`. Build both short and full lookups.
    const moduleFqnByShort = new Map<string, string[]>();
    for (const [fqn] of Object.entries(rubyPkg.modules)) {
      const short = fqn.split("::").pop()!;
      const list = moduleFqnByShort.get(short) || [];
      list.push(fqn);
      moduleFqnByShort.set(short, list);
    }

    // For each Ruby module, find the TS files of classes/modules that include it.
    // Resolved transitively: if Base includes Scoping and Scoping includes Named,
    // Named's methods should also be checked against base.ts.

    // Step 1: build direct include/extend graph (module FQN → includer FQNs)
    const allClassesAndModules = [
      ...Object.entries(rubyPkg.classes).map(([fqn, info]) => ({
        fqn,
        info: info as unknown as ClassInfo,
      })),
      ...Object.entries(rubyPkg.modules).map(([fqn, info]) => ({
        fqn,
        info: info as unknown as ClassInfo,
      })),
    ];
    const fqnToFile = new Map<string, string>();
    for (const { fqn, info } of allClassesAndModules) {
      if (info.file) fqnToFile.set(fqn, info.file);
    }
    const moduleIncluderFqns = buildModuleIncluderFqns(allClassesAndModules, moduleFqnByShort);

    // Step 2: transitively resolve includer files (DFS with memoization)
    const moduleIncluderFiles = new Map<string, Set<string>>();
    const resolveIncluderFiles = (modFqn: string, visited: Set<string>): Set<string> => {
      const cached = moduleIncluderFiles.get(modFqn);
      if (cached) return cached;
      if (visited.has(modFqn)) return new Set();
      visited.add(modFqn);

      const files = new Set<string>();
      const includers = moduleIncluderFqns.get(modFqn);
      if (includers) {
        for (const incFqn of includers) {
          const file = fqnToFile.get(incFqn);
          if (file) files.add(rubyFileToTs(file, pkg));
          // Transitively: if incFqn is also a module, its includers count too
          for (const f of resolveIncluderFiles(incFqn, visited)) {
            files.add(f);
          }
        }
      }

      moduleIncluderFiles.set(modFqn, files);
      return files;
    };

    for (const [fqn] of Object.entries(rubyPkg.modules)) {
      resolveIncluderFiles(fqn, new Set());
    }

    // Group by Ruby file
    const byFile = new Map<string, typeof allRuby>();
    const excludedFiles = new Set<string>();
    for (const entity of allRuby) {
      for (const item of splitOverriddenFileBuckets(entity)) {
        const file = item.info.file || "unknown.rb";
        if (isSourceUnported(file, pkg)) {
          excludedFiles.add(file);
          continue;
        }
        const list = byFile.get(file) || [];
        list.push(item);
        byFile.set(file, list);
      }
    }

    // Resolve package src directory for file existence checks
    const pkgSrcDir = packageSrcDir(pkg);
    // A cross-package port's file lives under the SIBLING package's src dir.
    const crossPackageSrcPath = (rubyFile: string): string | undefined => {
      const cross = rubyFileCrossPackageOverride(rubyFile, pkg);
      return cross ? path.join(packageSrcDir(cross.pkg), cross.tsFile) : undefined;
    };

    // Reverse index: TS method name → list of TS files defining it.
    // Used as a last-resort fallback when a Ruby file's expected TS path
    // doesn't exist but a sibling file in the same package implements
    // most of its methods (e.g. trailties' `commands/server/server_command.rb`
    // is implemented at `commands/server.ts`). Surfaces as a "misplaced"
    // file in the summary, mirroring how parity:test flags misplaced tests.
    const tsFilesByMethod = new Map<string, Set<string>>();
    for (const [tsFile, methods] of tsMethodsByFile) {
      for (const m of methods) {
        let set = tsFilesByMethod.get(m);
        if (!set) {
          set = new Set();
          tsFilesByMethod.set(m, set);
        }
        set.add(tsFile);
      }
    }

    // Compare methods per file
    let totalMatched = 0;
    let totalMissing = 0;
    let totalFiles = 0;
    let filesExist = 0;
    let totalMisplaced = 0;
    let paramNamesCompared = 0;
    const paramNameMismatches: ParamNameMismatch[] = [];
    let arityCompared = 0;
    let arityForwardingSkipped = 0;
    let arityExcluded = 0;
    const arityMismatches: ArityMismatch[] = [];
    let optionKeysCompared = 0;
    const optionKeyMismatches: OptionKeyMismatch[] = [];
    let literalsCompared = 0;
    let literalsSkipped = 0;
    const literalMismatches: LiteralMismatch[] = [];
    let callsCompared = 0;
    const callMismatches: CallMismatch[] = [];
    const callTagsUsed = new Map<string, Set<string>>();
    // The same, for the call-ARGUMENT tags: a tag that never suppressed a
    // mismatch is STALE, the only-shrink half `@missingRailsCall` already has.
    const argTagsUsed = new Map<string, Set<string>>();
    const suppressedCalls: SuppressedCall[] = [];
    // The call-ARGUMENT twin, reported in that artifact for the same reason:
    // its receipts carry a permanence claim and are a population of their own.
    const suppressedArgCalls: SuppressedCall[] = [];
    const callSkeletons: CallSkeleton[] = [];
    let callArgsCompared = 0;
    const callArgsSkipped = emptySkipTally();
    const callArgMismatches: CallArgMismatch[] = [];
    const bodyHashRecords: BodyHashRecord[] = [];
    const fileResults: FileResult[] = [];

    for (const [rubyFile, items] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const expectedTs = rubyFileToTs(rubyFile, pkg);
      const tsMethods = tsMethodsByFile.get(expectedTs) || new Set<string>();
      const tsFileExists = fs.existsSync(
        crossPackageSrcPath(rubyFile) ?? path.join(pkgSrcDir, expectedTs),
      );
      const missingMethods: MethodResult[] = [];
      const moves: MoveResult[] = [];
      let fileMatched = 0;
      let fileMissing = 0;
      const declarationOnly: MethodResult[] = [];

      // Includer method sets per OWNING entity, tracking which file each set
      // came from (for move detection). Keyed by owner rather than pooled per
      // file: a Ruby file often holds several entities, and a method of one
      // must not be credited to a TS file that includes a SIBLING. Rails'
      // http/content_security_policy.rb holds both a `Request` module that
      // ActionDispatch::Request includes and a `Middleware` class that nothing
      // includes; pooled, `Middleware#call` was credited to http/request.ts,
      // whose only `call` is `PASS_NOT_FOUND`'s (request.rb:82) — an unrelated
      // body the call gates then compared against.
      const includerMethodSetsByOwner = new Map<string, { file: string; methods: Set<string> }[]>();
      for (const item of items) {
        const sets: { file: string; methods: Set<string> }[] = [];
        for (const f of moduleIncluderFiles.get(item.fqn) ?? []) {
          const methods = tsMethodsByFile.get(f);
          if (methods) sets.push({ file: f, methods });
        }
        if (sets.length > 0) includerMethodSetsByOwner.set(item.fqn, sets);
      }

      // Deduplicate: collect all unique Ruby methods expected from this
      // file (keyed by Ruby method name, not first TS candidate, so two
      // distinct Ruby methods that camelize to the same first candidate
      // — e.g. `is_number?` and `number?` both → "isNumber" — both
      // survive). Multiple Ruby classes in the same file often define
      // the same method (e.g., 8 subclasses in binary.rb each override
      // `invert`). Count once.
      const seen = new Map<string, SeenRubyMethod>();
      // First-sighting Ruby params per name (mirrors `seen`'s dedup) for arity.
      const rubyParamsByName = new Map<string, ParamInfo[]>();
      // Names whose first-sighting Ruby entry is a forwarding-macro placeholder
      // (see arity.ts). Recorded in lockstep with rubyParamsByName so the verdict
      // always describes the very params the arity check would compare.
      const rubyForwardingNames = new Set<string>();
      // First-sighting Ruby option keys per name (mirrors rubyParamsByName).
      const rubyOptionKeysByName = new Map<string, string[]>();
      // First-sighting Ruby body call-set per name (advisory calls-parity check).
      const rubyCallsByName = new Map<string, string[]>();
      // Same first-sighting keying: the inert-receiver subset of that call-set
      // (RFC 0083), subtracted in calls runs only.
      const rubyWeakCallsByName = new Map<string, string[]>();
      // Same first-sighting keying: the receiver kinds each call name's sites
      // had (RFC 0129), which the ruby-compat half of `jsEnumerableAliases`
      // needs to tell `options.fetch` from `cache.fetch`.
      const rubyCallReceiversByName = new Map<string, Record<string, string[]>>();
      // First-sighting Ruby body digest per name (source-hash pinning, RFC 0025).
      const rubyBodyDigestByName = new Map<string, string>();
      const rubySkeletonByName = new Map<string, string[]>();
      const rubyCallArgsByName = new Map<string, CallSite[]>();
      // The same two populations keyed by (declaring class, name): one Ruby FILE
      // can declare a name twice, and first-sighting keying then hands the first
      // one's body to BOTH matched pairs.
      const rubyOwnersByName = new Map<string, Set<string>>();
      const rubyCallsByOwnerName = new Map<
        string,
        { calls: string[]; weak: string[]; receivers: Record<string, string[]> }
      >();
      const rubyCallArgsByOwnerName = new Map<string, CallSite[]>();
      const rubyReaderNames = new Set<string>();
      const rubyOwnerShortNames = new Set<string>();
      const rubyOwnersDefiningInitialize = new Set<string>();
      // (owner, name) pairs the extractor bucketed as CLASS methods — the
      // singleton seat wherever the owner FQN does not already say so (see
      // rubyOwnerSeat).
      const rubyKlassOwnerNames = new Set<string>();
      const ownerKey = (owner: string, name: string) => `${owner}\u0000${name}`;
      for (const item of items) {
        const f = flattenIncludedMethodInfos(item.info, item.fqn, rubyPkg, moduleFqnByShort, pkg);
        const rubyMethods = [...f.instance, ...f.klass];
        const klassNames = new Set(f.klass.map((rm) => rm.name));
        const itemShort = item.fqn.split("::").at(-1) ?? item.fqn;
        rubyOwnerShortNames.add(itemShort);
        if (rubyMethods.some((rm) => rm.name === "initialize")) {
          rubyOwnersDefiningInitialize.add(itemShort);
        }
        for (const rm of rubyMethods) {
          // Collected ahead of the mode filter: a Rails `attr_reader` is
          // usually private while the bodies reading it are public, so a
          // public-mode run would otherwise never see the declaration.
          if (rm.reader) rubyReaderNames.add(ownerKey(item.fqn, rm.name));
          if (!methodMatchesMode(rm)) continue;
          dedupeRubyMethodInto(seen, rm, item.fqn, rubyFile);
          if (!rubyParamsByName.has(rm.name)) {
            rubyParamsByName.set(rm.name, rm.params);
            if (isForwardingRubyEntry(rm)) rubyForwardingNames.add(rm.name);
          }
          if (rm.option_keys && !rubyOptionKeysByName.has(rm.name)) {
            rubyOptionKeysByName.set(rm.name, rm.option_keys);
          }
          rubyOwnersByName.set(
            rm.name,
            (rubyOwnersByName.get(rm.name) ?? new Set<string>()).add(item.fqn),
          );
          if (klassNames.has(rm.name)) rubyKlassOwnerNames.add(ownerKey(item.fqn, rm.name));
          if (rm.calls && !rubyCallsByName.has(rm.name)) {
            rubyCallsByName.set(rm.name, rm.calls);
            rubyWeakCallsByName.set(rm.name, rm.weakCalls ?? []);
            rubyCallReceiversByName.set(rm.name, rm.callReceivers ?? {});
          }
          if (rm.calls && !rubyCallsByOwnerName.has(ownerKey(item.fqn, rm.name))) {
            rubyCallsByOwnerName.set(ownerKey(item.fqn, rm.name), {
              calls: rm.calls,
              weak: rm.weakCalls ?? [],
              receivers: rm.callReceivers ?? {},
            });
          }
          if (rm.callArgs && !rubyCallArgsByOwnerName.has(ownerKey(item.fqn, rm.name))) {
            rubyCallArgsByOwnerName.set(ownerKey(item.fqn, rm.name), rm.callArgs);
          }
          if (rm.skeleton && !rubySkeletonByName.has(rm.name)) {
            rubySkeletonByName.set(rm.name, rm.skeleton);
          }
          if (rm.callArgs && !rubyCallArgsByName.has(rm.name)) {
            rubyCallArgsByName.set(rm.name, rm.callArgs);
          }
          if (rm.bodyDigest && !rubyBodyDigestByName.has(rm.name)) {
            rubyBodyDigestByName.set(rm.name, rm.bodyDigest);
          }
        }
      }

      // Advisory option-key check: diff the Ruby method's consumed option
      // symbols against the TS options-object keys (see options-keys.ts).
      const checkOptionKeys = (rubyName: string, tsName: string, tsFile: string) => {
        const rubyKeys = rubyOptionKeysByName.get(rubyName);
        if (!rubyKeys) return;
        const candidates = tsOptionKeysByFileName.get(tsFile)?.get(tsName);
        if (!candidates || candidates.length === 0) return;
        const positionalParams = (rubyParamsByName.get(rubyName) ?? [])
          .filter((p) => p.kind === "required" || p.kind === "optional")
          .map((p) => p.name);
        const verdict = matchOptionKeysAgainst(rubyKeys, candidates, positionalParams);
        if (!verdict.comparable) return;
        optionKeysCompared++;
        if (verdict.missingInTs.length === 0 && verdict.extraInTs.length === 0) return;
        optionKeyMismatches.push({
          rubyFile,
          tsFile,
          rubyName,
          tsName,
          missingInTs: verdict.missingInTs,
          extraInTs: verdict.extraInTs,
        });
      };

      // Advisory literal-default check (literals.ts); shares matched pairs with arity.
      const checkLiterals = (rubyName: string, tsName: string, tsFile: string) => {
        const rubyParams = rubyParamsByName.get(rubyName);
        if (!rubyParams) return;
        const candidates = tsParamsByFileNameInPkg.get(tsFile)?.get(tsName) ?? [];
        if (candidates.length === 0) return;
        const res = compareDefaults(rubyParams, candidates);
        literalsCompared += res.compared;
        literalsSkipped += res.skipped;
        for (const m of res.mismatches) {
          literalMismatches.push({ rubyFile, tsFile, ...m, kind: "default" });
        }
      };

      // The one TS member a matched pair is held to (see resolveTsOwner), and
      // whether the pairing stayed ambiguous — in which case the gates record
      // nothing rather than compare against a member this Ruby body did not
      // port to.
      // Resolved twice where the full population leaves it ambiguous — see
      // `ownersWithBodies` for why the retry runs second.
      const resolveOwner = (
        rubyName: string,
        tsName: string,
        tsFile: string,
        rubyModule: string,
      ): {
        tsClass: string | undefined;
        ambiguous: boolean;
        tsOwners: ReadonlySet<string> | undefined;
      } => {
        const declared = tsOwnersByFileName.get(tsFile)?.get(tsName);
        const bodied = ownersWithBodies(
          declared,
          tsBodylessOwnersByFileName.get(tsFile)?.get(tsName),
          tsBodiedOwnersByFileName.get(tsFile)?.get(tsName),
        );
        const first = resolveOwnerIn(declared, rubyName, tsName, tsFile, rubyModule);
        if (!first.ambiguous || bodied === declared) return { ...first, tsOwners: declared };
        const retry = resolveOwnerIn(bodied, rubyName, tsName, tsFile, rubyModule);
        return retry.ambiguous ? { ...first, tsOwners: declared } : { ...retry, tsOwners: bodied };
      };

      const resolveOwnerIn = (
        tsOwners: ReadonlySet<string> | undefined,
        rubyName: string,
        tsName: string,
        tsFile: string,
        rubyModule: string,
      ): { tsClass: string | undefined; ambiguous: boolean } => {
        const rubySeatOf = (rubyOwner: string) =>
          rubyOwnerSeat(rubyOwner, rubyKlassOwnerNames.has(ownerKey(rubyOwner, rubyName)));
        const rubySeat = rubySeatOf(rubyModule);
        const seatOf = (tsOwner: string) =>
          tsOwnerSeat(
            tsOwner,
            tsStaticOwnersByFileName.get(tsFile)?.get(tsName),
            tsInstanceOwnersByFileName.get(tsFile)?.get(tsName),
          );
        const rubyOwners = rubyOwnersByName.get(rubyName);
        const rubySeats = new Set([...(rubyOwners ?? [])].map(rubySeatOf));
        const tsClass = resolveTsOwner(tsOwners, rubyModule, {
          hosts: includeHosts(tsFile, rubyModule),
          seatOf,
          rubySeat,
          rubySeats,
          callSetOf: (tsOwner) => tsCallsByFileNameOwner.get(tsFile)?.get(tsName)?.get(tsOwner),
          writerOf: (tsOwner) =>
            tsWriterOwnersByFileName.get(tsFile)?.get(tsName)?.has(tsOwner) ?? false,
          rubyIsWriter: RUBY_WRITER_NAME.test(rubyName),
        });
        const tsSeat = tsClass === undefined ? undefined : seatOf(tsClass);
        const ambiguous =
          ambiguousTsOwner(tsOwners, tsClass) ||
          ambiguousRubyOwner(rubyOwners, tsOwners, {
            rubySeat,
            tsSeat,
            rubyOwnersOnTsSeat: [...(rubyOwners ?? [])].filter((o) => rubySeatOf(o) === tsSeat)
              .length,
          });
        return { tsClass, ambiguous };
      };

      // Advisory calls-parity check: for a name-matched pair, flag Ruby body
      // calls that (a) map by naming convention to a method we ported and
      // (b) are absent from the TS body's call-set. A coarse body-fidelity
      // signal — never affects the parity %. Lossy: legitimate restructuring
      // (extracted helper, inlined call) shows up here, so it's advisory.
      const checkCalls = (rubyName: string, tsName: string, tsFile: string, rubyModule: string) => {
        // The call set is computed only under `--calls`, the mode that
        // writes and gates the artifact (see the artifact write below).
        if (!callsGate) return;
        const rubyOwned =
          (rubyOwnersByName.get(rubyName)?.size ?? 0) > 1
            ? rubyCallsByOwnerName.get(ownerKey(rubyModule, rubyName))
            : {
                calls: rubyCallsByName.get(rubyName) ?? [],
                weak: rubyWeakCallsByName.get(rubyName) ?? [],
                receivers: rubyCallReceiversByName.get(rubyName) ?? {},
              };
        // A body whose every Ruby call is weak still gets compared:
        // significantMissingCalls returns empty for an empty `rubyCalls`, so the
        // pair is counted and found clean rather than leaving the population.
        // Returning early here keyed the denominator on the RUBY side alone, so
        // converging a false-positive class read as LOST coverage (RFC 0108).
        const rubyCalls = dropWeakCalls(rubyOwned?.calls, rubyOwned?.weak);
        const { tsClass, ambiguous, tsOwners } = resolveOwner(rubyName, tsName, tsFile, rubyModule);
        if (ambiguous) return;
        if (
          ownerRecordsNothing(
            tsCallsByFileNameOwner,
            tsFile,
            tsName,
            tsClass,
            tsOwners,
            tsBodylessOwnersByFileName.get(tsFile)?.get(tsName),
          )
        ) {
          return;
        }
        const tsCandidateSets = tsCallsByFileName.get(tsFile)?.get(tsName);
        if (!tsCandidateSets || tsCandidateSets.length === 0) return;
        // Helper extraction / delegation transparency: the body is compared
        // against the calls of the same-file helpers it reaches, and a one-line
        // forwarder against the method it forwards to (see effectiveTsCalls).
        const own = partitionNegatedCalls(tsCandidateSets.flat());
        const sameFile = sameFilePartition(tsFile);
        const sameFileCalls = (n: string) => sameFile.get(n)?.calls;
        const reached = reachedSameFileMethods(
          tsName,
          own.calls,
          sameFileCalls,
          SAME_FILE_CLOSURE_DEPTH,
          (n) => (n === tsName ? own.foreignReads : sameFile.get(n)?.foreignReads),
        );
        const effective = effectiveTsCalls(
          tsName,
          own.calls,
          (n) => tsCallsByName.get(n),
          sameFileCalls,
          reached,
        );
        const graphCalls = includeGraphCalls(tsFile, tsName);
        const tsCalls =
          graphCalls.calls.size === 0 ? effective : new Set([...effective, ...graphCalls.calls]);
        // A body compared against a helper's calls inherits its negated ones
        // too, or the helper's `!xs.includes(y)` would not count — same for a
        // wrapper and its delegate.
        const negatedTsCalls = new Set(own.negated);
        for (const n of reached) {
          for (const c of sameFile.get(n)?.negated ?? []) negatedTsCalls.add(c);
        }
        if (isDelegatingWrapper(tsName, own.calls)) {
          for (const c of tsNegatedCallsByName.get(tsName) ?? []) negatedTsCalls.add(c);
        }
        for (const c of graphCalls.negated) negatedTsCalls.add(c);
        callsCompared++;
        const missing = significantMissingCalls(
          rubyName,
          rubyCalls,
          tsCalls,
          // A `this:` receiver is not an argument — counting it would
          // promote zero-arg readers (`spawn`, `readonlyAttributeQ`) past the
          // gate the moment alias bindings started carrying real params.
          (c) => portedWithArgsSigs(tsFile, c).some((sig) => stripThis(sig).length > 0),
          rubyMethodToTs,
          callsSignificant,
          (rc) => jsEnumerableAliases(rc, rubyOwned?.receivers?.[rc]),
          negatedTsCalls,
          rubyOwned?.calls ?? rubyCalls,
        );
        const rubySkeleton = rubySkeletonByName.get(rubyName);
        const tsSkeletons = tsSkeletonByFileName.get(tsFile)?.get(tsName);
        if (rubySkeleton !== undefined && tsSkeletons?.length === 1) {
          callSkeletons.push({
            rubyFile,
            rubyName,
            tsFile,
            tsName,
            ruby: foldSkeletonTokens(rubySkeleton),
            ts: foldSkeletonTokens(tsSkeletons[0]),
          });
        }
        const seqSets = tsCallSeqByFileName.get(tsFile)?.get(tsName);
        const ordered: string[] = [];
        if (seqSets?.length === 1 && !isDelegatingWrapper(tsName, own.calls)) {
          ordered.push(
            ...reorderedCalls(
              rubyName,
              rubyCalls,
              [...partitionNegatedCalls(seqSets[0]).calls],
              (c) => portedWithArgsSigs(tsFile, c).some((sig) => stripThis(sig).length > 0),
              rubyMethodToTs,
              callsSignificant,
              rubyOwned?.calls ?? rubyCalls,
            ),
          );
        }
        const tags = tagsForOwner(tsMissingCallTagsByFileName.get(tsFile)?.get(tsName), tsClass);
        const tsDeclFile = declFileFor(tsDeclFileByFileNameOwner, tsFile, tsName, tsClass);
        let flagged = [...missing, ...ordered];
        if (tags !== undefined && tags.size > 0) {
          const tagKey = callTagKey(tsFile, tsClass ?? "*", tsName);
          const used = callTagsUsed.get(tagKey) ?? callTagsUsed.set(tagKey, new Set()).get(tagKey)!;
          const applied = applyCallTags(flagged, tags, used);
          flagged = applied.kept;
          for (const s of applied.suppressed) {
            suppressedCalls.push({ tsFile, rubyName, tsName, tsClass, tsDeclFile, ...s });
          }
        }
        if (flagged.length === 0) return;
        const flaggedReceivers: Record<string, string[]> = {};
        for (const f of flagged) {
          const call = callOf(f);
          const kinds = rubyOwned?.receivers?.[call];
          if (kinds) flaggedReceivers[call] = kinds;
        }
        callMismatches.push({
          rubyFile,
          tsFile,
          rubyName,
          tsName,
          tsClass,
          tsDeclFile,
          missing: flagged,
          ...(Object.keys(flaggedReceivers).length > 0 ? { receivers: flaggedReceivers } : {}),
        });
      };

      // Advisory call-argument check (RFC 0095), on the pair checkCalls
      // receives; computed only under `--calls`, the mode that writes it.
      const checkCallArgs = (
        rubyName: string,
        tsName: string,
        tsFile: string,
        rubyModule: string,
      ) => {
        if (!callsGate) return;
        // Near the exclusion checkCalls makes through `dropWeakCalls`: a call on
        // an inert receiver (`xs.map`, `opts.fetch`) collides by name with an
        // unrelated ported method and says nothing about the port. Decided per
        // SITE, on the flag extract-ruby-api.rb#record_call_site records from
        // `inert_receiver?` — the call-set gate has no per-site identity and can
        // only drop whole NAMES, but here a name that is weak at one site and a
        // genuine call at another would lose both sites to a name filter. See
        // {@link comparableRubySites} below for when a weak site is kept.
        const rubyOwnSites =
          (rubyOwnersByName.get(rubyName)?.size ?? 0) > 1
            ? rubyCallArgsByOwnerName.get(ownerKey(rubyModule, rubyName))
            : rubyCallArgsByName.get(rubyName);
        // Also dropped: a receiver-less zero-arg read of an `attr_reader` name.
        // Ruby spells such a read exactly like a call, so `if foreign_key`
        // (schema_definitions.rb:241) arrives as a second, zero-arg
        // `foreign_key` site beside the body's real `table.foreign_key(...)`
        // (:242) — and the port, carrying the reader as a FIELD, has only the
        // real one. Left in, the pairing hands the guard read the port's
        // genuine call and manufactures a shape row for a correct body.
        const rubyReadableSites = rubyOwnSites?.filter(
          (s) =>
            !(
              s.args.length === 0 &&
              s.recv === undefined &&
              rubyReaderNames.has(ownerKey(rubyModule, s.name))
            ),
        );
        if (!rubyReadableSites || rubyReadableSites.length === 0) return;
        // Two overloads/overrides under one (file, name) give no ground for
        // choosing whose call sites the Ruby ones pair against — as for a
        // skeleton record, only an unambiguous TS body compares.
        const { tsClass, ambiguous, tsOwners } = resolveOwner(rubyName, tsName, tsFile, rubyModule);
        if (ambiguous) return;
        if (
          ownerRecordsNothing(
            tsCallArgsByFileNameOwner,
            tsFile,
            tsName,
            tsClass,
            tsOwners,
            tsBodylessOwnersByFileName.get(tsFile)?.get(tsName),
          )
        ) {
          return;
        }
        const tsSites = ownerCallArgSites(
          tsCallArgsByFileNameOwner,
          tsCallArgsByFileName,
          tsFile,
          tsName,
          tsClass,
        );
        if (tsSites === undefined) return;
        // `rubyOwnersByName` is built per Ruby FILE, a few lines up: its keys are
        // the names THIS file (with its included modules flattened in) declares.
        const rubySites = comparableRubySites(rubyReadableSites, tsSites, (name) =>
          rubyOwnersByName.has(name),
        );
        if (rubySites.length === 0) return;
        const argTags = tagsForOwner(tsMissingArgTagsByFileName.get(tsFile)?.get(tsName), tsClass);
        for (const { ruby, ts } of pairCallSites(rubySites, tsSites)) {
          const result = compareCallArgs(
            ruby,
            ts,
            rubyName,
            portedWithArgsSigs(tsFile, ts.name),
            rubyParamsByName.get(ruby.name),
          );
          if (result.verdict === "skip") {
            callArgsSkipped[result.reason]++;
            continue;
          }
          callArgsCompared++;
          if (result.verdict !== "mismatch") continue;
          // A call-site receipt (`@missingRailsArgs <call> — <reason>`) takes
          // this deviation off the baseline: the reason is reviewed in the diff
          // where the code is, exactly as `@missingRailsCall` does for the
          // call-SET gate.
          if (argTags?.has(ruby.name)) {
            const tagKey = callTagKey(tsFile, tsClass ?? "*", tsName);
            (argTagsUsed.get(tagKey) ?? argTagsUsed.set(tagKey, new Set()).get(tagKey)!).add(
              ruby.name,
            );
            suppressedArgCalls.push({
              tsFile,
              rubyName,
              tsName,
              tsClass,
              call: ruby.name,
              reason: argTags.get(ruby.name) ?? "",
            });
            continue;
          }
          callArgMismatches.push({
            rubyFile,
            tsFile,
            rubyName,
            tsName,
            call: ruby.name,
            class: result.class,
            rubyArgs: result.rubyArgs,
            tsArgs: result.tsArgs,
          });
        }
      };

      // Advisory arity check for one name-matched pair: flag when the Ruby and
      // TS positional-arg ranges don't overlap (see arity.ts). Also drives the
      // option-key check, which shares the same matched (ruby, ts) pairs.
      // Source-hash pinning (RFC 0025): record the current normalized Ruby body
      // digest for this matched pair, keyed by (rubyFile, rubyName). The pin
      // manifest (body-pins.json) opts specific pairs in; lint-body-pins.ts
      // diffs the pinned digests against this artifact to flag upstream drift.
      const checkBody = (rubyName: string, tsName: string, tsFile: string) => {
        const digest = rubyBodyDigestByName.get(rubyName);
        if (!digest) return;
        bodyHashRecords.push({ rubyFile, rubyName, tsFile, tsName, digest });
      };

      const checkArity = (
        rubyName: string,
        tsName: string,
        tsFile: string,
        rubyModule = "",
        // A pair whose TS side is not this Ruby method's counterpart at all —
        // an `include` seam forwarding to the file that mirrors the mixin, or
        // a Ruby writer that landed on the reader's body. Only the CALL gates
        // read a body, so only they are skipped; arity, option keys, literals
        // and the body pin all still compare the pair by signature.
        skipCalls = false,
        // The TS file was reached by the misplaced-cluster GUESS rather than the
        // conventional path, so the pairing is not evidence of a rename and no
        // rename can close a row it produces (`renderer/object_renderer.rb`
        // guessed onto `abstract-renderer.ts` reported two). Parameter NAMES are
        // skipped for it; every other check still compares the pair.
        guessedFile = false,
      ) => {
        checkOptionKeys(rubyName, tsName, tsFile);
        checkLiterals(rubyName, tsName, tsFile);
        if (!skipCalls) {
          checkCalls(rubyName, tsName, tsFile, rubyModule);
          checkCallArgs(rubyName, tsName, tsFile, rubyModule);
        }
        checkBody(rubyName, tsName, tsFile);
        if (isArityOverridden(rubyName, rubyFile)) return;
        // Ruby writers (`foo=`) map to a TS setter/assignable property; the name
        // match already confirms it exists and arity isn't meaningful here.
        if (rubyName.endsWith("=")) return;
        const rubyParams = rubyParamsByName.get(rubyName);
        if (!rubyParams) return;
        // Every signature recorded for this TS name; a pair matches when it
        // overlaps ANY (see tsParamsByName above for why this is global).
        const candidates = tsParamsByName.get(tsName) ?? [];
        if (candidates.length === 0) return;
        // Parameter NAMES (param-names.ts) — a separate finding from arity, and
        // measured on the same matched pairs: a port that keeps Ruby's arg count
        // and renames every arg is 100% on arity and 0% here. Only pairs that
        // line up positionally are compared, so a length disagreement stays
        // arity's row rather than being charged twice.
        if (
          !rubyForwardingNames.has(rubyName) &&
          !guessedFile &&
          !predicatePairedWithBareTwin(rubyName, tsName, twinRubyNames)
        ) {
          // Scoped per-FILE, unlike arity's global pool: a name is only weak
          // evidence of identity for parameter SPELLINGS. `initialize` pools
          // every constructor in the package, so `Table#initialize(name, as:,
          // klass:, type_caster:)` would align against an unrelated 4-arg
          // constructor and report three renames that exist nowhere.
          let fileCandidates = tsParamsByFileNameInPkg.get(tsFile)?.get(tsName) ?? [];
          if (tsName === "constructor") {
            const byOwner = tsParamsByFileOwnerNameInPkg.get(tsFile);
            if (byOwner) {
              fileCandidates = [];
              for (const [key, sigs] of byOwner) {
                const [owner, name] = key.split("#");
                if (name !== tsName) continue;
                if (
                  isNestedConstructorHomonym(
                    owner,
                    rubyOwnerShortNames,
                    rubyOwnersDefiningInitialize,
                  )
                ) {
                  continue;
                }
                fileCandidates.push(...sigs);
              }
            }
          }
          // A clean candidate anywhere in the file settles the pair: which
          // declaration carries Rails' identifiers (the `this`-typed function,
          // the interface re-declaring it, the class assigning it) is the mixin
          // idiom's business. Only when nothing aligns cleanly does the owner
          // decide, so the nearest-fitting SIBLING CLASS cannot stand in —
          // `OutputBuffer#capture(*args)` reported `args → fn` off
          // `StreamingBuffer#capture(fn)` (buffers.rb:72,126).
          let verdict = matchParamNamesAgainst(rubyParams, fileCandidates);
          if (verdict.rows.length > 0) {
            const rubyOwner = rubyModule.split("::").at(-1) ?? rubyModule;
            const byOwnerName = tsParamsByFileOwnerNameInPkg.get(tsFile);
            verdict = matchParamNamesAgainst(
              rubyParams,
              byOwnerName?.get(`${rubyOwner}#${tsName}`) ?? [],
            );
          }
          if (verdict.aligned) {
            paramNamesCompared++;
            for (const row of verdict.rows) {
              paramNameMismatches.push({
                rubyFile,
                tsFile,
                rubyName,
                tsName,
                position: row.position,
                rubyParam: row.ruby,
                tsParam: row.ts,
              });
            }
          }
        }
        // A `delegate`/unresolved-`alias` entry carries a placeholder `[0-0]`, not a
        // signature — comparing it against the real TS arity is noise, so it is
        // skipped before `arityCompared` counts it. Placed AFTER the no-candidate
        // guard so the tally means "pairs that would otherwise have been compared".
        if (rubyForwardingNames.has(rubyName)) {
          arityForwardingSkipped++;
          return;
        }
        if (candidates.every((c) => shouldSkipArity(rubyParams, c))) return;
        const verdict = matchArityAgainst(rubyParams, candidates);
        // Excluding also drops the pair from the compared denominator, so a
        // justified deviation neither inflates nor deflates the arity %. Only a
        // pair that really mismatches consumes its exclude — one on a
        // now-matching pair stays unapplied and the gate reports it stale.
        if (!verdict.matched) {
          const excludeKey = arityExcludeKeyOf({ package: pkg, rubyFile, rubyName });
          if (arityExcludes.has(excludeKey)) {
            appliedArityExcludes.add(excludeKey);
            arityExcluded++;
            return;
          }
        }
        arityCompared++;
        if (verdict.matched) return;
        arityMismatches.push({
          rubyFile,
          tsFile,
          rubyName,
          tsName,
          rubySig: renderSig(rubyParams, "ruby"),
          tsSig: renderSig(verdict.tsParams, "ts"),
          rubyRange: verdict.rubyRange,
          tsRange: verdict.tsRange,
        });
      };

      // Misplaced-file detection: tally per-sibling-file how many of
      // this Ruby file's expected TS candidates land there, then pick
      // the strongest cluster (see `selectMisplacedFile` for thresholds).
      let misplacedActualFile: string | null = null;
      if (!tsFileExists && seen.size > 0) {
        const fileHits = new Map<string, number>();
        for (const [, { rubyName, rubyModule }] of seen) {
          const candidates = rubyMethodToTsForFqn(rubyModule, rubyName);
          if (!candidates) continue;
          const containingFiles = new Set<string>();
          for (const c of candidates) {
            const files = tsFilesByMethod.get(c);
            if (files) for (const f of files) containingFiles.add(f);
          }
          for (const f of containingFiles) {
            fileHits.set(f, (fileHits.get(f) || 0) + 1);
          }
        }
        misplacedActualFile = selectMisplacedFile(fileHits, seen.size, `${pkg}:${rubyFile}`);
      }
      const actualMethods = misplacedActualFile
        ? tsMethodsByFile.get(misplacedActualFile) || new Set<string>()
        : null;
      const hasTsCounterpart = rubyFileHasTsCounterpart(tsFileExists, misplacedActualFile);

      // The Ruby names this file expects, so a writer whose reader is present
      // resolves to `set#{Name}` instead of stealing the reader's TS body
      // (see the `name.endsWith("=")` arm of `rubyMethodToTsIgnoringSkip`).
      const siblingRubyNames = new Set([...seen.values()].map((m) => m.rubyName));
      const twinRubyNames = new Set([
        ...siblingRubyNames,
        ...crossPackageIncludedMethodNames(
          items.map((item) => item.info),
          pkg,
          ruby,
        ),
      ]);

      for (const [
        _dedupeKey,
        { rubyName, rubyModule, umbrellaConfig, notes, mixinFile, definedInFile },
      ] of seen) {
        const tsCandidates = rubyMethodToTsForFqn(rubyModule, rubyName, siblingRubyNames)!;

        // Check direct match first — find which candidate matched
        const directMatch = tsCandidates.find((c) => tsMethods.has(c));
        // A candidate whose only declaration here is a bodyless signature is
        // not a port — see `declarationOnlyInFile`. The direct-match arm is
        // skipped so the mixin / reopening / misplaced arms below still get
        // their shot: `Included<>` declares the mixin's members on the host and
        // the bodies live in the mixin's own file, which is a real port and
        // credits as a move. Only a name nothing else accounts for lands in the
        // `declarationOnly` column, counted as a miss so the file's percentage
        // states what a Rails developer would find on opening it.
        let declOnly =
          directMatch !== undefined &&
          declarationOnlyInFile(
            expectedTs,
            directMatch,
            tsBodylessOwnersByFileName,
            tsBodiedOwnersByFileName,
            notes,
            tsAliasNamesByFileName,
          );
        // The bodyless name to report, which for the misplaced-cluster arm
        // below is not `directMatch` (that arm runs because the expected file
        // does not exist at all).
        let declOnlyTsName = declOnly ? directMatch : undefined;
        if (directMatch && !declOnly) {
          fileMatched++;
          // A method Ruby flattened onto this host through `include` is ported
          // ONCE, in the file mirroring the mixin's own — `PostgreSQL::Quoting`
          // (`postgresql/quoting.rb:143`) into postgresql/quoting.ts — and the
          // host keeps only the `include` seam. The seam makes none of the
          // mixin's calls, so holding it to them charges the port twice for one
          // body; the mixin's own bucket compares the real one.
          const seam =
            mixinMethodCreditedToOwnFile(
              { rubyName, rubyModule, mixinFile },
              rubyFile,
              pkg,
              (f) => byFile.has(f),
              tsMethodsByFile,
            ) !== null;
          checkArity(
            rubyName,
            directMatch,
            expectedTs,
            rubyModule,
            seam || writerPairedWithReader(rubyName, directMatch, siblingRubyNames),
          );
          continue;
        }

        if (!hasTsCounterpart) {
          fileMissing++;
          missingMethods.push({ rubyName, tsName: tsCandidates[0], rubyModule });
          continue;
        }

        // Check include chain — track which candidate and file matched. Skipped
        // for a declaration-only name: this arm credits the port to a TS class
        // that mixes the module in, which for `crud.ts` is `select-manager.ts`
        // — the includer holding the four bodies Rails puts in `crud.rb`. That
        // is the drift, not a port of it. The mixin / reopening arms below are
        // unaffected; they credit a body in the file mirroring the mixin's OWN
        // Rails file, which is where Rails put it.
        let foundViaInclude: string | null = null;
        let matchedCandidate: string | null = null;
        for (const candidate of tsCandidates) {
          for (const { file, methods } of includerMethodSetsByOwner.get(rubyModule) ?? []) {
            if (methods.has(candidate)) {
              foundViaInclude = file;
              matchedCandidate = candidate;
              break;
            }
          }
          if (foundViaInclude) break;
        }

        if (foundViaInclude && !declOnly) {
          fileMatched++;
          checkArity(
            rubyName,
            matchedCandidate!,
            foundViaInclude,
            rubyModule,
            writerPairedWithReader(rubyName, matchedCandidate!, siblingRubyNames),
          );
          moves.push({
            tsName: matchedCandidate!,
            rubyName,
            rubyModule,
            expectedFile: expectedTs,
            actualFile: foundViaInclude,
          });
          continue;
        }

        // Mixed in from another Ruby file and ported there, once, exactly as
        // Rails writes it — see `mixinMethodCreditedToOwnFile`.
        const creditedToMixin = mixinMethodCreditedToOwnFile(
          { rubyName, rubyModule, mixinFile },
          rubyFile,
          pkg,
          (f) => byFile.has(f),
          tsMethodsByFile,
        );
        if (creditedToMixin) {
          fileMatched++;
          // No `checkArity`: the same pair is already compared in the mixin's
          // own bucket, so re-running it per host double-counts every mismatch.
          moves.push({
            tsName: creditedToMixin.tsName,
            rubyName,
            rubyModule,
            expectedFile: expectedTs,
            actualFile: creditedToMixin.tsFile,
          });
          continue;
        }

        // Defined by a reopening of this class in another Ruby file, and ported
        // there — see `reopeningMethodCreditedToOwnFile`.
        const creditedToReopening = reopeningMethodCreditedToOwnFile(
          { rubyName, rubyModule, definedInFile },
          rubyFile,
          pkg,
          tsMethodsByFile,
        );
        if (creditedToReopening) {
          fileMatched++;
          checkArity(rubyName, creditedToReopening.tsName, creditedToReopening.tsFile, rubyModule);
          moves.push({
            tsName: creditedToReopening.tsName,
            rubyName,
            rubyModule,
            expectedFile: expectedTs,
            actualFile: creditedToReopening.tsFile,
          });
          continue;
        }

        // Cross-file misplaced fallback: method exists in the cluster
        // file we identified above.
        if (actualMethods) {
          const verdict = misplacedClusterVerdict(
            tsCandidates,
            actualMethods,
            misplacedActualFile!,
            tsBodylessOwnersByFileName,
            tsBodiedOwnersByFileName,
          );
          if (verdict.kind === "declaration-only") {
            declOnly = true;
            declOnlyTsName = verdict.tsName;
          }
          const misplacedMatch = verdict.kind === "match" ? verdict.tsName : undefined;
          if (misplacedMatch) {
            fileMatched++;
            checkArity(rubyName, misplacedMatch, misplacedActualFile!, rubyModule, false, true);
            moves.push({
              tsName: misplacedMatch,
              rubyName,
              rubyModule,
              expectedFile: expectedTs,
              actualFile: misplacedActualFile!,
            });
            continue;
          }
        }

        // Umbrella module config (active_record.rb singleton accessors) is
        // redirected onto Base, but trails ports the individual flags wherever
        // they belong (schema-cache.ts, database-tasks.ts, …), not all on
        // base.ts: some as class statics (`Base.writingRole`), most as
        // ar-config.ts module exports with a `setX` setter function
        // (`ActiveRecord.protocol_adapters=` → `setProtocolAdapters`). Credit the
        // port wherever it lands in the package — the static/method form or the
        // `setX` setter form — as a move rather than pinning it as a
        // false-missing on base.ts. A flag trails doesn't implement anywhere
        // still falls through to missing (a real, un-hidden convergence gap).
        // The reader (`writing_role`) and writer (`writing_role=`) are two
        // distinct `seen` entries that both map to the one TS symbol
        // (`writingRole` / `setWritingRole`), so each is credited once — the
        // same 2-Ruby-methods-cover-1-TS-property accounting the direct-match
        // path already applies to every `attr_accessor`-backed property in the
        // codebase. Not umbrella-specific inflation; just consistent with it.
        // An `mattr_accessor`/`class_attribute` reader on a MODULE has no
        // settable ESM counterpart — a module export is not assignable from
        // outside — so trails renders the pair as an exported binding plus a
        // `setX()` writer (`ActiveSupport.parse_json_times` →
        // `parseJsonTimes` / `setParseJsonTimes`, json.ts:20-23), the same
        // settled shape RFC 0068 gives a blocking Ruby `x=`. The extractor
        // records an exported `let` as a value, not a method, so only the
        // writer half is in `tsFilesByMethod`; crediting the reader through it
        // measures the accessor as the one ported pair it is, exactly as the
        // umbrella-config arm below does for the same rendering.
        if (notes === "class_attribute") {
          const setter = tsCandidates.map((c) => `set${c.charAt(0).toUpperCase()}${c.slice(1)}`);
          const port = setter.find((c) => tsFilesByMethod.has(c));
          if (port) {
            const actualFile = [...(tsFilesByMethod.get(port) as Set<string>)].sort()[0];
            fileMatched++;
            moves.push({
              tsName: port,
              rubyName,
              rubyModule,
              expectedFile: expectedTs,
              actualFile,
            });
            continue;
          }
        }

        if (umbrellaConfig) {
          const directPort = tsCandidates.find((c) => tsFilesByMethod.has(c));
          const setterForms = tsCandidates.map(
            (c) => `set${c.charAt(0).toUpperCase()}${c.slice(1)}`,
          );
          const port = directPort ?? setterForms.find((c) => tsFilesByMethod.has(c));
          if (port) {
            const actualFile = [...(tsFilesByMethod.get(port) as Set<string>)].sort()[0];
            fileMatched++;
            // Only an arity-meaningful direct match (`writingRole`) is checked;
            // a `setX` setter has an extra `value` param vs the Ruby reader, so
            // comparing their arities manufactures a spurious mismatch.
            if (directPort) checkArity(rubyName, directPort, actualFile, rubyModule);
            moves.push({
              tsName: port,
              rubyName,
              rubyModule,
              expectedFile: expectedTs,
              actualFile,
            });
            continue;
          }
        }

        fileMissing++;
        const missed = {
          rubyName,
          tsName: declOnlyTsName ?? directMatch ?? tsCandidates[0],
          rubyModule,
        };
        missingMethods.push(missed);
        if (declOnly) declarationOnly.push(missed);
      }

      const total = fileMatched + fileMissing;
      if (total === 0) continue;

      fileResults.push({
        rubyFile,
        expectedTsFile: expectedTs,
        tsFileExists,
        misplacedAt: misplacedActualFile ?? undefined,
        matched: fileMatched,
        missing: fileMissing,
        total,
        missingMethods,
        declarationOnly,
        moves,
      });

      totalMatched += fileMatched;
      totalMissing += fileMissing;
      totalFiles++;
      if (tsFileExists) filesExist++;
      else if (misplacedActualFile) {
        totalMisplaced++;
        filesExist++;
      }
    }

    // Diff each Ruby file's literal constants against same-named TS constants.
    for (const [rubyFile, rubyConsts] of Object.entries(rubyPkg.fileConstants ?? {})) {
      if (isSourceUnported(rubyFile, pkg)) continue;
      const expectedTs = rubyFileToTs(rubyFile, pkg);
      const tsConsts = tsPkg?.fileConstants?.[expectedTs];
      if (!tsConsts) continue;
      const tsEntries = Object.entries(tsConsts);
      for (const [rubyName, rubyLit] of Object.entries(rubyConsts)) {
        const tsEntry = tsEntries.find(([tsName]) => constantNameMatches(rubyName, tsName));
        if (!tsEntry) continue;
        const verdict = compareLiteral(rubyLit, tsEntry[1]);
        if (verdict === "skip") {
          literalsSkipped++;
          continue;
        }
        literalsCompared++;
        if (verdict === "mismatch") {
          literalMismatches.push({
            rubyFile,
            tsFile: expectedTs,
            name: rubyName,
            rubyValue: displayLiteral(rubyLit),
            tsValue: displayLiteral(tsEntry[1]),
            kind: "constant",
          });
        }
      }
    }

    const totalMethods = totalMatched + totalMissing;
    const pct = totalMethods > 0 ? Math.round((totalMatched / totalMethods) * 1000) / 10 : 0;

    // ---- Inheritance check ----
    // For each primary Ruby class, locate the matching TS class (same expected
    // file + same short name) and verify Ruby's immediate superclass appears
    // somewhere in TS's ancestor chain. If the TS class is absent entirely,
    // surface that as a mismatch so regressions don't hide.
    const inheritance: InheritanceResult = {
      checked: 0,
      matched: 0,
      excluded: 0,
      mismatches: [],
    };
    if (tsPkg) {
      // Index TS classes by (file, shortName) and by short name for ancestor walks.
      const tsByFileName = new Map<string, ClassInfo>();
      const tsByShort = new Map<string, ClassInfo[]>();
      for (const cls of Object.values(tsPkg.classes)) {
        if (!cls.file) continue;
        tsByFileName.set(`${cls.file}::${cls.name}`, cls);
        const list = tsByShort.get(cls.name) || [];
        list.push(cls);
        tsByShort.set(cls.name, list);
      }

      const resolveAncestor = (name: string, childFile: string, declFile?: string) =>
        resolveEntityByDeclaringFile(tsByShort.get(name) || [], childFile, declFile);

      const ancestorChain = (cls: ClassInfo): string[] => {
        const chain: string[] = [];
        const seen = new Set<string>();
        let cursor: ClassInfo | null = cls;
        while (cursor?.superclass) {
          const name = shortName(cursor.superclass);
          if (!name) break;
          chain.push(name);
          const key = `${cursor.file}::${name}`;
          if (seen.has(key)) break;
          seen.add(key);
          cursor = resolveAncestor(name, cursor.file || "", cursor.superclassFile);
        }
        return chain;
      };

      for (const { fqn, info } of allRuby) {
        if (!info.file || isSourceUnported(info.file, pkg)) continue;
        if (inheritanceClassPerFile.get(info.file) !== fqn) continue;
        // `allRuby` mixes classes and modules; modules don't carry superclass.
        if (!(fqn in rubyPkg.classes)) continue;

        const expectedTs = rubyFileToTs(info.file, pkg);
        const short = shortName(fqn)!;
        const rubySuper = shortName(info.superclass);

        const tsCls = resolveTsClassForRuby(short, expectedTs, tsByFileName);
        inheritance.checked++;

        if (!tsCls) {
          // If the method-comparison already flags the TS file as missing,
          // don't double-count a ts-class-missing — the file-level signal
          // covers it. Only surface when the file exists but this class is
          // absent (a genuine inheritance blind spot).
          const pkgSrcDir = packageSrcDir(pkg);
          const fileExists = fs.existsSync(path.join(pkgSrcDir, expectedTs));
          if (!fileExists) {
            inheritance.checked--; // don't score; file-missing is tracked elsewhere
            continue;
          }
          inheritance.mismatches.push({
            rubyFqn: fqn,
            rubyFile: info.file,
            tsFile: expectedTs,
            tsName: short,
            rubySuper,
            tsSuper: null,
            tsChain: [],
            reason: "ts-class-missing",
          });
          continue;
        }

        const chain = ancestorChain(tsCls);
        // Pass the resolved TS class name (not the Ruby short name) so
        // the `TS_ROOT_INTERMEDIATE` whitelist keys on what the TS file
        // actually declares (e.g. "ValueType", not Ruby's "Value").
        if (superclassesMatch(rubySuper, chain, tsCls.name)) {
          inheritance.matched++;
        } else if (
          inheritanceExcludes.has(
            inheritanceExcludeKeyOf({ package: pkg, rubyFile: info.file, rubyFqn: fqn }),
          )
        ) {
          // Reviewed deviation: drop it from the denominator rather than score
          // it as a match, the way the arity check reports its excludes.
          appliedInheritanceExcludes.add(
            inheritanceExcludeKeyOf({ package: pkg, rubyFile: info.file, rubyFqn: fqn }),
          );
          inheritance.checked--;
          inheritance.excluded++;
        } else {
          inheritance.mismatches.push({
            rubyFqn: fqn,
            rubyFile: info.file,
            tsFile: expectedTs,
            tsName: short,
            rubySuper,
            tsSuper: chain[0] ?? null,
            tsChain: chain,
            reason: "super-mismatch",
          });
        }
      }
    }

    results.push({
      package: pkg,
      totalMethods,
      matched: totalMatched,
      missing: totalMissing,
      percent: pct,
      totalFiles,
      filesExist,
      misplacedFiles: totalMisplaced,
      excludedFiles: [...excludedFiles].sort(),
      files: fileResults,
      inheritance,
      ambiguousParents: ambiguousParentCount,
      arity: {
        compared: arityCompared,
        forwardingSkipped: arityForwardingSkipped,
        mismatched: arityMismatches.length,
        excluded: arityExcluded,
        mismatches: arityMismatches,
      },
      paramNames: {
        compared: paramNamesCompared,
        mismatchedPairs: new Set(paramNameMismatches.map((m) => `${m.rubyFile} ${m.rubyName}`))
          .size,
        mismatches: paramNameMismatches,
      },
      optionKeys: {
        compared: optionKeysCompared,
        mismatched: optionKeyMismatches.length,
        mismatches: optionKeyMismatches,
      },
      literals: {
        compared: literalsCompared,
        skipped: literalsSkipped,
        mismatched: literalMismatches.length,
        mismatches: literalMismatches,
      },
      calls: {
        compared: callsCompared,
        mismatched: callMismatches.length,
        mismatches: callMismatches,
        staleTags: staleCallTags(
          tsMissingCallTagsByFileName,
          callTagsUsed,
          tsDeclFileByFileNameOwner,
        ),
        suppressed: suppressedCalls,
        skeletons: callSkeletons,
      },
      callArgs: {
        compared: callArgsCompared,
        mismatched: callArgMismatches.length,
        skipped: callArgsSkipped,
        mismatches: callArgMismatches,
        staleTags: staleCallTags(
          tsMissingArgTagsByFileName,
          argTagsUsed,
          tsDeclFileByFileNameOwner,
        ),
        suppressed: suppressedArgCalls,
      },
      bodyHashes: bodyHashRecords,
    });
  }

  // Write JSON. Separate file per mode so artifacts don't clobber each
  // other when multiple runs land back-to-back in CI.
  const modeSuffix =
    mode === "private" ? "-privates-only" : mode === "public" ? "-public-only" : "";
  const jsonPath = path.join(OUTPUT_DIR, `api-comparison${modeSuffix}.json`);
  fs.writeFileSync(
    jsonPath,
    // Strip bodyHashes here: it's a large per-pair list that lives in its own
    // artifact (body-hashes.json below); embedding it in the coverage report
    // too would duplicate ~9k records for no consumer.
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        // The inheritance gate treats every committed exclude absent from this
        // list as stale, the same only-shrink contract arity-exclude has.
        appliedInheritanceExcludes: [...appliedInheritanceExcludes].sort(),
        results: results.map(({ bodyHashes: _bodyHashes, ...rest }) => rest),
      },
      null,
      2,
    ),
  );

  // Advisory arity artifact — always written; flat across packages. Per-mode
  // filename so a public/privates run doesn't clobber the full-surface one.
  const arityPath = path.join(OUTPUT_DIR, `arity-mismatches${modeSuffix}.json`);
  const arityFlat = results.flatMap((r) =>
    r.arity.mismatches.map((m) => ({ package: r.package, ...m })),
  );
  fs.writeFileSync(
    arityPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        packages: results.map((r) => r.package).sort(),
        compared: results.reduce((n, r) => n + r.arity.compared, 0),
        forwardingSkipped: results.reduce((n, r) => n + r.arity.forwardingSkipped, 0),
        mismatched: arityFlat.length,
        excluded: results.reduce((n, r) => n + r.arity.excluded, 0),
        // The gate treats every committed exclude absent from this list as stale.
        appliedExcludes: [...appliedArityExcludes].sort(),
        mismatches: arityFlat,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `ambiguous-parents${modeSuffix}.json`),
    JSON.stringify(
      Object.fromEntries(
        results
          .filter((r) => r.ambiguousParents > 0)
          .map((r) => [r.package, r.ambiguousParents])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
      ),
      null,
      2,
    ) + "\n",
  );

  // Advisory parameter-name artifact — always written; flat across packages;
  // same header shape as arity-mismatches.json. This is what the RFC 0126 mark
  // gate (lint-param-names.ts) measures.
  const paramNamesPath = path.join(OUTPUT_DIR, `param-name-mismatches${modeSuffix}.json`);
  const paramNamesFlat = results.flatMap((r) =>
    r.paramNames.mismatches.map((m) => ({ package: r.package, ...m })),
  );
  fs.writeFileSync(
    paramNamesPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        packages: results.map((r) => r.package).sort(),
        compared: results.reduce((n, r) => n + r.paramNames.compared, 0),
        mismatched: paramNamesFlat.length,
        mismatches: paramNamesFlat,
      },
      null,
      2,
    ),
  );

  // Advisory option-key artifact — always written; flat across packages; same
  // header shape as arity-mismatches.json plus a `note` on the heuristic.
  const optionKeysPath = path.join(OUTPUT_DIR, `options-key-mismatches${modeSuffix}.json`);
  const optionKeysFlat = results.flatMap((r) =>
    r.optionKeys.mismatches.map((m) => ({ package: r.package, ...m })),
  );
  fs.writeFileSync(
    optionKeysPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          "Advisory. Ruby keys are an UNDER-approximation (only keys read directly " +
          "in the body are detected), so `missingInTs` is the likely-real finding " +
          "and `extraInTs` is informational.",
        compared: results.reduce((n, r) => n + r.optionKeys.compared, 0),
        mismatched: optionKeysFlat.length,
        // The likely-real subset: pairs where Ruby honours a key TS omits.
        withMissingInTs: optionKeysFlat.filter((m) => m.missingInTs.length > 0).length,
        mismatches: optionKeysFlat,
      },
      null,
      2,
    ),
  );

  // Advisory literal artifact — always written, flat across packages.
  const literalsPath = path.join(OUTPUT_DIR, `literal-mismatches${modeSuffix}.json`);
  const literalsFlat = results.flatMap((r) =>
    r.literals.mismatches.map((m) => ({ package: r.package, ...m })),
  );
  fs.writeFileSync(
    literalsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Advisory. Literal defaults + constants, normalized; non-literal/nil-sentinel skipped.",
        compared: results.reduce((n, r) => n + r.literals.compared, 0),
        skipped: results.reduce((n, r) => n + r.literals.skipped, 0),
        mismatched: literalsFlat.length,
        mismatches: literalsFlat,
      },
      null,
      2,
    ),
  );

  if (callsGate) {
    // Advisory calls-parity artifact (RFC 0047), flat across packages. Written
    // only under `--calls`, the mode that computes the call sets at all —
    // a plain run would otherwise overwrite it with an empty result.
    const callsPath = path.join(OUTPUT_DIR, `call-mismatches${modeSuffix}.json`);
    const callsFlat = results.flatMap((r) =>
      r.calls.mismatches.map((m) => ({ package: r.package, ...m })),
    );
    const staleTagsFlat = results.flatMap((r) =>
      r.calls.staleTags.map((t) => ({ package: r.package, ...t })),
    );
    const suppressedFlat = results.flatMap((r) =>
      r.calls.suppressed.map((c) => ({ package: r.package, ...c })),
    );
    fs.writeFileSync(
      callsPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "Advisory. Ruby body calls (to other ported methods) absent from the matched TS body's call-set. Coarse body-fidelity signal; legitimate restructuring shows up here.",
          // The set of packages this run actually compared (sorted). The
          // ratchet (lint-call-mismatches.ts) reads it to reject a
          // partial-scope artifact — fewer packages than CI, e.g. a `--package`-filtered run or an
          // unfetched vendor source — before it can reseed or gate. See that
          // script's header for the full determinism story.
          packages: [...new Set(results.map((r) => r.package))].sort(),
          compared: results.reduce((n, r) => n + r.calls.compared, 0),
          mismatched: callsFlat.length,
          mismatches: callsFlat,
          staleTags: staleTagsFlat,
          suppressed: suppressedFlat,
        },
        null,
        2,
      ),
    );

    // Advisory call-argument artifact (RFC 0095), flat across packages, in the
    // shape of call-mismatches.json above — including the `packages` field its
    // own ratchet will read to reject a partial-scope artifact. Written under
    // `--calls` for the same reason: a plain run computes no call arguments and
    // would overwrite this with an empty result.
    const callArgsPath = path.join(OUTPUT_DIR, `call-arg-mismatches${modeSuffix}.json`);
    const callArgsFlat = results.flatMap((r) =>
      r.callArgs.mismatches.map((m) => ({ package: r.package, ...m })),
    );
    const staleArgTagsFlat = results.flatMap((r) =>
      r.callArgs.staleTags.map((t) => ({ package: r.package, ...t })),
    );
    const suppressedArgsFlat = results.flatMap((r) =>
      r.callArgs.suppressed.map((c) => ({ package: r.package, ...c })),
    );
    fs.writeFileSync(
      callArgsPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "Arguments a matched TS call site passes vs the Ruby one, normalized (identifiers camelized, literals through literals.ts). `shape` = count/order/value/kwarg-key difference, gated by lint-call-args.ts; `naming` = a ref: identifier spelled differently, report-only (RFC 0096).",
          packages: [...new Set(results.map((r) => r.package))].sort(),
          compared: results.reduce((n, r) => n + r.callArgs.compared, 0),
          mismatched: callArgsFlat.length,
          skipped: Object.fromEntries(
            CALL_ARG_SKIP_REASONS.map((reason) => [
              reason,
              results.reduce((n, r) => n + r.callArgs.skipped[reason], 0),
            ]),
          ),
          mismatches: callArgsFlat,
          staleTags: staleArgTagsFlat,
          suppressed: suppressedArgsFlat,
        },
        null,
        2,
      ),
    );

    const skeletonsPath = path.join(OUTPUT_DIR, `call-skeletons${modeSuffix}.json`);
    const skeletonsFlat = results.flatMap((r) =>
      r.calls.skeletons.map((s) => ({ package: r.package, ...s })),
    );
    fs.writeFileSync(
      skeletonsPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "Advisory, ungated. Ordered control + call skeleton per name-matched pair, both sides uncollapsed: if/loop/try/throw, new:Ctor, ref:<name>, in source order with duplicates. Ruby block iteration folds onto loop.",
          packages: [...new Set(results.map((r) => r.package))].sort(),
          skeletons: skeletonsFlat,
        },
        null,
        2,
      ),
    );
  }

  // Source-hash pinning artifact (RFC 0025) — the current normalized Ruby body
  // digest for every name-matched pair, flat across packages. lint-body-pins.ts
  // diffs the committed pins (body-pins.json) against this to report drift and
  // stale pins. Always written; not emitted for the privates-only variant
  // (private-method bodies carry no public-contract obligation, matching the
  // call-set gate). Parity % is unchanged.
  if (mode !== "private") {
    const bodyHashesPath = path.join(OUTPUT_DIR, "body-hashes.json");
    const bodyHashesFlat = results.flatMap((r) =>
      r.bodyHashes.map((b) => ({ package: r.package, ...b })),
    );
    fs.writeFileSync(
      bodyHashesPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          note: "Source-hash pinning (RFC 0025). Normalized Ruby body digest per name-matched pair. lint-body-pins.ts diffs body-pins.json against this to detect upstream Rails body drift.",
          packages: [...new Set(results.map((r) => r.package))].sort(),
          hashes: bodyHashesFlat,
        },
        null,
        2,
      ),
    );
  }

  printReport(
    results,
    showMissing,
    showFiles,
    filterPkg,
    showIncomplete,
    showInheritance,
    showArity,
    showParams,
    mode,
    showClosureOnly,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

// Read the committed body-pin manifest (RFC 0025) and return the set of pinned
// (package, rubyFile, rubyName) keys. Missing/malformed manifest → empty set
// (pinning is opt-in; a run without a manifest simply reports every pair as
// unpinned). Sync fs matches this script's existing IO style.
function loadPinnedKeys(): Set<string> {
  const pinsPath = path.join(SCRIPT_DIR, "body-pins.json");
  try {
    const pins = JSON.parse(fs.readFileSync(pinsPath, "utf-8")) as Array<{
      package: string;
      rubyFile: string;
      rubyName: string;
    }>;
    return new Set(pins.map((p) => `${p.package} ${p.rubyFile} ${p.rubyName}`));
  } catch {
    return new Set();
  }
}

function printReport(
  results: PackageResult[],
  showMissing: boolean,
  showFiles: boolean,
  filterPkg: string | null,
  showIncomplete = false,
  showInheritance = false,
  showArity = false,
  showParams = false,
  mode: CompareMode = "public",
  showClosureOnly = false,
) {
  const DATA_LAYER = new Set(DATA_LAYER_PACKAGES);
  const closureFileSet = showClosureOnly ? writeArClosure().files : null;
  if (mode === "private") {
    console.log(
      `\n  (comparing internal/private API surface — ` +
        `Ruby private/protected, TS private/protected, TS #-prefixed fields)`,
    );
  } else if (mode === "all") {
    console.log(`\n  (comparing full API surface — public + private/protected combined)`);
  }
  let grandTotal = 0;
  let grandMatched = 0;
  let grandFiles = 0;
  let grandFilesExist = 0;
  let grandInhChecked = 0;
  let grandInhMatched = 0;
  let grandArityCompared = 0;
  let grandArityMismatched = 0;
  let grandArityExcluded = 0;
  let grandOptKeysCompared = 0;
  let grandOptKeysMismatched = 0;
  let grandOptKeysMissing = 0;
  let grandLiteralsCompared = 0;
  let grandLiteralsMismatched = 0;
  let grandCallsCompared = 0;
  let grandCallsMismatched = 0;
  let grandCallArgsCompared = 0;
  let grandCallArgsMismatched = 0;
  let grandParamNamesCompared = 0;
  let grandParamNamesMismatched = 0;

  // Source-hash pinning (RFC 0025): the set of pinned (package, rubyFile,
  // rubyName) keys, read from the committed manifest so the summary can report
  // pinned/unpinned counts per package. Advisory — parity % is unchanged.
  const pinnedKeys = loadPinnedKeys();

  for (const pkg of results) {
    grandTotal += pkg.totalMethods;
    grandMatched += pkg.matched;
    grandFiles += pkg.totalFiles;
    grandFilesExist += pkg.filesExist;
    grandInhChecked += pkg.inheritance.checked;
    grandInhMatched += pkg.inheritance.matched;
    grandArityCompared += pkg.arity.compared;
    grandArityMismatched += pkg.arity.mismatched;
    grandArityExcluded += pkg.arity.excluded;
    grandOptKeysCompared += pkg.optionKeys.compared;
    grandOptKeysMismatched += pkg.optionKeys.mismatched;
    grandOptKeysMissing += pkg.optionKeys.mismatches.filter((m) => m.missingInTs.length > 0).length;
    grandLiteralsCompared += pkg.literals.compared;
    grandLiteralsMismatched += pkg.literals.mismatched;
    grandCallsCompared += pkg.calls.compared;
    grandCallsMismatched += pkg.calls.mismatched;
    grandCallArgsCompared += pkg.callArgs.compared;
    grandCallArgsMismatched += pkg.callArgs.mismatched;
    grandParamNamesCompared += pkg.paramNames.compared;
    grandParamNamesMismatched += pkg.paramNames.mismatchedPairs;

    console.log(`\n${"=".repeat(100)}`);
    const excludedNote =
      pkg.excludedFiles.length > 0 ? "  (some intentionally excluded, see unported-files/)" : "";
    const inh = pkg.inheritance;
    const inhPct = inh.checked > 0 ? Math.round((inh.matched / inh.checked) * 1000) / 10 : 0;
    const inhExcludedNote = inh.excluded > 0 ? `, ${inh.excluded} excluded` : "";
    const inhNote =
      inh.checked > 0
        ? `  |  inheritance: ${inh.matched}/${inh.checked} (${inhPct}%${inhExcludedNote})`
        : "";
    const misplacedNote = pkg.misplacedFiles > 0 ? `  |  ${pkg.misplacedFiles} misplaced` : "";
    const ar = pkg.arity;
    const arOk = ar.compared - ar.mismatched;
    const arPct = ar.compared > 0 ? Math.round((arOk / ar.compared) * 1000) / 10 : 0;
    const arExcludedNote = ar.excluded > 0 ? `, ${ar.excluded} excluded` : "";
    const arityNote =
      ar.compared > 0 ? `  |  arity: ${arOk}/${ar.compared} (${arPct}%${arExcludedNote})` : "";
    const pn = pkg.paramNames;
    const pnOk = pn.compared - pn.mismatchedPairs;
    const pnPct = pn.compared > 0 ? Math.round((pnOk / pn.compared) * 1000) / 10 : 0;
    const paramsNote = pn.compared > 0 ? `  |  params: ${pnOk}/${pn.compared} (${pnPct}%)` : "";
    const bodyTotal = pkg.bodyHashes.length;
    const bodyPinned = pkg.bodyHashes.filter((b) =>
      pinnedKeys.has(`${pkg.package} ${b.rubyFile} ${b.rubyName}`),
    ).length;
    const pinsNote =
      bodyTotal > 0
        ? `  |  pins: ${bodyPinned}/${bodyTotal} (${bodyTotal - bodyPinned} unpinned)`
        : "";
    console.log(
      `  ${pkg.package}  —  ${pkg.matched}/${pkg.totalMethods} methods (${pkg.percent}%)  |  files: ${pkg.filesExist}/${pkg.totalFiles}${misplacedNote}${inhNote}${arityNote}${paramsNote}${pinsNote}${excludedNote}`,
    );
    console.log(`${"=".repeat(100)}`);

    if (showArity && ar.mismatches.length > 0) {
      console.log(`\n  Arity mismatches (advisory — does not affect parity):`);
      for (const m of ar.mismatches) {
        console.log(`    ${m.tsFile}:${m.tsName}  ruby${m.rubySig}  ts${m.tsSig}`);
      }
    }

    if (showParams && pn.mismatches.length > 0) {
      console.log(`\n  Parameter-name mismatches (advisory — does not affect parity):`);
      for (const m of pn.mismatches) {
        console.log(
          `    ${m.tsFile}:${m.tsName}  @${m.position}  ruby \`${m.rubyParam}\`  ts \`${m.tsParam}\``,
        );
      }
    }

    if (showInheritance && inh.mismatches.length > 0) {
      console.log(`\n  Inheritance mismatches:`);
      for (const m of inh.mismatches) {
        if (m.reason === "ts-class-missing") {
          const rs = m.rubySuper ?? "(none)";
          console.log(`    ${m.tsFile}:${m.tsName}  ruby<${rs}>  ts<class missing>`);
          continue;
        }
        const rs = m.rubySuper ?? "(none)";
        const tsDesc = m.tsChain.length > 0 ? m.tsChain.join(" → ") : "(none)";
        console.log(`    ${m.tsFile}:${m.tsName}  ruby<${rs}>  ts<${tsDesc}>`);
      }
    }

    // Per-file table (only for detail packages or when filtered)
    const detailFiles = closureFileSet
      ? filterFilesToClosure(pkg.files, closureFileSet[pkg.package], DATA_LAYER.has(pkg.package))
      : pkg.files;

    if (DETAIL_PACKAGES.has(pkg.package) || filterPkg || showFiles) {
      console.log(
        `\n  ${"Ruby file".padEnd(55)} ${"Expected TS file".padEnd(40)} ${"Match".padStart(6)} ${"Miss".padStart(6)} ${"DeclOnly".padStart(9)} ${"Tot".padStart(6)}  %`,
      );
      console.log(
        `  ${"-".repeat(55)} ${"-".repeat(40)} ${"-".repeat(6)} ${"-".repeat(6)} ${"-".repeat(9)} ${"-".repeat(6)} ${"-".repeat(4)}`,
      );

      for (const f of detailFiles) {
        const pct = f.total > 0 ? Math.round((f.matched / f.total) * 100) : 0;
        const fullyMatched = f.total > 0 && f.matched === f.total;
        // A misplaced file is "incomplete" even at 100% match \u2014 the
        // file still needs to move to its conventional path.
        if (showIncomplete && fullyMatched && !f.misplacedAt) continue;
        const marker = f.misplacedAt
          ? ` \u21a6 ${f.misplacedAt}`
          : !f.tsFileExists
            ? " \u2717"
            : fullyMatched
              ? " \u2713"
              : "";
        console.log(
          `  ${f.rubyFile.padEnd(55)} ${f.expectedTsFile.padEnd(40)} ${String(f.matched).padStart(6)} ${String(f.missing).padStart(6)} ${String(f.declarationOnly.length).padStart(9)} ${String(f.total).padStart(6)} ${String(pct).padStart(3)}%${marker}`,
        );

        if (showMissing) {
          const declOnly = new Set(f.declarationOnly.map((m) => m.rubyName));
          for (const m of f.missingMethods) {
            const why = declOnly.has(m.rubyName) ? "  [declaration-only]" : "";
            console.log(`      - ${m.rubyName} → ${m.tsName}${why}`);
          }
        }
      }

      if (closureFileSet) {
        const total = detailFiles.reduce((n, f) => n + f.total, 0);
        const matched = detailFiles.reduce((n, f) => n + f.matched, 0);
        const pct = total > 0 ? Math.round((matched / total) * 1000) / 10 : 0;
        console.log(
          `\n  in AR closure: ${matched}/${total} methods (${pct}%)  |  files: ${detailFiles.length}`,
        );
      }
    }
  }

  // Data layer summary (arel + activemodel + activerecord)
  let dataTotal = 0;
  let dataMatched = 0;
  let dataFiles = 0;
  let dataFilesExist = 0;
  for (const pkg of results) {
    if (DATA_LAYER.has(pkg.package)) {
      dataTotal += pkg.totalMethods;
      dataMatched += pkg.matched;
      dataFiles += pkg.totalFiles;
      dataFilesExist += pkg.filesExist;
    }
  }

  // AR closure summary: the data layer plus only the support-gem files that
  // ActiveRecord/ActiveModel actually require (RFC 0092). The file set is
  // regenerated from vendor/rails on every run, so a moved `require` moves the
  // scope without a code change here.
  const closure = writeArClosure();
  let closureTotal = dataTotal;
  let closureMatched = dataMatched;
  let closureFiles = dataFiles;
  let closureFilesExist = dataFilesExist;
  for (const pkg of results) {
    const inScope = closure.files[pkg.package];
    if (!inScope || DATA_LAYER.has(pkg.package)) continue;
    const inScopeSet = new Set(inScope);
    for (const f of pkg.files) {
      if (!inScopeSet.has(f.rubyFile)) continue;
      closureTotal += f.total;
      closureMatched += f.matched;
      closureFiles += 1;
      if (f.tsFileExists) closureFilesExist += 1;
    }
  }

  const grandPct = grandTotal > 0 ? Math.round((grandMatched / grandTotal) * 1000) / 10 : 0;
  const dataPct = dataTotal > 0 ? Math.round((dataMatched / dataTotal) * 1000) / 10 : 0;
  const closurePct = closureTotal > 0 ? Math.round((closureMatched / closureTotal) * 1000) / 10 : 0;
  console.log(`\n${"=".repeat(100)}`);
  if (dataTotal > 0 && dataTotal !== grandTotal) {
    console.log(
      `  Data layer: ${dataMatched}/${dataTotal} methods (${dataPct}%)  |  files: ${dataFilesExist}/${dataFiles}`,
    );
  }
  if (closureTotal > dataTotal) {
    console.log(
      `  AR closure: ${closureMatched}/${closureTotal} methods (${closurePct}%)  |  files: ${closureFilesExist}/${closureFiles}`,
    );
  }
  const inhPct =
    grandInhChecked > 0 ? Math.round((grandInhMatched / grandInhChecked) * 1000) / 10 : 0;
  const inhSummary =
    grandInhChecked > 0
      ? `  |  inheritance: ${grandInhMatched}/${grandInhChecked} (${inhPct}%)`
      : "";
  const grandArOk = grandArityCompared - grandArityMismatched;
  const arPct =
    grandArityCompared > 0 ? Math.round((grandArOk / grandArityCompared) * 1000) / 10 : 0;
  const grandArityExcludedNote = grandArityExcluded > 0 ? `, ${grandArityExcluded} excluded` : "";
  const aritySummary =
    grandArityCompared > 0
      ? `  |  arity: ${grandArOk}/${grandArityCompared} (${arPct}%${grandArityExcludedNote})`
      : "";
  console.log(
    `  Overall: ${grandMatched}/${grandTotal} methods (${grandPct}%)  |  files: ${grandFilesExist}/${grandFiles}${inhSummary}${aritySummary}`,
  );
  if (grandParamNamesCompared > 0) {
    const pnOk = grandParamNamesCompared - grandParamNamesMismatched;
    const pnPct = Math.round((pnOk / grandParamNamesCompared) * 1000) / 10;
    console.log(
      `  Parameter names (advisory): ${pnOk}/${grandParamNamesCompared} pairs (${pnPct}%) spell ` +
        `Rails' identifiers${showParams ? "" : " — rerun with --params for the breakdown, or see output/param-name-mismatches.json"}`,
    );
  }
  if (grandArityMismatched > 0 && !showArity) {
    console.log(
      `  (${grandArityMismatched} arity mismatches — rerun with --arity for the breakdown, or see output/arity-mismatches.json)`,
    );
  }
  if (grandOptKeysCompared > 0) {
    console.log(
      `  Option keys (advisory): ${grandOptKeysCompared} pairs compared, ` +
        `${grandOptKeysMissing} with keys missing in TS (likely-real), ` +
        `${grandOptKeysMismatched} differ total — see output/options-key-mismatches.json`,
    );
  }
  if (grandLiteralsCompared > 0) {
    console.log(
      `  Literals (advisory): ${grandLiteralsCompared} default/constant values compared, ` +
        `${grandLiteralsMismatched} differ — see output/literal-mismatches.json`,
    );
  }
  if (grandCallsCompared > 0) {
    console.log(
      `  Calls (advisory): ${grandCallsCompared} matched pairs checked, ` +
        `${grandCallsMismatched} omit a ported-method call Rails makes — see output/call-mismatches.json`,
    );
  }
  if (grandCallArgsCompared > 0) {
    console.log(
      `  Call args (advisory): ${grandCallArgsCompared} call sites compared, ` +
        `${grandCallArgsMismatched} pass different arguments — see output/call-arg-mismatches.json`,
    );
  }
  console.log(`${"=".repeat(100)}\n`);
}

// Only run the CLI when invoked as a script. `import`s (e.g. from tests)
// should be able to pull in exported helpers without triggering main().
const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("compare.ts");
if (invokedAsScript) main();
