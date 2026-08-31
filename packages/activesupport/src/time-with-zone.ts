/**
 * ActiveSupport::TimeWithZone — a Time-like class that can represent a time
 * in any timezone.
 *
 * Mirrors the Rails API: https://api.rubyonrails.org/classes/ActiveSupport/TimeWithZone.html
 */

import { PeriodNotFound, TimeZone, TimezonePeriod } from "./values/time-zone.js";
import { Range } from "@blazetrails/ruby-compat";
import { Object as ObjectExt } from "./core-ext/object/acts-like.js";
import { Duration } from "./duration.js";
import { currentTime } from "./time-travel.js";
import { zone as timeZone, findZoneBang } from "./time-zone-config.js";
import { Temporal } from "@blazetrails/date";
import { instantFrom } from "./temporal.js";
import { Rational, Time } from "@blazetrails/date";
import { Encoding } from "./json/encoding.js";
import { DATE_FORMATS, toFs } from "./core-ext/time/conversions.js";
import { advance as timeAdvance } from "./time-ext.js";
import { inTimeZone } from "./core-ext/date-and-time/zones.js";
import {
  preserveTimezone,
  utcToLocalReturnsUtcOffsetTimes,
} from "./core-ext/date-and-time/compatibility.js";

/**
 * Options for the change() method.
 */
export interface ChangeOptions {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  min?: number;
  sec?: number;
  usec?: number;
  nsec?: number;
}

/**
 * Options for the advance() method.
 */
export interface AdvanceOptions {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  // boundary: classic JS days-in-month trick (day 0 of next month).
  return new Date(year, month, 0).getDate();
}

/**
 * Mirrors: `TimeWithZone::PRECISIONS` (`time_with_zone.rb:45-46`). Ruby's
 * `Hash.new` default block generates and stores the format on first read for
 * an unseen width; `??=` at the read site in `xmlschema` is that same store.
 */
const PRECISIONS: Record<number, string> = { 0: "%FT%T" };

const NS_PER_SECOND = 1_000_000_000n;

/** Sign of a BigInt as a Number-typed -1 / 0 / 1. */
function signOf(diff: bigint): number {
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/**
 * Convert a nanosecond-difference BigInt to a JS Number of seconds, preserving
 * sub-second precision via floating-point fractional seconds.
 */
function nsDiffToSeconds(diffNs: bigint): number {
  const wholeSeconds = diffNs / NS_PER_SECOND;
  const remainderNs = diffNs % NS_PER_SECOND;
  return Number(wholeSeconds) + Number(remainderNs) / 1e9;
}

/**
 * `SECONDS_PER_DAY = 86400` (time_with_zone.rb:560).
 */
const SECONDS_PER_DAY = 86400;

/** Ruby's `Time`, whichever shape carries it. */
type TimeLike = Time | Temporal.Instant | Temporal.PlainDateTime | Temporal.PlainDate;

/**
 * The dispatch Ruby gets for free: an undefined method on a `TimeWithZone`
 * routes to {@link TimeWithZone#methodMissing}, and `in` answers
 * {@link TimeWithZone#respondToMissing}.
 *
 * @noRailsEquivalent PERMANENT — Ruby resolves an undefined method through
 * `method_missing` at the language level; JS has no such hook, only `Proxy`.
 * The same shape `methodMissingProxy` establishes, kept local because Rails
 * wraps the forwarded result through `wrap_with_time_zone` rather than
 * returning it.
 */
const METHOD_MISSING_HANDLER: ProxyHandler<TimeWithZone> = {
  get(target, prop) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, target);
    if (typeof prop !== "string" || !target.respondToMissing(prop, false)) return undefined;
    return (...args: unknown[]) => target.methodMissing(prop, ...args);
  },
  has(target, prop) {
    return (
      Reflect.has(target, prop) ||
      (typeof prop === "string" && target.respondToMissing(prop, false))
    );
  },
};

export class TimeWithZone {
  /** `@utc` — `nil` until {@link utc} derives it from `@time`. */
  private _utc: Time | null;
  /** `@time` — the local wall clock, `nil` until {@link time} derives it. */
  private _time: TimeLike | null;
  /** The timezone */
  private readonly _timeZone: TimeZone;
  /** `@period` — memoized by {@link period}. */
  private _period?: TimezonePeriod;
  /** `@to_time_with_timezone` — memoized by {@link toTime}'s `:zone` arm. */
  private _toTimeWithTimezone?: Time;
  /** `@to_time_with_instance_offset` — memoized by {@link toTime}'s offset arm. */
  private _toTimeWithInstanceOffset?: Time;
  /** `@to_time_with_system_offset` — memoized by {@link toTime}'s system arm. */
  private _toTimeWithSystemOffset?: Time;

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#initialize`
   * (time_with_zone.rb:51-56).
   *
   * `utcTime` is Rails' `utc_time`: an `Instant` is already a UTC `Time`, and a
   * `PlainDateTime` / `PlainDate` is a wall clock whose values
   * {@link _transferTimeValuesToUtcConstructor} moves onto a UTC constructor.
   */
  constructor(
    utcTime: TimeLike | null,
    timeZone: TimeZone,
    localTime: TimeLike | null = null,
    period: TimezonePeriod | null = null,
  ) {
    this._utc = utcTime ? this._transferTimeValuesToUtcConstructor(utcTime) : null;
    this._timeZone = timeZone;
    this._time = localTime;
    this._period = this._utc
      ? (period ?? undefined)
      : this._getPeriodAndEnsureValidLocalTime(period);

    return new Proxy(this, METHOD_MISSING_HANDLER);
  }

