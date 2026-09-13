/**
 * The Ruby-core → `@blazetrails/ruby-compat` call resolution table (RFC 0129),
 * read in both directions: FORWARD, a TS `regexpEscape` counts as making Ruby's
 * `Regexp.escape`, so a faithful port is not flagged — the silence-only contract
 * `jsEnumerableAliases` already has, where a credit can never manufacture a
 * flag; REVERSE, a body that hand-rolls the escape under another name IS
 * flagged, and converges by importing the export, not by baselining. It lives in
 * `scripts/parity/` because two tools read it (RFC 0092's shared-home rule).
 *
 * ── Keyed by the MRI SPELLING, and why that is not enough on its own ────────
 * Rows are keyed `Receiver#method` / `Receiver.method`, because the bare name is
 * ambiguous across receivers: `fetch` is `Hash#fetch` (`vendor/ruby/hash.c:2176`),
 * `Array#fetch` AND `ActiveSupport::Cache::Store#fetch` — the last of which is
 * Rails, must keep flagging, and would be silently credited by a TS `fetch`.
 *
 * The comparator now CAN recover a coarse receiver: `extract-ruby-api.rb`
 * records a `callReceivers` kind per call name beside the inert-receiver
 * `weakCalls` subset (RFC 0083) — `hash` for a hash literal or a local it
 * proved is one, `string` / `symbol` / `array` / `numeric` for the other
 * literals, and the unproven shapes by shape (`local`, `ivar`, `const`,
 * `self`, `expr`). So a row whose bare name is ambiguous ACROSS receivers goes
 * in {@link RECEIVER_KEYED_RUBY_COMPAT_EXPORTS} instead, admitted only where
 * every site's kind is one the row's own receiver can be: `Hash#fetch` credits
 * `options.fetch` and never `cache.fetch`, whose receiver is an unproven
 * `local`. **Where the receiver still cannot be resolved, the row does not go
 * in the table at all** — a row admitted anyway would credit a Rails `fetch`
 * for a Ruby one, worse than flagging both — and {@link AMBIGUOUS_RUBY_CALLS}
 * keeps those exclusions reviewable.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

/**
 * MRI spelling → the `@blazetrails/ruby-compat` export that is its port.
 *
 * `Regexp.escape` (`vendor/ruby/re.c:4144` `rb_reg_s_quote`) is the entry folded
 * in from `enumerable-idioms.ts`'s former `CORE_LIBRARY_ALIASES`. Its argument
 * for admission is the one every row needs: the TS name must be implausible as
 * the port of a DIFFERENT Ruby method of the same bare name. `regexpEscape`
 * cannot be read as a port of `CGI.escape` or `URI::RFC2396_PARSER.escape`, so
 * crediting it cannot silence a dropped call of one. ONE name per row, never a
 * list of the spellings in the tree: an alias list would ratify the divergence
 * the row exists to make visible.
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
  ["Kernel#Float", "kernelFloat"],
  ["Kernel#Rational", "rational"],
  ["Range#cover?", "cover"],
  ["Regexp.escape", "regexpEscape"],
]);

/** The receiver kinds `extract-ruby-api.rb`'s `receiver_kind` records, in the
 *  spelling the artifact carries them. `hash`, `string`, `symbol`, `array` and
 *  `numeric` name the receiver's CLASS, and only where Ripper proved it; the
 *  rest name a shape whose class is unknown, so a receiver-keyed row can never
 *  match one. */
export type ReceiverKind =
  | "hash"
  | "string"
  | "symbol"
  | "array"
  | "numeric"
  | "regexp"
  | "self"
  | "local"
  | "ivar"
  | "const"
  | "expr";

/**
 * MRI spelling → its ruby-compat export AND the receiver kinds that prove the
 * receiver is the one the key names. Every row here is a name a Rails method
 * ALSO answers — `Relation#merge`, `Cache::Store#fetch`, `Persistence#update`
 * — so it is admitted at a call site only, and only when every site of that
 * name in the body had a proving kind. A `cache.fetch` records `local`, which
 * proves nothing and so credits nothing.
 *
 * Each row's Ruby receiver is a single class, so each takes a single kind —
 * plus, where `ivar: true`, the `ivar` shape: `@row.include?` in
 * `fixture_set/table_row.rb:113` is a Hash the extractor cannot prove, and a
 * row admits it only where no other ruby-compat row and no JS spelling of the
 * same bare name would read it differently;
 * `RECEIVER_KEYED_RUBY_COMPAT_EXPORTS` is a separate map from
 * {@link RUBY_COMPAT_EXPORTS} rather than an optional field on it because the
 * two are read differently — an unconditional row credits from the name alone.
 */
export const RECEIVER_KEYED_RUBY_COMPAT_EXPORTS = new Map<
  string,
  { tsExport: string; receiver: ReceiverKind; ivar?: true }
