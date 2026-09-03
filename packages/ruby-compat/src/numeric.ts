/**
 * Ruby `Float#round` (`vendor/ruby/numeric.c:2505` `flo_round`): rounds to
 * `ndigits` decimal places, half away from zero — which is where JS
 * `Math.round` differs, rounding `-0.5` up to `-0` where Ruby answers `-1`.
 * @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/numeric.c:2505`).
 */
export function round(x: number, ndigits = 0): number {
  const f = 10 ** ndigits;
  const scaled = x * f;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return ndigits === 0 ? rounded : rounded / f;
}
