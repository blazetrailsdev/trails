import { Date as RubyDate, Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../../hash-utils.js";
import { currentTimeInstant } from "../../time-travel.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { zone as timeZone } from "../../time-zone-config.js";
import { advance as dateAdvance } from "../date/calculations.js";
import { toF } from "../date-time/conversions.js";

export const COMMON_YEAR_DAYS_IN_MONTH = [null, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number | Rational;
  nsec?: number;
  offset?: string | number;
}

export interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export function current(): TimeWithZone | RubyTime {
  const zone = timeZone();
  return zone
    ? zone.now()
    : RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n));
}

const atWithoutCoercion = RubyTime.at.bind(RubyTime);

export function atWithCoercion(
  timeOrNumber:
    | number
    | bigint
    | Rational
    | RubyTime
    | TimeWithZone
    | Temporal.PlainDateTime
    | Temporal.ZonedDateTime,
  ...args: (number | bigint | Rational)[]
): RubyTime {
  if (args.length === 0) {
    if (timeOrNumber instanceof TimeWithZone) {
      return atWithoutCoercion(timeOrNumber.toR()).getlocal();
    } else if (
      timeOrNumber instanceof Temporal.PlainDateTime ||
      timeOrNumber instanceof Temporal.ZonedDateTime
    ) {
      return atWithoutCoercion(toF(timeOrNumber)).getlocal();
    } else {
      return atWithoutCoercion(timeOrNumber);
    }
  } else {
    return atWithoutCoercion(timeOrNumber as number, ...args);
  }
}

export function daysInMonth(month: number, year: number = current().year): number {
  if (month === 2 && RubyDate.isGregorianLeap(year)) {
    return 29;
  } else {
    return COMMON_YEAR_DAYS_IN_MONTH[month]!;
  }
}

export function daysInYear(year: number = current().year): number {
  return daysInMonth(2, year) + 337;
}

export function rfc3339(str: string): RubyTime {
  const parts = RubyDate._rfc3339(str);

  if (Object.keys(parts).length === 0) throw new ArgumentError("invalid date");

  const secFractionPart = parts.secFraction;
  return RubyTime.new(
    parts.year as number,
    parts.mon,
    parts.mday,
    parts.hour,
    parts.min,
    secFractionPart === undefined ? parts.sec! : new Rational(parts.sec!, 1).add(secFractionPart),
    Number(parts.offset),
  );
}

export function secondsSinceMidnight(this: RubyTime): number {
  return this.toI() - change.call(this, { hour: 0 }).toI() + this.usec / 1.0e6;
}

export function secondsUntilEndOfDay(this: RubyTime): number {
  return endOfDay.call(this).toI() - this.toI();
}

export function secFraction(this: RubyTime): number {
  return this.subsec;
}

