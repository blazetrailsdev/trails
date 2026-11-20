import { expect, vi } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import type { Rational } from "@blazetrails/ruby-compat";
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

export async function assertSubProcessReturns(
  expectedLines: string[],
  code: (puts: (line: unknown) => void) => Promise<void> | void,
): Promise<void> {
  vi.resetModules();
  const actualLines: string[] = [];
  await code((line) => actualLines.push(String(line)));
  expect(actualLines).toEqual(expectedLines);
}

export const TIME_SUPPORTS_DISTINCT_UTC = !Time.new(2017, 1, 1, 0, 0, 0, 0).isUtc();

export class TimeLike {
  /** @internal */
  protected _value: number | null;

  subsec: number | Rational | null;

  constructor(value: number | null, subsec: number | Rational | null) {
    this._value = value;
    this.subsec = subsec;
  }

  toI(): number | null {
    return this._value;
  }
}

export class TimeLikeWithOffset extends TimeLike {
  utcOffset: number | null;

  constructor(value: number | null, subsec: number | Rational | null, utcOffset: number | null) {
    super(value, subsec);
    this.utcOffset = utcOffset;
  }
}
