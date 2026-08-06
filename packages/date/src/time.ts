/**
 * Ruby's core `::Time`, as much of it as trails needs — the sibling of
 * `./date.ts`. It answers `hour`/`min`/`sec` where `::Date` does not, which is
 * what routes `I18n::Backend::Base#localize` to `time.formats` rather than
 * `date.formats` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `packages/i18n/src/backend/base.ts:245-271`), and `%Z` answers the zone's abbreviation
 * (`"UTC"` for a `Time.utc`) rather than `::Date`'s offset spelling.
 */

import { Temporal } from "@js-temporal/polyfill";
import { ArgumentError, strftime } from "./date.js";

/**
 * The `utc_offset` argument MRI's `Time.new` accepts: `"UTC"`, an offset —
 * `"+09"`, `"+0900"`, `"+09:00"`, `"+09:00:30"` or a number of seconds east of
 * UTC, which is the form Rails passes
 * (`activesupport/lib/active_support/core_ext/string/conversions.rb:28`,
 * `core_ext/time/calculations.rb:172-175`) — or one of the military zone
 * letters (`A`..`I` = +1..+9, `K`..`M` = +10..+12, `N`..`Y` = -1..-12, and
 * `Z`, which MRI treats as UTC itself rather than as a zero offset). Anything
 * else raises with MRI's message; an IANA name like `"America/New_York"` is
 * not a `Time.new` zone, it is what a `TimeZone` object wraps.
 *
 * The answer is `"UTC"` — the one zone `Time.new` names — or the offset in
 * seconds east of UTC, which is how the receiver carries it: a number trails
 * owns, so that MRI's sub-minute offsets are representable where a `Temporal`
 * offset time zone (minute-precision) cannot hold them.
 *
 * MRI rejects a minute past 59 as a malformed spelling — `"+00:60:00"` gets the
 * `expected for utc_offset` message, not `"utc_offset out of range"` — while a
 * second past 59 it takes (`"+00:00:99"` is `99`), bounded only by the total
 * `86400`. A numeric offset needs no whole-second bound either: MRI takes a
 * `Float`/`Rational` and answers it back from `utc_offset`.
 */
function utcOffsetArgument(zone: string | number): "UTC" | number {
  if (typeof zone === "number") {
    if (!Number.isFinite(zone) || Math.abs(zone) >= 86400) {
      throw new ArgumentError("utc_offset out of range");
    }
    return zone;
  }
  // `"Z"` is the military letter for UTC, and MRI treats it as `Time.utc`
  // does — `zone` answers `"UTC"`, not `nil` as an offset-built time does.
  if (zone === "UTC" || zone === "Z") return "UTC";
  const offset = /^([+-])(\d{2})(?::(\d{2})(?::(\d{2}))?|(\d{2})(\d{2})?)?$/.exec(zone);
  if (offset) {
    const [, sign, hour, colonMin, colonSec, compactMin, compactSec] = offset;
    const min = colonMin ?? compactMin ?? "00";
    const sec = colonSec ?? compactSec ?? "00";
    if (Number(min) < 60) {
      const seconds = Number(hour) * 3600 + Number(min) * 60 + Number(sec);
      if (seconds >= 86400) throw new ArgumentError("utc_offset out of range");
      return sign === "-" ? -seconds : seconds;
    }
  }
  if (/^[A-IK-Y]$/.test(zone)) {
    const code = zone.charCodeAt(0);
    const hours = code <= 73 ? code - 64 : code <= 77 ? code - 65 : 77 - code;
    return hours * 3600;
  }
  throw new ArgumentError('"+HH:MM", "-HH:MM", "UTC" or "A".."I","K".."Z" expected for utc_offset');
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The tzdata abbreviations MRI's `Time#zone` answers, for the zones `Intl`
 * cannot supply them for: an `en-US` `timeZoneName: "short"` is an
 * abbreviation only where English has one (`"EST"`, `"PDT"`, `"HST"`) and a
 * `"GMT+5:30"` string everywhere else, where MRI answers `"IST"`.
 *
 * Each entry is the zone's standard abbreviation, then its summer one where
 * the zone has a second — picked by offset rather than by a DST flag, so
 * `Europe/Dublin`'s negative DST (standard `"IST"` in summer, `"GMT"` in
 * winter) falls out the same way as every other zone's. Zones whose tzdata
 * abbreviation is the numeric `"+04"` form need no entry: `tzdataAbbreviation`
 * spells those from the offset.
 */
const ZONE_ABBREVIATIONS: Record<string, readonly [string] | readonly [string, string]> = {
  "Africa/Cairo": ["EET", "EEST"],
  "Africa/Harare": ["CAT"],
  "Africa/Johannesburg": ["SAST"],
  "Africa/Lagos": ["WAT"],
  "Africa/Nairobi": ["EAT"],
  "America/St_Johns": ["NST", "NDT"],
  "Asia/Hong_Kong": ["HKT"],
  "Asia/Jakarta": ["WIB"],
  "Asia/Jayapura": ["WIT"],
  "Asia/Jerusalem": ["IST", "IDT"],
  "Asia/Karachi": ["PKT"],
  "Asia/Kolkata": ["IST"],
  "Asia/Makassar": ["WITA"],
  "Asia/Manila": ["PST"],
  "Asia/Seoul": ["KST"],
  "Asia/Shanghai": ["CST"],
  "Asia/Taipei": ["CST"],
  "Asia/Tokyo": ["JST"],
  "Asia/Yangon": ["MMT"],
  "Australia/Adelaide": ["ACST", "ACDT"],
  "Australia/Brisbane": ["AEST"],
  "Australia/Darwin": ["ACST"],
  "Australia/Perth": ["AWST"],
  "Australia/Sydney": ["AEST", "AEDT"],
  "Europe/Athens": ["EET", "EEST"],
  "Europe/Berlin": ["CET", "CEST"],
  "Europe/Dublin": ["GMT", "IST"],
  "Europe/Lisbon": ["WET", "WEST"],
  "Europe/London": ["GMT", "BST"],
  "Europe/Moscow": ["MSK"],
  "Europe/Paris": ["CET", "CEST"],
  "Pacific/Auckland": ["NZST", "NZDT"],
  "Pacific/Guam": ["ChST"],
};

