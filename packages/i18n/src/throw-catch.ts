/**
 * Ruby's `throw`/`catch` has no JS analogue. `I18n::Backend::Base#translate`
 * signals a missing translation with `throw(:exception, ...)`, which callers
 * intercept with `catch(:exception)`; the pair below is that mechanism, not a
 * port of any gem file.
 */

export class ThrownException extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super("uncaught throw :exception");
    this.name = "ThrownException";
    this.value = value;
  }
}

/** Mirrors Ruby's `throw(:exception, value)`. */
export function throwException(value: unknown): never {
  throw new ThrownException(value);
}

/** Mirrors Ruby's `catch(:exception) { ... }`. */
export function catchException<T>(block: () => T): T | unknown {
  try {
    return block();
  } catch (error) {
    if (error instanceof ThrownException) return error.value;
    throw error;
  }
}
