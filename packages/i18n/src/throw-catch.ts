/**
 * Ruby's `throw`/`catch` has no JS analogue. `I18n::Backend::Base#translate`
 * signals a missing translation with `throw(:exception, ...)`, which callers
 * intercept with `catch(:exception)`; the pair below is that mechanism, not a
 * port of any gem file.
 */

/**
 * @noRailsEquivalent PERMANENT — Ruby's `throw`/`catch` is a language-level
 * non-local exit with no JS counterpart, so the value Ruby throws has to travel
 * as a carrier error.
 */
export class ThrownException extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super("uncaught throw :exception");
    this.name = "ThrownException";
    this.value = value;
  }
}

/**
 * Mirrors Ruby's `throw(:exception, value)`.
 *
 * @noRailsEquivalent PERMANENT — `throw` is a Ruby keyword, not a method.
 */
export function throwException(value: unknown): never {
  throw new ThrownException(value);
}

/**
 * Mirrors Ruby's `catch(:exception) { ... }`.
 *
 * @noRailsEquivalent PERMANENT — `catch` is a Ruby keyword, not a method.
 */
export function catchException<T>(block: () => T): T | unknown {
  try {
    return block();
  } catch (error) {
    if (error instanceof ThrownException) return error.value;
    throw error;
  }
}
