/**
 * Mirrors: `class Time` (`core_ext/time/calculations.rb`).
 *
 * Rails reopens `Time` here. trails' `Time` is `packages/date/src/time.ts`, in
 * a package activesupport already depends on, so the reopening is the settled
 * mixin idiom from CLAUDE.md — `this`-typed functions living in the file that
 * matches the Rails path, assigned onto `Time` at the bottom of this module,
 * with a module augmentation carrying the types. Importing this module is what
 * `require "active_support/core_ext/time/calculations"` is.
 */

import { Date as RubyDate, Rational, Time as RubyTime } from "@blazetrails/date";
import { ArgumentError } from "../../hash-utils.js";
import { currentTimeInstant } from "../../time-travel.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { zone as timeZone } from "../../time-zone-config.js";
import { advance as dateAdvance } from "../date/calculations.js";

/** Mirrors: `Time::COMMON_YEAR_DAYS_IN_MONTH` (`time/calculations.rb:13`) */
export const COMMON_YEAR_DAYS_IN_MONTH = [null, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Rails' `:year`, `:month`, `:day`, `:hour`, `:min`, `:sec`, `:usec`, `:nsec`
 * and `:offset` (`time/calculations.rb:111-121`). `:usec` takes a `Rational` as
 * well as an Integer — the `end_of_*` family passes `Rational(999999999, 1000)`
 * — and `:offset` a `"+HH:MM"` String or a seconds Integer, as `::Time.new`'s
 * does.
 */
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

/** Rails' `:years`, `:months`, `:weeks`, `:days`, `:hours`, `:minutes`, `:seconds` (`time/calculations.rb:186-192`). */
export interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

/**
 * Mirrors: `Time.current` (`time/calculations.rb:39-41`).
 *
 * `::Time.now` is what trails' time travel stubs, so its arm reads the travelled
 * clock through `currentTimeInstant` rather than `Temporal.Now`.
 */
export function current(): TimeWithZone | RubyTime {
  const zone = timeZone();
  return zone
    ? zone.now()
    : RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n));
}

/** Mirrors: `Time.days_in_month` (`time/calculations.rb:24-30`) */
export function daysInMonth(month: number, year: number = current().year): number {
  if (month === 2 && RubyDate.isGregorianLeap(year)) {
    return 29;
  } else {
    return COMMON_YEAR_DAYS_IN_MONTH[month]!;
  }
}

/** Mirrors: `Time.days_in_year` (`time/calculations.rb:34-36`) */
export function daysInYear(year: number = current().year): number {
  return daysInMonth(2, year) + 337;
}

/**
 * Mirrors: `Time.rfc3339` (`time/calculations.rb:69-81`).
 *
 * `Date._rfc3339` answers an empty hash for anything that is not a full
 * date-time-with-offset, which is the `parts.empty?` raise below; ruby/date's
 * parser is not ported, so the grammar it accepts is spelled as the pattern.
 */
export function rfc3339(str: string): RubyTime {
  const parts =
    /^(-?\d{4,})-(\d\d)-(\d\d)[Tt ](\d\d):(\d\d):(\d\d)(\.\d+)?([Zz]|[+-]\d\d:\d\d)$/.exec(str);

  if (!parts) throw new ArgumentError("invalid date");

  const secFractionPart = parts[7];
  return RubyTime.new(
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
    Number(parts[4]),
    Number(parts[5]),
    secFractionPart === undefined
      ? Number(parts[6])
      : new Rational(Number(parts[6]), 1).add(
          new Rational(BigInt(secFractionPart.slice(1).padEnd(9, "0").slice(0, 9)), 1_000_000_000n),
        ),
    /^[Zz]$/.test(parts[8]) ? "+00:00" : parts[8],
  );
}

/** Mirrors: `Time#seconds_since_midnight` (`time/calculations.rb:91-93`) */
export function secondsSinceMidnight(this: RubyTime): number {
  return this.toI() - change.call(this, { hour: 0 }).toI() + this.usec / 1.0e6;
}

/** Mirrors: `Time#seconds_until_end_of_day` (`time/calculations.rb:100-102`) */
export function secondsUntilEndOfDay(this: RubyTime): number {
  return endOfDay.call(this).toI() - this.toI();
}

/** Mirrors: `Time#sec_fraction` (`time/calculations.rb:107-109`) */
export function secFraction(this: RubyTime): number {
  return this.subsec;
}

/**
 * Mirrors: `Time#change` (`time/calculations.rb:123-178`).
 *
 * Each `options.fetch(:k, default)` is spelled `"k" in options` rather than
 * `??`: `Hash#fetch` yields the STORED value whenever the key is present, `nil`
 * included, where `??` would substitute the default for it. The `options[:hour]`
 * truthiness tests are the opposite case — Ruby's `0` is truthy — so those are
 * `!= null`, which admits the `hour: 0` Rails admits.
 *
 * `Rational(new_usec, 1000000)` (`:141`) is `quo`: `Rational()` of a Rational
 * over an Integer is that Rational divided by it.
 *
 * The `zone.respond_to?(:utc_to_local)` arm
 * (`:148-171`) selects a receiver whose `zone` is a `TZInfo` zone OBJECT. No
 * trails `::Time` carries one — its `zone` is the tzdata abbreviation String —
 * so the arm is unreachable, and its second-occurrence correction is not lost
 * with it: the `isdst` handed to `::Time.local` on the next arm makes the same
 * choice of the wall clock a DST fall-back repeats.
 */
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

