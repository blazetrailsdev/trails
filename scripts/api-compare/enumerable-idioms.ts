import { rubyCompatAliases } from "../parity/ruby-compat.js";

/**
 * Single source of truth for Ruby Enumerable/Comparable idioms whose faithful
 * port is a native JS method spelled DIFFERENTLY. Two api-compare tools consume
 * it (RFC 0025), so it lives here rather than in a copy each keeps in sync:
 *   - compare.ts's call ratchet counts the analogue (`some` for `any?`) as
 *     making the Ruby call, so a faithful port isn't flagged as an omission;
 *   - lint-calls.ts's call-graph lint treats the KEYS as noise — Ruby records
 *     them as calls but the port is a native JS method, not a ported internal.
 *
 * A value lists ONLY the differently-named spelling: the naming-convention name
 * (`rubyMethodToTs`) is already a candidate, so `select` needs just ["filter"].
 * Each alias must be the WHOLE call's analogue, never a building block —
 * `min_by → reduce` would let any reduce silence a dropped min_by, so such loose
 * pairs are deliberately absent. Aliases are consulted only to decide whether a
 * TS body already makes a call; they never widen which Ruby calls count as
 * ported, so adding one can never introduce a new mismatch.
 *
 * NO POSITIONAL/PROPERTY ANALOGUES HERE, and that is a measured decision, not
 * an oversight (RFC 0092 `positional-idiom-analogues`, 2026-08-08). `first` →
 * `[0]`, `last` → `.at(-1)`, `size` → `.length`, `any?` → `.length > 0` are
 * property or index forms, not call names, so they could only be credited
 * through `NO_JS_CALL_FORM` (compare.ts) — which suppresses the Ruby call for
 * EVERY receiver. The evidence against doing that is recorded at that table's
 * "DELIBERATELY NOT suppressed" comment: the one receiver distinction the
 * comparator has (the RFC 0083 inert-receiver filter) is already applied, and
 * zero of the 106 surviving activerecord rows for these names are inert, while
 * several are genuine Relation receivers whose `.first`/`.any?` runs a query.
 * Those rows are handed to the reason-text route instead.
 */
export const JS_ENUMERABLE_ALIASES = new Map<string, string[]>([
  ["any?", ["some"]],
  ["all?", ["every"]],
  // `none?` is `!any?`: the `some` analogue must be NEGATED, and so must the
  // de-Morgan `every` — `!xs.every(p)` or `xs.every((x) => !p(x))`, both of
  // which the extractor marks (see NEGATED_ALIASES).
  ["none?", ["some", "every"]],
  ["one?", ["filter"]],
  // `includes` is omitted here on purpose: it is now a naming-convention
  // candidate for these two (CONTAINMENT_PREDICATE_ALIASES in conventions.ts),
  // and conventions.test.ts fails on an alias the conventions already produce.
  ["include?", ["has"]],
  ["member?", ["has"]],
  // ActiveSupport's `exclude?` is `!include?`, so the containment call is the
  // whole call — ports spell it `!xs.includes(y)` / `!set.has(y)`, and the
  // leading `!` IS required (see NEGATED_ALIASES). (The convention
  // candidate for a method NAMED `exclude?` is `excludes`, so no overlap.)
  ["exclude?", ["includes", "has"]],
  ["key?", ["has"]],
  ["has_key?", ["has"]],
  ["select", ["filter"]],
  ["reject", ["filter"]],
  ["detect", ["find"]],
  ["collect", ["map"]],
  ["collect_concat", ["flatMap"]],
  ["each", ["forEach"]],
  ["inject", ["reduce"]],
  ["index", ["indexOf", "findIndex"]],
  ["find_index", ["indexOf"]],
  ["sort_by", ["sort"]],
  // Ruby Array#concat mutates the receiver → JS `push(...xs)`; Array#concat's
  // new-array return is NOT the analogue.
  ["concat", ["push"]],
  // `Regexp#match?` is exactly and only "does this pattern match?", which JS
  // spells `RegExp#test` — the WHOLE call's analogue, not a building block, so
  // it cannot silence a dropped call the way a loose pair would.
  ["match?", ["test"]],
]);

/**
 * Ruby `File` class methods whose faithful port goes through trails' fs adapter
 * (`activesupport/src/fs-adapter.ts`), whose members carry NODE's spellings —
 * `File.exist?` is `getFs().existsSync`, `File.stat` is `statSync`, and so on.
 * Ruby's name is not available: the adapter is the Node `fs` surface, so the
 * port cannot spell the call `exist` without inventing a wrapper Rails does not
 * have. Same silence-only contract as {@link JS_ENUMERABLE_ALIASES} — an alias
 * only decides whether a TS body already makes a call and can never manufacture
 * a mismatch — and kept a separate table for the same reason
 * `RUBY_COMPAT_EXPORTS` (scripts/parity/ruby-compat.ts) is: these KEYS are not
 * lint-calls.ts noise.
 *
 * Both spellings are listed per name because the adapter exposes the sync
 * member (`existsSync`) while a promise-shaped seam spells it bare (`exists`).
 * Each is the WHOLE call's analogue, never a building block.
 */
