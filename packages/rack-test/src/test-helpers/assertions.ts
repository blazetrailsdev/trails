import { expect } from "vitest";
import { rbObjClass } from "@blazetrails/ruby-compat";

/** @internal */
export function mustBe(actual: Record<string, () => unknown>, operator: string): void {
  expect(actual[operator](), `Expected ${inspect(actual)} to be ${operator}`).toBeTruthy();
}

/** @internal */
export function wontBe(actual: Record<string, () => unknown>, operator: string): void {
  expect(actual[operator](), `Expected ${inspect(actual)} to not be ${operator}`).toBeFalsy();
}

/** @internal */
export function mustRespondTo(obj: object, meth: string): void {
  expect(meth in obj, `Expected ${inspect(obj)} (${rbObjClass(obj)}) to respond to #${meth}`).toBe(
    true,
  );
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
