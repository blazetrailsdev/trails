/**
 * Mirrors: ActiveRecord::Type::Date
 */
import { DateType as ActiveModelDate } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class Date extends ActiveModelDate {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super();
    this._timezone = options?.timezone;
  }

  get isUtc(): boolean {
    return isUtc(this._timezone);
  }
}
