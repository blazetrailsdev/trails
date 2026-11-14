import { expect } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import { Timestamp } from "../lib/index.js";

export function assertEqualWithOffset(
  expected: Time | DateTime | Timestamp,
  actual: Time | DateTime | Timestamp,
) {
  expect(actual).toBeInstanceOf(expected.constructor);
  expect((actual as { equals(o: unknown): boolean }).equals(expected)).toBe(true);
  if (expected instanceof DateTime) {
    expect((actual as DateTime).offset).toEqual(expected.offset);
  } else {
    expect((actual as Time | Timestamp).utcOffset).toBe(expected.utcOffset);
  }
}

export function assertRaises(
  klass: abstract new (...args: never[]) => Error,
  block: () => unknown,
): Error {
  let error: unknown;
  try {
    block();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(klass);
  return error as Error;
}

export function assertArraySameItems(expected: readonly unknown[], actual: readonly unknown[]) {
  const condition =
    expected.length === actual.length && expected.filter((x) => !actual.includes(x)).length === 0;
  expect(condition).toBeTruthy();
}
