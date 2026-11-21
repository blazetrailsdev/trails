import { expect, vi } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import { Encoding, Rational, rbPlus } from "@blazetrails/ruby-compat";
import { Timestamp } from "../../lib/index.js";

type SubSecond = number | Rational;
type UtcOffset = number | "utc" | null;
type Feature = "output" | "offset" | "distinct_utc" | "unspecified_offset" | "utc";

export class TestEncoding {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  find(): Encoding | null {
    return Encoding.find(this.name);
  }

  toMethod(): string {
    return this.name.toLowerCase().replace(/-/g, "_");
  }
}

export const TIME_SUPPORTS_DISTINCT_UTC = !Time.new(2017, 1, 1, 0, 0, 0, 0).isUtc();

export class TimeLike {
  /** @internal */
  protected _value: number | null;

  subsec: SubSecond | null;

  constructor(value: number | null, subsec: SubSecond | null) {
    this._value = value;
    this.subsec = subsec;
  }

  toI(): number | null {
    return this._value;
  }
}

export class TimeLikeWithOffset extends TimeLike {
  utcOffset: number | null;

  constructor(value: number | null, subsec: SubSecond | null, utcOffset: number | null) {
    super(value, subsec);
    this.utcOffset = utcOffset;
  }
}

export abstract class TimeTypesHelper {
  static isSupports(_feature: Feature): boolean {
    return false;
  }

  abstract get type(): string;

  abstract time(
    ...args: [number, number, number, number, number, number, SubSecond?, UtcOffset?]
  ): unknown;

  isSupports(feature: Feature): boolean {
    return (this.constructor as typeof TimeTypesHelper).isSupports(feature);
  }

  expectedZeroOffset(): 0 | "utc" {
    return this.isSupports("utc") && !this.isSupports("distinct_utc") ? "utc" : 0;
  }
}

export abstract class TimeTypesOutputHelper extends TimeTypesHelper {
  static override isSupports(feature: Feature): boolean {
    return feature === "output" || feature === "offset";
  }

  outputTime(
    ...args: [number, number, number, number, number, number, SubSecond?, UtcOffset?]
  ): unknown {
    return this.time(...args);
  }
}

export class TimeTypesTimeHelper extends TimeTypesOutputHelper {
  static override isSupports(feature: Feature): boolean {
    return (
      super.isSupports(feature) ||
      (feature === "distinct_utc" && TIME_SUPPORTS_DISTINCT_UTC) ||
      feature === "utc"
    );
  }

  get type(): string {
    return "time";
  }

  time(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = 0,
  ): Time {
    const sec = rbPlus(second, subSecond) as number | Rational;
    if (utcOffset === "utc") {
      return Time.utc(year, month, day, hour, minute, sec);
    } else {
      return Time.new(year, month, day, hour, minute, sec, utcOffset);
    }
  }
}

export class TimeTypesDateTimeHelper extends TimeTypesOutputHelper {
  get type(): string {
    return "datetime";
  }

  time(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = 0,
  ): DateTime {
    if (utcOffset === "utc") utcOffset = 0;
    return new DateTime(
      year,
      month,
      day,
      hour,
      minute,
      rbPlus(second, subSecond) as number | Rational,
      new Rational(utcOffset ?? 0, 86400),
    );
  }
}

export class TimeTypesTimestampHelper extends TimeTypesOutputHelper {
  static override isSupports(feature: Feature): boolean {
    return (
      super.isSupports(feature) ||
      feature === "distinct_utc" ||
      feature === "unspecified_offset" ||
      feature === "utc"
    );
  }

  get type(): string {
    return "timestamp";
  }

  time(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = null,
  ): Timestamp {
    return Timestamp.create(year, month, day, hour, minute, second, subSecond, utcOffset);
  }
}

export abstract class TimeTypesBaseTimeLikeHelper extends TimeTypesHelper {
  /** @internal */
  protected timeHelper: TimeTypesTimeHelper;

  constructor() {
    super();
    this.timeHelper = new TimeTypesTimeHelper();
  }

  outputTime(...args: Parameters<TimeTypesTimeHelper["time"]>): Time {
    return this.timeHelper.time(...args);
  }
}

export class TimeTypesTimeLikeHelper extends TimeTypesBaseTimeLikeHelper {
  static override isSupports(_feature: Feature): boolean {
    return false;
  }

  get type(): string {
    return "time_like";
  }

  time(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = 0,
  ): TimeLike {
    if (!(utcOffset === 0 || utcOffset === "utc")) {
      throw new Error("TimeLike does not support non-zero/non-UTC offsets");
    }
    return new TimeLike(Time.utc(year, month, day, hour, minute, second).toI(), subSecond);
  }
}

export class TimeTypesTimeLikeWithOffsetHelper extends TimeTypesBaseTimeLikeHelper {
  static override isSupports(feature: Feature): boolean {
    return feature === "offset";
  }

  get type(): string {
    return "time_like_with_offset";
  }

  time(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = 0,
  ): TimeLikeWithOffset {
    if (utcOffset === "utc") utcOffset = 0;
    return new TimeLikeWithOffset(
      Time.new(year, month, day, hour, minute, second, utcOffset).toI(),
      subSecond,
      utcOffset,
    );
  }
}

export function timeTypesHelpers(
  ...args: [...requiredFeatures: Feature[], block: (helper: TimeTypesHelper) => void]
): void {
  const block = args.pop() as (helper: TimeTypesHelper) => void;
  const requiredFeatures = args as Feature[];
  for (const helperClass of [
    TimeTypesTimeHelper,
    TimeTypesDateTimeHelper,
    TimeTypesTimestampHelper,
    TimeTypesTimeLikeHelper,
    TimeTypesTimeLikeWithOffsetHelper,
  ]) {
    if (requiredFeatures.every((f) => helperClass.isSupports(f))) {
      block(new helperClass());
    }
  }
}

export function testEncodings(...names: string[]): TestEncoding[] {
  return names.map((n) => new TestEncoding(n));
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

export function assertNothingRaised(block: () => unknown): void {
  expect(block).not.toThrow();
}

export function assertNilOrEqual(expected: unknown, actual: unknown): void {
  if (expected == null) {
    expect(actual).toBeNull();
  } else {
    expect(actual).toEqual(expected);
  }
}

export function assertEqualWithOffset(
  expected: Time | DateTime | Timestamp,
  actual: Time | DateTime | Timestamp,
) {
  expect(actual).toBeInstanceOf(expected.constructor);
  expect((actual as { equals(o: unknown): boolean }).equals(expected)).toBe(true);

  if ("utcOffset" in expected) {
    assertNilOrEqual(expected.utcOffset, (actual as Time | Timestamp).utcOffset);
  } else if ("offset" in expected) {
    assertNilOrEqual(expected.offset, (actual as DateTime).offset);
  }

  if ("isUtc" in expected) {
    assertNilOrEqual(expected.isUtc(), (actual as Time | Timestamp).isUtc());
  }
}

export function assertEqualWithOffsetAndClass(
  expected: Time | DateTime | Timestamp,
  actual: Time | DateTime | Timestamp,
) {
  assertEqualWithOffset(expected, actual);
  expect(actual.constructor).toBe(expected.constructor);
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
