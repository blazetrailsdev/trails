/** @internal */
export function assertNotSame(unexpected: unknown, actual: unknown): void {
  if (Object.is(actual, unexpected)) {
    throw new Error(`Expected ${inspect(actual)} to not be the same as ${inspect(unexpected)}.`);
  }
}

/** @internal */
export function assertEmpty(actual: ArrayLike<unknown>, message?: string): void {
  if (actual.length !== 0) {
    throw new Error(`${message ? `${message}: ` : ""}Expected ${inspect(actual)} to be empty.`);
  }
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
