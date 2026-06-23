/**
 * Mirrors: ActiveRecord::Type::DateTime
 */
import { DateTimeType as ActiveModelDateTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class DateTime extends ActiveModelDateTime {
  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }

  get isUtc(): boolean {
    return isUtc(this._timezone);
  }

  // serialize is inherited near-identity from ActiveModel: value_for_database
  // returns the cast Temporal.Instant, and the connection adapter's quote/bind
  // layer renders the SQL-string literal. (Previously this override emitted the
  // SQL string here, conflating serialize with adapter quoting.)
}