export function change(this: RubyTime, options: ChangeOptions): RubyTime {
  const newYear = "year" in options ? options.year! : this.year;
  const newMonth = "month" in options ? options.month! : this.month;
  const newDay = "day" in options ? options.day! : this.day;
  const newHour = "hour" in options ? options.hour! : this.hour;
  const newMin = "min" in options ? options.min! : options.hour != null ? 0 : this.min;
  let newSec = new Rational(
    "sec" in options ? options.sec! : options.hour != null || options.min != null ? 0 : this.sec,
    1,
  );
  const newOffset = "offset" in options ? options.offset! : null;

  let newUsec: Rational;
  const newNsec = options.nsec;
  if (newNsec != null) {
    if (options.usec != null) {
      throw new ArgumentError(
        `Can't change both :nsec and :usec at the same time: {${Object.entries(options)
          .map(
            ([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : String(value)}`,
          )
          .join(", ")}}`,
      );
    }
    newUsec = new Rational(newNsec, 1000);
  } else if ("usec" in options) {
    newUsec = options.usec instanceof Rational ? options.usec : new Rational(options.usec!, 1);
  } else if (options.hour != null || options.min != null || options.sec != null) {
    newUsec = new Rational(0, 1);
  } else {
    newUsec = new Rational(this.nsec, 1000);
  }

  if (newUsec.cmp(1000000) >= 0) throw new ArgumentError("argument out of range");

  newSec = newSec.add(newUsec.quo(1_000_000));

  if (newOffset != null) {
    return RubyTime.new(newYear, newMonth, newDay, newHour, newMin, newSec, newOffset);
  } else if (this.isUtc()) {
    return RubyTime.utc(newYear, newMonth, newDay, newHour, newMin, newSec);
  } else if (this.zone != null) {
    return RubyTime.local(
      newSec,
      newMin,
      newHour,
      newDay,
      newMonth,
      newYear,
      null,
      null,
      this.isdst,
      null,
    );
  } else {
    return RubyTime.new(newYear, newMonth, newDay, newHour, newMin, newSec, this.utcOffset);
  }
}

export function advance(this: RubyTime, options: AdvanceOptions): RubyTime {
  options = { ...options };

  if (options.weeks != null) {
    const partialWeeks = options.weeks - Math.floor(options.weeks);
    options.weeks = Math.floor(options.weeks);
    options.days = (options.days ?? 0) + 7 * partialWeeks;
  }

  if (options.days != null) {
    const partialDays = options.days - Math.floor(options.days);
    options.days = Math.floor(options.days);
    options.hours = (options.hours ?? 0) + 24 * partialDays;
  }

  const d = dateAdvance(this.toDate(), options);
  const timeAdvancedByDate = change.call(this, { year: d.year, month: d.month, day: d.day });
  const secondsToAdvance =
    (options.seconds ?? 0) + (options.minutes ?? 0) * 60 + (options.hours ?? 0) * 3600;

  if (secondsToAdvance === 0) {
    return timeAdvancedByDate;
  } else {
    return since.call(timeAdvancedByDate, secondsToAdvance);
  }
}

export function ago(this: RubyTime, seconds: number): RubyTime {
  return since.call(this, -seconds);
}

export function since(this: RubyTime, seconds: number): RubyTime {
  return this.plus(seconds);
}

export function beginningOfDay(this: RubyTime): RubyTime {
  return change.call(this, { hour: 0 });
}

export function middleOfDay(this: RubyTime): RubyTime {
  return change.call(this, { hour: 12 });
}

export function endOfDay(this: RubyTime): RubyTime {
  return change.call(this, {
    hour: 23,
    min: 59,
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

export function beginningOfHour(this: RubyTime): RubyTime {
  return change.call(this, { min: 0 });
}

export function endOfHour(this: RubyTime): RubyTime {
  return change.call(this, {
    min: 59,
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

export function beginningOfMinute(this: RubyTime): RubyTime {
  return change.call(this, { sec: 0 });
}

export function endOfMinute(this: RubyTime): RubyTime {
  return change.call(this, {
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

export { since as in };
export { beginningOfDay as midnight };
export { beginningOfDay as atMidnight };
export { beginningOfDay as atBeginningOfDay };
export { middleOfDay as midday };
export { middleOfDay as noon };
export { middleOfDay as atMidday };
export { middleOfDay as atNoon };
export { middleOfDay as atMiddleOfDay };
export { endOfDay as atEndOfDay };
export { beginningOfHour as atBeginningOfHour };
export { endOfHour as atEndOfHour };
export { beginningOfMinute as atBeginningOfMinute };
export { endOfMinute as atEndOfMinute };

export function prevDay(this: RubyTime, days = 1): RubyTime {
  return advance.call(this, { days: -days });
}

export function nextDay(this: RubyTime, days = 1): RubyTime {
  return advance.call(this, { days: days });
}

export function prevMonth(this: RubyTime, months = 1): RubyTime {
  return advance.call(this, { months: -months });
}

export function nextMonth(this: RubyTime, months = 1): RubyTime {
  return advance.call(this, { months: months });
}

export function prevYear(this: RubyTime, years = 1): RubyTime {
  return advance.call(this, { years: -years });
}

export function nextYear(this: RubyTime, years = 1): RubyTime {
  return advance.call(this, { years: years });
}

declare module "@blazetrails/date" {
  interface Time {
    secondsSinceMidnight(): number;
    secondsUntilEndOfDay(): number;
    secFraction(): number;
    change(options: ChangeOptions): Time;
    advance(options: AdvanceOptions): Time;
    ago(seconds: number): Time;
    since(seconds: number): Time;
    in(seconds: number): Time;
    beginningOfDay(): Time;
    midnight(): Time;
    atMidnight(): Time;
    atBeginningOfDay(): Time;
    middleOfDay(): Time;
    midday(): Time;
    noon(): Time;
    atMidday(): Time;
    atNoon(): Time;
    atMiddleOfDay(): Time;
    endOfDay(): Time;
    atEndOfDay(): Time;
    beginningOfHour(): Time;
    atBeginningOfHour(): Time;
    endOfHour(): Time;
    atEndOfHour(): Time;
    beginningOfMinute(): Time;
    atBeginningOfMinute(): Time;
    endOfMinute(): Time;
    atEndOfMinute(): Time;
    prevDay(days?: number): Time;
    nextDay(days?: number): Time;
    prevMonth(months?: number): Time;
    nextMonth(months?: number): Time;
    prevYear(years?: number): Time;
    nextYear(years?: number): Time;
  }

  namespace Time {
    export function current(): TimeWithZone | Time;
    export function daysInMonth(month: number, year?: number): number;
    export function daysInYear(year?: number): number;
    export function rfc3339(str: string): Time;
    export function atWithCoercion(
      timeOrNumber: unknown,
      ...args: (number | bigint | Rational)[]
    ): Time;
  }
}

Object.assign(RubyTime.prototype, {
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  secFraction,
  change,
  advance,
  ago,
  since,
  in: since,
  beginningOfDay,
  midnight: beginningOfDay,
  atMidnight: beginningOfDay,
  atBeginningOfDay: beginningOfDay,
  middleOfDay,
  midday: middleOfDay,
  noon: middleOfDay,
  atMidday: middleOfDay,
  atNoon: middleOfDay,
  atMiddleOfDay: middleOfDay,
  endOfDay,
  atEndOfDay: endOfDay,
  beginningOfHour,
  atBeginningOfHour: beginningOfHour,
  endOfHour,
  atEndOfHour: endOfHour,
  beginningOfMinute,
  atBeginningOfMinute: beginningOfMinute,
  endOfMinute,
  atEndOfMinute: endOfMinute,
  prevDay,
  nextDay,
  prevMonth,
  nextMonth,
  prevYear,
  nextYear,
});

Object.assign(RubyTime, { current, daysInMonth, daysInYear, rfc3339, atWithCoercion });

RubyTime.at = atWithCoercion as typeof RubyTime.at;
