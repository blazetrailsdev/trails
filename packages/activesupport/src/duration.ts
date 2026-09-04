/**
 * ActiveSupport::Duration — mirrors the Rails API as closely as possible.
 *
 * @boundary-file: `since`/`ago`/`from_now`/`until`/`after`/`before` accept
 *   `Date | Temporal.Instant` (`Date` for ergonomic interop) but return
 *   `Temporal.Instant`. The default reference is `Temporal.Now.instant()`.
 */

import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { cmp, equals as cmpEquals, rbEqual, rubyClass } from "@blazetrails/ruby-compat";
import { instantFrom } from "./temporal.js";
import { advance as dateAdvance, since as dateSince } from "./core-ext/date/calculations.js";
import { advance as timeAdvance, since as timeSince } from "./core-ext/time/calculations.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { ArgumentError } from "./hash-utils.js";
import { isEmpty } from "@blazetrails/ruby-compat";
import type { TimeWithZone } from "./time-with-zone.js";
import { ISO8601Parser } from "./duration/iso8601-parser.js";
import { ISO8601Serializer } from "./duration/iso8601-serializer.js";

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
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;
const SECONDS_PER_MONTH = 2629746;
const SECONDS_PER_YEAR = 31556952;

const PARTS_IN_SECONDS: Record<keyof DurationParts, number> = {
  seconds: 1,
  minutes: SECONDS_PER_MINUTE,
  hours: SECONDS_PER_HOUR,
  days: SECONDS_PER_DAY,
  weeks: SECONDS_PER_WEEK,
  months: SECONDS_PER_MONTH,
  years: SECONDS_PER_YEAR,
};

const PARTS: (keyof DurationParts)[] = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
];

