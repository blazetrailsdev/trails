/**
 * Mirrors: ActiveRecord::Type::DateTime
 */
import { DateTimeType as ActiveModelDateTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class DateTime extends ActiveModelDateTime {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super();
    this._timezone = options?.timezone;
  }

  get isUtc(): boolean {
    return isUtc(this._timezone);
  }
}
