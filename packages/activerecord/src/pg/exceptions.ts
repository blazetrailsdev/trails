export const PG_DIAG_SQLSTATE = 67;

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
  if (!(error instanceof Error) || "result" in error || !Object.isExtensible(error)) return error;
  const { code, message } = error as Error & { code?: unknown };
  let result: { errorField(fieldcode: number): string | null } | null = null;
  if (error.name === "error" && typeof code === "string") {
    result = { errorField: (fieldcode) => (fieldcode === PG_DIAG_SQLSTATE ? code : null) };
  } else if (message.includes("client has already ended") || /client was closed/i.test(message)) {
    CONNECTION_BAD.set(error, false);
  } else if (
    (typeof code === "string" && code.startsWith("08")) ||
    message.includes("Client has encountered a connection error") ||
    message.includes("invalid frontend message type") ||
    message.includes("Connection terminated")
  ) {
    CONNECTION_BAD.set(error, true);
  }
  return Object.defineProperty(error, "result", {
    value: result,
    writable: true,
    configurable: true,
  });
}

export function connectionBad(error: unknown): Error {
  const bad = error instanceof Error ? error : new Error(String(error));
  pgError(bad);
  CONNECTION_BAD.set(bad, true);
  return bad;
}