  /**
   * The instant as a `ZonedDateTime` in this zone — the component reader every
   * local accessor below goes through. Derived from {@link utc}, so a
   * local-time-only instance resolves its UTC value exactly where Rails does.
   */
  private get _zoned(): Temporal.ZonedDateTime {
    return this.utc().toTime().toInstant().toZonedDateTimeISO(this._timeZone.tzinfo.identifier);
  }

  /** Epoch milliseconds — sourced directly from the ZonedDateTime. */
  private get _epochMs(): number {
    return this._zoned.epochMilliseconds;
  }

  /** UTC-zoned snapshot of the underlying instant for component access. */
  private get _utcPlain(): Temporal.PlainDateTime {
    return this.utc().toTime().toPlainDateTime();
  }

  /**
   * Ensure proxy class responds to all methods that underlying time instance
   * responds to.
   *
   * Mirrors: `ActiveSupport::TimeWithZone#respond_to_missing?`
   * (time_with_zone.rb:548-550) — `time.respond_to?(sym, include_priv)`. The
   * trails leading-underscore convention is what `include_priv` selects on.
   */
  respondToMissing(sym: string, includePriv: boolean): boolean {
    if (!includePriv && sym.startsWith("_")) return false;
    return typeof (this.time as unknown as Record<string, unknown>)[sym] === "function";
  }

