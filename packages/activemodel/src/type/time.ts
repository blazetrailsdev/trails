import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import { TimeWithZone, isBlank, include, type Included } from "@blazetrails/activesupport";
import {
  AcceptsMultiparameterTime,
  type InstanceMethods,
} from "./helpers/accepts-multiparameter-time.js";
import { isUtc } from "./helpers/timezone.js";
import { TimeValue } from "./helpers/time-value.js";
import { ValueType } from "./value.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (time.rb:40-42); the class/interface merge is how `include()` surfaces on the type side.
export interface TimeType
  extends
    Omit<
      InstanceMethods<Temporal.Instant | TimeWithZone | RubyTime>,
      "valueFromMultiparameterAssignment"
    >,
    Omit<Included<typeof TimeValue>, "userInputInTimeZone" | "serializeCastValue"> {
  serializeCastValue(value: Temporal.Instant | TimeWithZone | RubyTime | null): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TimeType extends ValueType<Temporal.Instant | TimeWithZone | RubyTime> {
  type(): string {
    return "time";
  }

  userInputInTimeZone(
    value: unknown,
  ): TimeWithZone | Temporal.ZonedDateTime | Temporal.Instant | null {
    if (value == null || value === false) return null;
    if (typeof value === "string" && isBlank(value)) return null;

    if (typeof value === "string") {
      value = `2000-01-01 ${value}`;
      let timeHash: DateParts | undefined;
      try {
        timeHash = RubyDate._parse(value as string);
      } catch (error) {
        if (!(error instanceof RubyArgumentError)) throw error;
      }
      if (timeHash == null || timeHash.hour == null) return null;
    } else if (value instanceof TimeWithZone) {
      value = value.change({ year: 2000, day: 1, month: 1 });
    } else if (value instanceof Temporal.Instant) {
      value = value
        .toZonedDateTimeISO(this.#zoneId())
        .with({ year: 2000, day: 1, month: 1 })
        .toInstant();
    }

    return TimeValue.userInputInTimeZone.call(this, value);
  }

  /** @internal */
  protected castValue(value: unknown): Temporal.Instant | TimeWithZone | RubyTime | null {
    if (typeof value !== "string") {
      if (value instanceof Temporal.PlainDateTime) {
        value = value.toZonedDateTime(this.#zoneId()).toInstant();
      }
      return this.applySecondsPrecision(value) as Temporal.Instant | TimeWithZone | RubyTime | null;
    }
    if (value.trim() === "") return null;

    const dummyTimeValue = value.replace(/^\d{4}-\d\d-\d\d(?:T|\s)|/, "2000-01-01 ");

    const fast = this.fastStringToTime(dummyTimeValue);
    if (fast) return fast;

    let timeHash: DateParts | undefined;
    try {
      timeHash = RubyDate._parse(dummyTimeValue);
    } catch (error) {
      if (!(error instanceof RubyArgumentError)) throw error;
    }
    if (timeHash == null || timeHash.hour == null) return null;

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

  get isUtc(): boolean {
    return isUtc();
  }

  /** @internal */
  #zoneId(): string {
    return this.isUtc ? "UTC" : Temporal.Now.timeZoneId();
  }

  /** @internal */
  protected valueFromMultiparameterAssignment(
    values: Record<string, unknown>,
  ): Temporal.Instant | null {
    const time = (
      acceptsMultiparameterTime.instanceMethod("valueFromMultiparameterAssignment")!.value as (
        this: unknown,
        valuesHash: Record<string, unknown>,
      ) => RubyTime | null
    ).call(this, values);
    return time && time.toTime().toInstant();
  }
}

const acceptsMultiparameterTime = new AcceptsMultiparameterTime({
  defaults: { "1": 2000, "2": 1, "3": 1, "4": 0, "5": 0 },
});
include(TimeType, acceptsMultiparameterTime);

include(TimeType, TimeValue);
