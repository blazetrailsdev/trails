/**
 * Ruby's core `::Time`, as much of it as trails needs — the sibling of
 * `./date.ts`. It answers `hour`/`min`/`sec` where `::Date` does not, which is
 * what routes `I18n::Backend::Base#localize` to `time.formats` rather than
 * `date.formats` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `./backend/base.ts:245-271`), and `%Z` answers `"UTC"` rather than `::Date`'s
 * offset spelling.
 */

import { Temporal } from "@js-temporal/polyfill";
import { strftime } from "./date.js";

/**
 * @noRailsEquivalent PERMANENT — Ruby core `::Time`. Rails never defines the
 * class, only reopens it in `core_ext/time/*.rb`, so there is no Rails
 * counterpart for a port to converge on. trails carries only the members a
 * caller duck-types.
 */
export class Time {
  readonly #plain: Temporal.PlainDateTime;

  /** Ruby `Time.utc(year, month, day, hour = 0, min = 0, sec = 0)`. */
  static utc(year: number, month: number, day: number, hour = 0, min = 0, sec = 0): Time {
    return new Time(year, month, day, hour, min, sec);
  }

  // Private because Ruby's `Time.new` builds a *local* time, and trails models
  // only the UTC one `Time.utc` returns — a public constructor here would read
  // as `Time.new` and quietly mean something else.
  private constructor(
    year: number,
    month: number,
    day: number,
    hour: number,
    min: number,
    sec: number,
  ) {
    this.#plain = new Temporal.PlainDateTime(year, month, day, hour, min, sec);
  }

  get year(): number {
    return this.#plain.year;
  }

  get mon(): number {
    return this.#plain.month;
  }

  get month(): number {
    return this.#plain.month;
  }

  get day(): number {
    return this.#plain.day;
  }

  /** Ruby counts Sunday as 0; `Temporal.PlainDateTime#dayOfWeek` counts Monday as 1. */
  get wday(): number {
    return this.#plain.dayOfWeek % 7;
  }

  get hour(): number {
    return this.#plain.hour;
  }

  get min(): number {
    return this.#plain.minute;
  }

  get sec(): number {
    return this.#plain.second;
  }

  /** `Time.utc(...).strftime('%Z')` is `"UTC"`, not an offset. */
  get zone(): string {
    return "UTC";
  }

  strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.#plain.dayOfYear,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        zone: this.zone,
      },
      format,
    );
  }
}
