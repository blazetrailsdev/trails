import { Temporal, Time } from "@blazetrails/date";
import { ArgumentError, Rational } from "@blazetrails/ruby-compat";
import {
  ActsLikeObject,
  TimeWithZone,
  change as timeChange,
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
  isUtc: boolean;
  applySecondsPrecision<T>(value: T): T;
}

export function serializeCastValue(this: TimeValueHost, value: unknown): unknown {
  value = this.applySecondsPrecision(value);

  if (ActsLikeObject.actsLike(value, "time")) {
    const time = value as Time | TimeWithZone;
    if (this.isUtc) {
      if (!time.isUtc()) value = time.getutc();
    } else {
      value = time.getlocal();
    }
  }

  return value;
}

type NsecBearing =
  | Time
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
): TimeWithZone | Temporal.ZonedDateTime | Temporal.Instant | Time | null {
  if (value === null || value === undefined) return null;
  if (value instanceof TimeWithZone) return value.inTimeZone();
  if (value instanceof Time) {
    const timeZone = zone();
    return timeZone ? new TimeWithZone(value.toTime().toInstant(), timeZone) : value;
  }
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
  offset: number | Rational | null = null,
): Time | null {
  if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;

  const usec = typeof microsec === "bigint" ? Number(microsec) : (microsec ?? 0);

  if (offset != null) {
    let time: Time | null;
    try {
      time = Time.utc(Number(year), mon, mday, hour, min, sec, usec);
    } catch {
      time = null;
    }
    if (!time) return null;

    if (!(offset === 0 || (offset instanceof Rational && offset.isZero()))) {
      time = time.minus(offset) as Time;
    }
    return (this?.isUtc ?? isUtc()) ? time : time.getlocal();
  } else if (this?.isUtc ?? isUtc()) {
    try {
      return Time.utc(Number(year), mon, mday, hour, min, sec, usec);
    } catch {
      return null;
    }
  } else {
    try {
      return Time.local(Number(year), mon, mday, hour, min, sec, usec);
    } catch {
      return null;
    }
  }
}

/** @internal */
export function fastStringToTime(this: TimezoneAware | void, string: string): Time | null {
  if (!string.includes("-")) return null;

  try {
    return (this?.isUtc ?? isUtc()) ? Time.new(string, { in: "UTC" }) : Time.new(string);
  } catch (error) {
    if (error instanceof ArgumentError) return null;
    throw error;
  }
}

export const TimeValue = {
  serializeCastValue,
  applySecondsPrecision,
  typeCastForSchema,
  userInputInTimeZone,
  newTime,
  /** @missingRailsCall new — CONVERGEABLE call-gate-credits-ruby-new-only-as-constructor */
  fastStringToTime,
};

function respondToNsec(value: unknown): value is NsecBearing {
  return (
    value instanceof Time ||
    value instanceof TimeWithZone ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainTime
  );
}

function nsec(value: NsecBearing): bigint {
  if (value instanceof Time || value instanceof TimeWithZone) return BigInt(value.nsec);
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
  if (value instanceof Time) {
    return timeChange(value, { nsec: Number(newNsec) }) as T;
  }
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
