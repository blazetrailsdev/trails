import { Temporal } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import {
  TimeWithZone,
  inTimeZone as stringInTimeZone,
  toFs,
  zone,
} from "@blazetrails/activesupport";

import { isUtc } from "./timezone.js";

export interface TimezoneAware {
  readonly isUtc: boolean;
}

interface TimeValueHost {
  precision?: number;
  applySecondsPrecision<T>(value: T): T;
}

export function serializeCastValue<T>(this: TimeValueHost, value: T): T {
  return this.applySecondsPrecision(value);
}

type NsecBearing =
  | TimeWithZone
  | Temporal.Instant
  | Temporal.PlainDateTime
  | Temporal.ZonedDateTime
  | Temporal.PlainTime;

const NANOS_PER_SECOND = 1_000_000_000n;

export function applySecondsPrecision<T>(this: { precision?: number }, value: T): T {
  const precision = this.precision;
  if (precision == null || !respondToNsec(value)) return value;
  if (!Number.isInteger(precision) || precision < 0 || precision > 9) return value;
  const numberOfInsignificantDigits = 9 - precision;
  const roundPower = 10n ** BigInt(numberOfInsignificantDigits);
  const roundedOffNsec = nsec(value) % roundPower;
  if (roundedOffNsec > 0n) {
    return changeNsec(value, nsec(value) - roundedOffNsec) as T;
  } else {
    return value;
  }
}

export function typeCastForSchema(value: unknown): string {
  return JSON.stringify(toFs(value as Temporal.Instant, "db"));
}

export function userInputInTimeZone(
  value: unknown,
): TimeWithZone | Temporal.ZonedDateTime | Temporal.Instant | null {
  if (value === null || value === undefined) return null;
  if (value instanceof TimeWithZone) return value.inTimeZone();
  if (value instanceof Temporal.ZonedDateTime) return value;
  if (value instanceof Temporal.Instant) {
    const timeZone = zone();
    return timeZone ? new TimeWithZone(value, timeZone) : value;
  }
  return stringInTimeZone(String(value)) ?? null;
}

/** @internal */
export function newTime(
  this: TimezoneAware | void,
  year: number | bigint | null | undefined,
  mon: number | null | undefined,
  mday: number | null | undefined,
  hour: number | null | undefined,
  min: number | null | undefined,
  sec: number | null | undefined,
  microsec: number | bigint | Rational | null | undefined,
  offset?: number | Rational | null,
): Temporal.Instant | null {
  if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
  if (mon == null || mday == null) return null;
  const totalNano =
    microsec instanceof Rational
      ? microsec.mul(1000).toI()
      : typeof microsec === "bigint"
        ? Number(microsec * 1000n)
        : Math.trunc((microsec ?? 0) * 1000);
  const components = {
    year: Number(year),
    month: mon,
    day: mday,
    hour: hour ?? 0,
    minute: min ?? 0,
    second: sec ?? 0,
    millisecond: Math.trunc(totalNano / 1_000_000),
    microsecond: Math.trunc(totalNano / 1000) % 1000,
    nanosecond: totalNano % 1000,
  };
  try {
    if (offset != null) {
      const instant = Temporal.PlainDateTime.from(components, { overflow: "reject" })
        .toZonedDateTime("UTC")
        .toInstant();
      if (offset instanceof Rational) {
        return offset.isZero()
          ? instant
          : instant.subtract({ nanoseconds: offset.mul(1_000_000_000).toI() });
      }
      return offset === 0 ? instant : instant.subtract({ seconds: offset });
    }
    return Temporal.PlainDateTime.from(components, { overflow: "reject" })
      .toZonedDateTime((this?.isUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId())
      .toInstant();
  } catch {
    return null;
  }
}

/** @internal */
export function fastStringToTime(
  this: TimezoneAware | void,
  string: string,
): Temporal.Instant | null {
  if (!string.includes("-")) return null;
  const normalized = string
    .replace(" ", "T")
    .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2})$/, "$1$2:00");
  const datetimeString = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T00:00:00`
    : normalized;
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(datetimeString);
  try {
    if (hasOffset) return Temporal.Instant.from(datetimeString);
    return Temporal.PlainDateTime.from(datetimeString, { overflow: "reject" })
      .toZonedDateTime((this?.isUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId())
      .toInstant();
  } catch {
    return null;
  }
}

export const TimeValue = {
  serializeCastValue,
  applySecondsPrecision,
  typeCastForSchema,
  userInputInTimeZone,
  newTime,
  fastStringToTime,
};

function respondToNsec(value: unknown): value is NsecBearing {
  return (
    value instanceof TimeWithZone ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainTime
  );
}

function nsec(value: NsecBearing): bigint {
  if (value instanceof TimeWithZone) return BigInt(value.nsec);
  if (value instanceof Temporal.Instant) {
    return ((value.epochNanoseconds % NANOS_PER_SECOND) + NANOS_PER_SECOND) % NANOS_PER_SECOND;
  }
  return (
    BigInt(value.millisecond) * 1_000_000n +
    BigInt(value.microsecond) * 1_000n +
    BigInt(value.nanosecond)
  );
}

function changeNsec<T extends NsecBearing>(value: T, newNsec: bigint): T {
  if (value instanceof TimeWithZone) {
    return value.change({ nsec: Number(newNsec) }) as T;
  }
  if (value instanceof Temporal.Instant) {
    return Temporal.Instant.fromEpochNanoseconds(
      value.epochNanoseconds - nsec(value) + newNsec,
    ) as T;
  }
  return value.with({
    millisecond: Number(newNsec / 1_000_000n),
    microsecond: Number((newNsec / 1_000n) % 1_000n),
    nanosecond: Number(newNsec % 1_000n),
  }) as T;
}
