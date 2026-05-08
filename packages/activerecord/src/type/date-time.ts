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

  override serialize(value: unknown): string | null {
    // Delegate to activemodel for precision truncation and exact digit count
    // (defaults to 6 when precision is null, matching ActiveModel behavior).
    // Then convert ISO 8601 "YYYY-MM-DDTHH:MM:SS[.frac]Z" → SQL space-separated
    // "YYYY-MM-DD HH:MM:SS[.frac]" accepted by both PG and MySQL/MariaDB.
    const iso = super.serialize(value);
    if (iso === null) return null;
    if (iso === "infinity" || iso === "-infinity") return iso;
    return iso.replace("T", " ").replace(/Z$/, "");
  }
}
