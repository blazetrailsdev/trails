/**
 * ActiveSupport::Duration — mirrors the Rails API as closely as possible.
 *
 * @boundary-file: `since`/`ago`/`from_now`/`until`/`after`/`before` accept
 *   `Date | Temporal.Instant` (`Date` for ergonomic interop) but return
 *   `Temporal.Instant`. The default reference is `Temporal.Now.instant()`.
 */

import { Temporal } from "@blazetrails/date";
import { rbEqual } from "./rb-equal.js";
import { instantFrom } from "./temporal.js";
import { advance as dateAdvance, since as dateSince } from "./core-ext/date/calculations.js";
import { inspect } from "./core-ext/object/inspect.js";
import { ArgumentError } from "./hash-utils.js";
import { isEmpty } from "./ruby-empty.js";
import type { TimeWithZone } from "./time-with-zone.js";

export type DurationParts = {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;
const SECONDS_PER_MONTH = 2629746; // 1/12 of a gregorian year (duration.rb:117)
const SECONDS_PER_YEAR = 31556952; // length of a gregorian year (duration.rb:118)

/**
 * Mirrors: ActiveSupport::Duration::PARTS_IN_SECONDS (duration.rb:120-128).
 */
const PARTS_IN_SECONDS: Record<keyof DurationParts, number> = {
  seconds: 1,
  minutes: SECONDS_PER_MINUTE,
  hours: SECONDS_PER_HOUR,
  days: SECONDS_PER_DAY,
  weeks: SECONDS_PER_WEEK,
  months: SECONDS_PER_MONTH,
  years: SECONDS_PER_YEAR,
};

// Mirrors Rails PARTS (duration.rb:130).
const PARTS: (keyof DurationParts)[] = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
];

// Mirrors Rails VARIABLE_PARTS (duration.rb:131): the calendar units whose
// wall-clock length varies (DST, month/year length).
const VARIABLE_PARTS: (keyof DurationParts)[] = ["years", "months", "weeks", "days"];

// Mirrors Rails `@parts.merge(other._parts) { |_k, v, ov| v + ov }`
// (duration.rb:270-272): a Ruby Hash keeps insertion order, and `sum`
// (`:397-419`) applies the parts in exactly that order, so the receiver's keys
// come first and the other's new keys are appended in `other._parts`' own
// order, not in a canonical one.
function mergeParts(
  a: DurationParts,
  aKeys: readonly (keyof DurationParts)[],
  b: Partial<DurationParts>,
): Partial<DurationParts> {
  const result: Partial<DurationParts> = {};
  for (const key of aKeys) {
    result[key] = a[key] + (b[key] ?? 0);
  }
  for (const key of Object.keys(b) as (keyof DurationParts)[]) {
    if (PARTS.includes(key) && b[key] !== undefined && !aKeys.includes(key)) {
      result[key] = a[key] + b[key];
    }
  }
  return result;
}

export class Duration {
  readonly parts: DurationParts;

  /**
   * @internal The keys of Rails' `@parts` (`duration.rb:227`) — the units the
   * duration was built from, zeroes rejected unless the whole duration is zero.
   * `parts` itself stays a full fixed record so its readers stay total, so this
   * carries the sparseness `@parts.reject!` gives Ruby, which `sum` (`:397-419`)
   * and `inspect` (`:340-357`) both read as "the parts there are".
   */
  private readonly _partKeys: readonly (keyof DurationParts)[];

  private readonly _variable: boolean;

  /**
   * Mirrors: ActiveSupport::Duration#value (duration.rb:133) — the
   * `attr_reader :value` every factory fills through the constructor seat.
   */
  readonly value: number;

