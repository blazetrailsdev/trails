/**
 * Ruby's `empty?` — `Array#empty?` (`vendor/ruby/array.c:2686`
 * `rb_ary_empty_p`), `Hash#empty?` (`vendor/ruby/hash.c:3023`
 * `rb_hash_empty_p`) and `String#empty?` (`vendor/ruby/string.c:2243`
 * `rb_str_empty`). All three are C primitives, so they have no counterpart
 * file for the port to mirror.
 *
 * It exists because the obvious spellings — `xs.length === 0`,
 * `Object.keys(h).length === 0` — are property reads, so a faithfully ported
 * body emits no call at all and the call-set gate (RFC 0047) has nothing to
 * credit the Ruby `empty?` with. Calling it keeps the Ruby method visible in
 * the TS body, which is what the gate measures and what a Rails dev reads.
 *
 * Receiver dispatch follows `core_ext/object/blank.rb`'s own arms — Ruby's
 * `Array`/`Hash` `blank?` IS `empty?` (blank.rb:96, 111) — so `Set`/`Map` (the
 * ports' Hash-like receivers) answer on `size`, and a plain object on its own
 * keys.
 *
 * @internal
 * @noRailsEquivalent PERMANENT `empty?` is Ruby core, not Rails
 * (`vendor/ruby/array.c:2686`, `hash.c:3023`, `string.c:2243`), so it has no
 * counterpart file; it exists so a ported body emits the call the RFC 0047
 * call-set gate credits (blank.rb:96, 111).
 */
export function isEmpty(value: readonly unknown[] | string | object): boolean {
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  return Object.keys(value).length === 0;
}
