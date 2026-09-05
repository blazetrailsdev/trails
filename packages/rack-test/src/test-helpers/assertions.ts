import { expect } from "vitest";
import { rbObjClass } from "@blazetrails/ruby-compat";

/** @internal */
export function mustBe(actual: object, operator: string): void {
  expect(resolve(actual, operator), `Expected ${inspect(actual)} to be ${operator}`).toBeTruthy();
}

/** @internal */
export function wontBe(actual: object, operator: string): void {
  expect(
    resolve(actual, operator),
    `Expected ${inspect(actual)} to not be ${operator}`,
  ).toBeFalsy();
}

function resolve(actual: object, operator: string): unknown {
  const member = (actual as Record<string, unknown>)[operator];
  return typeof member === "function" ? (member as () => unknown).call(actual) : member;
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
