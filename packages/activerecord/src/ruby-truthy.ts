/**
 * Ruby truthiness, for ports of Ruby conditionals.
 *
 * This has no Rails counterpart — it's a language primitive we have to model
 * explicitly because JS and Ruby disagree in both directions. In Ruby ONLY
 * `nil` and `false` are falsey, so `""`, `0`, `NaN` and `[]` are all truthy;
 * in JS the first three are falsy.
 *
 * Port any `if some_value` / `some_value && ...` guard through this rather
 * than writing a bare JS truthiness check, which silently changes behavior for
 * empty strings and zeroes.
 *
 * @internal
 */
export function isRubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}
