import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import { include } from "@blazetrails/activesupport";
import { toFs } from "@blazetrails/activesupport/core-ext/date/conversions";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
import {
  DateInfinity,
  DateNegativeInfinity,
  type DateInfinity as DateInfinityType,
  type DateNegativeInfinity as DateNegativeInfinityType,
} from "./internal/sentinels.js";
import { ValueType } from "./value.js";

export { DateInfinity, DateNegativeInfinity };
export type { DateInfinityType, DateNegativeInfinityType };

export type DateCastResult = Temporal.PlainDate | DateInfinityType | DateNegativeInfinityType;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include` (date.rb:28); the class/interface merge is how `include()` surfaces on the type side.
export interface DateType extends Omit<
  InstanceMethods<DateCastResult>,
  "valueFromMultiparameterAssignment"
> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DateType extends ValueType<DateCastResult> {
  readonly name: string = "date";

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    return JSON.stringify(toFs(value as Temporal.PlainDate, "db"));
  }

  /** @internal */
  protected castValue(value: unknown): DateCastResult | null {
    if (typeof value === "string") {
      if (value === "") return null;
      return this.fastStringToDate(value) ?? this.fallbackStringToDate(value);
    } else if (value instanceof Temporal.PlainDate) {
      return value;
    } else if (value instanceof Temporal.PlainDateTime) {
      return value.toPlainDate();
      // boundary: a JS Date assigned to a date attribute is Ruby's ::Time.
    } else if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return Temporal.PlainDate.from({
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      });
    } else {
      return value as DateCastResult;
    }
  }

  /** @internal */
  protected fastStringToDate(string: string): Temporal.PlainDate | null {
    if (string.includes("\n")) return null;
    const m = ISO_DATE.exec(string);
    if (!m) return null;
    return this.newDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  /** @internal */
  protected fallbackStringToDate(string: string): Temporal.PlainDate | null {
    let parts: DateParts | undefined;
    try {
      parts = RubyDate._parse(string, false);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    return parts ? this.newDate(parts.year, parts.mon, parts.mday) : null;
  }

  /** @internal */
  protected newDate(
    year: number | bigint | null | undefined,
    mon: number | null | undefined,
    mday: number | null | undefined,
  ): Temporal.PlainDate | null {
    if (year == null || (year === 0 && mon === 0 && mday === 0)) return null;
    if (mon == null || mday == null) return null;
    try {
      return Temporal.PlainDate.from(
        { year: Number(year), month: mon, day: mday },
        { overflow: "reject" },
      );
    } catch {
      return null;
    }
  }

  /** @internal */
  protected valueFromMultiparameterAssignment(
    values: Record<number, unknown>,
  ): Temporal.PlainDate | null {
    const time = (
      acceptsMultiparameterTime.instanceMethod("valueFromMultiparameterAssignment")!.value as (
        this: unknown,
        valuesHash: Record<string, unknown>,
      ) => RubyTime | null
    ).call(this, values as Record<string, unknown>);
    return time && this.newDate(time.year, time.mon, time.mday);
  }
}

const ISO_DATE = /^(\d{4})-(\d\d)-(\d\d)$/;

const acceptsMultiparameterTime = new AcceptsMultiparameterTime();
include(DateType, acceptsMultiparameterTime);