export const FS_ADAPTER_ALIASES = new Map<string, string[]>([
  ["exist?", ["existsSync", "exists"]],
  ["stat", ["statSync"]],
  ["rename", ["renameSync"]],
  ["unlink", ["unlinkSync"]],
  ["realpath", ["realpathSync"]],
]);

/** JS call names that count as making Ruby call `rubyCall`. The Ruby-core tail
 *  is `rubyCompatAliases` (scripts/parity/ruby-compat.ts), the FORWARD half of
 *  the RFC 0129 table that absorbed this file's `CORE_LIBRARY_ALIASES`; same
 *  silence-only contract as the two tables above it. */
export function jsEnumerableAliases(rubyCall: string): string[] {
  const aliases = JS_ENUMERABLE_ALIASES.get(rubyCall) ?? FS_ADAPTER_ALIASES.get(rubyCall);
  /* A name can be claimed by both halves — `key?` is `Map#has` on a Map receiver
     AND `@blazetrails/ruby-compat`'s `hasKey` on an object one — so the two are
     UNIONED rather than short-circuited: either spelling is the whole call. */
  return [...new Set([...(aliases ?? []), ...rubyCompatAliases(rubyCall)])];
}

/**
 * Aliases whose faithful port carries a `!` — the Ruby call is the NEGATION of
 * that JS analogue, so only a NEGATED TS call counts: `none?` → `!xs.some(p)`,
 * `exclude?` → `!xs.includes(y)` / `!set.has(y)`. Without this, a port that
 * INVERTED the condition (a bare `xs.includes(y)` where Rails wrote
 * `exclude?`) silenced the ratchet just as well as the faithful one.
 *
 * Keyed per-ALIAS, not per Ruby call, because the marker is only meaningful
 * where the alias is the negation: `all? → every` is faithful unnegated.
 *
 * `none? → every` is the de-Morgan analogue, whose `!` may sit on the call
 * (`!xs.every(p)`) or INSIDE the predicate callback (`xs.every((t) =>
 * !t.isDirty())`, transaction.ts `isRestorable`, porting
 * `@stack.none?(&:dirty?)` at abstract/transaction.rb:573). The extractor marks
 * both shapes (see NEGATED_CALL_PREFIX), so requiring the marker here rejects
 * only the de-Morgan OPPOSITE — a bare `xs.every(p)` where Rails wrote
 * `none?`.
 */
export const NEGATED_ALIASES = new Map<string, Set<string>>([
  ["none?", new Set(["some", "every"])],
  ["exclude?", new Set(["includes", "has"])],
]);

/**
 * Prefix the TS extractor uses to mark a call it saw in a NEGATED position —
 * either the call itself (`!xs.includes(y)` → `!includes`) or its predicate
 * callback (`xs.every((t) => !t.isDirty())` → `!every`), which is where a
 * de-Morgan port puts the negation. Marked names are recorded IN ADDITION to
 * the plain name, so every consumer that tests membership by plain name is
 * unaffected; only the {@link NEGATED_ALIASES} check reads the marked form.
 * Lives here, not in extract-ts-api.ts, so compare.ts can read it without
 * importing the extractor (and its TypeScript-compiler dependency).
 */
export const NEGATED_CALL_PREFIX = "!";

/**
 * Prefix the TS extractor uses to mark a name it only ever saw as a member of a
 * receiver that is not `this`/`super` — a property READ (`details.locale` →
 * `.locale`) or an INVOCATION (`details.digest(x)` → `.digest`).
 * Ruby has no field access, so such a read still counts as a call — the plain
 * name is recorded exactly as before — but it names a member of ANOTHER object,
 * so the same-file closure must not resolve it against a same-file method that
 * happens to carry the name (RFC 0108; see reachedSameFileMethods).
 *
 * Marked IN ADDITION to the plain name, and only when EVERY occurrence in the
 * body was off such a receiver: one `this.locale()` in the same body makes the
 * name the body's own again.
 */
export const FOREIGN_READ_PREFIX = ".";

/** Whether alias `tsCall` counts for `rubyCall` only when the TS call is negated. */
export function requiresNegatedAlias(rubyCall: string, tsCall: string): boolean {
  return NEGATED_ALIASES.get(rubyCall)?.has(tsCall) ?? false;
}

/**
 * Split a raw TS call-set into the plain call names, the names the extractor
 * saw in a NEGATED position (`!includes` → `includes`) and the ones it only saw
 * as a foreign member — read or call (`.locale` → `locale`). Both marked populations are
 * kept OUT of the plain set: they are a second record of a call already in it,
 * so leaving them in would double-count against DELEGATION_MAX_CALLS in
 * `isDelegatingWrapper` (compare.ts) and make wrapper detection body-shape dependent.
 */
export function partitionNegatedCalls(raw: Iterable<string>): {
  calls: Set<string>;
  negated: Set<string>;
  foreignReads: Set<string>;
} {
  const calls = new Set<string>();
  const negated = new Set<string>();
  const foreignReads = new Set<string>();
  for (const c of raw) {
    if (c.startsWith(NEGATED_CALL_PREFIX)) negated.add(c.slice(NEGATED_CALL_PREFIX.length));
    else if (c.startsWith(FOREIGN_READ_PREFIX)) {
      foreignReads.add(c.slice(FOREIGN_READ_PREFIX.length));
    } else calls.add(c);
  }
  return { calls, negated, foreignReads };
}
