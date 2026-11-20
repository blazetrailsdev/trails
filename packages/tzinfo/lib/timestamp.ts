import { DateTime, Time } from "@blazetrails/date";
import {
  ArgumentError,
  RangeError,
  Rational,
  cmp,
  equals,
  isBetween,
  rbHash,
  rbInspect,
  rbIntegerTypeP,
  rbModName,
  rbObjClassname,
  rbObjRespondTo,
  rational,
  toI,
  type Comparable,
} from "@blazetrails/ruby-compat";

type UtcOffset = number | "utc" | null;
type SubSecond = number | Rational;
type Offset = "preserve" | "ignore" | "treat_as_utc";
type ForBlock = (timestamp: Timestamp) => unknown;

interface TimeLike {
  toI(): number;
  subsec: number | Rational | null;
  utcOffset?: number | null;
}

const JD_EPOCH = 2440588;

export class Timestamp implements Comparable {
  static create(
    year: number,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset | string = null,
  ): Timestamp {
    if (!rbIntegerTypeP(year)) throw new ArgumentError("year must be an Integer");
    if (!rbIntegerTypeP(month)) throw new ArgumentError("month must be an Integer");
    if (!rbIntegerTypeP(day)) throw new ArgumentError("day must be an Integer");
    if (!rbIntegerTypeP(hour)) throw new ArgumentError("hour must be an Integer");
    if (!rbIntegerTypeP(minute)) throw new ArgumentError("minute must be an Integer");
    if (!rbIntegerTypeP(second)) throw new ArgumentError("second must be an Integer");
    if (month < 1 || month > 12) throw new RangeError("month must be between 1 and 12");
    if (day < 1 || day > 31) throw new RangeError("day must be between 1 and 31");
    if (hour < 0 || hour > 23) throw new RangeError("hour must be between 0 and 23");
    if (minute < 0 || minute > 59) throw new RangeError("minute must be between 0 and 59");
    if (second < 0 || second > 59) throw new RangeError("second must be between 0 and 59");

    const afterFebruary = month > 2;
    if (!afterFebruary) year -= 1;
    const era = Math.floor(year / 400);
    const yearOfEra = year - era * 400;
    const dayOfYear = Math.floor((153 * (month + (afterFebruary ? -3 : 9)) + 2) / 5) + day - 1;
    const dayOfEra =
      yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
    const daysSinceEpoch = era * 146097 + dayOfEra - 719468;
    let value = ((daysSinceEpoch * 24 + hour) * 60 + minute) * 60 + second;
    if (rbIntegerTypeP(utcOffset)) value -= utcOffset;

    return new this(value, subSecond, utcOffset as UtcOffset);
  }

  static for(
    value: unknown,
    offset: Offset | ForBlock = "preserve",
    block?: ForBlock,
  ): Timestamp | Time | DateTime {
    if (typeof offset === "function") {
      block = offset;
      offset = "preserve";
    }
    if (value == null || value === false) throw new ArgumentError("value must be specified");

    let ignoreOffset: boolean;
    let targetUtcOffset: UtcOffset;
    switch (offset) {
      case "ignore":
        ignoreOffset = true;
        targetUtcOffset = null;
        break;
      case "treat_as_utc":
        ignoreOffset = true;
        targetUtcOffset = "utc";
        break;
      case "preserve":
        ignoreOffset = false;
        targetUtcOffset = null;
        break;
      default:
        throw new ArgumentError("offset must be :preserve, :ignore or :treat_as_utc");
    }

    let timeLike = false;
    let timestamp: Timestamp;
    if (value instanceof Time) {
      timestamp = this.forTime(value, ignoreOffset, targetUtcOffset);
    } else if (value instanceof DateTime) {
      timestamp = this.forDatetime(value, ignoreOffset, targetUtcOffset);
    } else if (value instanceof Timestamp) {
      timestamp = this.forTimestamp(value, ignoreOffset, targetUtcOffset);
    } else {
      if (!this.isTimeLike(value)) {
        throw new ArgumentError(`${rbObjClassname(value)} values are not supported`);
      }
      timeLike = true;
      timestamp = this.forTimeLike(value, ignoreOffset, targetUtcOffset);
    }

    if (block) {
      const result = block(timestamp);
      if (!(result instanceof Timestamp)) {
        throw new ArgumentError("block must return a Timestamp");
      }

      if (value instanceof Time) {
        return result.toTime();
      } else if (value instanceof DateTime) {
        return result.toDatetime();
      } else {
        return timeLike ? result.toTime() : result;
      }
    } else {
      return timestamp;
    }
  }