>([
  ["Hash#delete", { tsExport: "hashDelete", receiver: "hash", ivar: true }],
  ["Hash#except", { tsExport: "except", receiver: "hash" }],
  ["Hash#fetch", { tsExport: "fetch", receiver: "hash" }],
  // MRI defines `include?` onto `rb_hash_has_key` (`vendor/ruby/hash.c:7255`),
  // the same body `key?` and `has_key?` get, so its port is `hasKey` too.
  ["Hash#include?", { tsExport: "hasKey", receiver: "hash", ivar: true }],
  ["Hash#merge", { tsExport: "merge", receiver: "hash" }],
  ["Hash#merge!", { tsExport: "mergeBang", receiver: "hash" }],
  ["Hash#reject", { tsExport: "reject", receiver: "hash" }],
  ["Hash#slice", { tsExport: "slice", receiver: "hash" }],
  ["Hash#update", { tsExport: "update", receiver: "hash" }],
  ["String#delete", { tsExport: "stringDelete", receiver: "string" }],
  ["String#succ", { tsExport: "succ", receiver: "string" }],
  ["Symbol#to_s", { tsExport: "symbolToS", receiver: "symbol" }],
]);

/** ruby-compat exports deliberately NOT in the table, each with the homonym
 *  that makes its bare name unresolvable — the table's burndown, not its scrap
 *  heap: a row leaves it the day the comparator can resolve a receiver. The
 *  ten `Hash#` / `String#` / `Symbol#` rows it opened with left it for
 *  {@link RECEIVER_KEYED_RUBY_COMPAT_EXPORTS} the day `callReceivers` landed
 *  (RFC 0129); it is empty, and only ever shrinks. */
export const AMBIGUOUS_RUBY_CALLS = new Map<string, string>([]);

/** The bare method name of an MRI spelling: `Hash#key?` → `key?`. */
export function rubyCallName(mriSpelling: string): string {
  return mriSpelling.split(/[#.]/).slice(1).join(".");
}

/** Bare Ruby call name → the ruby-compat exports claiming it. A name two rows
 *  claim for DIFFERENT exports stays visible rather than collapsing; `key?` and
 *  `has_key?` claim one export between them, so they resolve. */
function byBareName(): Map<string, Set<Claim>> {
  const byName = new Map<string, Set<Claim>>();
  const add = (mri: string, claim: Claim): void => {
    const name = rubyCallName(mri);
    const claims = byName.get(name) ?? new Set<Claim>();
    claims.add(claim);
    byName.set(name, claims);
  };
  for (const [mri, tsExport] of RUBY_COMPAT_EXPORTS) add(mri, { tsExport });
  for (const [mri, row] of RECEIVER_KEYED_RUBY_COMPAT_EXPORTS) add(mri, row);
  return byName;
}

/** One row as {@link rubyCompatExport} reads it: `receiver` absent on an
 *  unconditional row, which credits from the bare name alone. */
type Claim = { tsExport: string; receiver?: ReceiverKind; ivar?: true };

const BY_BARE_NAME = byBareName();

/** The ruby-compat export that ports Ruby call `rubyCall` on a receiver whose
 *  recorded kinds are `receiverKinds` (the Ruby body's `callReceivers` entry
 *  for the name, absent when every occurrence was an unqualified call), or
 *  `undefined` when the table admits none.
 *
 *  A row keyed on a receiver is admitted only when EVERY kind recorded for the
 *  name proves that receiver — the same all-sites discipline `weakCalls` has,
 *  and the reason a body mixing `options.fetch` with `cache.fetch` credits
 *  neither. Two rows claiming one bare name for DIFFERENT exports resolve only
 *  where the recorded kinds admit exactly one of them — `delete` on a `hash`
 *  or `ivar` is `Hash#delete`, never `String#delete` — and otherwise nothing,
 *  the unresolvable-receiver case an {@link AMBIGUOUS_RUBY_CALLS} member is. */
export function rubyCompatExport(
  rubyCall: string,
  receiverKinds?: readonly string[],
): string | undefined {
  const claims = BY_BARE_NAME.get(rubyCall);
  if (claims === undefined) return undefined;
  if (claims.size === 1) {
    const claim = [...claims][0];
    if (claim.receiver === undefined) return claim.tsExport;
  }
  if (receiverKinds === undefined || receiverKinds.length === 0) return undefined;
  const admitted = [...claims].filter(
    (claim) =>
      claim.receiver !== undefined &&
      receiverKinds.every(
        (kind) => kind === claim.receiver || (claim.ivar === true && kind === "ivar"),
      ),
  );
  return admitted.length === 1 ? admitted[0].tsExport : undefined;
}

/** Forward: JS call names counting as Ruby `rubyCall`, as `jsEnumerableAliases` consults. */
export function rubyCompatAliases(rubyCall: string, receiverKinds?: readonly string[]): string[] {
  const tsExport = rubyCompatExport(rubyCall, receiverKinds);
  return tsExport === undefined ? [] : [tsExport];
}
