import { DelegateClass } from "@blazetrails/ruby-compat";
import { Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone } from "@blazetrails/activesupport";
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class Value extends DelegateClass(RubyTime) {}

export class Time extends ActiveModelTime {
  static Value = Value;

  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }

  override get isUtc(): boolean {
    return isUtc(this._timezone);
  }

  override serialize(value: unknown): Value | null {
    value = super.serialize(value);
    return value instanceof RubyTime || value instanceof TimeWithZone
      ? new Value(value)
      : (value as Value | null);
  }

  override serializeCastValue(value: TimeWithZone | RubyTime | null): Value | null {
    const serialized: unknown = super.serializeCastValue(value);
    return value != null ? new Value(serialized) : null;
  }

  protected override castValue(value: unknown): TimeWithZone | RubyTime | null {
    const cast = super.castValue(value);
    return cast instanceof Value ? (cast.__getobj__() as TimeWithZone | RubyTime) : cast;
  }
}