  static utc(value: number, subSecond: SubSecond = 0): Timestamp {
    return new this(value, subSecond, "utc");
  }

  /** @internal */
  private static newBang(
    value: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = null,
  ): Timestamp {
    const result = Object.create(this.prototype) as Timestamp;
    result.initializeBang(value, subSecond, utcOffset);
    return result;
  }

  /** @internal */
  private static forTime(time: Time, ignoreOffset: boolean, targetUtcOffset: UtcOffset): Timestamp {
    let value = time.toI();
    const subSecond = time.subsec;

    let utcOffset: UtcOffset;
    if (ignoreOffset) {
      utcOffset = targetUtcOffset;
      value += time.utcOffset;
    } else if (time.isUtc()) {
      utcOffset = "utc";
    } else {
      utcOffset = time.utcOffset;
    }

    return this.newBang(value, subSecond, utcOffset);
  }

  /** @internal */
  private static forDatetime(
    datetime: DateTime,
    ignoreOffset: boolean,
    targetUtcOffset: UtcOffset,
  ): Timestamp {
    let value =
      (Number(datetime.jd) - JD_EPOCH) * 86400 +
      datetime.sec +
      datetime.min * 60 +
      datetime.hour * 3600;
    const subSecond = datetime.secFraction;

    let utcOffset: UtcOffset;
    if (ignoreOffset) {
      utcOffset = targetUtcOffset;
    } else {
      utcOffset = Number(toI(datetime.offset.mul(86400)));
      value -= utcOffset;
    }

    return this.newBang(value, subSecond, utcOffset);
  }

  /** @internal */
  private static forTimestamp(
    timestamp: Timestamp,
    ignoreOffset: boolean,
    targetUtcOffset: UtcOffset,
  ): Timestamp {
    if (ignoreOffset) {
      if (targetUtcOffset != null) {
        if (
          !(
            (targetUtcOffset === "utc" && timestamp.isUtc()) ||
            timestamp.utcOffset === targetUtcOffset
          )
        ) {
          return this.newBang(
            timestamp.value + (timestamp.utcOffset ?? 0),
            timestamp.subSecond,
            targetUtcOffset,
          );
        }
      } else if (timestamp.utcOffset != null) {
        return this.newBang(timestamp.value + timestamp.utcOffset, timestamp.subSecond);
      }
    }

    if (timestamp.constructor !== Timestamp) {
      return this.newBang(
        timestamp.value,
        timestamp.subSecond,
        timestamp.isUtc() ? "utc" : timestamp.utcOffset,
      );
    }

    return timestamp;
  }

  /** @internal */
  private static isTimeLike(value: unknown): value is TimeLike {
    return rbObjRespondTo(value, "toI") && rbObjRespondTo(value, "subsec");
  }

  /** @internal */
  private static forTimeLike(
    timeLike: TimeLike,
    ignoreOffset: boolean,
    targetUtcOffset: UtcOffset,
  ): Timestamp {
    let value = timeLike.toI();
    const subSecond = timeLike.subsec == null ? new Rational(0, 1) : rational(timeLike.subsec);

    let utcOffset: UtcOffset;
    if (ignoreOffset) {
      utcOffset = targetUtcOffset;
      if (rbObjRespondTo(timeLike, "utcOffset")) value += Math.trunc(timeLike.utcOffset ?? 0);
    } else if (rbObjRespondTo(timeLike, "utcOffset")) {
      utcOffset = Math.trunc(timeLike.utcOffset ?? 0);
    } else {
      utcOffset = 0;
    }

    return new this(value, subSecond, utcOffset);
  }

  declare value: number;

  declare subSecond: SubSecond;

  declare utcOffset: number | null;

  /** @internal */
  declare protected _utc: boolean | null;

  constructor(value: number, subSecond: SubSecond = 0, utcOffset: UtcOffset = null) {
    if (!Number.isInteger(value)) throw new ArgumentError("value must be an Integer");
    if (!(subSecond === 0 || subSecond instanceof Rational)) {
      throw new ArgumentError("sub_second must be a Rational or the Integer 0");
    }
    if (subSecond instanceof Rational && (subSecond.cmp(0) < 0 || subSecond.cmp(1) >= 0)) {
      throw new RangeError("sub_second must be >= 0 and < 1");
    }
    if (utcOffset != null && utcOffset !== "utc" && !Number.isInteger(utcOffset)) {
      throw new ArgumentError("utc_offset must be an Integer, :utc or nil");
    }
    this.initializeBang(value, subSecond, utcOffset);
  }

