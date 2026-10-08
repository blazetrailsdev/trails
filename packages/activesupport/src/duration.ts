/**
 * ActiveSupport::Duration — mirrors the Rails API as closely as possible.
 *
 * @boundary-file: `since`/`ago`/`from_now`/`until`/`after`/`before` also accept
 *   `Date | Temporal.Instant` (`Date` for ergonomic interop) and return
 *   `Temporal.Instant` for them. The default reference is `Time.current`.
 */

import { Temporal, Time as RubyTime } from "@blazetrails/date";
import {
  cmp,
  equals as cmpEquals,
  numericMinus,
  numericModulo,
  numericMul,
  numericPlus,
  numericUminus,
  rbDbl2num,
  rbFloatTypeP,
  rbCNumeric,
  rbEql,
  rbEqual,
  rbObjIsKindOf,
  rbObjClassname,
  rubyClass,
} from "@blazetrails/ruby-compat";
import { instantFrom } from "./temporal.js";
import { advance as dateAdvance, since as dateSince } from "./core-ext/date/calculations.js";
import {
  advance as datetimeAdvance,
  since as datetimeSince,
} from "./core-ext/date-time/calculations.js";
import { current as timeCurrent } from "./core-ext/time/calculations.js";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { ArgumentError } from "./hash-utils.js";
import { toSentence } from "./array-utils.js";
import { isEmpty } from "@blazetrails/ruby-compat";
import type { TimeWithZone } from "./time-with-zone.js";
import { actsLike } from "./core-ext/object/acts-like.js";
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

const PARTS: readonly (keyof DurationParts)[] = Object.freeze([
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
]);

const VARIABLE_PARTS: (keyof DurationParts)[] = ["years", "months", "weeks", "days"];

function mergeParts(
  a: DurationParts,
  aKeys: readonly (keyof DurationParts)[],
  b: Partial<DurationParts>,
): Partial<DurationParts> {
  const result: Partial<DurationParts> = {};
  for (const key of aKeys) {
    result[key] = numericPlus(a[key], b[key] ?? 0) as number;
  }
  for (const key of Object.keys(b) as (keyof DurationParts)[]) {
    if (PARTS.includes(key) && b[key] !== undefined && !aKeys.includes(key)) {
      result[key] = numericPlus(a[key], b[key]) as number;
    }
  }
  return result;
}

export class Duration {
  static ISO8601Parser = ISO8601Parser;

  static readonly PARTS = PARTS;

  readonly parts: DurationParts;