  /**
   * Send the missing method to +time+ instance, and wrap result in a new
   * TimeWithZone with the existing +time_zone+.
   *
   * Mirrors: `ActiveSupport::TimeWithZone#method_missing`
   * (time_with_zone.rb:553-557). Reached through the `Proxy` the constructor
   * returns — see {@link METHOD_MISSING_HANDLER}.
   */
  methodMissing(method: string, ...args: unknown[]): unknown {
    const time = this.time as unknown as Record<string, unknown>;
    try {
      return this._wrapWithTimeZone(
        (time[method] as (...a: unknown[]) => unknown).apply(time, args),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "NoMethodError") {
        e.message = e.message
          .replace(String(this.time), this.inspect())
          .replace("Time", "ActiveSupport::TimeWithZone");
      }
      throw e;
    }
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#incorporate_utc_offset`
   * (time_with_zone.rb:562-568). Ruby's `Date` advances in DAYS, so its arm
   * spells the offset as the day fraction `Rational(offset, SECONDS_PER_DAY)`;
   * a wall clock carrying that date advances by the seconds that fraction
   * names. The `else` arm is Ruby's `time + offset` (:567) directly, over
   * `Time#plus`.
   */
  private _incorporateUtcOffset(time: Time | Temporal.PlainDate, offset: number): Time {
    if (time instanceof Temporal.PlainDate) {
      return this._transferTimeValuesToUtcConstructor(
        time.toPlainDateTime().add({ seconds: offset }),
      );
    }
    return time.plus(offset);
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#get_period_and_ensure_valid_local_time`
   * (time_with_zone.rb:570-581). Ruby's `rescue ... retry` is the loop.
   */
  private _getPeriodAndEnsureValidLocalTime(period: TimezonePeriod | null): TimezonePeriod {
    // we don't want a Time.local instance enforcing its own DST rules as well,
    // so transfer time values to a utc constructor if necessary
    if (!(this._time instanceof Time) || !this._time.isUtc()) {
      this._time = this._transferTimeValuesToUtcConstructor(this._time!);
    }
    for (;;) {
      try {
        return period ?? this._timeZone.periodForLocal(this._time);
      } catch (e) {
        if (!(e instanceof PeriodNotFound)) throw e;
        // time is in the "spring forward" hour gap, so we're moving the time forward one hour and trying again
        this._time = this._incorporateUtcOffset(this._time, 3600);
      }
    }
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#transfer_time_values_to_utc_constructor`
   * (time_with_zone.rb:583-587) — `Time.utc(year, month, day, hour, min,
   * sec + subsec)`, over whichever shape carries the wall clock.
   */
  private _transferTimeValuesToUtcConstructor(time: TimeLike): Time {
    // avoid creating another Time object if possible
    if (time instanceof Time && time.isUtc()) return time;
    const values =
      time instanceof Time
        ? time.toTime().toPlainDateTime()
        : time instanceof Temporal.Instant
          ? time.toZonedDateTimeISO("UTC").toPlainDateTime()
          : time instanceof Temporal.PlainDate
            ? time.toPlainDateTime()
            : time;
    return Time.utc(
      values.year,
      values.month,
      values.day,
      values.hour,
      values.minute,
      new Rational(
        values.millisecond * 1_000_000 + values.microsecond * 1_000 + values.nanosecond,
        1_000_000_000,
      ).add(values.second),
    );
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#wrap_with_time_zone`
   * (time_with_zone.rb:593-602).
   */
  private _wrapWithTimeZone(time: unknown): unknown {
    if (ObjectExt.actsLike(time, "time")) {
      const local = time as TimeLike;
      const periods = this.timeZone.periodsForLocal(
        this._transferTimeValuesToUtcConstructor(local),
      );
      const period = this.period;
      const matched = periods.some(
        (p) =>
          p.abbreviation === period.abbreviation &&
          p.observedUtcOffset === period.observedUtcOffset &&
          p.isDst() === period.isDst(),
      );
      return new TimeWithZone(null, this.timeZone, local, matched ? period : null);
    } else if (time instanceof Range) {
      // `..`, not `...`: Rails rebuilds an INCLUSIVE range whatever the source
      // range was (time_with_zone.rb:598).
      return new Range(this._wrapWithTimeZone(time.begin), this._wrapWithTimeZone(time.end));
    } else {
      return time;
    }
  }

  // ---------------------------------------------------------------------------
  // Core accessors
  // ---------------------------------------------------------------------------

  /**
   * The underlying `TZInfo::TimezonePeriod`, memoized on first read.
   *
   * Mirrors: ActiveSupport::TimeWithZone#period
   * (time_with_zone.rb:72-74) — `@period ||= time_zone.period_for_utc(@utc)`.
   */
  get period(): TimezonePeriod {
    return (this._period ??= this._timeZone.periodForUtc(this._utc!));
  }

  /** The TimeZone instance */
  get timeZone(): TimeZone {
    return this._timeZone;
  }

  /**
   * Returns the local wall-clock time as a Temporal.PlainDateTime.
   *
   * Mirrors: `ActiveSupport::TimeWithZone#time` (time_with_zone.rb:58-60) —
   * `@time ||= incorporate_utc_offset(@utc, utc_offset)`.
   */
  get time(): Temporal.PlainDateTime {
    this._time ??= this._incorporateUtcOffset(this._utc!, this.utcOffset);
    return this._transferTimeValuesToUtcConstructor(this._time).toTime().toPlainDateTime();
  }

  /** Timezone abbreviation (e.g., "EST", "EDT") — time_with_zone.rb:133-135. */
  get zone(): string {
    return this.period.abbreviation;
  }

  /** UTC offset in seconds — time_with_zone.rb:111-113. */
  get utcOffset(): number {
    return this.period.observedUtcOffset;
  }

  /** Alias for utcOffset */
  get gmtOffset(): number {
    return this.utcOffset;
  }

  /** `alias_method :gmtoff, :utc_offset` (time_with_zone.rb:115). */
  get gmtoff(): number {
    return this.utcOffset;
  }

  /** Whether DST is in effect — time_with_zone.rb:94-96. */
  dst(): boolean {
    return this.period.isDst();
  }

  /** Alias for dst() */
  isdst(): boolean {
    return this.dst();
  }

  /** Whether the timezone is UTC */
  isUtc(): boolean {
    const tz = this._timeZone.tzinfo.identifier;
    return (
      this.utcOffset === 0 &&
      (tz === "Etc/UTC" ||
        tz === "UTC" ||
        tz === "UCT" ||
        tz === "Etc/UCT" ||
        tz === "Etc/Universal" ||
        tz === "Universal" ||
        this._timeZone.name === "UTC")
    );
  }

  /** Alias for isUtc() */
  isGmt(): boolean {
    return this.isUtc();
  }

  // ---------------------------------------------------------------------------
  // Local time component accessors
  // ---------------------------------------------------------------------------

  private _local(): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
    nsec: number;
  } {
    const z = this._zoned;
    return {
      year: z.year,
      month: z.month,
      day: z.day,
      hour: z.hour,
      minute: z.minute,
      second: z.second,
      millisecond: z.millisecond,
      nsec: z.millisecond * 1_000_000 + z.microsecond * 1_000 + z.nanosecond,
    };
  }

  get year(): number {
    return this._local().year;
  }

  /** 1-12 */
  get mon(): number {
    return this._local().month;
  }

  /** 1-12 */
  get month(): number {
    return this._local().month;
  }

  /** 1-31 */
  get day(): number {
    return this._local().day;
  }

  /** 0-23 */
  get hour(): number {
    return this._local().hour;
  }

  /** 0-59 */
  get min(): number {
    return this._local().minute;
  }

  /** 0-59 */
  get sec(): number {
    return this._local().second;
  }

  /** Milliseconds 0-999 */
  get msec(): number {
    return this._local().millisecond;
  }

  /** Microseconds 0-999999 */
  get usec(): number {
    return Math.floor(this._local().nsec / 1000);
  }

  /** Nanoseconds 0-999999999 */
  get nsec(): number {
    return this._local().nsec;
  }

  /** Day of the week, 0=Sunday */
  get wday(): number {
    const l = this._local();
    // boundary: JS Date constructor for cheap weekday-of arithmetic.
    return new Date(l.year, l.month - 1, l.day).getDay();
  }

  /** Day of the year, 1-366 */
  get yday(): number {
    const l = this._local();
    // boundary: JS Date arithmetic for day-of-year span calculation.
    const jan1 = new Date(l.year, 0, 1);
    // boundary: JS Date arithmetic for day-of-year span calculation.
    const localDate = new Date(l.year, l.month - 1, l.day);
    return Math.floor((localDate.getTime() - jan1.getTime()) / 86400000) + 1;
  }

  // ---------------------------------------------------------------------------
  // Conversions
  // ---------------------------------------------------------------------------

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#utc` (time_with_zone.rb:63-65) —
   * `@utc ||= incorporate_utc_offset(@time, -utc_offset)`, a `::Time` in UTC.
   */
  utc(): Time {
    return (this._utc ??= this._incorporateUtcOffset(this._time as Time, -this.utcOffset));
  }

  /** `alias_method :getutc, :utc` (time_with_zone.rb:68). */
  getutc(): Time {
    return this.utc();
  }

  /** `alias_method :getgm, :utc` (time_with_zone.rb:67). */
  getgm(): Time {
    return this.utc();
  }

  /** `alias_method :gmtime, :utc` (time_with_zone.rb:69). */
  gmtime(): Time {
    return this.utc();
  }

  /**
   * `alias_method :comparable_time, :utc` (time_with_zone.rb:66) — the value
   * `<=>` and `between?` compare on.
   */
  comparableTime(): Time {
    return this.utc();
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#localtime(utc_offset = nil)`
   * (time_with_zone.rb:83-85) — `utc.getlocal(utc_offset)`, a `::Time` at the
   * given offset or zone, or in the system zone when none is given.
   */
  localtime(utcOffset: string | number | null = null): Time {
    return this.utc().getlocal(utcOffset);
  }

  /** `alias_method :getlocal, :localtime` (time_with_zone.rb:86). */
  getlocal(utcOffset: string | number | null = null): Time {
    return this.localtime(utcOffset);
  }

  /** Returns a Temporal.PlainDate representing the local date. */
  toDate(): Temporal.PlainDate {
    return this._zoned.toPlainDate();
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#to_time` (time_with_zone.rb:493-501).
   * Rails hands `getlocal` the `TimeZone` object itself for the `:zone` arm,
   * which `::Time` reads through `utc_to_local`; `@blazetrails/date`'s `Time`
   * seats a zone by its IANA identifier, which is the same zone spelled the way
   * that constructor takes it.
   */
  toTime(): Time {
    if (this.preserveTimezone() === ":zone") {
      return (this._toTimeWithTimezone ??= this.getlocal(this.timeZone.tzinfo.identifier));
    } else if (this.preserveTimezone()) {
      return (this._toTimeWithInstanceOffset ??= this.getlocal(this.utcOffset));
    } else {
      return (this._toTimeWithSystemOffset ??= this.getlocal());
    }
  }

  /** Unix timestamp in seconds */
  toI(): number {
    return Math.floor(this._epochMs / 1000);
  }

  /** Alias for toI() */
  tvSec(): number {
    return this.toI();
  }

  /** Unix timestamp as float with sub-second precision */
  toF(): number {
    return this._epochMs / 1000;
  }

  /**
   * Mirrors: `TimeWithZone#to_r` (`time_with_zone.rb:478-480`). Seconds since
   * the Epoch as an exact Rational.
   */
  toR(): Rational {
    return this.utc().toR();
  }

  /**
   * Convert to a different timezone. No-argument form uses Time.zone.
   *
   * `utc.in_time_zone(new_zone)` (time_with_zone.rb:79) lands in
   * `Time#in_time_zone`, whose first act is `::Time.find_zone!`
   * (core_ext/time/zones.rb), so every argument class, unmatched offset and bad
   * name raises there rather than here.
   */
  inTimeZone(newZone?: unknown): TimeWithZone {
    if (newZone == null) {
      const currentZone = timeZone();
      if (!currentZone) return this;
      newZone = currentZone;
    }
    const tz = findZoneBang(newZone) as TimeZone;
    if (tz.tzinfo.identifier === this._timeZone.tzinfo.identifier) return this;
    return new TimeWithZone(this._zoned.toInstant(), tz);
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /** Formatted UTC offset like "+05:30" */
  formattedOffset(colon = true, alternateUtcString?: string): string {
    if (this.isUtc() && alternateUtcString !== undefined) {
      return alternateUtcString;
    }
    return TimeZone.secondsToUtcOffset(this.utcOffset, colon);
  }

  /**
   * Returns a string of the object's date and time.
   *
   * Mirrors: `TimeWithZone#to_s` (`time_with_zone.rb:200-202`). Ruby formats
   * through `time.strftime`; `time` is the local wall clock, which is what
   * this receiver's own `strftime` formats (the `%Z` gsub it runs first has
   * nothing to substitute in this literal).
   */
  toString(): string {
    // mimicking Ruby Time#to_s format
    return `${this.strftime("%Y-%m-%d %H:%M:%S")} ${this.formattedOffset(false, "UTC")}`;
  }

  inspect(): string {
    const l = this._local();
    const ns = String(l.nsec).padStart(9, "0");
    return (
      `${l.year}-${pad2(l.month)}-${pad2(l.day)} ` +
      `${pad2(l.hour)}:${pad2(l.minute)}:${pad2(l.second)}.${ns} ` +
      `${this.zone} ${this.formattedOffset()}`
    );
  }

  /**
   * Replaces `%Z` directive with +zone before passing to `Time#strftime`,
   * so that zone information is correct.
   *
   * `getlocal(utc_offset)` answers a `::Time` at the receiver's offset, whose
   * `strftime` is the `date` gem's C formatter. That `::Time` was built from an
   * offset rather than a zone, so its own `zone` is `nil` and any `%Z` the gsub
   * left behind prints empty, as in Ruby.
   */
  strftime(format: string): string {
    format = format.replace(/((?:^|[^%])(?:%%)*)%Z/g, `$1${this.zone}`);
    return this.getlocal(this.utcOffset).strftime(format);
  }

  /**
   * ISO 8601 / xmlschema / rfc3339 format.
   */
  xmlschema(fractionDigits = 0): string {
    PRECISIONS[fractionDigits] ??= `%FT%T.%${fractionDigits}N`;
    return `${this.strftime(PRECISIONS[fractionDigits])}${this.formattedOffset(true, "Z")}`;
  }

  /** Alias for xmlschema() */
  iso8601(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  /** Alias for xmlschema() */
  rfc3339(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  /**
   * Returns a string of the object's date and time in the RFC 2822 standard
   * format.
   *
   * Mirrors: `TimeWithZone#rfc2822` (`time_with_zone.rb:194-196`).
   */
  rfc2822(): string {
    return this.toFs("rfc822");
  }

  /** `alias_method :rfc822, :rfc2822` (time_with_zone.rb:197). */
  rfc822(): string {
    return this.rfc2822();
  }

  /** HTTP date format */
  httpdate(): string {
    const u = this._utcPlain;
    return (
      `${SHORT_DAY_NAMES[u.dayOfWeek % 7]}, ${pad2(u.day)} ` +
      `${SHORT_MONTH_NAMES[u.month - 1]} ${u.year} ` +
      `${pad2(u.hour)}:${pad2(u.minute)}:${pad2(u.second)} GMT`
    );
  }

  /**
   * Returns a string of the object's date and time.
   *
   * Mirrors: `TimeWithZone#to_fs` (`time_with_zone.rb:212-220`). Every key in
   * `Time::DATE_FORMATS` works here, including one an app registers at boot —
   * the registry is read at call time, so a late registration is reachable.
   *
   * `DATE_FORMATS` comes from `time-ext.ts`, which imports this file back. The
   * edge is not a TDZ hazard: neither side reads the other at module-eval time
   * (this read is inside the method, and `time-ext`'s `TimeWithZone` uses are
   * inside function bodies) and neither declares a `class ... extends` across
   * it.
   */
  toFs(format: string = "default"): string {
    if (format === "db") {
      return toFs(this.utc(), format);
    } else {
      const formatter = DATE_FORMATS[format];
      if (formatter != null) {
        return typeof formatter === "function" ? String(formatter(this)) : this.strftime(formatter);
      } else {
        return this.toString();
      }
    }
  }

  /** `alias_method :to_formatted_s, :to_fs` (time_with_zone.rb:221). */
  toFormattedS(format?: string): string {
    return this.toFs(format);
  }

  /** JSON representation — ISO 8601 in UTC */
  asJson(): string {
    if (Encoding.useStandardJsonTimeFormat) {
      return this.xmlschema(Encoding.timePrecision);
    }
    return `${this.strftime("%Y/%m/%d %H:%M:%S")} ${this.formattedOffset(false)}`;
  }

  toJSON(): string {
    return this.asJson();
  }

  // ---------------------------------------------------------------------------
  // Arithmetic
  // ---------------------------------------------------------------------------

  /**
   * Add seconds or a Duration.
   */
  plus(interval: number | Duration): TimeWithZone {
    if (interval instanceof Duration) {
      if (interval.isVariable()) {
        // Variable durations (years, months, weeks, days) advance from local time
        return this.advance({
          years: interval.parts.years || undefined,
          months: interval.parts.months || undefined,
          weeks: interval.parts.weeks || undefined,
          days: interval.parts.days || undefined,
          hours: interval.parts.hours || undefined,
          minutes: interval.parts.minutes || undefined,
          seconds: interval.parts.seconds || undefined,
        });
      }
      // Fixed duration — advance from UTC
      const ms = interval.inSeconds() * 1000;
      return new TimeWithZone(
        Temporal.Instant.fromEpochMilliseconds(Math.trunc(this._epochMs + ms)),
        this._timeZone,
      );
    }
    if (typeof interval !== "number") {
      const desc =
        interval === null ? "null" : interval === undefined ? "undefined" : typeof interval;
      throw new TypeError(`no implicit conversion of ${desc} into number`);
    }
    // Number of seconds
    return new TimeWithZone(
      Temporal.Instant.fromEpochMilliseconds(Math.trunc(this._epochMs + interval * 1000)),
      this._timeZone,
    );
  }

  /**
   * Subtract seconds, Duration, or another TimeWithZone/Date/Temporal.Instant
   * (returns seconds difference).
   */
  minus(interval: number | Duration): TimeWithZone;
  minus(other: TimeWithZone | Date | Temporal.Instant): number;
  minus(arg: number | Duration | TimeWithZone | Date | Temporal.Instant): TimeWithZone | number {
    if (arg instanceof TimeWithZone) {
      return nsDiffToSeconds(this._zoned.epochNanoseconds - arg._zoned.epochNanoseconds);
    }
    // boundary: minus accepts Date for backwards compat with Rails' `t1 - t2`
    // overload that takes any Time-like value (including Ruby Time / DateTime).
    if (arg instanceof Date) {
      return (this._epochMs - arg.getTime()) / 1000;
    }
    if (arg instanceof Temporal.Instant) {
      return nsDiffToSeconds(this._zoned.epochNanoseconds - arg.epochNanoseconds);
    }
    if (arg instanceof Duration) {
      return this.plus(arg.negate());
    }
    return this.plus(-arg);
  }

  /** Alias for plus */
  since(other: number): TimeWithZone {
    return this.plus(other);
  }

  /**
   * Subtracts an interval of time from the current object's time and returns
   * the result as a new TimeWithZone object.
   *
   * Mirrors: `TimeWithZone#ago` (`time_with_zone.rb:369-371`).
   */
  ago(other: number): TimeWithZone {
    return this.since(-other);
  }

  /** Alias for since — matches Rails `in` method */
  in(other: number): TimeWithZone {
    return this.plus(other);
  }

  // ---------------------------------------------------------------------------
  // Advance / Change
  // ---------------------------------------------------------------------------

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#advance` (time_with_zone.rb:430-438).
   * Variable-length parts advance from `#time` — the local wall clock, whose
   * calendar arithmetic is `Time#advance`'s (time/calculations.rb:194-217) and
   * through it `Date#advance`'s — and the result is wrapped back into this
   * zone, exactly as `method_missing` (:553-557) does. Everything else advances
   * from `#utc`, for accuracy when moving across DST boundaries.
   *
   * @missingRailsArgs in_time_zone — PERMANENT: Ruby's `in_time_zone` is a
   * method ON the receiver; TypeScript cannot reopen `Time`, so
   * `core-ext/date-and-time/zones.ts` is the receiver-form reopening of
   * `DateAndTime::Zones` and takes the receiver as its first argument.
   */
  advance(options: AdvanceOptions): TimeWithZone {
    if ([options.years, options.weeks, options.months, options.days].some((v) => v != null)) {
      return this._wrapWithTimeZone(
        timeAdvance(this._transferTimeValuesToUtcConstructor(this.time), options),
      ) as TimeWithZone;
    } else {
      return inTimeZone(timeAdvance(this.utc(), options), this.timeZone) as TimeWithZone;
    }
  }

  /**
   * Return a new TimeWithZone where specified components are replaced.
   *
   * @missingRailsCall find_zone — CONVERGEABLE (story
   *   time-with-zone-advance-change-delegations, in the
   *   activesupport-surfaced-deviations bucket): Rails' change accepts `:zone`
   *   and `:offset` and resolves them through `::Time.find_zone`
   *   (time_with_zone.rb:390-404); trails' `ChangeOptions` carries no
   *   `zone`/`offset` key at all, so there is no value to resolve. Converging
   *   means adding those two options, not adding the call.
   */
  change(options: ChangeOptions): TimeWithZone {
    const l = this._local();

    const year = options.year ?? l.year;
    const month = options.month ?? l.month;
    const day = Math.min(options.day ?? l.day, daysInMonth(year, month));
    const hour = options.hour ?? l.hour;
    // If hour changes, reset lower components unless explicitly set
    const min = options.min ?? (options.hour !== undefined ? 0 : l.minute);
    const sec =
      options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : l.second);
    // Ruby carries the whole fraction into `new_sec` as a Rational
    // (calculations.rb:132-141), so `change` is nanosecond-exact. `Date.UTC` and
    // `TimeZone#local` are millisecond-granular, so the fraction is split: the
    // millisecond half goes through them and `subMsNsec` is added back to the
    // resulting instant, which is exact because a zone offset is whole seconds.
    let ms = l.millisecond;
    let subMsNsec = l.nsec % 1_000_000;
    if (options.usec !== undefined) {
      ms = Math.floor(options.usec / 1000);
      subMsNsec = (options.usec % 1000) * 1_000;
    } else if (options.nsec !== undefined) {
      ms = Math.floor(options.nsec / 1_000_000);
      subMsNsec = options.nsec % 1_000_000;
    } else if (
      options.hour !== undefined ||
      options.min !== undefined ||
      options.sec !== undefined
    ) {
      ms = 0;
      subMsNsec = 0;
    }

    // `periods.include?(period) ? period : nil` (time_with_zone.rb:406): the
    // receiver's own period wins while the new wall clock still falls in it, so
    // an ambiguous result stays on the side of the transition it started on.
    // Ruby compares TimezonePeriod objects; here that is (offset, dst).
    const newTime = Temporal.Instant.fromEpochMilliseconds(
      Date.UTC(year, month - 1, day, hour, min, sec, ms),
    );
    const periods = this._timeZone.periodsForLocal(
      this._transferTimeValuesToUtcConstructor(newTime),
    );
    const period = periods.find(
      (p) =>
        p.observedUtcOffset === this.period.observedUtcOffset && p.isDst() === this.period.isDst(),
    );
    if (!period) {
      const base = this._timeZone.local(year, month, day, hour, min, sec, ms);
      return subMsNsec === 0 ? base : this._withSubMsNsec(base, subMsNsec);
    }
    return new TimeWithZone(
      Temporal.Instant.fromEpochNanoseconds(
        BigInt(newTime.epochMilliseconds - period.observedUtcOffset * 1000) * 1_000_000n +
          BigInt(subMsNsec),
      ),
      this._timeZone,
    );
  }

  /** @internal Adds back the sub-millisecond half of a {@link change} fraction. */
  private _withSubMsNsec(base: TimeWithZone, subMsNsec: number): TimeWithZone {
    return new TimeWithZone(
      Temporal.Instant.fromEpochNanoseconds(
        base.utc().toTime().toInstant().epochNanoseconds + BigInt(subMsNsec),
      ),
      base.timeZone,
    );
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  /**
   * Compare to another TimeWithZone, Date, or Temporal.Instant. Returns -1, 0, or 1.
   * Comparison is nanosecond-precise for TimeWithZone / Temporal.Instant
   * arguments; Date arguments compare at millisecond resolution (Date's
   * native granularity).
   */
  compareTo(other: TimeWithZone | Date | Temporal.Instant): number {
    if (other instanceof TimeWithZone) {
      return signOf(this._zoned.epochNanoseconds - other._zoned.epochNanoseconds);
    }
    if (other instanceof Temporal.Instant) {
      return signOf(this._zoned.epochNanoseconds - other.epochNanoseconds);
    }
    const thisMs = this._epochMs;
    const otherMs = other.getTime();
    if (thisMs < otherMs) return -1;
    if (thisMs > otherMs) return 1;
    return 0;
  }

  /**
   * Equality — two TimeWithZone instances are equal if they represent the same
   * moment in time, regardless of timezone.
   */
  equals(other: TimeWithZone | Date | Temporal.Instant): boolean {
    return this.compareTo(other) === 0;
  }

  /**
   * Equality based on UTC instant. Two times representing the same moment
   * are eql regardless of timezone. Also accepts Date or Temporal.Instant.
   */
  eql(other: unknown): boolean {
    if (other instanceof TimeWithZone) {
      return this._zoned.epochNanoseconds === other._zoned.epochNanoseconds;
    }
    // boundary: eql is duck-typed in Rails (any Time-like); accept Date.
    if (other instanceof Date) {
      return this._epochMs === other.getTime();
    }
    if (other instanceof Temporal.Instant) {
      return this._zoned.epochNanoseconds === other.epochNanoseconds;
    }
    // `other.eql?(utc)` (time_with_zone.rb:275) — `utc` is a `::Time`, so a
    // `::Time` argument is the one Rails compares against it directly.
    if (other instanceof Time) {
      return this._zoned.epochNanoseconds === other.toTime().epochNanoseconds;
    }
    return false;
  }

  /**
   * Check if time falls between min and max (inclusive).
   */
  between(
    min: TimeWithZone | Date | Temporal.Instant,
    max: TimeWithZone | Date | Temporal.Instant,
  ): boolean {
    return this.compareTo(min) >= 0 && this.compareTo(max) <= 0;
  }

  // ---------------------------------------------------------------------------
  // Temporal queries
  // ---------------------------------------------------------------------------

  isPast(): boolean {
    return this._epochMs < currentTime().getTime();
  }

  isFuture(): boolean {
    return this._epochMs > currentTime().getTime();
  }

  isToday(): boolean {
    const now = new TimeWithZone(instantFrom(currentTime()), this._timeZone);
    return this.year === now.year && this.month === now.month && this.day === now.day;
  }

  isTomorrow(): boolean {
    const now = new TimeWithZone(instantFrom(currentTime()), this._timeZone);
    const tomorrow = now.advance({ days: 1 });
    return (
      this.year === tomorrow.year && this.month === tomorrow.month && this.day === tomorrow.day
    );
  }

  isYesterday(): boolean {
    const now = new TimeWithZone(instantFrom(currentTime()), this._timeZone);
    const yesterday = now.advance({ days: -1 });
    return (
      this.year === yesterday.year && this.month === yesterday.month && this.day === yesterday.day
    );
  }

  /** Returns true if this time is before the given time */
  isBefore(other: TimeWithZone | Date | Temporal.Instant): boolean {
    return this.compareTo(other) < 0;
  }

  /** Returns true if this time is after the given time */
  isAfter(other: TimeWithZone | Date | Temporal.Instant): boolean {
    return this.compareTo(other) > 0;
  }

  /** Alias for isYesterday */
  isPrevDay(): boolean {
    return this.isYesterday();
  }

  /** Alias for isTomorrow */
  isNextDay(): boolean {
    return this.isTomorrow();
  }

  // ---------------------------------------------------------------------------
  // Weekday query methods
  // ---------------------------------------------------------------------------

  isSunday(): boolean {
    return this.wday === 0;
  }

  isMonday(): boolean {
    return this.wday === 1;
  }

  isTuesday(): boolean {
    return this.wday === 2;
  }

  isWednesday(): boolean {
    return this.wday === 3;
  }

  isThursday(): boolean {
    return this.wday === 4;
  }

  isFriday(): boolean {
    return this.wday === 5;
  }

  isSaturday(): boolean {
    return this.wday === 6;
  }

  // ---------------------------------------------------------------------------
  // Beginning / End of period methods
  // ---------------------------------------------------------------------------

  beginningOfYear(): TimeWithZone {
    return this.change({ month: 1, day: 1, hour: 0, min: 0, sec: 0 });
  }

  beginningOfMonth(): TimeWithZone {
    return this.change({ day: 1, hour: 0, min: 0, sec: 0 });
  }

  beginningOfDay(): TimeWithZone {
    return this.change({ hour: 0, min: 0, sec: 0 });
  }

  /** Mirrors: `Time#middle_of_day` (`core_ext/time/calculations.rb:245-247`) */
  middleOfDay(): TimeWithZone {
    return this.change({ hour: 12, min: 0, sec: 0 });
  }

  beginningOfHour(): TimeWithZone {
    return this.change({ min: 0, sec: 0 });
  }

  beginningOfMinute(): TimeWithZone {
    return this.change({ sec: 0 });
  }

  endOfYear(): TimeWithZone {
    return this.change({ month: 12, day: 31, hour: 23, min: 59, sec: 59, nsec: 999999999 });
  }

  endOfMonth(): TimeWithZone {
    const l = this._local();
    const lastDay = daysInMonth(l.year, l.month);
    return this.change({ day: lastDay, hour: 23, min: 59, sec: 59, nsec: 999999999 });
  }

  endOfDay(): TimeWithZone {
    return this.change({ hour: 23, min: 59, sec: 59, nsec: 999999999 });
  }

  endOfHour(): TimeWithZone {
    return this.change({ min: 59, sec: 59, nsec: 999999999 });
  }

  endOfMinute(): TimeWithZone {
    return this.change({ sec: 59, nsec: 999999999 });
  }

  /** Seconds elapsed since midnight in the local timezone */
  secondsSinceMidnight(): number {
    const l = this._local();
    return l.hour * 3600 + l.minute * 60 + l.second;
  }

  /**
   * Round to the nearest precision in seconds (default: 1 second).
   */
  round(precision = 1): TimeWithZone {
    if (!Number.isFinite(precision) || precision <= 0) {
      throw new RangeError(`precision must be a positive number, got ${precision}`);
    }
    const ms = this._epochMs;
    const precisionMs = precision * 1000;
    const rounded = Math.round(ms / precisionMs) * precisionMs;
    return new TimeWithZone(
      Temporal.Instant.fromEpochMilliseconds(Math.trunc(rounded)),
      this._timeZone,
    );
  }

  // ---------------------------------------------------------------------------
  // Type checking
  // ---------------------------------------------------------------------------

  actsLikeTime(): boolean {
    return true;
  }

  isBlank(): boolean {
    return false;
  }

  /**
   * `def present?; true; end` (time_with_zone.rb:519-521) — the counterpart to
   * {@link isBlank}, defined outright rather than derived so a TimeWithZone
   * never routes through `Object#present?`'s `!blank?`.
   */
  isPresent(): boolean {
    return true;
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#freeze`
   * (time_with_zone.rb:523-527) — Ruby's `super` is `Object.freeze`, which JS
   * spells as a call on the object rather than a method it inherits.
   */
  freeze(): this {
    // preload instance variables before freezing
    void this.period;
    this.utc();
    void this.time;
    this.toDatetime();
    this.toTime();
    return Object.freeze(this);
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#to_datetime`
   * (time_with_zone.rb:486-488) — `utc.to_datetime.new_offset(Rational(
   * utc_offset, 86_400))`, the same instant carrying this zone's offset.
   */
  toDatetime(): Temporal.ZonedDateTime {
    return this._zoned;
  }

  /**
   * Mirrors: `ActiveSupport::TimeWithZone#duration_of_variable_length?`
   * (time_with_zone.rb:589-591) — `ActiveSupport::Duration === obj &&
   * obj.variable?`. A variable-length duration (years/months/days) has to be
   * applied in local time, where a fixed one can be added to the UTC instant.
   */
  private durationOfVariableLength(obj: unknown): boolean {
    return obj instanceof Duration && obj.isVariable();
  }

  /**
   * `DateAndTime::Compatibility#preserve_timezone`, reached through the
   * `include DateAndTime::Compatibility` at time_with_zone.rb:29. Rails' one
   * module-level switch, read here rather than re-seated.
   */
  preserveTimezone(): boolean | string {
    return preserveTimezone();
  }

  /**
   * `DateAndTime::Compatibility#utc_to_local_returns_utc_offset_times`, the
   * other half of the same `include`.
   */
  utcToLocalReturnsUtcOffsetTimes(): boolean {
    return utcToLocalReturnsUtcOffsetTimes();
  }

  /** Returns the internal UTC timestamp in milliseconds */
  getTime(): number {
    return this._epochMs;
  }

  /**
   * valueOf for comparison operators to work
   *
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activesupport/lib/active_support/time_with_zone.rb:200, :469` — `def to_s` and
   *   `def to_i` are the Ruby coercion hooks).
   * JS primitive-coercion protocol — Ruby coerces through
   * to_s/to_i instead
   */
  valueOf(): number {
    return this._epochMs;
  }
}
