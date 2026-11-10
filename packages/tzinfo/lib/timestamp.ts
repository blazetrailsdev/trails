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
  rbModName,
  type Comparable,
} from "@blazetrails/ruby-compat";

type UtcOffset = number | "utc" | null;
type SubSecond = number | Rational;

const JD_EPOCH = 2440588;

export class Timestamp implements Comparable {
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
