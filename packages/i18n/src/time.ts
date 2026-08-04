/**
 * Ruby's core `::Time`, as much of it as trails needs — the sibling of
 * `./date.ts`. It answers `hour`/`min`/`sec` where `::Date` does not, which is
 * what routes `I18n::Backend::Base#localize` to `time.formats` rather than
 * `date.formats` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `./backend/base.ts:245-271`), and `%Z` answers the zone's abbreviation
 * (`"UTC"` for a `Time.utc`) rather than `::Date`'s offset spelling.
 */

import { Temporal } from "@js-temporal/polyfill";
import { ArgumentError, strftime } from "./date.js";

/**
 * The `utc_offset` argument MRI's `Time.new` accepts, resolved to something
 * `Temporal` takes: `"UTC"`, an offset — `"+09"`, `"+0900"`, `"+09:00"` or a
 * number of seconds east of UTC, which is the form Rails passes
 * (`activesupport/lib/active_support/core_ext/string/conversions.rb:28`,
 * `core_ext/time/calculations.rb:172-175`) — or one of the military zone
 * letters (`A`..`I` = +1..+9, `K`..`M` = +10..+12, `N`..`Y` = -1..-12, and
 * `Z`, which MRI treats as UTC itself rather than as a zero offset). Anything else raises with MRI's message; an IANA name like
 * `"America/New_York"` is not a `Time.new` zone, it is what a `TimeZone`
 * object wraps.
 *
 * MRI also takes a sub-minute offset. `Temporal` has no way to express one —
 * an offset time zone is minute-precision — so that one spelling raises here
 * where MRI accepts it. Rails never builds one: its offsets come from zone
 * tables and `Date._parse`, both of which are whole minutes.
 */
function utcOffsetArgument(zone: string | number): string {
  if (typeof zone === "number") {
    if (zone % 60 !== 0) throw new ArgumentError("utc_offset out of range");
    const sign = zone < 0 ? "-" : "+";
    const minutes = Math.abs(zone) / 60;
    return `${sign}${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
  }
  // `"Z"` is the military letter for UTC, and MRI treats it as `Time.utc`
  // does — `zone` answers `"UTC"`, not `nil` as an offset-built time does.
  if (zone === "UTC" || zone === "Z") return "UTC";
  if (/^[+-]\d{2}(:?\d{2})?$/.test(zone)) return zone;
  if (/^[+-]\d{2}:\d{2}:\d{2}$/.test(zone)) {
    if (!zone.endsWith(":00")) throw new ArgumentError("utc_offset out of range");
    return zone.slice(0, 6);
  }
  if (/^[A-IK-Y]$/.test(zone)) {
    const code = zone.charCodeAt(0);
    const hours = code <= 73 ? code - 64 : code <= 77 ? code - 65 : 77 - code;
    const sign = hours < 0 ? "-" : "+";
    return `${sign}${pad2(Math.abs(hours))}:00`;
  }
  throw new ArgumentError('"+HH:MM", "-HH:MM", "UTC" or "A".."I","K".."Z" expected for utc_offset');
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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
   * which builds a time in the *local* zone unless `zone` gives an offset.
   * `Time.utc` is the UTC entry point, as in Ruby, and `zone` takes the
   * spellings MRI's `utc_offset` argument takes — see `utcOffsetArgument`.
   */
  constructor(
    year: number,
    month: number,
    day: number,
    hour = 0,
    min = 0,
    sec = 0,
    zone: string | number | null = null,
  ) {
    this.#plain = new Temporal.PlainDateTime(year, month, day, hour, min, sec);
    this.#zoned = this.#plain.toZonedDateTime(
      zone == null ? Temporal.Now.timeZoneId() : utcOffsetArgument(zone),
    );
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
   * answers instead. A time built from an offset rather than a zone has no
   * abbreviation to answer and Ruby returns `nil`, which `%Z` prints as "".
   */
  get zone(): string | null {
    if (/^[+-]\d{2}:?\d{2}$/.test(this.#zoned.timeZoneId)) return null;
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
    // `%z` is `±HHMM` — neither `Time#zone` nor `Temporal`'s extended `±HH:MM`.
    const minutes = Math.abs(this.utcOffset) / 60;
    const zoneOffset = `${this.utcOffset < 0 ? "-" : "+"}${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}`;
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
        zone: this.zone ?? "",
        zoneOffset,
      },
      format,
    );
  }
}
