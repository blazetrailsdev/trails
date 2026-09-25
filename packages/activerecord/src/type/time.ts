import { DelegateClass } from "@blazetrails/ruby-compat";
import { Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone } from "@blazetrails/activesupport";
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Timezone, type TimezoneOptions } from "./internal/timezone.js";

export class Value extends DelegateClass(RubyTime) {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Internal::Timezone`; the class/interface merge is how `include()` surfaces on the type side.
export interface Time extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Time extends ActiveModelTime {
  static Value = Value;

  constructor({ timezone, ...kwargs }: TimezoneOptions = {}) {
    super(kwargs);
    this._timezone = timezone;
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

include(Time, Timezone);