/**
 * Mirrors: `Time#advance` (`time/calculations.rb:194-217`).
 *
 * Rails writes the normalised `:weeks` / `:days` back into the CALLER's hash;
 * `Date#advance` (`date/calculations.rb:127-136`) reads it only, and
 * `date_ext_test.rb:367-371` asserts the difference. The write goes into a copy
 * here so that the hash this hands on to the `Date` arm is the one Rails hands
 * it, without the caller's object moving under a `Date` receiver's contract.
 *
 * `to_date.gregorian` (`:206`) puts the day on the
 * proleptic Gregorian calendar before advancing it. `Time#toDate`
 * (`packages/date/src/time.ts`) already builds under `GREGORIAN`, as MRI's
 * `time_to_date` does, so there is no reform to lift.
 */
export function advance(this: RubyTime, options: AdvanceOptions): RubyTime {
  options = { ...options };

  if (options.weeks != null) {
    const partialWeeks = options.weeks - Math.trunc(options.weeks);
    options.weeks = Math.trunc(options.weeks);
    options.days = (options.days ?? 0) + 7 * partialWeeks;
  }

  if (options.days != null) {
    const partialDays = options.days - Math.trunc(options.days);
    options.days = Math.trunc(options.days);
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

/** Mirrors: `Time#ago` (`time/calculations.rb:220-222`) */
export function ago(this: RubyTime, seconds: number): RubyTime {
  return since.call(this, -seconds);
}

/**
 * Mirrors: `Time#since` (`time/calculations.rb:225-234`).
 *
 * Rails' `rescue TypeError` arm exists for a
 * `seconds` that `Time#+` will not take, and warns that Rails 8.1 will raise
 * there instead. `seconds` is typed `number` here, so `Time#plus` cannot raise
 * and the arm is unreachable; porting it would widen this method's return —
 * and, through `ago`/`advance`/every `beginning_of_*`, the whole reopening's —
 * to `Time | DateTime` for a branch nothing can enter.
 */
export function since(this: RubyTime, seconds: number): RubyTime {
  return this.plus(seconds);
}

/** Mirrors: `Time#beginning_of_day` (`time/calculations.rb:238-240`) */
export function beginningOfDay(this: RubyTime): RubyTime {
  return change.call(this, { hour: 0 });
}

/** Mirrors: `Time#middle_of_day` (`time/calculations.rb:246-248`) */
export function middleOfDay(this: RubyTime): RubyTime {
  return change.call(this, { hour: 12 });
}

/** Mirrors: `Time#end_of_day` (`time/calculations.rb:256-263`) */
export function endOfDay(this: RubyTime): RubyTime {
  return change.call(this, {
    hour: 23,
    min: 59,
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

/** Mirrors: `Time#beginning_of_hour` (`time/calculations.rb:267-269`) */
export function beginningOfHour(this: RubyTime): RubyTime {
  return change.call(this, { min: 0 });
}

/** Mirrors: `Time#end_of_hour` (`time/calculations.rb:273-279`) */
export function endOfHour(this: RubyTime): RubyTime {
  return change.call(this, {
    min: 59,
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

/** Mirrors: `Time#beginning_of_minute` (`time/calculations.rb:283-285`) */
export function beginningOfMinute(this: RubyTime): RubyTime {
  return change.call(this, { sec: 0 });
}

/** Mirrors: `Time#end_of_minute` (`time/calculations.rb:289-294`) */
export function endOfMinute(this: RubyTime): RubyTime {
  return change.call(this, {
    sec: 59,
    usec: new Rational(999999999, 1000),
  });
}

/** Rails' `alias`es: `alias :in :since` (`time/calculations.rb:235`), the day
 * boundaries (:241-243, :250-254, :264), the hour ones (:270, :281) and the
 * minute ones (:286, :295). */
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

/** Mirrors: `Time#prev_day` (`time/calculations.rb:358-360`) */
export function prevDay(this: RubyTime, days = 1): RubyTime {
  return advance.call(this, { days: -days });
}

/** Mirrors: `Time#next_day` (`time/calculations.rb:363-365`) */
export function nextDay(this: RubyTime, days = 1): RubyTime {
  return advance.call(this, { days: days });
}

/** Mirrors: `Time#prev_month` (`time/calculations.rb:368-370`) */
export function prevMonth(this: RubyTime, months = 1): RubyTime {
  return advance.call(this, { months: -months });
}

/** Mirrors: `Time#next_month` (`time/calculations.rb:373-375`) */
export function nextMonth(this: RubyTime, months = 1): RubyTime {
  return advance.call(this, { months: months });
}

/** Mirrors: `Time#prev_year` (`time/calculations.rb:378-380`) */
export function prevYear(this: RubyTime, years = 1): RubyTime {
  return advance.call(this, { years: -years });
}

/** Mirrors: `Time#next_year` (`time/calculations.rb:383-385`) */
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

Object.assign(RubyTime, { current, daysInMonth, daysInYear, rfc3339 });
