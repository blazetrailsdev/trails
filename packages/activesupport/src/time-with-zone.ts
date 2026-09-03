import { PeriodNotFound, TimeZone, TimezonePeriod } from "./values/time-zone.js";
import {
  Range,
  equals as cmpEquals,
  greaterThan,
  greaterThanOrEqual,
  isBetween,
  lessThan,
  lessThanOrEqual,
  rubyClass,
} from "@blazetrails/ruby-compat";
import { Object as ObjectExt } from "./core-ext/object/acts-like.js";
import { Duration } from "./duration.js";
import { currentTime } from "./time-travel.js";
import { zone as timeZone, findZoneBang } from "./time-zone-config.js";
import { DateTime, Temporal } from "@blazetrails/date";
import { instantFrom } from "./temporal.js";
import { Time } from "@blazetrails/date";
import { Rational, rational } from "@blazetrails/ruby-compat";
import { Encoding } from "./json/encoding.js";
import { DATE_FORMATS, toFs } from "./core-ext/time/conversions.js";
import { advance as timeAdvance } from "./time-ext.js";
import { inTimeZone } from "./core-ext/date-and-time/zones.js";
import {
  preserveTimezone,
  utcToLocalReturnsUtcOffsetTimes,
} from "./core-ext/date-and-time/compatibility.js";

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

const PRECISIONS: Record<number, string> = { 0: "%FT%T" };

const NS_PER_SECOND = 1_000_000_000n;

