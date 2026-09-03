/** @noRailsEquivalent PERMANENT */
export class ThrownException extends Error {
  readonly value: unknown;

  constructor(value: unknown) {
    super("uncaught throw :exception");
    this.name = "ThrownException";
    this.value = value;
  }
}

/** @noRailsEquivalent PERMANENT */
export function throwException(value: unknown): never {
  throw new ThrownException(value);
}

/** @noRailsEquivalent PERMANENT */
export function catchException<T>(block: () => T): T | unknown {
  try {
    return block();
  } catch (error) {
    if (error instanceof ThrownException) return error.value;
    throw error;
  }
}