/**
 * `timeZoneId` with any tzdata link name resolved to the zone `Intl` treats as
 * primary — `Intl` and `Temporal` disagree on which spelling that is (ICU
 * answers `Asia/Calcutta` for `Asia/Kolkata` and `Europe/Kiev` for
 * `Europe/Kyiv`, while `Temporal` keeps whatever it was given), so this is only
 * a stable join key when both sides of a lookup go through it.
 */
function primaryZoneId(timeZoneId: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timeZoneId }).resolvedOptions().timeZone;
}

let abbreviationsByPrimaryZoneId: Map<string, readonly [string] | readonly [string, string]>;

/**
 * `ZONE_ABBREVIATIONS[timeZoneId]`, also answering for the zone's tzdata link
 * names: a host whose local zone is reported as `Asia/Calcutta` rather than
 * `Asia/Kolkata` is the same zone and gets the same `"IST"`.
 */
function zoneAbbreviations(
  timeZoneId: string,
): readonly [string] | readonly [string, string] | undefined {
  const abbreviations = ZONE_ABBREVIATIONS[timeZoneId];
  if (abbreviations !== undefined) return abbreviations;
  abbreviationsByPrimaryZoneId ??= new Map(
    Object.entries(ZONE_ABBREVIATIONS).map(([id, entry]) => [primaryZoneId(id), entry]),
  );
  return abbreviationsByPrimaryZoneId.get(primaryZoneId(timeZoneId));
}

/**
 * The abbreviation tzdata gives `zoned`'s zone at `zoned`'s instant, which is
 * what MRI's `Time#zone` and `%Z` answer. Zones outside `ZONE_ABBREVIATIONS`
 * either have an English abbreviation `Intl` knows (`"EST"`) or carry tzdata's
 * numeric abbreviation, which is the offset spelled `"+04"` / `"+0545"` —
 * neither of them `Intl`'s `"GMT+4"`.
 */
function tzdataAbbreviation(zoned: Temporal.ZonedDateTime): string {
  const abbreviations = zoneAbbreviations(zoned.timeZoneId);
  if (abbreviations !== undefined) {
    if (abbreviations.length === 1) return abbreviations[0];
    const january = Number(zoned.with({ month: 1, day: 1 }).offsetNanoseconds);
    const july = Number(zoned.with({ month: 7, day: 1 }).offsetNanoseconds);
    return Number(zoned.offsetNanoseconds) > Math.min(january, july)
      ? abbreviations[1]
      : abbreviations[0];
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoned.timeZoneId,
    timeZoneName: "short",
  }).formatToParts(new globalThis.Date(zoned.epochMilliseconds));
  const short = parts.find((part) => part.type === "timeZoneName")!.value;
  if (short === "GMT" || !short.startsWith("GMT")) return short;
  const offset = zoned.offset;
  return offset.endsWith(":00") ? offset.slice(0, 3) : offset.replace(":", "");
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `::Time`. Rails never defines the
 * class, only reopens it in `core_ext/time/*.rb`, so there is no Rails
 * counterpart for a port to converge on. trails carries only the members a
 * caller duck-types.
 */
export class Time {
  readonly #plain: Temporal.PlainDateTime;
  /** @internal The receiver's zone, or `null` when it was built from an offset. */
  readonly #timeZoneId: string | null;
  /** @internal Seconds east of UTC — Ruby's `Time#utc_offset`. */
  readonly #utcOffset: number;

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
    const utcOffset = zone == null ? Temporal.Now.timeZoneId() : utcOffsetArgument(zone);
    this.#timeZoneId = typeof utcOffset === "number" ? null : utcOffset;
    this.#utcOffset =
      typeof utcOffset === "number"
        ? utcOffset
        : Number(this.#plain.toZonedDateTime(utcOffset).offsetNanoseconds) / 1_000_000_000;
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
   * `Time#zone` is the zone's tzdata abbreviation — `"UTC"` for a `Time.utc`, `"PDT"`
   * for a local summer time — not an offset, which is what `::DateTime#zone`
   * answers instead. A time built from an offset rather than a zone has no
   * abbreviation to answer and Ruby returns `nil`, which `%Z` prints as "".
   */
  get zone(): string | null {
    if (this.#timeZoneId == null) return null;
    return tzdataAbbreviation(this.#plain.toZonedDateTime(this.#timeZoneId));
  }

  /** Ruby `Time#utc_offset`, the receiver's offset from UTC in seconds. */
  get utcOffset(): number {
    return this.#utcOffset;
  }

  strftime(format: string): string {
    // `%z` is `±HHMM` — neither `Time#zone` nor `Temporal`'s extended `±HH:MM`.
    const minutes = Math.floor(Math.abs(this.utcOffset) / 60);
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
        nsec: 0,
        zone: this.zone ?? "",
        zoneOffset,
      },
      format,
    );
  }
}
