/** @internal */
export function mustBe(actual: Record<string, () => unknown>, operator: string): void {
  if (!actual[operator]()) {
    throw new Error(`Expected ${inspect(actual)} to be ${operator}`);
  }
}

/** @internal */
export function wontBe(actual: Record<string, () => unknown>, operator: string): void {
  if (actual[operator]()) {
    throw new Error(`Expected ${inspect(actual)} to not be ${operator}`);
  }
}

/** @internal */
export function mustRespondTo(obj: object, meth: string): void {
  if (!(meth in obj)) {
    throw new Error(`Expected ${inspect(obj)} to respond to #${meth}`);
  }
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
