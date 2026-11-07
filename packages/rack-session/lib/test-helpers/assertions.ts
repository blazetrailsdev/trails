import { expect } from "vitest";
import { isEmpty, isNil, rbInspect } from "@blazetrails/ruby-compat";

/** @internal */
export function mustBe(actual: unknown, operator: string): void {
  expect(resolve(actual, operator), `Expected ${rbInspect(actual)} to be ${operator}`).toBeTruthy();
}

/** @internal */
export function wontBe(actual: unknown, operator: string): void {
  expect(
    resolve(actual, operator),
    `Expected ${rbInspect(actual)} to not be ${operator}`,
  ).toBeFalsy();
}

const KERNEL_PREDICATES: Record<string, (value: never) => boolean> = { isNil, isEmpty };

function resolve(actual: unknown, operator: string): unknown {
  if (Object.hasOwn(KERNEL_PREDICATES, operator))
    return KERNEL_PREDICATES[operator](actual as never);
  const member = (actual as Record<string, unknown>)[operator];
  return typeof member === "function" ? (member as () => unknown).call(actual) : member;
}
