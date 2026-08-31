/**
 * The Ruby-core → `@blazetrails/ruby-compat` call resolution table (RFC 0129),
 * read in BOTH directions:
 *
 *   forward — Ruby calls `Regexp.escape`, TS calls `regexpEscape`: the port
 *             made the call, so no mismatch is reported. Same silence-only
 *             contract `jsEnumerableAliases` has — a forward credit can never
 *             manufacture a flag.
 *   reverse — Ruby calls `Regexp.escape`, TS hand-rolls the escape under some
 *             other name: a mismatch, converging by importing the export, not
 *             by baselining it.
 *
 * In `scripts/parity/` because two tools read it — the call ratchet's alias hook
 * (through `enumerable-idioms.ts`) and `parity:api:calls:ruby-compat:report` —
 * RFC 0092's shared-home rule.
 *
 * ── Keyed by the MRI SPELLING, and why that is not enough on its own ────────
 * Rows are keyed `Receiver#method` / `Receiver.method`, because the bare name
 * is ambiguous across receivers: `fetch` is `Hash#fetch`
 * (`vendor/ruby/hash.c:2176`), `Array#fetch` AND
 * `ActiveSupport::Cache::Store#fetch` — the last of which is Rails, must keep
 * flagging, and would be silently credited by a TS `fetch`.
 *
 * But the comparator cannot recover a receiver: the Ruby extractor records a
 * body's calls as NAMES (`extract-ruby-api.rb` `collect_method_calls`) with one
 * receiver signal beside them, the inert-receiver `weakCalls` subset (RFC
 * 0083), and the TS side has only `FOREIGN_READ_PREFIX`. Neither tells
 * `options.fetch` from `cache.fetch`.
 *
 * So: **where the receiver cannot be resolved, the row does not go in the
 * table.** A row admitted anyway would credit a Rails `fetch` for a Ruby one,
 * which is worse than flagging both. The MRI keying is what makes each
 * admission legible — you can see WHICH `fetch` a row claims — not a
 * discriminator the comparator gets to use; {@link AMBIGUOUS_RUBY_CALLS} keeps
 * every exclusion reviewable rather than an absence. Only what trails actually
 * calls goes in: a resolution table, not an inventory of Ruby core.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

/**
 * MRI spelling → the `@blazetrails/ruby-compat` export that is its port.
 *
 * `Regexp.escape` (`vendor/ruby/re.c:4144` `rb_reg_s_quote`) is the entry
 * folded in from `enumerable-idioms.ts`'s former `CORE_LIBRARY_ALIASES`, which
 * held it alone. Its argument for admission is the one every row needs: the TS
 * name must be implausible as the port of a DIFFERENT Ruby method of the same
 * bare name. `regexpEscape` cannot be read as a port of `CGI.escape` or
 * `URI::RFC2396_PARSER.escape`, so crediting it cannot silence a dropped call
 * of one — even though `escape` is a bare name three receivers answer.
 *
 * ONE name per row, never a list of the spellings that happened to be in the
 * tree: an alias list would ratify the divergence the row exists to make
 * visible, and a body that escapes under some other name should still flag.
 */
export const RUBY_COMPAT_EXPORTS = new Map<string, string>([
  ["Comparable#<=>", "cmp"],
  ["Comparable#between?", "isBetween"],
  ["Hash#delete_if", "deleteIf"],
  ["Hash#each_key", "eachKey"],
  ["Hash#each_pair", "eachPair"],
  ["Hash#has_key?", "hasKey"],
  ["Hash#key?", "hasKey"],
  ["Hash#transform_values", "transformValues"],
  ["Kernel#Rational", "rational"],
  ["Range#cover?", "cover"],
  ["Regexp.escape", "regexpEscape"],
]);

/**
 * ruby-compat exports deliberately NOT in the table, each with the homonym that
 * makes its bare name unresolvable. Every one is a real export we could credit,
 * held out because the credit would land on the wrong receiver often enough to
 * matter — the table's burndown, not its scrap heap: a row leaves it the day
 * the comparator can resolve a receiver.
 */
export const AMBIGUOUS_RUBY_CALLS = new Map<string, string>([
  ["Hash#except", "`ActiveRecord::Relation#except` is also `except`."],
  ["Hash#fetch", "`ActiveSupport::Cache::Store#fetch` and `Array#fetch` too."],
  ["Hash#merge", "`ActiveRecord::Relation#merge` is also `merge`."],
  ["Hash#merge!", "`ActiveRecord::Relation#merge!` is also `merge!`."],
  ["Hash#reject", "`Enumerable#reject` is also `reject`."],
  ["Hash#slice", "`String#slice` and `Array#slice` too."],
  ["Hash#update", "`ActiveRecord::Persistence#update` is also `update`."],
  ["String#succ", "`Integer#succ` and `Date#succ`, neither ported here."],
  ["Symbol#to_s", "`to_s` is every object's."],
]);

/** The bare method name of an MRI spelling: `Hash#key?` → `key?`. */
export function rubyCallName(mriSpelling: string): string {
  return mriSpelling.split(/[#.]/).slice(1).join(".");
}

/** Bare Ruby call name → the ruby-compat exports claiming it. A name two rows
 *  claim for DIFFERENT exports stays visible rather than collapsing; `key?` and
 *  `has_key?` claim one export between them, so they resolve. */
function byBareName(): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>();
  for (const [mri, tsExport] of RUBY_COMPAT_EXPORTS) {
    const name = rubyCallName(mri);
    const claims = byName.get(name) ?? new Set<string>();
    claims.add(tsExport);
    byName.set(name, claims);
  }
  return byName;
}

const BY_BARE_NAME = byBareName();

/** The ruby-compat export that ports Ruby call `rubyCall`, or `undefined` when
 *  the table admits none — including when two rows claim the bare name for
 *  DIFFERENT exports, the same unresolvable-receiver case as an
 *  {@link AMBIGUOUS_RUBY_CALLS} member, excluded for the same reason. */
export function rubyCompatExport(rubyCall: string): string | undefined {
  const claims = BY_BARE_NAME.get(rubyCall);
  if (claims === undefined || claims.size !== 1) return undefined;
  return [...claims][0];
}

/** The forward direction: JS call names that count as making Ruby call
 *  `rubyCall`, in the shape {@link jsEnumerableAliases} consults. */
export function rubyCompatAliases(rubyCall: string): string[] {
  const tsExport = rubyCompatExport(rubyCall);
  return tsExport === undefined ? [] : [tsExport];
}