  // Mirrors Rails `Duration#initialize(value, parts, variable = nil)`
  // (duration.rb:280-287).
  constructor(value: number, parts: Partial<DurationParts> = {}, variable: boolean | null = null) {
    this.value = value;
    this.parts = {
      years: parts.years ?? 0,
      months: parts.months ?? 0,
      weeks: parts.weeks ?? 0,
      days: parts.days ?? 0,
      hours: parts.hours ?? 0,
      minutes: parts.minutes ?? 0,
      seconds: parts.seconds ?? 0,
    };
    // Ruby's `@parts` is a Hash, and both `sum` and `merge` read it in
    // insertion order, so the argument's own key order is the part order.
    const given = (Object.keys(parts) as (keyof DurationParts)[]).filter(
      (part) => PARTS.includes(part) && parts[part] !== undefined,
    );
    this._partKeys = value === 0 ? given : given.filter((part) => this.parts[part] !== 0);
    this._variable = variable ?? this._partKeys.some((part) => VARIABLE_PARTS.includes(part));
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  // Explicit variable flags mirror Rails' factory constructors
  // (duration.rb:155-180): fixed units pass false, calendar units true.
  static seconds(value: number): Duration {
    return new Duration(value, { seconds: value }, false);
  }
  static minutes(value: number): Duration {
    return new Duration(value * SECONDS_PER_MINUTE, { minutes: value }, false);
  }
  static hours(value: number): Duration {
    return new Duration(value * SECONDS_PER_HOUR, { hours: value }, false);
  }
  static days(value: number): Duration {
    return new Duration(value * SECONDS_PER_DAY, { days: value }, true);
  }
  static weeks(value: number): Duration {
    return new Duration(value * SECONDS_PER_WEEK, { weeks: value }, true);
  }
  static months(value: number): Duration {
    return new Duration(value * SECONDS_PER_MONTH, { months: value }, true);
  }
  static years(value: number): Duration {
    return new Duration(value * SECONDS_PER_YEAR, { years: value }, true);
  }

  // Numeric/Integer singular aliases (core_ext/numeric/time.rb, core_ext/integer/time.rb):
  // Ruby reopens Numeric so `2.second` reads as an alias of `2.seconds`; here the
  // receiver is the argument, so the aliases sit beside the factories they forward to.
  /** Alias of {@link Duration.seconds}. */
  static second(n: number): Duration {
    return Duration.seconds(n);
  }
  /** Alias of {@link Duration.minutes}. */
  static minute(n: number): Duration {
    return Duration.minutes(n);
  }
  /** Alias of {@link Duration.hours}. */
  static hour(n: number): Duration {
    return Duration.hours(n);
  }
  /** Alias of {@link Duration.days}. */
  static day(n: number): Duration {
    return Duration.days(n);
  }
  /** Alias of {@link Duration.weeks}. */
  static week(n: number): Duration {
    return Duration.weeks(n);
  }

  /**
   * Returns a Duration instance matching the number of fortnights provided.
   *
   *   2.fortnights # => 4 weeks
   */
  static fortnights(n: number): Duration {
    return Duration.weeks(n * 2);
  }
  /** Alias of {@link Duration.fortnights}. */
  static fortnight(n: number): Duration {
    return Duration.fortnights(n);
  }

  /** Alias of {@link Duration.months}. */
  static month(n: number): Duration {
    return Duration.months(n);
  }
  /** Alias of {@link Duration.years}. */
  static year(n: number): Duration {
    return Duration.years(n);
  }

  // ---------------------------------------------------------------------------
  // Arithmetic
  // ---------------------------------------------------------------------------

  // Variable flags below mirror Rails' arithmetic (duration.rb:268-304,
  // 322-324): `+` with a Duration ORs the flags, numeric `+`/`*`/`/` and
  // unary `-` carry the receiver's flag — never recomputed from result parts.
  plus(other: Duration | number): Duration {
    if (typeof other === "number") {
      return new Duration(
        this.value + other,
        mergeParts(this.parts, this._partKeys, { seconds: other }),
        this._variable,
      );
    }
    return new Duration(
      this.value + other.value,
      mergeParts(this.parts, this._partKeys, other._parts()),
      this._variable || other._variable,
    );
  }

  minus(other: Duration | number): Duration {
    if (typeof other === "number") {
      return this.plus(-other);
    }
    return this.plus(other.negate());
  }

  times(other: number): Duration {
    return new Duration(
      this.value * other,
      this.transformValues((number) => number * other),
      this._variable,
    );
  }

  // Mirrors Rails `/` with a Numeric (duration.rb:297-305): divides each
  // part, preserving the receiver's variable flag.
  dividedBy(other: number): Duration {
    return new Duration(
      this.value / other,
      this.transformValues((number) => number / other),
      this._variable,
    );
  }

  /** @internal Rails' `@parts.transform_values` (`duration.rb:288`, `:299`). */
  private transformValues(fn: (number: number) => number): Partial<DurationParts> {
    const result: Partial<DurationParts> = {};
    for (const key of this._partKeys) {
      result[key] = fn(this.parts[key]);
    }
    return result;
  }

  negate(): Duration {
    return new Duration(
      -this.value,
      this.transformValues((number) => -number),
      this._variable,
    );
  }

  modulo(other: Duration | number): Duration {
    if (other instanceof Duration) {
      return Duration.build(this.value % other.value);
    }
    return Duration.build(this.value % other);
  }

  // ---------------------------------------------------------------------------
  // Conversion
  // ---------------------------------------------------------------------------

  /**
   * Mirrors: ActiveSupport::Duration#to_i (duration.rb:377-380) — `@value.to_i`,
   * with `in_seconds` declared as its alias. trails carries the body on
   * `inSeconds`; `toI` is the Rails-primary spelling of the same value,
   * truncated the way `Integer#to_i` is.
   */
  toI(): number {
    return Math.trunc(this.inSeconds());
  }

  inSeconds(): number {
    return this.value;
  }

  inMilliseconds(): number {
    return this.inSeconds() * 1000;
  }

  inMinutes(): number {
    return this.inSeconds() / SECONDS_PER_MINUTE;
  }

  inHours(): number {
    return this.inSeconds() / SECONDS_PER_HOUR;
  }

  inDays(): number {
    return this.inSeconds() / SECONDS_PER_DAY;
  }

  inWeeks(): number {
    return this.inSeconds() / SECONDS_PER_WEEK;
  }

  inMonths(): number {
    return this.inSeconds() / SECONDS_PER_MONTH;
  }

  inYears(): number {
    return this.inSeconds() / SECONDS_PER_YEAR;
  }

  // ---------------------------------------------------------------------------
  // Date application — applies each part sequentially like Rails does
  // ---------------------------------------------------------------------------

  since(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  since(time?: Date | Temporal.Instant): Temporal.Instant;
  since(
    time: Date | Temporal.Instant | Temporal.PlainDate = Temporal.Now.instant(),
  ): Temporal.Instant | Temporal.PlainDate | TimeWithZone {
    return this.sum(1, time);
  }

  ago(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  ago(time?: Date | Temporal.Instant): Temporal.Instant;
  ago(
    time: Date | Temporal.Instant | Temporal.PlainDate = Temporal.Now.instant(),
  ): Temporal.Instant | Temporal.PlainDate | TimeWithZone {
    return this.sum(-1, time);
  }

  fromNow(): Temporal.Instant {
    return this.since();
  }

  until(date: Date | Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    return this.ago(date);
  }

  after(date: Date | Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    return this.since(date);
  }

  before(date: Date | Temporal.Instant = Temporal.Now.instant()): Temporal.Instant {
    return this.ago(date);
  }

  // ---------------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------------

  inspect(): string {
    const activeParts: string[] = [];

    for (const key of PARTS) {
      const val = this.parts[key];
      if (val !== 0) {
        const abs = Math.abs(val);
        activeParts.push(`${val} ${abs === 1 ? singular(key) : key}`);
      }
    }

    if (activeParts.length === 0) {
      return "0 seconds";
    }

    if (activeParts.length === 1) return activeParts[0];
    if (activeParts.length === 2) return `${activeParts[0]} and ${activeParts[1]}`;

    const last = activeParts[activeParts.length - 1];
    const rest = activeParts.slice(0, -1).join(", ");
    return `${rest}, and ${last}`;
  }

  /**
   * Mirrors: ActiveSupport::Duration#== (duration.rb:341-347) — another
   * Duration with the same `value`, or `other == value` for anything else, so
   * `2.days == 172800` is true. The else arm is a `==` SEND to `other`, so a
   * receiver that answers `==` against a number (a `Scalar`) decides it —
   * `rbEqual` is that dispatch. `value` is seconds, a JS number.
   */
  equals(other: unknown): boolean {
    if (other instanceof Duration) {
      return other.value === this.value;
    } else {
      return rbEqual(other, this.value);
    }
  }

  toString(): string {
    return String(Math.round(this.inSeconds()));
  }

  isEqualTo(other: Duration): boolean {
    for (const key of PARTS) {
      if (this.parts[key] !== other.parts[key]) return false;
    }
    return true;
  }

  eql(other: unknown): boolean {
    if (!(other instanceof Duration)) return false;
    // Rails eql? compares in_seconds values for Duration
    return Math.abs(this.inSeconds() - other.inSeconds()) < 0.001;
  }

  // comparable
  compareTo(other: Duration | number | unknown): number {
    if (typeof other !== "number" && !(other instanceof Duration)) return NaN;
    const a = this.inSeconds();
    const b = typeof other === "number" ? other : other.inSeconds();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  isA(klass: unknown): boolean {
    return klass === Duration || this instanceof (klass as any);
  }

  /** Mirrors Rails `Duration#variable?` (duration.rb:477-479): reads the
   * `@variable` flag computed (or passed) at construction. */
  isVariable(): boolean {
    return this._variable;
  }

  /**
   * Mirrors: ActiveSupport::Duration#_parts (duration.rb:481-483) — the
   * `:nodoc:` reader `@parts` is exposed through, which `Duration#sum` and
   * `TimeWithZone#advance` read off another Duration.
   *
   * `@parts` is sparse: `initialize` runs `@parts.reject! { |k, v| v.zero? }`
   * unless the whole value is zero (duration.rb:228), so a zero-valued unit is
   * absent rather than present-and-zero. `parts` here is a total record, so the
   * sparseness lives in `_partKeys` and is applied on the way out.
   */
  _parts(): Partial<DurationParts> {
    return this.transformValues((number) => number);
  }

  /**
   * Mirrors: ActiveSupport::Duration#sum (duration.rb:485-510).
   *
   * The `acts_like?` guard is spelled as the receiver check
   * `core-ext/date-and-time/calculations.ts:200-210` uses: neither of trails'
   * receivers carries an `acts_like_*?` marker method, so being one IS the
   * answer — a `Date`/`Temporal.Instant` is a moment, a `Temporal.PlainDate`
   * is a calendar day.
   *
   * `time.since(sign * value)` reads the value off `inSeconds()`, trails'
   * `@value`; an empty `@parts` means a zero one (the constructor only leaves
   * `_partKeys` empty when it was given no parts), so a moment receiver comes
   * back unchanged while `Date#since` still widens the calendar day into a
   * zoned Time (`core_ext/date/calculations.rb:61-63`).
   *
   * The `@parts.each` loop lives in a module function because the two receivers
   * take different unit methods: {@link applyDurationToDate} is that loop
   * verbatim, {@link applyDurationPreservingNs} carries it for a moment
   * receiver in a fixed unit order rather than `@parts` order (tracked by
   * `duration-sum-instant-arm-ignores-part-order`).
   */
  private sum(
    sign: 1 | -1,
    time: Date | Temporal.Instant | Temporal.PlainDate = Temporal.Now.instant(),
  ): Temporal.Instant | Temporal.PlainDate | TimeWithZone {
    if (
      !(
        time instanceof Date ||
        time instanceof Temporal.Instant ||
        time instanceof Temporal.PlainDate
      )
    ) {
      throw new ArgumentError(`expected a time or date, got ${inspect(time)}`);
    }

    if (isEmpty(this._partKeys)) {
      if (time instanceof Temporal.PlainDate) return dateSince(time, sign * this.inSeconds());
      return applyDurationPreservingNs(time, this.parts, sign);
    }

    if (time instanceof Temporal.PlainDate)
      return applyDurationToDate(time, this.parts, this._partKeys, sign);
    return applyDurationPreservingNs(time, this.parts, sign);
  }

  /**
   * Mirrors: ActiveSupport::Duration#as_json (duration.rb:459-461).
   */
  asJson(_options: unknown = null): number {
    return Math.trunc(this.inSeconds());
  }

  /**
   * Mirrors: ActiveSupport::Duration#coerce (duration.rb:245-254). Ruby's
   * numeric-coercion protocol hands back `[other, self]` so the arithmetic
   * operator re-dispatches with a Scalar on the left.
   */
  coerce(other: unknown): [Scalar, Duration] {
    if (other instanceof Scalar) {
      return [other, this];
    }
    if (other instanceof Duration) {
      return [new Scalar(other.value), this];
    }
    return [new Scalar(other as number), this];
  }

  /**
   * Mirrors: ActiveSupport::Duration#raise_type_error (duration.rb:520-522).
   *
   * @internal
   */
  raiseTypeError(other: unknown): never {
    throw new TypeError(
      `no implicit conversion of ${(other as object)?.constructor?.name ?? String(other)} into Duration`,
    );
  }

  /**
   * Mirrors: ActiveSupport::Duration.calculate_total_seconds (duration.rb:217-221).
   */
  private static calculateTotalSeconds(parts: Partial<DurationParts>): number {
    return Object.entries(parts).reduce(
      (total, [part, value]) => total + value * PARTS_IN_SECONDS[part as keyof DurationParts],
      0,
    );
  }

  // ISO 8601 output
  iso8601(options: { precision?: number | null } = {}): string {
    const { years, months, weeks, days, hours, minutes, seconds } = this.parts;

    let datePart = "P";
    if (years !== 0) datePart += `${years}Y`;
    if (months !== 0) datePart += `${months}M`;
    // Rails converts weeks to days in ISO output
    const totalDays = weeks * 7 + days;
    if (totalDays !== 0) datePart += `${totalDays}D`;

    let timePart = "";
    if (hours !== 0) timePart += `${hours}H`;
    if (minutes !== 0) timePart += `${minutes}M`;

    const totalSeconds = seconds;
    if (totalSeconds !== 0 || (datePart === "P" && timePart === "")) {
      const precision = options.precision;
      let secStr: string;
      if (precision == null) {
        secStr = Number.isInteger(totalSeconds) ? String(totalSeconds) : String(totalSeconds);
      } else {
        secStr = totalSeconds.toFixed(precision);
      }
      timePart += `${secStr}S`;
    }

    if (timePart !== "") {
      return datePart + "T" + timePart;
    }
    if (datePart === "P") return "PT0S";
    return datePart;
  }

  // ISO 8601 parsing
  static parse(iso: string): Duration {
    if (
      !iso ||
      iso === "P" ||
      iso === "PT" ||
      iso === "-P" ||
      iso === "-PT" ||
      iso === "+P" ||
      iso === "+PT" ||
      iso === "T" ||
      /^[~.]/.test(iso)
    ) {
      throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    // A trailing `T` (e.g. "P1YT", "P1.5YT") is invalid: the time designator
    // requires at least one of H/M/S after it. The main regex's optional time
    // group would otherwise accept these.
    if (iso.endsWith("T")) {
      throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    const moreInvalidPatterns = [
      /^[+-]?PW$/,
      /^[+-]?P-?\d+Y-?\d+W/,
      /^[+-]?P-?\d+\.\d+Y-?\d+\.\d+M/,
      /^[+-]?P-?\d+\.\d+MT-?\d+\.\d+S/,
    ];
    for (const p of moreInvalidPatterns) {
      if (p.test(iso)) throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    // PG's intervalstyle=iso_8601 emits per-component signs (e.g. "P-1Y-2D"),
    // so allow an optional leading `-` on each component in addition to the
    // single overall sign Rails uses.
    const pattern =
      /^([+-])?P(?:(-?\d+(?:[.,]\d+)?)Y)?(?:(-?\d+(?:[.,]\d+)?)M)?(?:(-?\d+(?:[.,]\d+)?)W)?(?:(-?\d+(?:[.,]\d+)?)D)?(?:T(?:(-?\d+(?:[.,]\d+)?)H)?(?:(-?\d+(?:[.,]\d+)?)M)?(?:(-?\d+(?:[.,]\d+)?)S)?)?$/;

    const match = pattern.exec(iso.replace(/,/g, "."));
    if (!match) throw new Error(`Invalid ISO 8601 duration: "${iso}"`);

    // Reject mixing the overall `-` sign with any per-component `-`: combining
    // them would silently double-negate (e.g. "-P-1Y" parsing to +1Y).
    if (match[1] === "-" && match.slice(2).some((c) => c?.startsWith("-"))) {
      throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    const sign = match[1] === "-" ? -1 : 1;
    const parse = (s: string | undefined) => (s ? parseFloat(s) * sign : 0);

    const parts = {
      years: parse(match[2]),
      months: parse(match[3]),
      weeks: parse(match[4]),
      days: parse(match[5]),
      hours: parse(match[6]),
      minutes: parse(match[7]),
      seconds: parse(match[8]),
    };
    const value = Duration.calculateTotalSeconds(parts);
    return new Duration(value, parts);
  }

  /**
   * Creates a new Duration from a seconds value that is converted
   * to the individual parts (duration.rb:183-214):
   *
   *   Duration.build(31556952).parts // => { years: 1 }
   *   Duration.build(2716146).parts  // => { months: 1, days: 1 }
   */
  static build(value: unknown): Duration {
    if (typeof value !== "number") {
      const typeName =
        value === null ? "NilClass" : typeof value === "string" ? "String" : String(typeof value);
      throw new TypeError(`can't build an ActiveSupport::Duration from a ${typeName}`);
    }

    const parts: Partial<DurationParts> = {};
    const remainderSign = Math.sign(value);
    let remainder = Math.abs(Number(value.toFixed(9)));
    let variable = false;

    if (value !== 0) {
      for (const part of PARTS) {
        if (part !== "seconds") {
          const partInSeconds = PARTS_IN_SECONDS[part];
          parts[part] = Math.floor(remainder / partInSeconds) * remainderSign;
          remainder %= partInSeconds;

          if (parts[part] !== 0) {
            variable ||= VARIABLE_PARTS.includes(part);
          }
        }
      }
    }

    parts.seconds = remainder * remainderSign;

    return new Duration(value, parts, variable);
  }
}

// ---------------------------------------------------------------------------
// Numeric helpers — functional equivalents of Rails' numeric extensions
// (e.g. `5.minutes` in Ruby → `minutes(5)` in TypeScript)
// ---------------------------------------------------------------------------

/** @example seconds(30).since(date) */
export function seconds(n: number): Duration {
  return Duration.seconds(n);
}
/** @example minutes(5).ago() */
export function minutes(n: number): Duration {
  return Duration.minutes(n);
}
/** @example hours(2).fromNow() */
export function hours(n: number): Duration {
  return Duration.hours(n);
}
/** @example days(3).since(date) */
export function days(n: number): Duration {
  return Duration.days(n);
}
/** @example weeks(1).fromNow() */
export function weeks(n: number): Duration {
  return Duration.weeks(n);
}
/** @example months(6).ago() */
export function months(n: number): Duration {
  return Duration.months(n);
}
/** @example years(2).fromNow() */
export function years(n: number): Duration {
  return Duration.years(n);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function singular(key: keyof DurationParts): string {
  switch (key) {
    case "years":
      return "year";
    case "months":
      return "month";
    case "weeks":
      return "week";
    case "days":
      return "day";
    case "hours":
      return "hour";
    case "minutes":
      return "minute";
    case "seconds":
      return "second";
  }
}

function toDateInput(date: Date | Temporal.Instant): Date {
  if (date instanceof Date) return date;
  if (date instanceof Temporal.Instant) return new Date(date.epochMilliseconds);
  throw new TypeError(`expected a time or date, got ${JSON.stringify(date)}`);
}

/**
 * The `time.acts_like?(:date)` arm of `ActiveSupport::Duration#sum`
 * (`duration.rb:397-419`): each part is applied in turn, the sub-day ones
 * through `Date#since` — which widens the day into a zoned `Time`
 * (`core_ext/date/calculations.rb:61-63`) — and the rest through `advance`,
 * which keeps the receiver a calendar day.
 *
 * The loop walks `partKeys` — Rails' `@parts` keys, not every key
 * `DurationParts` carries — so `0.days` advances by zero days and stays a
 * `PlainDate` while `0.seconds` still takes the `since` arm and widens, which
 * is what `@parts.reject! ... unless value == 0` (`duration.rb:228`) gives Ruby.
 */
function applyDurationToDate(
  date: Temporal.PlainDate,
  parts: DurationParts,
  partKeys: readonly (keyof DurationParts)[],
  sign: 1 | -1,
): Temporal.PlainDate | TimeWithZone {
  let time: Temporal.PlainDate | TimeWithZone = date;

  for (const type of partKeys) {
    const number = parts[type];
    const t = time;
    if (type === "seconds") {
      time = dateOrTimeSince(t, sign * number);
    } else if (type === "minutes") {
      time = dateOrTimeSince(t, sign * number * 60);
    } else if (type === "hours") {
      time = dateOrTimeSince(t, sign * number * 3600);
    } else {
      time = dateOrTimeAdvance(t, { [type]: sign * number });
    }
  }

  return time;
}

/** `t.since(seconds)` over either receiver {@link applyDurationToDate} carries. */
function dateOrTimeSince(t: Temporal.PlainDate | TimeWithZone, seconds: number): TimeWithZone {
  return t instanceof Temporal.PlainDate ? dateSince(t, seconds) : t.since(seconds);
}

/** `t.advance(options)` over either receiver {@link applyDurationToDate} carries. */
function dateOrTimeAdvance(
  t: Temporal.PlainDate | TimeWithZone,
  options: Partial<DurationParts>,
): Temporal.PlainDate | TimeWithZone {
  return t instanceof Temporal.PlainDate ? dateAdvance(t, options) : t.advance(options);
}

/**
 * Apply a Duration while preserving the sub-millisecond nanosecond remainder
 * of a Temporal.Instant input. Calendar math runs at ms precision through
 * applyDuration; the original ns remainder is re-added to the result.
 */
function applyDurationPreservingNs(
  date: Date | Temporal.Instant,
  parts: DurationParts,
  direction: 1 | -1,
): Temporal.Instant {
  const nsRemainder = date instanceof Temporal.Instant ? date.epochNanoseconds % 1_000_000n : 0n;
  const result = instantFrom(applyDuration(toDateInput(date), parts, direction));
  return nsRemainder === 0n ? result : result.add({ nanoseconds: Number(nsRemainder) });
}

/**
 * Apply duration parts to a Date sequentially, matching Rails advance() semantics.
 * direction: 1 for since/after, -1 for ago/before
 */
function applyDuration(date: Date, parts: DurationParts, direction: 1 | -1): Date {
  if (!(date instanceof Date)) {
    throw new TypeError(`expected a time or date, got ${JSON.stringify(date)}`);
  }

  let d = new Date(date.getTime());

  const years = parts.years * direction;
  const months = parts.months * direction;
  const weeks = parts.weeks * direction;
  const days = parts.days * direction;
  const hours = parts.hours * direction;
  const minutes = parts.minutes * direction;
  const seconds = parts.seconds * direction;

  // Integer years via setFullYear for calendar accuracy
  if (Number.isInteger(years) && years !== 0) {
    d.setFullYear(d.getFullYear() + years);
  } else if (years !== 0) {
    d = new Date(d.getTime() + years * SECONDS_PER_YEAR * 1000);
  }

  // Integer months via setMonth for calendar accuracy
  if (Number.isInteger(months) && months !== 0) {
    d.setMonth(d.getMonth() + months);
  } else if (months !== 0) {
    d = new Date(d.getTime() + months * SECONDS_PER_MONTH * 1000);
  }

  // Integer weeks and days via setDate for calendar accuracy
  const intWeeks = Math.trunc(weeks);
  const fracWeeks = weeks - intWeeks;
  if (intWeeks !== 0) {
    d.setDate(d.getDate() + intWeeks * 7);
  }

  const intDays = Math.trunc(days);
  const fracDays = days - intDays;
  if (intDays !== 0) {
    d.setDate(d.getDate() + intDays);
  }

  // Fractional weeks/days + time parts via millisecond arithmetic
  const extraMs =
    fracWeeks * 7 * SECONDS_PER_DAY * 1000 +
    fracDays * SECONDS_PER_DAY * 1000 +
    hours * SECONDS_PER_HOUR * 1000 +
    minutes * SECONDS_PER_MINUTE * 1000 +
    seconds * 1000;

  if (extraMs !== 0) {
    d = new Date(d.getTime() + extraMs);
  }

  return d;
}

export class Scalar {
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }

  /**
   * Mirrors: ActiveSupport::Duration::Scalar#coerce (duration.rb:23-25).
   */
  coerce(other: unknown): [Scalar, Scalar] {
    return [new Scalar(other as number), this];
  }

  /**
   * Mirrors: ActiveSupport::Duration::Scalar#raise_type_error
   * (duration.rb:108-110).
   *
   * @internal
   */
  raiseTypeError(other: unknown): never {
    throw new TypeError(
      `no implicit conversion of ${(other as object)?.constructor?.name ?? String(other)} into Scalar`,
    );
  }

  /**
   * Mirrors: Comparable#== over ActiveSupport::Duration::Scalar#<=>
   * (duration.rb:31-38) — `Scalar < Numeric` includes Comparable, so `==` is
   * `(self <=> other) == 0` and `Scalar.new(172800) == 172800` is true.
   */
  equals(other: unknown): boolean {
    if (other instanceof Scalar || other instanceof Duration) {
      return this.value === other.value;
    } else if (typeof other === "number") {
      return this.value === other;
    } else {
      return false;
    }
  }

  /** Mirrors: ActiveSupport::Duration::Scalar#variable? (duration.rb:93-95). */
  isVariable(): boolean {
    return false;
  }

  toI(): number {
    return Math.trunc(this.value);
  }

  toF(): number {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }

  /**
   * @noRailsEquivalent PERMANENT (`vendor/rails/activesupport/lib/active_support/duration.rb:353,
   *   :377` — `def to_s` and `def to_i` are the Ruby coercion hooks).
   * JS primitive-coercion protocol — Ruby coerces through to_s/to_i instead
   */
  valueOf(): number {
    return this.value;
  }

  plus(other: Scalar | number): Scalar {
    const otherVal = other instanceof Scalar ? other.value : other;
    return new Scalar(this.value + otherVal);
  }

  minus(other: Scalar | number): Scalar {
    const otherVal = other instanceof Scalar ? other.value : other;
    return new Scalar(this.value - otherVal);
  }

  /** Unary minus (`Scalar#-@`): `Scalar.new(-value)`. */
  negate(): Scalar {
    return new Scalar(-this.value);
  }

  times(other: number): Scalar {
    return new Scalar(this.value * other);
  }

  div(other: number): Scalar {
    return new Scalar(this.value / other);
  }
}
