/**
 * @noRailsEquivalent PERMANENT Ruby core Array#first, modelled so a ported body emits a call rather than an index read and the call-set gate can credit it (association_scope.rb:115).
 */

/**
 * Ruby `Array#first`, for ports of Ruby collection readers.
 *
 * This has no Rails counterpart — `Array#first` is Ruby core, the same way the
 * sibling `ruby-empty.ts` models `empty?` and `ruby-truthy.ts` models Ruby
 * truthiness. It lives here rather than in activesupport for the same reason
 * those do: the call-set comparator resolves a Ruby call name against the
 * PORTED names of the package the call appears in, so exporting `first` from
 * activesupport would make every Ruby `first` in an activesupport body
 * resolvable and surface a pile of unrelated divergences at once. activerecord
 * already resolves `first` (`ActiveRecord::Relation#first`), so the population
 * here is unchanged.
 *
 * It exists because the faithful spelling — `rows[0]` — is an index read, so a
 * faithfully ported body emits no call at all and the call-set gate (RFC 0047)
 * has nothing to credit the Ruby `first` with. Calling it keeps the Ruby method
 * visible in the TS body, which is what the gate measures and what a Rails dev
 * reads.
 *
 * Only the no-argument Array arm is ported, the way `ruby-empty.ts` limited
 * itself to its own receivers. Ruby's `first(n)` returns an Array and
 * `Enumerable#first` also answers on Hash and Range; no trails caller needs
 * either yet, and porting an unused arm is surface the ports do not read.
 *
 * @internal
 * @noRailsEquivalent PERMANENT Ruby core Array#first, modelled so a ported body emits a call rather than an index read (association_scope.rb:115).
 */
export function first<T>(value: readonly T[]): T | undefined {
  return value[0];
}
