/**
 * @noRailsEquivalent PERMANENT Ruby core Array#drop, modelled so a ported body still credits `reflection.chain.drop(1)` (association_scope.rb:115).
 */
import { ArgumentError } from "@blazetrails/activemodel";

/**
 * Ruby `Array#drop`, for ports of Ruby collection readers.
 *
 * This has no Rails counterpart — `Array#drop` is Ruby core, the same way the
 * sibling `ruby-first.ts` models `first` and `ruby-empty.ts` models `empty?`.
 * It lives here rather than in activesupport for the same reason `ruby-first.ts`
 * does: the call-set comparator resolves a Ruby call name against the PORTED
 * names of the package the call appears in, so exporting `drop` from
 * activesupport would make every Ruby `drop` in an activesupport body
 * resolvable and surface a pile of unrelated divergences at once.
 *
 * It exists because the faithful spelling — `chain.slice(1)` — names a JS
 * method Ruby never calls, so a faithfully ported body credits no `drop` and
 * the call-set gate (RFC 0047) has nothing to match against Ruby's
 * `reflection.chain.drop(1)` (`association_scope.rb:115`,
 * `through_association.rb:36`). Calling it keeps the Ruby method visible in the
 * TS body, which is what the gate measures and what a Rails dev reads.
 *
 * Only the Array arm is ported, the way `ruby-first.ts` limited itself to its
 * own receivers. Ruby raises `ArgumentError, "attempt to drop negative size"`
 * for a negative count (`array.c`'s `rb_ary_drop`); that arm is kept because it
 * is the one observable behaviour `slice` silently disagrees with — `slice(-1)`
 * returns a tail instead of raising.
 *
 * @internal
 * @noRailsEquivalent PERMANENT Ruby core Array#drop, modelled so a ported body still credits `reflection.chain.drop(1)` (association_scope.rb:115).
 */
export function drop<T>(value: readonly T[], n: number): T[] {
  if (n < 0) throw new ArgumentError("attempt to drop negative size");
  return value.slice(n);
}
