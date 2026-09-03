/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function isRubyTruthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}
