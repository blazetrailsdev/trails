/**
 * Ruby `empty?`, for ports of Ruby collection predicates.
 *
 * This has no Rails counterpart — `Array#empty?`, `Hash#empty?` and
 * `String#empty?` are Ruby core, the same way `activerecord`'s sibling
 * `ruby-truthy.ts` models Ruby truthiness. It lives in activesupport, the
 * lowest package every port can reach, so an `empty?` in an activesupport body
 * spells the same call an activerecord one does.
 *
 * It exists because the obvious
 * spellings — `xs.length === 0`, `Object.keys(h).length === 0` — are property
 * reads, so a faithfully ported body emits no call at all and the call-set gate
 * (RFC 0047) has nothing to credit the Ruby `empty?` with. Calling it keeps the
 * Ruby method visible in the TS body, which is what the gate measures and what
 * a Rails dev reads.
 *
 * Receiver dispatch follows `core_ext/object/blank.rb`'s own arms — Ruby's
 * `Array`/`Hash` `blank?` IS `empty?` (blank.rb:96, 111) — so `Set`/`Map` (the
 * ports' Hash-like receivers) answer on `size`, and a plain object on its own
 * keys.
 *
 * @internal
 */
export function isEmpty(value: readonly unknown[] | string | object): boolean {
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  return Object.keys(value).length === 0;
}
