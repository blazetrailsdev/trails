import {
  ArgumentError,
  Date as RubyDate,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import { numericMul, rbObjAsString as toS, registerConstant, toI } from "@blazetrails/ruby-compat";
import {
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { include, type Included } from "@blazetrails/activesupport";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
import { Timezone } from "./helpers/timezone.js";
import { TimeValue } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

export type DateTimeCastResult = RubyTime | DateInfinityType | DateNegativeInfinityType;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (date_time.rb:44-46); the class/interface merge is how `include()` surfaces on the type side.
export interface DateTimeType
  extends
    Timezone,
    InstanceMethods<DateTimeCastResult>,
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
    if (typeof value !== "string")
      return this.applySecondsPrecision(value) as DateTimeCastResult | null;
    if (value === "") return null;

    return this.fastStringToTime(value) ?? this.fallbackStringToTime(value);
  }

  /** @internal */
  protected microseconds(time: DateParts): number {
    return time.secFraction != null ? Number(toI(numericMul(time.secFraction, 1_000_000))) : 0;
  }

  /** @internal */
  protected fallbackStringToTime(string: string): RubyTime | null {
    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(string);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
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
}

include(DateTimeType, Timezone);

const acceptsMultiparameterTime = new AcceptsMultiparameterTime({ defaults: { "4": 0, "5": 0 } });
include(DateTimeType, acceptsMultiparameterTime);

include(DateTimeType, TimeValue);

registerConstant("ActiveModel::Type::DateTime", DateTimeType);