  readonly [rubyClass] = "ActiveSupport::Duration";

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
    this._partKeys =
      Number(value) === 0 ? given : given.filter((part) => Number(this.parts[part]) !== 0);
    this._variable = variable ?? this._partKeys.some((part) => VARIABLE_PARTS.includes(part));
  }

  static seconds(value: number): Duration {
    return new Duration(value, { seconds: value }, false);
  }
  static minutes(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_MINUTE) as number, { minutes: value }, false);
  }
  static hours(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_HOUR) as number, { hours: value }, false);
  }
  static days(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_DAY) as number, { days: value }, true);
  }
  static weeks(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_WEEK) as number, { weeks: value }, true);
  }
  static months(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_MONTH) as number, { months: value }, true);
  }
  static years(value: number): Duration {
    return new Duration(numericMul(value, SECONDS_PER_YEAR) as number, { years: value }, true);
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

  plus(other: Duration | Scalar | number): Duration {
    if (other instanceof Duration) {
      return new Duration(
        numericPlus(this.value, other.value) as number,
        mergeParts(this.parts, this._partKeys, other._parts()),
        this._variable || other._variable,
      );
    } else {
      if (!rbObjIsKindOf(other, rbCNumeric) && !(other instanceof Scalar)) {
        throw new TypeError(
          `${rbObjClassname(other)} can't be coerced into ${rbObjClassname(this._parts().seconds ?? 0)}`,
        );
      }
      return new Duration(
        numericPlus(this.value, other instanceof Scalar ? other.value : other) as number,
        mergeParts(this.parts, this._partKeys, {
          seconds: other instanceof Scalar ? other.value : other,
        }),
        this._variable,
      );
    }
  }

  minus(other: Duration | Scalar | number): Duration {
    if (other instanceof Duration || other instanceof Scalar) {
      return this.plus(other.negate());
    }
    return this.plus(numericUminus(other) as number);
  }

  times(other: Duration | Scalar | number): Duration {
    if (other instanceof Scalar || other instanceof Duration) {
      return new Duration(
        numericMul(this.value, other.value) as number,
        this.transformValues((number) => numericMul(number, other.value) as number),
        this._variable || other.isVariable(),
      );
    }
    if (rbObjIsKindOf(other, rbCNumeric)) {
      return new Duration(
        numericMul(this.value, other) as number,
        this.transformValues((number) => numericMul(number, other) as number),
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
        numericDiv(this.value, other.value),
        this.transformValues((number) => numericDiv(number, other.value)),
        this._variable,
      );
    }
    if (other instanceof Duration) {
      return numericDiv(this.value, other.value);
    }
    if (rbObjIsKindOf(other, rbCNumeric)) {
      return new Duration(
        numericDiv(this.value, other),
        this.transformValues((number) => numericDiv(number, other)),
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
      numericUminus(this.value) as number,
      this.transformValues((number) => numericUminus(number) as number),
      this._variable,
    );
  }

  modulo(other: Duration | Scalar | number): Duration {
    if (other instanceof Duration || other instanceof Scalar) {
      return Duration.build(numericModulo(this.value, other.value));
    }
    if (rbObjIsKindOf(other, rbCNumeric)) {
      return Duration.build(numericModulo(this.value, other));
    }
    this.raiseTypeError(other);
  }

  toI(): number {
    return Math.trunc(this.inSeconds());
  }

  toF(): number {
    return this.value;
  }

  isPositive(): boolean {
    return this.value > 0;
  }

  isNegative(): boolean {
    return this.value < 0;
  }

  isZero(): boolean {
    return Number(this.value) === 0;
  }

  abs(): number {
    return Math.abs(this.value);
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
  since(time: Date | Temporal.Instant): Temporal.Instant;
  since(time?: TimeWithZone): TimeWithZone | RubyTime;
  since(time?: DurationReceiver): DurationResult;
  since(time: DurationReceiver = timeCurrent()): DurationResult {
    return this.sum(1, time);
  }

  ago(time: RubyTime): RubyTime;
  ago(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  ago(time: Date | Temporal.Instant): Temporal.Instant;
  ago(time?: TimeWithZone): TimeWithZone | RubyTime;
  ago(time?: DurationReceiver): DurationResult;
  ago(time: DurationReceiver = timeCurrent()): DurationResult {
    return this.sum(-1, time);
  }

  fromNow(): TimeWithZone | RubyTime {
    return this.since();
  }

  until(time: RubyTime): RubyTime;
  until(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  until(time: Date | Temporal.Instant): Temporal.Instant;
  until(time?: TimeWithZone): TimeWithZone | RubyTime;
  until(time: DurationReceiver = timeCurrent()): DurationResult {
    return this.ago(time);
  }

  after(time: RubyTime): RubyTime;
  after(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  after(time: Date | Temporal.Instant): Temporal.Instant;
  after(time?: TimeWithZone): TimeWithZone | RubyTime;
  after(time: DurationReceiver = timeCurrent()): DurationResult {
    return this.since(time);
  }

  before(time: RubyTime): RubyTime;
  before(time: Temporal.PlainDate): Temporal.PlainDate | TimeWithZone;
  before(time: Date | Temporal.Instant): Temporal.Instant;
  before(time?: TimeWithZone): TimeWithZone | RubyTime;
  before(time: DurationReceiver = timeCurrent()): DurationResult {
    return this.ago(time);
  }

  inspect(): string {
    if (isEmpty(this._parts())) return `${this.value} seconds`;

    return toSentence(
      (Object.entries(this._parts()) as [keyof DurationParts, number][])
        .sort(([a], [b]) => PARTS.indexOf(a) - PARTS.indexOf(b))
        .map(([unit, val]) => `${val} ${val === 1 ? unit.slice(0, -1) : unit}`),
      { locale: false },
    );
  }

  equals(other: unknown): boolean {
    if (other instanceof Duration) {
      return rbEqual(other.value, this.value);
    } else {
      return rbEqual(other, this.value);
    }
  }

  toString(): string {
    return String(Math.round(this.inSeconds()));
  }

  isEqualTo(other: Duration): boolean {
    for (const key of PARTS) {
      if (!rbEqual(this.parts[key], other.parts[key])) return false;
    }
    return true;
  }

  eql(other: unknown): boolean {
    return other instanceof Duration && rbEql(other.value, this.value);
  }

  compareTo(other: Duration | number | unknown): number {
    if (other instanceof Duration) {
      return cmp(this.value, other.value) as number;
    } else if (rbObjIsKindOf(other, rbCNumeric)) {
      return cmp(this.value, other) as number;
    }
    return NaN;
  }

  isA(klass: unknown): boolean {
    return Duration === klass || Object(this.value) instanceof (klass as any);
  }
  declare isKindOf: (klass: unknown) => boolean;

  isVariable(): boolean {
    return this._variable;
  }

  _parts(): Partial<DurationParts> {
    return this.transformValues((number) => number);
  }

  private sum(sign: 1 | -1, time: DurationReceiver = timeCurrent()): DurationResult {
    if (!(actsLike.call(time, "time") || actsLike.call(time, "date"))) {
      throw new ArgumentError(`expected a time or date, got ${inspect(time)}`);
    }

    if (isEmpty(this._parts())) {
      if (time instanceof Temporal.PlainDate) return dateSince(time, sign * this.inSeconds());
      if (isDateTime(time)) return datetimeSince(time, sign * this.inSeconds());
      if (!(time instanceof Date || time instanceof Temporal.Instant))
        return time.since(sign * this.inSeconds());
      return applyDurationPreservingNs(time, this.parts, sign);
    }

    if (isDateTime(time) || !(time instanceof Date || time instanceof Temporal.Instant))
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
    if (typeof value !== "number" && !(value instanceof Number)) {
      const typeName =
        value === null ? "NilClass" : typeof value === "string" ? "String" : String(typeof value);
      throw new TypeError(`can't build an ActiveSupport::Duration from a ${typeName}`);
    }

    const parts: Partial<DurationParts> = {};
    const remainderSign = Math.sign(Number(value));
    let remainder = Math.abs(Number(value.toFixed(9)));
    let variable = false;

    if (Number(value) !== 0) {
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

    parts.seconds = rbFloatTypeP(value)
      ? rbDbl2num(remainder * remainderSign)
      : remainder * remainderSign;

    return new Duration(value as number, parts, variable);
  }
}

Duration.prototype.isKindOf = Duration.prototype.isA;

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

type DateTime = Temporal.PlainDateTime | Temporal.ZonedDateTime;
type DurationReceiver =
  | Date
  | Temporal.Instant
  | Temporal.PlainDate
  | DateTime
  | TimeWithZone
  | RubyTime;
type DurationResult = Temporal.Instant | Temporal.PlainDate | DateTime | TimeWithZone | RubyTime;

function toDateInput(date: Date | Temporal.Instant): Date {
  if (date instanceof Date) return date;
  if (date instanceof Temporal.Instant) return new Date(date.epochMilliseconds);
  throw new TypeError(`expected a time or date, got ${JSON.stringify(date)}`);
}

function numericDiv(a: number, b: number): number {
  if (Number.isInteger(a) && Number.isInteger(b) && b !== 0) return Math.floor(a / b);
  return rbFloatTypeP(a) || rbFloatTypeP(b) ? rbDbl2num(a / b) : a / b;
}

function applyDurationToDate(
  date: Temporal.PlainDate | DateTime | TimeWithZone | RubyTime,
  parts: DurationParts,
  partKeys: readonly (keyof DurationParts)[],
  sign: 1 | -1,
): Temporal.PlainDate | DateTime | TimeWithZone | RubyTime {
  let time: Temporal.PlainDate | DateTime | TimeWithZone | RubyTime = date;

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

function isDateTime(t: unknown): t is Temporal.PlainDateTime | Temporal.ZonedDateTime {
  return t instanceof Temporal.PlainDateTime || t instanceof Temporal.ZonedDateTime;
}

function dateOrTimeSince(
  t: Temporal.PlainDate | DateTime | TimeWithZone | RubyTime,
  seconds: number,
): DateTime | TimeWithZone | RubyTime {
  if (t instanceof Temporal.PlainDate) return dateSince(t, seconds);
  if (isDateTime(t)) return datetimeSince(t, seconds);
  return t.since(seconds);
}

function dateOrTimeAdvance(
  t: Temporal.PlainDate | DateTime | TimeWithZone | RubyTime,
  options: Partial<DurationParts>,
): Temporal.PlainDate | DateTime | TimeWithZone | RubyTime {
  if (t instanceof Temporal.PlainDate) return dateAdvance(t, options);
  if (isDateTime(t)) return datetimeAdvance(t, options);
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

  plus(other: Duration): Duration;
  plus(other: unknown): Scalar;
  plus(other: unknown): Scalar | Duration {
    if (other instanceof Duration) {
      const seconds = numericPlus(this.value, other._parts().seconds ?? 0) as number;
      const newParts = { ...other._parts(), seconds };
      const newValue = numericPlus(this.value, other.value) as number;

      return new Duration(newValue, newParts, other.isVariable());
    } else {
      return this.calculate("+", other);
    }
  }

  minus(other: Duration): Duration;
  minus(other: unknown): Scalar;
  minus(other: unknown): Scalar | Duration {
    if (other instanceof Duration) {
      const seconds = numericMinus(this.value, other._parts().seconds ?? 0) as number;
      let newParts: Partial<DurationParts> = {};
      for (const [key, v] of Object.entries(other._parts())) {
        newParts[key as keyof DurationParts] = numericUminus(v) as number;
      }
      newParts = { ...newParts, seconds };
      const newValue = numericMinus(this.value, other.value) as number;

      return new Duration(newValue, newParts, other.isVariable());
    } else {
      return this.calculate("-", other);
    }
  }

  negate(): Scalar {
    return new Scalar(numericUminus(this.value) as number);
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

  times(other: Duration): Duration;
  times(other: unknown): Scalar;
  times(other: unknown): Scalar | Duration {
    if (other instanceof Duration) {
      const newParts: Partial<DurationParts> = {};
      for (const [key, otherValue] of Object.entries(other._parts())) {
        newParts[key as keyof DurationParts] = numericMul(this.value, otherValue) as number;
      }
      const newValue = numericMul(this.value, other.value) as number;

      return new Duration(newValue, newParts, other.isVariable());
    } else {
      return this.calculate("*", other);
    }
  }

  div(other: Duration): number;
  div(other: unknown): Scalar;
  div(other: unknown): Scalar | number {
    if (other instanceof Duration) {
      return numericDiv(this.value, other.value);
    } else {
      return this.calculate("/", other);
    }
  }

  modulo(other: Duration): Duration;
  modulo(other: unknown): Scalar;
  modulo(other: unknown): Scalar | Duration {
    if (other instanceof Duration) {
      return Duration.build(numericModulo(this.value, other.value));
    } else {
      return this.calculate("%", other);
    }
  }

  /** @internal */
  private calculate(op: "+" | "-" | "*" | "/" | "%", other: unknown): Scalar {
    const publicSend = (value: number, operator: typeof op, otherValue: number): number => {
      switch (operator) {
        case "+":
          return numericPlus(value, otherValue) as number;
        case "-":
          return numericMinus(value, otherValue) as number;
        case "*":
          return numericMul(value, otherValue) as number;
        case "/":
          return numericDiv(value, otherValue);
        case "%":
          return numericModulo(value, otherValue) as number;
      }
    };
    if (other instanceof Scalar) {
      return new Scalar(publicSend(this.value, op, other.value));
    } else if (rbObjIsKindOf(other, rbCNumeric)) {
      return new Scalar(publicSend(this.value, op, other as number));
    } else {
      this.raiseTypeError(other);
    }
  }

  /** @internal */
  private raiseTypeError(other: unknown): never {
    throw new TypeError(
      `no implicit conversion of ${rbObjClassname(other)} into ${rbObjClassname(this)}`,
    );
  }
}
