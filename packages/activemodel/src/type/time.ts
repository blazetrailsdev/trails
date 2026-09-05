import {
  ArgumentError as RubyArgumentError,
  Date as RubyDate,
  Temporal,
  Time as RubyTime,
  type DateParts,
} from "@blazetrails/date";
import {
  TimeWithZone,
  change as timeChange,
  isBlank,
  include,
  type Included,
} from "@blazetrails/activesupport";
import { Rational } from "@blazetrails/ruby-compat";
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
    InstanceMethods<TimeWithZone | RubyTime>,
    Omit<Included<typeof TimeValue>, "userInputInTimeZone" | "serializeCastValue"> {
  serializeCastValue(value: TimeWithZone | RubyTime | null): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TimeType extends ValueType<TimeWithZone | RubyTime> {
  type(): string {
    return "time";
  }

  userInputInTimeZone(
    value: unknown,
  ): TimeWithZone | Temporal.ZonedDateTime | Temporal.Instant | RubyTime | null {
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
    } else if (value instanceof RubyTime) {
      value = timeChange(value, { year: 2000, day: 1, month: 1 });
    }

    return TimeValue.userInputInTimeZone.call(this, value);
  }

  /** @internal */
  protected castValue(value: unknown): TimeWithZone | RubyTime | null {
    if (typeof value !== "string") {
      // boundary: a `Temporal.Instant` and a `Temporal.PlainDateTime` each stand for the zoneless Ruby ::Time `cast_value` receives.
      let seconds: Rational | null = null;
      if (value instanceof Temporal.Instant) {
        seconds = new Rational(value.epochNanoseconds, 1_000_000_000n);
      } else if (value instanceof Temporal.PlainDateTime) {
        seconds = new Rational(
          value.toZonedDateTime(this.#zoneId()).epochNanoseconds,
          1_000_000_000n,
        );
      }
      if (seconds != null) {
        const time = RubyTime.at(seconds);
        value = this.isUtc ? time.getutc() : time.getlocal();
      }
      return this.applySecondsPrecision(value) as TimeWithZone | RubyTime | null;
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
}

const acceptsMultiparameterTime = new AcceptsMultiparameterTime({
  defaults: { "1": 2000, "2": 1, "3": 1, "4": 0, "5": 0 },
});
include(TimeType, acceptsMultiparameterTime);

include(TimeType, TimeValue);
