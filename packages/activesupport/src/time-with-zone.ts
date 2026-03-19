/**
 * ActiveSupport::TimeWithZone — a Time-like class that can represent a time
 * in any timezone.
 *
 * Mirrors the Rails API: https://api.rubyonrails.org/classes/ActiveSupport/TimeWithZone.html
 */

import { TimeZone, getLocalComponents } from "./time-zone.js";
import { Duration } from "./duration.js";
import { currentTime } from "./time-travel.js";
import { getZone } from "./time-zone-config.js";

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export class TimeWithZone {
  /** The underlying UTC instant */
  private readonly _utc: Date;
  /** The timezone */
  private readonly _timeZone: TimeZone;

  constructor(utcTime: Date, timeZone: TimeZone) {
    this._utc = new Date(utcTime.getTime());
    this._timeZone = timeZone;
  }

  // ---------------------------------------------------------------------------
  // Core accessors
  // ---------------------------------------------------------------------------

  /** The TimeZone instance */
  get timeZone(): TimeZone {
    return this._timeZone;
  }

  /** Returns the local time as a Date (wall-clock time expressed as UTC Date) */
  get time(): Date {
    const l = this._local();
    return new Date(
      Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second, l.millisecond),
    );
  }

  /** Timezone abbreviation (e.g., "EST", "EDT") */
  get zone(): string {
    return this._timeZone.abbreviation(this._utc);
  }

  /** UTC offset in seconds */
  get utcOffset(): number {
    return this._timeZone.utcOffsetAt(this._utc);
  }

  /** Alias for utcOffset */
  get gmtOffset(): number {
    return this.utcOffset;
  }

  /** Whether DST is in effect */
  dst(): boolean {
    return this._timeZone.isDst(this._utc);
  }

  /** Alias for dst() */
  isdst(): boolean {
    return this.dst();
  }

  /** Whether the timezone is UTC */
  isUtc(): boolean {
    const tz = this._timeZone.tzinfo;
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
  } {
    return getLocalComponents(this._timeZone.tzinfo, this._utc);
  }

  get year(): number {
    return this._local().year;
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

  /** Microseconds (milliseconds * 1000, since JS doesn't have sub-ms precision) */
  get usec(): number {
    return this.msec * 1000;
  }

  /** Nanoseconds (milliseconds * 1_000_000) */
  get nsec(): number {
    return this.msec * 1_000_000;
  }

  /** Day of the week, 0=Sunday */
  get wday(): number {
    // Calculate from the local date
    const l = this._local();
    return new Date(l.year, l.month - 1, l.day).getDay();
  }

  /** Day of the year, 1-366 */
  get yday(): number {
    const l = this._local();
    const jan1 = new Date(l.year, 0, 1);
    const localDate = new Date(l.year, l.month - 1, l.day);
    return Math.floor((localDate.getTime() - jan1.getTime()) / 86400000) + 1;
  }

  // ---------------------------------------------------------------------------
  // Conversions
  // ---------------------------------------------------------------------------

  /** Returns the UTC time as a Date */
  utc(): Date {
    return new Date(this._utc.getTime());
  }

  /** Alias for utc() */
  getutc(): Date {
    return this.utc();
  }

  /** Alias for utc() */
  getgm(): Date {
    return this.utc();
  }

  /** Alias for utc() */
  gmtime(): Date {
    return this.utc();
  }

  /**
   * Returns local time as a Date (in the system timezone, adjusted to represent
   * the same wall clock time as in this zone).
   */
  localtime(utcOffsetOverride?: number): Date {
    if (utcOffsetOverride !== undefined) {
      return new Date(this._utc.getTime() + utcOffsetOverride * 1000);
    }
    const l = this._local();
    return new Date(l.year, l.month - 1, l.day, l.hour, l.minute, l.second, l.millisecond);
  }

  /** Alias for localtime() */
  getlocal(utcOffset?: number): Date {
    return this.localtime(utcOffset);
  }

  /** Returns a Date representing this instant */
  toDate(): Date {
    const l = this._local();
    return new Date(l.year, l.month - 1, l.day);
  }

  /** Returns the UTC Date */
  toTime(): Date {
    return this.utc();
  }

  /** Unix timestamp in seconds */
  toI(): number {
    return Math.floor(this._utc.getTime() / 1000);
  }

  /** Alias for toI() */
  tvSec(): number {
    return this.toI();
  }

  /** Unix timestamp as float with sub-second precision */
  toF(): number {
    return this._utc.getTime() / 1000;
  }

  /** Convert to a different timezone. No-argument form uses Time.zone. */
  inTimeZone(zone?: string | TimeZone): TimeWithZone {
    if (zone === undefined) {
      const currentZone = getZone();
      if (!currentZone) return this;
      zone = currentZone;
    }
    const tz = typeof zone === "string" ? TimeZone.find(zone) : zone;
    if (tz.tzinfo === this._timeZone.tzinfo) return this;
    return new TimeWithZone(this._utc, tz);
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /** Formatted UTC offset like "+05:30" */
  formattedOffset(colon = true, alternateUtcString?: string): string {
    if (alternateUtcString !== undefined && this.utcOffset === 0) {
      return alternateUtcString;
    }
    const offset = this.utcOffset;
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const h = String(Math.floor(abs / 3600)).padStart(2, "0");
    const m = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
    return colon ? `${sign}${h}:${m}` : `${sign}${h}${m}`;
  }

  toString(): string {
    const l = this._local();
    return (
      `${l.year}-${pad2(l.month)}-${pad2(l.day)} ` +
      `${pad2(l.hour)}:${pad2(l.minute)}:${pad2(l.second)} ` +
      `${this.formattedOffset(false)}`
    );
  }

  inspect(): string {
    const l = this._local();
    const ns = String(l.millisecond * 1_000_000).padStart(9, "0");
    return (
      `${l.year}-${pad2(l.month)}-${pad2(l.day)} ` +
      `${pad2(l.hour)}:${pad2(l.minute)}:${pad2(l.second)}.${ns} ` +
      `${this.zone} ${this.formattedOffset()}`
    );
  }

  /**
   * Format using strftime-style format string.
   */
  strftime(format: string): string {
    const l = this._local();
    const tokens: Record<string, () => string> = {
      Y: () => String(l.year),
      C: () => String(Math.floor(l.year / 100)),
      y: () => pad2(l.year % 100),
      m: () => pad2(l.month),
      d: () => pad2(l.day),
      e: () => String(l.day).padStart(2, " "),
      j: () => String(this.yday).padStart(3, "0"),
      H: () => pad2(l.hour),
      k: () => String(l.hour).padStart(2, " "),
      I: () => pad2(l.hour === 0 ? 12 : l.hour > 12 ? l.hour - 12 : l.hour),
      l: () => String(l.hour === 0 ? 12 : l.hour > 12 ? l.hour - 12 : l.hour).padStart(2, " "),
      P: () => (l.hour < 12 ? "am" : "pm"),
      p: () => (l.hour < 12 ? "AM" : "PM"),
      M: () => pad2(l.minute),
      S: () => pad2(l.second),
      L: () => pad3(l.millisecond),
      N: () => String(l.millisecond * 1_000_000).padStart(9, "0"),
      z: () => this.formattedOffset(false),
      Z: () => this.zone,
      ":z": () => this.formattedOffset(true),
      A: () => DAY_NAMES[this.wday],
      a: () => SHORT_DAY_NAMES[this.wday],
      u: () => String(this.wday === 0 ? 7 : this.wday),
      w: () => String(this.wday),
      B: () => MONTH_NAMES[l.month - 1],
      b: () => SHORT_MONTH_NAMES[l.month - 1],
      h: () => SHORT_MONTH_NAMES[l.month - 1],
      s: () => String(this.toI()),
      n: () => "\n",
      t: () => "\t",
      "%": () => "%",
    };

    return format.replace(/%(-?)(:?[A-Za-z%])/g, (_match, flag, spec) => {
      const fn = tokens[spec];
      if (!fn) return _match;
      let result = fn();
      if (flag === "-") {
        // Remove leading zeros/spaces
        result = result.replace(/^[0 ]+/, "") || "0";
      }
      return result;
    });
  }

  /**
   * ISO 8601 / xmlschema / rfc3339 format.
   */
  xmlschema(fractionDigits = 0): string {
    const l = this._local();
    let base =
      `${l.year}-${pad2(l.month)}-${pad2(l.day)}T` +
      `${pad2(l.hour)}:${pad2(l.minute)}:${pad2(l.second)}`;

    if (fractionDigits > 0) {
      const frac = (l.millisecond / 1000).toFixed(fractionDigits).slice(1);
      base += frac;
    }

    base += this.formattedOffset();
    return base;
  }

  /** Alias for xmlschema() */
  iso8601(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  /** Alias for xmlschema() */
  rfc3339(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  /** RFC 2822 format */
  rfc2822(): string {
    const l = this._local();
    return (
      `${SHORT_DAY_NAMES[this.wday]}, ${pad2(l.day)} ${SHORT_MONTH_NAMES[l.month - 1]} ${l.year} ` +
      `${pad2(l.hour)}:${pad2(l.minute)}:${pad2(l.second)} ` +
      `${this.formattedOffset(false)}`
    );
  }

  /** HTTP date format */
  httpdate(): string {
    const u = this._utc;
    return (
      `${SHORT_DAY_NAMES[u.getUTCDay()]}, ${pad2(u.getUTCDate())} ` +
      `${SHORT_MONTH_NAMES[u.getUTCMonth()]} ${u.getUTCFullYear()} ` +
      `${pad2(u.getUTCHours())}:${pad2(u.getUTCMinutes())}:${pad2(u.getUTCSeconds())} GMT`
    );
  }

  /** Named format strings, matching Rails to_fs / to_formatted_s */
  toFs(format: string = "default"): string {
    switch (format) {
      case "db": {
        const u = this._utc;
        return (
          `${u.getUTCFullYear()}-${pad2(u.getUTCMonth() + 1)}-${pad2(u.getUTCDate())} ` +
          `${pad2(u.getUTCHours())}:${pad2(u.getUTCMinutes())}:${pad2(u.getUTCSeconds())}`
        );
      }
      case "long":
        return this.strftime("%B %d, %Y %H:%M");
      case "short":
        return this.strftime("%d %b %H:%M");
      case "rfc822":
      case "rfc2822":
        return this.rfc2822();
      case "iso8601":
      case "xmlschema":
        return this.xmlschema();
      case "inspect": {
        const li = this._local();
        const nsi = String(li.millisecond * 1_000_000).padStart(9, "0");
        return (
          `${li.year}-${pad2(li.month)}-${pad2(li.day)} ` +
          `${pad2(li.hour)}:${pad2(li.minute)}:${pad2(li.second)}.${nsi} ` +
          `${this.formattedOffset(false)}`
        );
      }
      default:
        return this.toString();
    }
  }

  /** Alias for toFs */
  toFormattedS(format?: string): string {
    return this.toFs(format);
  }

  /** JSON representation — ISO 8601 in UTC */
  asJson(): string {
    return this.xmlschema(3);
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
      return new TimeWithZone(new Date(this._utc.getTime() + ms), this._timeZone);
    }
    if (typeof interval !== "number") {
      throw new TypeError(`no implicit conversion of ${typeof interval} into number`);
    }
    // Number of seconds
    return new TimeWithZone(new Date(this._utc.getTime() + interval * 1000), this._timeZone);
  }

  /**
   * Subtract seconds, Duration, or another TimeWithZone/Date (returns seconds difference).
   */
  minus(interval: number | Duration): TimeWithZone;
  minus(other: TimeWithZone | Date): number;
  minus(arg: number | Duration | TimeWithZone | Date): TimeWithZone | number {
    if (arg instanceof TimeWithZone) {
      return (this._utc.getTime() - arg._utc.getTime()) / 1000;
    }
    if (arg instanceof Date) {
      return (this._utc.getTime() - arg.getTime()) / 1000;
    }
    if (arg instanceof Duration) {
      return this.plus(arg.negate());
    }
    return this.plus(-arg);
  }

  /** Alias for plus */
  since(seconds: number): TimeWithZone {
    return this.plus(seconds);
  }

  /** Alias for minus with seconds */
  ago(seconds: number): TimeWithZone {
    return this.plus(-seconds);
  }

  /** Alias for since — matches Rails `in` method */
  in(seconds: number): TimeWithZone {
    return this.plus(seconds);
  }

  // ---------------------------------------------------------------------------
  // Advance / Change
  // ---------------------------------------------------------------------------

  /**
   * Advance by calendar amounts. Variable parts (years, months, weeks, days)
   * are applied in local time; fixed parts (hours, minutes, seconds) from UTC.
   */
  advance(options: AdvanceOptions): TimeWithZone {
    const l = this._local();
    let { year, month, day } = l;

    // Apply variable parts in local time
    if (options.years) year += options.years;
    if (options.months) {
      month += options.months;
      // Normalize month overflow
      while (month > 12) {
        month -= 12;
        year++;
      }
      while (month < 1) {
        month += 12;
        year--;
      }
    }
    // Clamp day to valid range for the new month
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) day = maxDay;

    if (options.weeks) day += options.weeks * 7;
    if (options.days) day += options.days;

    // Reconstruct the local time, then convert to UTC
    const newLocal = this._timeZone.local(
      year,
      month,
      day,
      l.hour,
      l.minute,
      l.second,
      l.millisecond,
    );

    // Now apply fixed parts as seconds on UTC
    let ms = 0;
    if (options.hours) ms += options.hours * 3600000;
    if (options.minutes) ms += options.minutes * 60000;
    if (options.seconds) ms += options.seconds * 1000;

    if (ms !== 0) {
      return new TimeWithZone(new Date(newLocal._utc.getTime() + ms), this._timeZone);
    }

    return newLocal;
  }

  /**
   * Return a new TimeWithZone where specified components are replaced.
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
    let ms = l.millisecond;
    if (options.usec !== undefined) {
      ms = Math.floor(options.usec / 1000);
    } else if (options.nsec !== undefined) {
      ms = Math.floor(options.nsec / 1_000_000);
    } else if (
      options.hour !== undefined ||
      options.min !== undefined ||
      options.sec !== undefined
    ) {
      ms = 0;
    }

    return this._timeZone.local(year, month, day, hour, min, sec, ms);
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  /**
   * Compare to another TimeWithZone or Date. Returns -1, 0, or 1.
   */
  compareTo(other: TimeWithZone | Date): number {
    const otherMs = other instanceof TimeWithZone ? other._utc.getTime() : other.getTime();
    const thisMs = this._utc.getTime();
    if (thisMs < otherMs) return -1;
    if (thisMs > otherMs) return 1;
    return 0;
  }

  /**
   * Equality — two TimeWithZone instances are equal if they represent the same
   * moment in time, regardless of timezone.
   */
  equals(other: TimeWithZone | Date): boolean {
    return this.compareTo(other) === 0;
  }

  /**
   * Equality based on UTC instant. Two times representing the same moment
   * are eql regardless of timezone. Also accepts Date.
   */
  eql(other: unknown): boolean {
    if (other instanceof TimeWithZone) {
      return this._utc.getTime() === other._utc.getTime();
    }
    if (other instanceof Date) {
      return this._utc.getTime() === other.getTime();
    }
    return false;
  }

  /**
   * Check if time falls between min and max (inclusive).
   */
  between(min: TimeWithZone | Date, max: TimeWithZone | Date): boolean {
    return this.compareTo(min) >= 0 && this.compareTo(max) <= 0;
  }

  // ---------------------------------------------------------------------------
  // Temporal queries
  // ---------------------------------------------------------------------------

  isPast(): boolean {
    return this._utc.getTime() < currentTime().getTime();
  }

  isFuture(): boolean {
    return this._utc.getTime() > currentTime().getTime();
  }

  isToday(): boolean {
    const now = new TimeWithZone(currentTime(), this._timeZone);
    return this.year === now.year && this.month === now.month && this.day === now.day;
  }

  isTomorrow(): boolean {
    const now = new TimeWithZone(currentTime(), this._timeZone);
    const tomorrow = now.advance({ days: 1 });
    return (
      this.year === tomorrow.year && this.month === tomorrow.month && this.day === tomorrow.day
    );
  }

  isYesterday(): boolean {
    const now = new TimeWithZone(currentTime(), this._timeZone);
    const yesterday = now.advance({ days: -1 });
    return (
      this.year === yesterday.year && this.month === yesterday.month && this.day === yesterday.day
    );
  }

  /** Returns true if this time is before the given time */
  isBefore(other: TimeWithZone | Date): boolean {
    return this.compareTo(other) < 0;
  }

  /** Returns true if this time is after the given time */
  isAfter(other: TimeWithZone | Date): boolean {
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
    const ms = this._utc.getTime();
    const precisionMs = precision * 1000;
    const rounded = Math.round(ms / precisionMs) * precisionMs;
    return new TimeWithZone(new Date(rounded), this._timeZone);
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

  /** Returns the internal UTC timestamp in milliseconds */
  getTime(): number {
    return this._utc.getTime();
  }

  /** valueOf for comparison operators to work */
  valueOf(): number {
    return this._utc.getTime();
  }
}
