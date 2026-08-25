/**
 * @internal Per-class own-state helper. Mirrors Ruby `@ivar` semantics on
 * a class object: each subclass has its own value, never inherited via
 * the prototype chain. Replaces the duplicated `host = (k) => k as
 * unknown as Host` cast in `trailtie.ts` and `engine.ts`.
 *
 * @noRailsEquivalent PERMANENT -- Ruby gives every class object its own ivars,
 * so `Railtie` just writes `@blocks` and each subclass starts empty
 * (railtie.rb:227-245). A JS class object inherits its properties down the
 * prototype chain, so own-state needs an explicit `hasOwnProperty` guard;
 * there is no Ruby method to mirror.
 */
export function ownState<T>(klass: object, key: string, factory: () => T): T {
  const bag = klass as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(bag, key)) bag[key] = factory();
  return bag[key] as T;
}

/**
 * @internal Read own-state without initializing.
 *
 * @noRailsEquivalent PERMANENT -- the read half of the `@ivar`-on-a-class
 * emulation above; Ruby spells it `@blocks` (railtie.rb:227-245).
 */
export function readOwnState<T>(klass: object, key: string): T | undefined {
  const bag = klass as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(bag, key) ? (bag[key] as T) : undefined;
}

/**
 * @internal Write own-state.
 *
 * @noRailsEquivalent PERMANENT -- the write half of the `@ivar`-on-a-class
 * emulation above; Ruby spells it `@blocks = ...` (railtie.rb:227-245).
 */
export function writeOwnState(klass: object, key: string, value: unknown): void {
  (klass as Record<string, unknown>)[key] = value;
}