const VARIABLE_PARTS: (keyof DurationParts)[] = ["years", "months", "weeks", "days"];

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

  /** @internal */
  private readonly _partKeys: readonly (keyof DurationParts)[];

  private readonly _variable: boolean;

  readonly value: number;

  /** @missingRailsCall reject! — PERMANENT */
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
    const given = (Object.keys(parts) as (keyof DurationParts)[]).filter(
      (part) => PARTS.includes(part) && parts[part] !== undefined,
    );
    this._partKeys = value === 0 ? given : given.filter((part) => this.parts[part] !== 0);
    this._variable = variable ?? this._partKeys.some((part) => VARIABLE_PARTS.includes(part));
  }

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

  static second(n: number): Duration {
    return Duration.seconds(n);
  }
  static minute(n: number): Duration {
    return Duration.minutes(n);
  }
  static hour(n: number): Duration {
    return Duration.hours(n);
  }
  static day(n: number): Duration {
    return Duration.days(n);
  }
  static week(n: number): Duration {
    return Duration.weeks(n);
  }

  static fortnights(n: number): Duration {
    return Duration.weeks(n * 2);
  }
  static fortnight(n: number): Duration {
    return Duration.fortnights(n);
  }

  static month(n: number): Duration {
    return Duration.months(n);
  }
  static year(n: number): Duration {
    return Duration.years(n);
  }

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

  times(other: Duration | Scalar | number): Duration {
    if (other instanceof Scalar || other instanceof Duration) {
      return new Duration(
        this.value * other.value,
        this.transformValues((number) => number * other.value),
        this._variable || other.isVariable(),
      );
    }
    if (typeof other === "number") {
      return new Duration(
        this.value * other,
        this.transformValues((number) => number * other),
        this._variable,
      );
    }
    this.raiseTypeError(other);
  }

  dividedBy(other: Duration): number;
  dividedBy(other: Scalar | number): Duration;
  dividedBy(other: Duration | Scalar | number): Duration | number {
    if (other instanceof Scalar) {
      return new Duration(
        this.value / other.value,
        this.transformValues((number) => number / other.value),
        this._variable,
      );
    }
    if (other instanceof Duration) {
      return this.value / other.value;
    }
    if (typeof other === "number") {
      return new Duration(
        this.value / other,
        this.transformValues((number) => number / other),
        this._variable,
      );
    }
    this.raiseTypeError(other);
  }

  /** @internal */
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

  modulo(other: Duration | Scalar | number): Duration {
    if (other instanceof Duration || other instanceof Scalar) {
      return Duration.build(this.value % other.value);
    }
    if (typeof other === "number") {
      return Duration.build(this.value % other);
    }
    this.raiseTypeError(other);
  }

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

  since(time: RubyTime): RubyTime;
  since(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  since(time?: Date | Temporal.Instant): Temporal.Instant;
  since(time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    return this.sum(1, time);
  }

  ago(time: RubyTime): RubyTime;
  ago(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  ago(time?: Date | Temporal.Instant): Temporal.Instant;
  ago(time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    return this.sum(-1, time);
  }

  fromNow(): Temporal.Instant {
    return this.since();
  }

  until(time: RubyTime): RubyTime;
  until(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  until(time?: Date | Temporal.Instant): Temporal.Instant;
  until(time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    return this.sum(-1, time);
  }

  after(time: RubyTime): RubyTime;
  after(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  after(time?: Date | Temporal.Instant): Temporal.Instant;
  after(time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    return this.sum(1, time);
  }

  before(time: RubyTime): RubyTime;
  before(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  before(time?: Date | Temporal.Instant): Temporal.Instant;
  before(time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    return this.sum(-1, time);
  }

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
    return Math.abs(this.inSeconds() - other.inSeconds()) < 0.001;
  }

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

  isVariable(): boolean {
    return this._variable;
  }

  _parts(): Partial<DurationParts> {
    return this.transformValues((number) => number);
  }

  private sum(sign: 1 | -1, time: DurationReceiver = Temporal.Now.instant()): DurationResult {
    if (
      !(
        time instanceof Date ||
        time instanceof Temporal.Instant ||
        time instanceof Temporal.PlainDate ||
        time instanceof RubyTime
      )
    ) {
      throw new ArgumentError(`expected a time or date, got ${inspect(time)}`);
    }

    if (isEmpty(this._partKeys)) {
      if (time instanceof Temporal.PlainDate) return dateSince(time, sign * this.inSeconds());
      if (time instanceof RubyTime) return timeSince.call(time, sign * this.inSeconds());
      return applyDurationPreservingNs(time, this.parts, sign);
    }

    if (time instanceof Temporal.PlainDate || time instanceof RubyTime)
      return applyDurationToDate(time, this.parts, this._partKeys, sign);
    return applyDurationPreservingNs(time, this.parts, sign);
  }

  asJson(_options: unknown = null): number {
    return Math.trunc(this.inSeconds());
  }

  coerce(other: unknown): [Scalar, Duration] {
    if (other instanceof Scalar) {
      return [other, this];
    }
    if (other instanceof Duration) {
      return [new Scalar(other.value), this];
    }
    return [new Scalar(other as number), this];
  }

  /** @internal */
  raiseTypeError(other: unknown): never {
    throw new TypeError(
      `no implicit conversion of ${(other as object)?.constructor?.name ?? String(other)} into Duration`,
    );
  }

  private static calculateTotalSeconds(parts: Partial<DurationParts>): number {
    return Object.entries(parts).reduce(
      (total, [part, value]) => total + value * PARTS_IN_SECONDS[part as keyof DurationParts],
      0,
    );
  }

  iso8601({ precision = null }: { precision?: number | null } = {}): string {
    return new ISO8601Serializer(this, { precision }).serialize();
  }

  static parse(iso8601duration: string): Duration {
    const parts = new ISO8601Parser(iso8601duration).parseBang();
    return new Duration(Duration.calculateTotalSeconds(parts), parts);
  }

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

export function seconds(n: number): Duration {
  return Duration.seconds(n);
}
export function minutes(n: number): Duration {
  return Duration.minutes(n);
}
export function hours(n: number): Duration {
  return Duration.hours(n);
}
export function days(n: number): Duration {
  return Duration.days(n);
}
export function weeks(n: number): Duration {
  return Duration.weeks(n);
}
export function months(n: number): Duration {
  return Duration.months(n);
}
export function years(n: number): Duration {
  return Duration.years(n);
}

type DurationReceiver = Date | Temporal.Instant | Temporal.PlainDate | RubyTime;
type DurationResult = Temporal.Instant | Temporal.PlainDate | TimeWithZone | RubyTime;

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

function applyDurationToDate(
  date: Temporal.PlainDate | RubyTime,
  parts: DurationParts,
  partKeys: readonly (keyof DurationParts)[],
  sign: 1 | -1,
): Temporal.PlainDate | TimeWithZone | RubyTime {
  let time: Temporal.PlainDate | TimeWithZone | RubyTime = date;

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

function dateOrTimeSince(
  t: Temporal.PlainDate | TimeWithZone | RubyTime,
  seconds: number,
): TimeWithZone | RubyTime {
  if (t instanceof Temporal.PlainDate) return dateSince(t, seconds);
  if (t instanceof RubyTime) return timeSince.call(t, seconds);
  return t.since(seconds);
}

function dateOrTimeAdvance(
  t: Temporal.PlainDate | TimeWithZone | RubyTime,
  options: Partial<DurationParts>,
): Temporal.PlainDate | TimeWithZone | RubyTime {
  if (t instanceof Temporal.PlainDate) return dateAdvance(t, options);
  if (t instanceof RubyTime) return timeAdvance.call(t, options);
  return t.advance(options);
}

function applyDurationPreservingNs(
  date: Date | Temporal.Instant,
  parts: DurationParts,
  direction: 1 | -1,
): Temporal.Instant {
  const nsRemainder = date instanceof Temporal.Instant ? date.epochNanoseconds % 1_000_000n : 0n;
  const result = instantFrom(applyDuration(toDateInput(date), parts, direction));
  return nsRemainder === 0n ? result : result.add({ nanoseconds: Number(nsRemainder) });
}

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

  if (Number.isInteger(years) && years !== 0) {
    d.setFullYear(d.getFullYear() + years);
  } else if (years !== 0) {
    d = new Date(d.getTime() + years * SECONDS_PER_YEAR * 1000);
  }

  if (Number.isInteger(months) && months !== 0) {
    d.setMonth(d.getMonth() + months);
  } else if (months !== 0) {
    d = new Date(d.getTime() + months * SECONDS_PER_MONTH * 1000);
  }

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

  coerce(other: unknown): [Scalar, Scalar] {
    return [new Scalar(other as number), this];
  }

  /** @internal */
  raiseTypeError(other: unknown): never {
    throw new TypeError(
      `no implicit conversion of ${(other as object)?.constructor?.name ?? String(other)} into Scalar`,
    );
  }

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

  /** @noRailsEquivalent PERMANENT */
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

  negate(): Scalar {
    return new Scalar(-this.value);
  }

  compareTo(other: unknown): number | null {
    if (other instanceof Scalar || other instanceof Duration) {
      return cmp(this.value, other.value);
    } else if (typeof other === "number") {
      return cmp(this.value, other);
    } else {
      return null;
    }
  }

  readonly [rubyClass] = "ActiveSupport::Duration::Scalar";

  equals = cmpEquals;

  times(other: number): Scalar {
    return new Scalar(this.value * other);
  }

  div(other: number): Scalar {
    return new Scalar(this.value / other);
  }
}