  isUtc(): boolean | null {
    return this._utc;
  }

  addAndSetUtcOffset(seconds: number, utcOffset: UtcOffset): Timestamp {
    if (!Number.isInteger(seconds)) throw new ArgumentError("seconds must be an Integer");
    if (utcOffset != null && utcOffset !== "utc" && !Number.isInteger(utcOffset)) {
      throw new ArgumentError("utc_offset must be an Integer, :utc or nil");
    }
    if (seconds === 0 && utcOffset === (this._utc ? "utc" : this.utcOffset)) return this;
    return Timestamp.newBang(this.value + seconds, this.subSecond, utcOffset);
  }

  utc(): Timestamp {
    if (this._utc) return this;
    return Timestamp.newBang(this.value, this.subSecond, "utc");
  }

  toTime(): Time {
    const time = this.newTime();

    if (this.utcOffset != null && !this._utc) {
      return time.getlocal(this.utcOffset);
    } else {
      return time.utc();
    }
  }

  toDatetime(): DateTime {
    return this.newDatetime();
  }

  toI(): number {
    return this.value;
  }

  strftime(format: string | null): string {
    if (format == null) throw new ArgumentError("format must be specified");
    return this.toTime().strftime(format);
  }

  toString(): string {
    if (this.utcOffset == null) return this.valueAndSubSecondToS();
    if (this._utc) return `${this.valueAndSubSecondToS()} UTC`;

    const sign = this.utcOffset >= 0 ? "+" : "-";
    let min = Math.floor(Math.abs(this.utcOffset) / 60);
    const sec = Math.abs(this.utcOffset) % 60;
    const hour = Math.floor(min / 60);
    min = min % 60;

    return `${this.valueAndSubSecondToS(this.utcOffset)} ${sign}${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}${sec > 0 ? `:${String(sec).padStart(2, "0")}` : ""}${this.utcOffset !== 0 ? ` (${this.valueAndSubSecondToS()} UTC)` : ""}`;
  }

  compareTo(t: unknown): number | null {
    if (!(t instanceof Timestamp)) return null;
    if (this.utcOffset != null && t.utcOffset == null) return null;
    if (this.utcOffset == null && t.utcOffset != null) return null;

    let result = cmp(this.value, t.value)!;
    if (result === 0) result = cmp(this.subSecond, t.subSecond)!;
    return result;
  }

  isBetween = isBetween;
  equals = equals;

  eql = equals;

  hash(): number {
    return rbHash([this.value, this.subSecond, this.utcOffset != null]);
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}: @value=${this.value}, @sub_second=${this.subSecond}, @utc_offset=${rbInspect(this.utcOffset)}, @utc=${rbInspect(this._utc)}>`;
  }

  /** @internal */
  protected newTime(klass: typeof Time = Time): Time {
    return klass.at(
      this.value,
      this.subSecond instanceof Rational
        ? this.subSecond.mul(1_000_000)
        : this.subSecond * 1_000_000,
    );
  }

  /** @internal */
  protected newDatetime(klass: typeof DateTime = DateTime): DateTime {
    const datetime = new klass(-4712, 1, 1)
      .plus(new Rational(this.value, 1).add(this.subSecond).quo(86400).add(JD_EPOCH))
      .gregorian();
    return this.utcOffset != null && this.utcOffset !== 0
      ? datetime.newOffset(new Rational(this.utcOffset, 86400))
      : datetime;
  }

  /** @internal */
  private valueAndSubSecondToS(offset = 0): string {
    return `${this.value + offset}${this.subSecondToS()}`;
  }

  /** @internal */
  private subSecondToS(): string {
    if (this.subSecond === 0) {
      return "";
    } else {
      const subSecond = this.subSecond as Rational;
      return ` ${subSecond.numerator}/${subSecond.denominator}`;
    }
  }

  /** @internal */
  private initializeBang(
    value: number,
    subSecond: SubSecond = 0,
    utcOffset: UtcOffset = null,
  ): void {
    this.value = value;

    this.subSecond =
      subSecond === 0 || (subSecond instanceof Rational && subSecond.isZero()) ? 0 : subSecond;

    if (utcOffset != null) {
      this._utc = utcOffset === "utc";
      this.utcOffset = this._utc ? 0 : (utcOffset as number);
    } else {
      this._utc = this.utcOffset = null;
    }
  }
}
