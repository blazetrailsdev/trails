/**
 * Mirrors: ActiveRecord::Type::Time
 *
 * Wraps the ActiveModel time type with ActiveRecord timezone configuration.
 * Values are cast by ActiveModel; this type adds timezone-aware behavior
 * through the `timezone` option and `isUtc` accessor.
 */
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class Time extends ActiveModelTime {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }

  get isUtc(): boolean {
    return isUtc(this._timezone);
  }
}
