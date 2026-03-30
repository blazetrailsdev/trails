/**
 * Mirrors: ActiveRecord::Type::Time
 *
 * Also defines Time::Value as a branded wrapper around Date (matching
 * Ruby's DelegateClass(::Time)).
 */
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class TimeValue extends globalThis.Date {
  constructor(value: globalThis.Date) {
    super(value.getTime());
  }
}

export class Time extends ActiveModelTime {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super();
    this._timezone = options?.timezone;
  }

  get isUtc(): boolean {
    return isUtc(this._timezone);
  }

  serialize(value: unknown): TimeValue | null {
    const cast = super.serialize(value);
    if (cast instanceof globalThis.Date) {
      return new TimeValue(cast);
    }
    return null;
  }
}
