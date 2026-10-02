import { Temporal, Time } from "@blazetrails/date";
import { ArgumentError, Rational, rbFSend } from "@blazetrails/ruby-compat";
import { actsLike, TimeWithZone, toFs } from "@blazetrails/activesupport";

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

  if (actsLike.call(value, "time")) {
    if (this.isUtc) {
      if (!rbFSend(value, "isUtc")) value = rbFSend(value, "getutc");
    } else {
      value = rbFSend(value, "getlocal");
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

/**
 * @boundary: `precision` is an Integer, so `10 ** n` is taken over BigInt, the
 *  Integer arm of Ruby's `**`. A negative exponent there is a Rational, which
 *  divides every Integer nsec, as `10 ** 0` does.
 */
export function applySecondsPrecision<T>(this: { precision?: number }, value: T): T {
  const precision = this.precision;
  if (precision == null || !respondToNsec(value)) return value;
  const numberOfInsignificantDigits = 9 - precision;
  const roundPower = 10n ** BigInt(Math.max(numberOfInsignificantDigits, 0));
  const roundedOffNsec = nsec(value) % roundPower;
  if (roundedOffNsec > 0n) {
    return changeNsec(value, nsec(value) - roundedOffNsec) as T;
  } else {
    return value;
  }
}

export function typeCastForSchema(value: unknown): unknown {
  return JSON.stringify(toFs(value as Temporal.Instant, "db"));
}

export function userInputInTimeZone(
  value: unknown,
): TimeWithZone | Temporal.ZonedDateTime | Temporal.Instant | Time | null {
  return rbFSend(value, "inTimeZone") as
    | TimeWithZone
    | Temporal.ZonedDateTime
    | Temporal.Instant
    | Time
    | null;
}

/** @internal */
export function newTime(
  this: TimezoneAware,
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

  if (offset != null) {
    let time: Time | null;
    try {
      time = Time.utc(Number(year), mon, mday, hour, min, sec, microsec);
    } catch {
      time = null;
    }
    if (!time) return null;

    if (!(offset === 0 || (offset instanceof Rational && offset.isZero()))) {
      time = time.minus(offset) as Time;
    }
    return this.isUtc ? time : time.getlocal();
  } else if (this.isUtc) {
    try {
      return Time.utc(Number(year), mon, mday, hour, min, sec, microsec);
    } catch {
      return null;
    }
  } else {
    try {
      return Time.local(Number(year), mon, mday, hour, min, sec, microsec);
    } catch {
      return null;
    }
  }
}

/** @internal */
export function fastStringToTime(this: TimezoneAware, string: string): Time | null {
  try {
    if (!string.includes("-")) return null;

    if (this.isUtc) {
      return Time.new(string, { in: "UTC" });
    } else {
      return Time.new(string);
    }
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
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
  if (value instanceof Time || value instanceof TimeWithZone) {
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
