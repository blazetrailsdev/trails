/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function ownState<T>(klass: object, key: string, factory: () => T): T {
  const bag = klass as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(bag, key)) bag[key] = factory();
  return bag[key] as T;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function readOwnState<T>(klass: object, key: string): T | undefined {
  const bag = klass as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(bag, key) ? (bag[key] as T) : undefined;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function writeOwnState(klass: object, key: string, value: unknown): void {
  (klass as Record<string, unknown>)[key] = value;
}