function signOf(diff: bigint): number {
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

function nsDiffToSeconds(diffNs: bigint): number {
  const wholeSeconds = diffNs / NS_PER_SECOND;
  const remainderNs = diffNs % NS_PER_SECOND;
  return Number(wholeSeconds) + Number(remainderNs) / 1e9;
}

const SECONDS_PER_DAY = 86400;

type TimeLike =
  | Time
  | Temporal.Instant
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.ZonedDateTime;

/** @noRailsEquivalent PERMANENT */
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
  private _utc: Time | null;
  private _time: TimeLike | null;
  private readonly _timeZone: TimeZone;
  private _period?: TimezonePeriod;
  private _toTimeWithTimezone?: Time;
  private _toTimeWithInstanceOffset?: Time;
  private _toTimeWithSystemOffset?: Time;

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

  private get _zoned(): Temporal.ZonedDateTime {
    return this.utc().toTime().toInstant().toZonedDateTimeISO(this._timeZone.tzinfo.identifier);
  }

  private get _epochMs(): number {
    return this._zoned.epochMilliseconds;
  }

  private get _utcPlain(): Temporal.PlainDateTime {
    return this.utc().toTime().toPlainDateTime();
  }

  respondToMissing(sym: string, includePriv: boolean): boolean {
    if (!includePriv && sym.startsWith("_")) return false;
    return typeof (this.time as unknown as Record<string, unknown>)[sym] === "function";
  }

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

  private _incorporateUtcOffset(time: Time | Temporal.PlainDate, offset: number): Time {
    if (time instanceof Temporal.PlainDate) {
      return this._transferTimeValuesToUtcConstructor(
        new DateTime(time.toPlainDateTime()).plus(rational(offset, SECONDS_PER_DAY)).toDatetime(),
      );
    }
    return time.plus(offset);
  }

  private _getPeriodAndEnsureValidLocalTime(period: TimezonePeriod | null): TimezonePeriod {
    if (!(this._time instanceof Time) || !this._time.isUtc()) {
      this._time = this._transferTimeValuesToUtcConstructor(this._time!);
    }
    for (;;) {
      try {
        return period ?? this._timeZone.periodForLocal(this._time);
      } catch (e) {
        if (!(e instanceof PeriodNotFound)) throw e;
        this._time = this._incorporateUtcOffset(this._time, 3600);
      }
    }
  }

  private _transferTimeValuesToUtcConstructor(time: TimeLike): Time {
    if (time instanceof Time && time.isUtc()) return time;
    const values =
      time instanceof Time
        ? time.toTime().toPlainDateTime()
        : time instanceof Temporal.Instant
          ? time.toZonedDateTimeISO("UTC").toPlainDateTime()
          : time instanceof Temporal.PlainDate
            ? time.toPlainDateTime()
            : time instanceof Temporal.ZonedDateTime
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
      return new Range(this._wrapWithTimeZone(time.begin), this._wrapWithTimeZone(time.end));
    } else {
      return time;
    }
  }

  get period(): TimezonePeriod {
    return (this._period ??= this._timeZone.periodForUtc(this._utc!));
  }

  get timeZone(): TimeZone {
    return this._timeZone;
  }

  get time(): Temporal.PlainDateTime {
    this._time ??= this._incorporateUtcOffset(this._utc!, this.utcOffset);
    return this._transferTimeValuesToUtcConstructor(this._time).toTime().toPlainDateTime();
  }

  get zone(): string {
    return this.period.abbreviation;
  }

  get utcOffset(): number {
    return this.period.observedUtcOffset;
  }

  get gmtOffset(): number {
    return this.utcOffset;
  }

  get gmtoff(): number {
    return this.utcOffset;
  }

  dst(): boolean {
    return this.period.isDst();
  }

  isdst(): boolean {
    return this.dst();
  }

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

  isGmt(): boolean {
    return this.isUtc();
  }

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

  get mon(): number {
    return this._local().month;
  }

  get month(): number {
    return this._local().month;
  }

  get day(): number {
    return this._local().day;
  }

  get hour(): number {
    return this._local().hour;
  }

  get min(): number {
    return this._local().minute;
  }

  get sec(): number {
    return this._local().second;
  }

  get msec(): number {
    return this._local().millisecond;
  }

  get usec(): number {
    return Math.floor(this._local().nsec / 1000);
  }

  get nsec(): number {
    return this._local().nsec;
  }

  get wday(): number {
    const l = this._local();
    // boundary: JS Date constructor for cheap weekday-of arithmetic.
    return new Date(l.year, l.month - 1, l.day).getDay();
  }

  get yday(): number {
    const l = this._local();
    // boundary: JS Date arithmetic for day-of-year span calculation.
    const jan1 = new Date(l.year, 0, 1);
    // boundary: JS Date arithmetic for day-of-year span calculation.
    const localDate = new Date(l.year, l.month - 1, l.day);
    return Math.floor((localDate.getTime() - jan1.getTime()) / 86400000) + 1;
  }

  utc(): Time {
    return (this._utc ??= this._incorporateUtcOffset(this._time as Time, -this.utcOffset));
  }

  getutc(): Time {
    return this.utc();
  }

  getgm(): Time {
    return this.utc();
  }

  gmtime(): Time {
    return this.utc();
  }

  comparableTime(): Time {
    return this.utc();
  }

  localtime(utcOffset: string | number | null = null): Time {
    return this.utc().getlocal(utcOffset);
  }

  getlocal(utcOffset: string | number | null = null): Time {
    return this.localtime(utcOffset);
  }

  toDate(): Temporal.PlainDate {
    return this._zoned.toPlainDate();
  }

  toTime(): Time {
    if (this.preserveTimezone() === ":zone") {
      return (this._toTimeWithTimezone ??= this.getlocal(this.timeZone.tzinfo.identifier));
    } else if (this.preserveTimezone()) {
      return (this._toTimeWithInstanceOffset ??= this.getlocal(this.utcOffset));
    } else {
      return (this._toTimeWithSystemOffset ??= this.getlocal());
    }
  }

  toI(): number {
    return Math.floor(this._epochMs / 1000);
  }

  tvSec(): number {
    return this.toI();
  }

  toF(): number {
    return this._epochMs / 1000;
  }

  toR(): Rational {
    return this.utc().toR();
  }

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

  formattedOffset(colon = true, alternateUtcString?: string): string {
    if (this.isUtc() && alternateUtcString !== undefined) {
      return alternateUtcString;
    }
    return TimeZone.secondsToUtcOffset(this.utcOffset, colon);
  }

  toString(): string {
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

  strftime(format: string): string {
    format = format.replace(/((?:^|[^%])(?:%%)*)%Z/g, `$1${this.zone}`);
    return this.getlocal(this.utcOffset).strftime(format);
  }

  xmlschema(fractionDigits = 0): string {
    PRECISIONS[fractionDigits] ??= `%FT%T.%${fractionDigits}N`;
    return `${this.strftime(PRECISIONS[fractionDigits])}${this.formattedOffset(true, "Z")}`;
  }

  iso8601(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  rfc3339(fractionDigits = 0): string {
    return this.xmlschema(fractionDigits);
  }

  rfc2822(): string {
    return this.toFs("rfc822");
  }

  rfc822(): string {
    return this.rfc2822();
  }

  httpdate(): string {
    const u = this._utcPlain;
    return (
      `${SHORT_DAY_NAMES[u.dayOfWeek % 7]}, ${pad2(u.day)} ` +
      `${SHORT_MONTH_NAMES[u.month - 1]} ${u.year} ` +
      `${pad2(u.hour)}:${pad2(u.minute)}:${pad2(u.second)} GMT`
    );
  }

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

  toFormattedS(format?: string): string {
    return this.toFs(format);
  }

  asJson(): string {
    if (Encoding.useStandardJsonTimeFormat) {
      return this.xmlschema(Encoding.timePrecision);
    }
    return `${this.strftime("%Y/%m/%d %H:%M:%S")} ${this.formattedOffset(false)}`;
  }

  toJSON(): string {
    return this.asJson();
  }

  plus(interval: number | Duration): TimeWithZone {
    if (interval instanceof Duration) {
      if (interval.isVariable()) {
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
    return new TimeWithZone(
      Temporal.Instant.fromEpochMilliseconds(Math.trunc(this._epochMs + interval * 1000)),
      this._timeZone,
    );
  }

  minus(interval: number | Duration): TimeWithZone;
  minus(other: TimeWithZone | Date | Temporal.Instant): number;
  minus(arg: number | Duration | TimeWithZone | Date | Temporal.Instant): TimeWithZone | number {
    if (arg instanceof TimeWithZone) {
      return nsDiffToSeconds(this._zoned.epochNanoseconds - arg._zoned.epochNanoseconds);
    }
    // boundary: minus accepts Date for backwards compat with Rails' `t1 - t2`
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

  since(other: number): TimeWithZone {
    return this.plus(other);
  }

  ago(other: number): TimeWithZone {
    return this.since(-other);
  }

  in(other: number): TimeWithZone {
    return this.plus(other);
  }

  /** @missingRailsArgs in_time_zone — PERMANENT */
  advance(options: AdvanceOptions): TimeWithZone {
    if ([options.years, options.weeks, options.months, options.days].some((v) => v != null)) {
      return this._wrapWithTimeZone(
        timeAdvance(this._transferTimeValuesToUtcConstructor(this.time), options),
      ) as TimeWithZone;
    } else {
      return inTimeZone(timeAdvance(this.utc(), options), this.timeZone) as TimeWithZone;
    }
  }

  /** @missingRailsCall find_zone — CONVERGEABLE time-with-zone-advance-change-delegations */
  change(options: ChangeOptions): TimeWithZone {
    const l = this._local();

    const year = options.year ?? l.year;
    const month = options.month ?? l.month;
    const day = Math.min(options.day ?? l.day, daysInMonth(year, month));
    const hour = options.hour ?? l.hour;
    const min = options.min ?? (options.hour !== undefined ? 0 : l.minute);
    const sec =
      options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : l.second);
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

  /** @internal */
  private _withSubMsNsec(base: TimeWithZone, subMsNsec: number): TimeWithZone {
    return new TimeWithZone(
      Temporal.Instant.fromEpochNanoseconds(
        base.utc().toTime().toInstant().epochNanoseconds + BigInt(subMsNsec),
      ),
      base.timeZone,
    );
  }

  compareTo(other: unknown): number | null {
    if (other instanceof TimeWithZone) {
      return signOf(this._zoned.epochNanoseconds - other._zoned.epochNanoseconds);
    }
    if (other instanceof Temporal.Instant) {
      return signOf(this._zoned.epochNanoseconds - other.epochNanoseconds);
    }
    // boundary: a JS `Date` compares at its own millisecond granularity.
    if (other instanceof Date) {
      const thisMs = this._epochMs;
      const otherMs = other.getTime();
      if (thisMs < otherMs) return -1;
      if (thisMs > otherMs) return 1;
      return 0;
    }
    return null;
  }

  readonly [rubyClass] = "ActiveSupport::TimeWithZone";

  lessThan = lessThan;

  lessThanOrEqual = lessThanOrEqual;

  greaterThan = greaterThan;

  greaterThanOrEqual = greaterThanOrEqual;

  equals = cmpEquals;

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
    if (other instanceof Time) {
      return this._zoned.epochNanoseconds === other.toTime().epochNanoseconds;
    }
    return false;
  }

  isBetween = isBetween;

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

  isBefore = lessThan;

  isAfter = greaterThan;

  isPrevDay(): boolean {
    return this.isYesterday();
  }

  isNextDay(): boolean {
    return this.isTomorrow();
  }

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

  beginningOfYear(): TimeWithZone {
    return this.change({ month: 1, day: 1, hour: 0, min: 0, sec: 0 });
  }

  beginningOfMonth(): TimeWithZone {
    return this.change({ day: 1, hour: 0, min: 0, sec: 0 });
  }

  beginningOfDay(): TimeWithZone {
    return this.change({ hour: 0, min: 0, sec: 0 });
  }

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

  secondsSinceMidnight(): number {
    const l = this._local();
    return l.hour * 3600 + l.minute * 60 + l.second;
  }

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

  actsLikeTime(): boolean {
    return true;
  }

  isBlank(): boolean {
    return false;
  }

  isPresent(): boolean {
    return true;
  }

  freeze(): this {
    void this.period;
    this.utc();
    void this.time;
    this.toDatetime();
    this.toTime();
    return Object.freeze(this);
  }

  toDatetime(): Temporal.ZonedDateTime {
    return this._zoned;
  }

  private durationOfVariableLength(obj: unknown): boolean {
    return obj instanceof Duration && obj.isVariable();
  }

  preserveTimezone(): boolean | string {
    return preserveTimezone();
  }

  utcToLocalReturnsUtcOffsetTimes(): boolean {
    return utcToLocalReturnsUtcOffsetTimes();
  }

  getTime(): number {
    return this._epochMs;
  }

  /** @noRailsEquivalent PERMANENT */
  valueOf(): number {
    return this._epochMs;
  }
}
