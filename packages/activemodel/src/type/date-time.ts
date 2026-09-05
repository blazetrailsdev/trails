import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import { Rational, rbObjAsString as toS } from "@blazetrails/ruby-compat";
import {
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { include, type Included } from "@blazetrails/activesupport";
import { ArgumentError } from "../attribute-assignment.js";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { TimeValue } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = RubyTime | DateInfinityType | DateNegativeInfinityType;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (date_time.rb:44-46); the class/interface merge is how `include()` surfaces on the type side.
export interface DateTimeType
  extends
    Omit<InstanceMethods<DateTimeCastResult>, "valueFromMultiparameterAssignment">,
    Omit<Included<typeof TimeValue>, "serializeCastValue"> {
  serializeCastValue(value: DateTimeCastResult | null): DateTimeCastResult | null;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DateTimeType extends ValueType<DateTimeCastResult> {
  type(): string {
    return "datetime";
  }

  /** @internal */
  protected castValue(value: unknown): DateTimeCastResult | null {
    let seconds: Rational | null = null;
    // boundary: a JS `Date`, a `Temporal.Instant` and a `Temporal.PlainDateTime` each stand for the zoneless Ruby ::Time `cast_value` receives.
    if (value instanceof Date) {
      seconds = new Rational(value.getTime(), 1000);
    } else if (value instanceof Temporal.Instant) {
      seconds = new Rational(value.epochNanoseconds, 1_000_000_000n);
    } else if (value instanceof Temporal.PlainDateTime) {
      seconds = new Rational(
        value.toZonedDateTime(this.isUtc ? "UTC" : Temporal.Now.timeZoneId()).epochNanoseconds,
        1_000_000_000n,
      );
    }
    if (seconds != null) {
      const time = RubyTime.at(seconds);
      value = this.isUtc ? time.getutc() : time.getlocal();
    }
    if (typeof value !== "string")
      return this.applySecondsPrecision(value) as DateTimeCastResult | null;
    if (value === "") return null;

    return this.fastStringToTime(value) ?? this.fallbackStringToTime(value);
  }

  /** @internal */
  protected microseconds(time: DateParts): number {
    const secFraction = time.secFraction;
    if (secFraction == null) return 0;
    if (secFraction instanceof Rational) return secFraction.mul(1_000_000).toI();
    if (typeof secFraction === "bigint") return Number(secFraction * 1_000_000n);
    return Math.trunc(secFraction * 1_000_000);
  }

  /** @internal */
  protected fallbackStringToTime(string: string): RubyTime | null {
    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(string);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    if (!timeHash) return null;

    timeHash.secFraction = this.microseconds(timeHash);

    return this.newTime(
      timeHash.year,
      timeHash.mon,
      timeHash.mday,
      timeHash.hour,
      timeHash.min,
      timeHash.sec,
      timeHash.secFraction,
      timeHash.offset,
    );
  }

  /** @internal */
  protected valueFromMultiparameterAssignment(
    valuesHash: Record<string | number, unknown>,
  ): DateTimeCastResult | null {
    const missing = [1, 2, 3].filter((k) => !Object.hasOwn(valuesHash, k));
    if (missing.length > 0) {
      throw new ArgumentError(
        `Provided hash ${toS(valuesHash)} doesn't contain necessary keys: ${toS(missing)}`,
      );
    }
    const time = (
      acceptsMultiparameterTime.instanceMethod("valueFromMultiparameterAssignment")!.value as (
        this: unknown,
        valuesHash: Record<string, unknown>,
      ) => RubyTime | null
    ).call(this, valuesHash as Record<string, unknown>);
    return time;
  }

  get isUtc(): boolean {
    return isUtc();
  }

  override isChanged(oldValue: unknown, newValue: unknown, _raw?: unknown): boolean {
    if (oldValue instanceof RubyTime && newValue instanceof RubyTime) {
      return oldValue.toR().cmp(newValue.toR()) !== 0;
    }
    return oldValue !== newValue;
  }
}

const acceptsMultiparameterTime = new AcceptsMultiparameterTime({ defaults: { "4": 0, "5": 0 } });
include(DateTimeType, acceptsMultiparameterTime);

include(DateTimeType, TimeValue);
