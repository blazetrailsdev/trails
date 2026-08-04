/**
 * Ruby's core `::Time`, as much of it as trails needs — the sibling of
 * `./date.ts`. It answers `hour`/`min`/`sec` where `::Date` does not, which is
 * what routes `I18n::Backend::Base#localize` to `time.formats` rather than
 * `date.formats` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `./backend/base.ts:245-271`), and `%Z` answers the zone's abbreviation
 * (`"UTC"` for a `Time.utc`) rather than `::Date`'s offset spelling.
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
  /** @internal The receiver's zone — Ruby's `Time#zone`/`#utc_offset` source. */
  readonly #zoned: Temporal.ZonedDateTime;

  /** Ruby `Time.utc(year, month, day, hour = 0, min = 0, sec = 0)`. */
  static utc(year: number, month: number, day: number, hour = 0, min = 0, sec = 0): Time {
    return new Time(year, month, day, hour, min, sec, "UTC");
  }

  /**
   * Ruby `Time.new(year, month, day, hour = 0, min = 0, sec = 0, zone = nil)`,
   * which builds a time in the *local* zone unless `zone` names another one.
   * `Time.utc` is the UTC entry point, as in Ruby. Ruby's `zone` argument also
   * accepts an offset spelling (`"+09:00"`); here it is the IANA identifier
   * `Temporal` resolves.
   */
  constructor(
    year: number,
    month: number,
    day: number,
    hour = 0,
    min = 0,
    sec = 0,
    zone: string | null = null,
  ) {
    this.#plain = new Temporal.PlainDateTime(year, month, day, hour, min, sec);
    this.#zoned = this.#plain.toZonedDateTime(zone ?? Temporal.Now.timeZoneId());
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

  get yday(): number {
    return this.#plain.dayOfYear;
  }

  /**
   * `Time#zone` is the zone's abbreviation — `"UTC"` for a `Time.utc`, `"PDT"`
   * for a local summer time — not an offset, which is what `::DateTime#zone`
   * answers instead.
   */
  get zone(): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: this.#zoned.timeZoneId,
      timeZoneName: "short",
    }).formatToParts(new globalThis.Date(this.#zoned.epochMilliseconds));
    return parts.find((part) => part.type === "timeZoneName")!.value;
  }

  /** Ruby `Time#utc_offset`, the receiver's offset from UTC in seconds. */
  get utcOffset(): number {
    return Number(this.#zoned.offsetNanoseconds) / 1_000_000_000;
  }

  strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        zone: this.zone,
        zoneOffset: this.#zoned.offset.replace(":", ""),
      },
      format,
    );
  }
}
