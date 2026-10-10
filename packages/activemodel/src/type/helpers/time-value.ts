import { Temporal, Time } from "@blazetrails/date";
import {
  ArgumentError,
  cmp,
  numericMinus,
  numericModulo,
  numericPow,
  Rational,
  rbFSend,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { actsLike, TimeWithZone } from "@blazetrails/activesupport";

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

export function applySecondsPrecision<T>(this: { precision?: number }, value: T): T {
  if (!(this.precision != null && rbObjRespondTo(value, "nsec"))) return value;

  const numberOfInsignificantDigits = numericMinus(9, this.precision);
  const roundPower = numericPow(10, numberOfInsignificantDigits);
  const roundedOffNsec = numericModulo(rbFSend(value, "nsec"), roundPower);

  if (cmp(roundedOffNsec, 0)! > 0) {
    return rbFSend(value, "change", {
      nsec: numericMinus(rbFSend(value, "nsec"), roundedOffNsec),
    }) as T;
  } else {
    return value;
  }
}

export function typeCastForSchema(value: unknown): unknown {
  return JSON.stringify(rbFSend(value, "toFs", "db"));
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
