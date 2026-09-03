import { ArgumentError } from "@blazetrails/activemodel";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function drop<T>(value: readonly T[], n: number): T[] {
  if (n < 0) throw new ArgumentError("attempt to drop negative size");
  return value.slice(n);
}
