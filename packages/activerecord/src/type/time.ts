import { DelegateClass, registerConstant } from "@blazetrails/ruby-compat";
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
  /** @inlinedFrom ActiveRecord::Type::Internal::Timezone#initialize rails/v8.0.2/activerecord/lib/active_record/type/internal/timezone.rb:7-10 */
  constructor({
    timezone,
    ...kwargs
  }: TimezoneOptions & ConstructorParameters<typeof ActiveModelTime>[0] = {}) {
    super(kwargs);
    this._timezone = timezone;
  }

  static Value = Value;

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

registerConstant("ActiveRecord::Type::Time", Time);
registerConstant("ActiveRecord::Type::Time::Value", Value);
