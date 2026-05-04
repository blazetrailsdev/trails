/**
 * Mirrors: ActiveRecord::Type::Time
 *
 * Wraps the ActiveModel time type with ActiveRecord timezone configuration.
 * Values are cast by ActiveModel; this type adds timezone-aware behavior
 * through the `timezone` option and `isUtc` accessor.
 */
import type { Temporal } from "@blazetrails/activesupport/temporal";
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

  override serialize(value: unknown): string | null {
    return super.serialize(value);
  }

  override serializeCastValue(value: Temporal.PlainTime | null): string | null {
    return super.serializeCastValue(value);
  }

  protected override castValue(value: unknown): Temporal.PlainTime | null {
    return super.castValue(value);
  }
}
