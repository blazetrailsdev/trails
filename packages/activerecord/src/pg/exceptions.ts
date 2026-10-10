export const PG_DIAG_SQLSTATE = 67;

const ERRORS = new WeakSet<object>();

export class Error {
  static [Symbol.hasInstance](error: unknown): boolean {
    return typeof error === "object" && error !== null && ERRORS.has(error);
  }
}

const CONNECTION_BAD = new WeakMap<object, boolean>();

export class ConnectionBad {
  static [Symbol.hasInstance](error: unknown): boolean {
    return typeof error === "object" && error !== null && CONNECTION_BAD.has(error);
  }

  /** @noRailsEquivalent CONVERGEABLE pg-translate-exception-respond-to-result */
  static isLibpq(error: object): boolean {
    return CONNECTION_BAD.get(error) === true;
  }
}

/** @noRailsEquivalent CONVERGEABLE pg-translate-exception-respond-to-result */
export function pgError(error: unknown): unknown {
  if (!(error instanceof globalThis.Error) || "result" in error || !Object.isExtensible(error)) {
    return error;
  }
  const { code, message } = error as globalThis.Error & { code?: unknown };
  let result: { errorField(fieldcode: number): string | null } | null = null;
  if (error.name === "error" && typeof code === "string") {
    result = { errorField: (fieldcode) => (fieldcode === PG_DIAG_SQLSTATE ? code : null) };
    ERRORS.add(error);
  } else if (message.includes("client has already ended") || /client was closed/i.test(message)) {
    CONNECTION_BAD.set(error, false);
    ERRORS.add(error);
  } else if (
    (typeof code === "string" && code.startsWith("08")) ||
    message.includes("Client has encountered a connection error") ||
    message.includes("invalid frontend message type") ||
    message.includes("Connection terminated")
  ) {
    CONNECTION_BAD.set(error, true);
    ERRORS.add(error);
  } else if (
    (typeof code === "string" && /^E([A-Z]+|AI_[A-Z]+)$/.test(code)) ||
    message.includes("Query read timeout")
  ) {
    ERRORS.add(error);
  }
  return Object.defineProperty(error, "result", {
    value: result,
    writable: true,
    configurable: true,
  });
}

export function connectionBad(error: unknown): globalThis.Error {
  const bad = error instanceof globalThis.Error ? error : new globalThis.Error(String(error));
  pgError(bad);
  CONNECTION_BAD.set(bad, true);
  ERRORS.add(bad);
  return bad;
}
