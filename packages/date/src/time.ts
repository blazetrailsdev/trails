/**
 * Ruby's core `::Time`, as much of it as trails needs — the sibling of
 * `./date.ts`. It answers `hour`/`min`/`sec` where `::Date` does not, which is
 * what routes `I18n::Backend::Base#localize` to `time.formats` rather than
 * `date.formats` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `packages/i18n/src/backend/base.ts:245-271`), and `%Z` answers the zone's abbreviation
 * (`"UTC"` for a `Time.utc`) rather than `::Date`'s offset spelling.
 */

import { Temporal } from "@js-temporal/polyfill";
import {
  ArgumentError,
  Date,
  DateTime,
  Rational,
  SEAT,
  cCivilToJd,
  dfLocalToUtc,
  decodeYear,
  fToR,
  jdLocalToUtc,
  of2str,
  strftime,
  timeToDf,
} from "./date.js";

/**
 * MRI reads the process's zone once and caches it (`time.c`
 * `localtime_with_gmtoff_zone`, over the libc `tzset` cache); every
 * `Temporal.Now.timeZoneId()` is an `Intl` `resolvedOptions()` round trip
 * instead, ~15x the cost of reading the clock itself, and `Time.now` sits on
 * trails' production clock read. The memo is per-process, exactly as MRI's is.
 */
let localTimeZoneId: string | null = null;

function nowTimeZoneId(): string {
  return (localTimeZoneId ??= Temporal.Now.timeZoneId());
}

/**
 * Drop the {@link nowTimeZoneId} memo. MRI re-reads the zone when `TZ` changes
 * under it (`tzset`); a test that rewrites `TZ` — or stubs
 * `Temporal.Now.timeZoneId` — mid-process needs the same.
 *
 * @noRailsEquivalent PERMANENT — the reset half of the memo above.
 */
export function resetLocalTimeZoneId(): void {
  localTimeZoneId = null;
}

/**
 * Whether a string names a zone rather than spelling a `utc_offset`. MRI's
 * `Time#getlocal` takes only the offset spellings — a leading sign, or one of
 * the military letters — plus a zone OBJECT, which a zone identifier stands in
 * for here.
 */
function isZoneIdentifier(zone: string): boolean {
  return !/^([+-]|[A-IK-Z]$)/.test(zone);
}

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
 * The nanoseconds MRI's `Time#nsec` answers for a `sec` argument: the *exact*
 * value, truncated at nine digits rather than rounded —
 * `Time.utc(2008, 3, 1, 6, 0, 0.3).nsec` is `299999999`, because the nearest
 * double to `0.3` is `0.29999999999999998889...`, and
 * `Time.utc(2008, 3, 1, 6, 0, 7.456789).nsec` is `456788999` for the same
 * reason.
 *
 * MRI's `::Time` holds the second as a Rational (`time.c` `time_timespec`,
 * over `rb_time_magnify`), so a `Rational` argument is exact at any
 * denominator: `Time.new(2008, 3, 1, 6, 0, Rational(1, 3)).nsec` is
 * `333333333`. A `number` becomes its own exact ratio through `Float#to_r`
 * ({@link fToR}) first, so one path serves both and the truncation is the
 * floored `Rational` quotient rather than a decimal-string slice.
 */
function subsecNanoseconds(sec: number | Rational): number {
  const fraction = (sec instanceof Rational ? sec : fToR(sec)).mod(1);
  if (fraction.isZero()) return 0;
  return fraction.mul(1_000_000_000).div(1);
}

/**
 * MRI's `num_exact` (`time.c`), the conversion every `Time.at` argument goes
 * through: an Integer and a Rational are exact already, and a Float becomes
 * its own exact ratio through `Float#to_r` ({@link fToR}) — which is why
 * `Time.at(946684800.123456789).nsec` is `123456835` rather than `...789`.
 */
function numExact(v: number | bigint | Rational): Rational {
  if (v instanceof Rational) return v;
  if (typeof v === "bigint") return new Rational(v, 1);
  return fToR(v);
}

/**
 * MRI's `months[]` table (`time.c`), the three-letter month names
 * `month_arg` matches a String positional against.
 */
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * MRI's `obj2vint` (`time.c`), the conversion every `::Time` constructor
 * positional goes through before `obj2ubits` sees it. A String is taken
 * through `rb_str_to_inum(str, 10, TRUE)` — strict `Integer()`, so
 * `Time.utc("2004")` is the year 2004 while `"5.5"`, `"2004abc"` and `""` all
 * raise. A Numeric is truncated toward zero.
 */
function obj2vint(obj: number | string): number {
  if (typeof obj !== "string") return Math.trunc(obj);
  if (!/^[+-]?\d+$/.test(obj.trim())) {
    throw new ArgumentError(`invalid value for Integer(): ${JSON.stringify(obj)}`);
  }
  return parseInt(obj.trim(), 10);
}

/**
 * MRI's `month_arg` (`time.c`): the month positional alone also takes one of
 * `months[]`, matched case-insensitively over exactly three characters, so
 * `Time.utc(2004, "JAN")` is January and `Time.utc(2004, "june")` raises.
 */
function monthArg(obj: number | string): number {
  if (typeof obj === "string") {
    const index = months.indexOf(obj.trim().toLowerCase());
    if (index !== -1) return index + 1;
  }
  return obj2vint(obj);
}

/**
 * MRI's `obj2ubits` (`time.c`), which every `::Time` constructor positional
 * goes through before `validate_vtm` sees it: the value has to fit in `bits`
 * unsigned bits or the argument is rejected outright, with a message that names
 * no field. That is why `Time.utc(2015, 6, 32)` is `"argument out of range"`
 * while `Time.utc(2015, 6, 0)` — inside 5 bits — is `"mday out of range"`.
 */
function obj2ubits(obj: number, bits: number): number {
  const usableMask = (1 << bits) - 1;
  if ((obj & usableMask) !== obj) throw new ArgumentError("argument out of range");
  return obj;
}

/**
 * MRI's `validate_vtm_range` macro (`time.c`), which interpolates the struct
 * member's own name into the message.
 */
function validateVtmRange(mem: string, value: number, b: number, e: number): void {
  if (value < b || value > e) throw new ArgumentError(`${mem} out of range`);
}

/**
 * MRI's `rb_scan_args_kw` splits the keyword hash off an argument list before
 * binding the positionals, so `Time.new`'s keywords may follow any number of
 * them — `Time.new(2020, 1, 1, in: "+05:00")` is a three-positional call, not a
 * fourth positional. `Rational` is the one object a positional itself takes
 * (`sec`), so it is not a keyword hash.
 */
function isTimeNewOptions(arg: unknown): arg is TimeNewOptions {
  return typeof arg === "object" && arg !== null && !(arg instanceof Rational);
}

/** The defaults `Time.new`'s positionals fall back to once a keyword hash is
 *  lifted out of the slot one of them would have bound. */
const TIME_NEW_DEFAULTS = [undefined, 1, 1, 0, 0, 0, null];

/**
 * The keywords MRI's `Time.new` takes beside its positionals (`time.c`
 * `time_s_init`): `in:` names the zone — the keyword spelling of the older
 * seventh positional — and `precision:` the sub-second digits kept off a
 * STRING argument.
 *
 * @noRailsEquivalent PERMANENT — the trails spelling of Ruby kwargs on a Ruby
 * core method. Rails never defines `::Time`, so there is no Rails counterpart
 * for the keyword bag either.
 */
export interface TimeNewOptions {
  in?: string | number | null;
  precision?: number | null;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby core `::Time`. Rails never defines the
 * class, only reopens it in `core_ext/time/*.rb`, so there is no Rails
 * counterpart for a port to converge on. trails carries only the members a
 * caller duck-types.
 */
/**
 * The seat `Time.#atInstant` fills before entering the constructor, so the
 * instant path skips `obj2ubits`/`validate_vtm` and the `Temporal.PlainDateTime`
 * build for positionals that came off a `Temporal.ZonedDateTime` and are valid
 * by construction — and whose `#instant`/`#utcOffset` the caller overwrote
 * immediately afterwards anyway. A private field can only be installed by the
 * constructor, so the seat is handed in rather than assigned onto a bare object.
 * MRI's `time_new_timew` builds the struct directly; JS private fields admit no
 * such second constructor.
 */
let seatedTime: {
  zoned: Temporal.ZonedDateTime;
  instant: Temporal.Instant;
  timeZoneId: string | null;
} | null = null;

export class Time {
  #plainMemo: Temporal.PlainDateTime | null;
  /**
   * @internal The `Temporal.ZonedDateTime` the instant path was seated with,
   * and which the wall clock and the offset are read off on first use. MRI's
   * `time_new_timew` seats the epoch alone and fills its `struct vtm` lazily,
   * on the first field read (`time.c` `time_get_tm` / `MAKE_TM`); a `Time.now`
   * that only ever names an instant — trails' production clock read — pays for
   * neither.
   */
  #zoned: Temporal.ZonedDateTime | null;
  /**
   * @internal The instant the receiver names. MRI's `::Time` holds the epoch
   * itself (`time.c` `time_new_timew`); a wall clock alone does not name one
   * instant inside a DST fall-back's repeated hour, so the seat is carried
   * here too rather than re-derived from `#plain` on every read.
   */
  #instant: Temporal.Instant;
  /** @internal The receiver's zone, or `null` when it was built from an offset. */
  #timeZoneId: string | null;
  /** @internal Seconds east of UTC — Ruby's `Time#utc_offset`. */
  #utcOffsetMemo: number | null;

  /** @internal The wall clock, derived from {@link #zoned} on first read. */
  get #plain(): Temporal.PlainDateTime {
    return (this.#plainMemo ??= this.#zoned!.toPlainDateTime());
  }

  /** @internal Ruby's `Time#utc_offset`, derived from {@link #zoned} on first read. */
  get #utcOffset(): number {
    return (this.#utcOffsetMemo ??= Number(this.#zoned!.offsetNanoseconds) / 1_000_000_000);
  }

  /**
   * Ruby `Time.now(in: nil)` (`timev.rb` `Time.now`), the current time — in the
   * zone `in:` names, or the local one. MRI takes no `precision:` here:
   * `Time.now(precision: 3)` is `ArgumentError: unknown keyword: :precision`,
   * because the keyword only trims the sub-second a STRING argument spells and
   * `now` takes none.
   */
  static now({ in: inZone = null }: { in?: string | number | null } = {}): Time {
    return Time.#atInstant(Temporal.Now.instant(), inZone);
  }

  /**
   * Ruby `Time.new(year = nil, month = nil, day = nil, hour = nil, min = nil,
   * sec = nil, zone = nil, in: nil, precision: nil)` (`time.c` `time_s_init`):
   * with no arguments it answers the current time in the local zone, and with
   * them it lands on the same seat `Time.local` does. `in:` is the keyword
   * spelling of the seventh positional's zone; both routes reach the
   * constructor's `zone`, and giving both is MRI's `ArgumentError: timezone
   * argument given as positional and keyword arguments`.
   *
   * `precision:` trims the sub-second of the STRING form —
   * `Time.new("2000-12-31 23:59:59.56789", precision: 3)` is
   * `Time.new("2000-12-31 23:59:59.567")` — and MRI applies it to nothing else:
   * `Time.new(2020, 1, 1, 0, 0, 0.56789, precision: 3).nsec` is `567890000`,
   * the untrimmed value. trails does not port the string form yet, so the
   * keyword is taken and, as in MRI without a string, changes nothing. Taking
   * it is what `travel_to`'s `Time.new` stub reads: it forwards to the original
   * method whenever it is handed anything at all (`time_helpers.rb:180-187`),
   * so `Time.new(precision: 3)` answers the real current time, not the
   * travelled one.
   *
   * The keywords are spelled as a trailing object and, as in MRI, may follow
   * any number of positionals — `Time.new({ precision: 3 })`,
   * `Time.new(2020, 1, 1, { in: "+05:00" })` — because `rb_scan_args_kw` lifts
   * the hash out before the positionals bind (see {@link isTimeNewOptions}).
   *
   * The no-argument path reads the clock straight rather than through
   * {@link Time.now}, as `time_s_init` does: `travel_to` stubs both, and going
   * through `Time.now` let its stub answer a `Time.new` call the `Time.new`
   * stub had just forwarded to the original method.
   */
  static new(
    year?: number | string | TimeNewOptions,
    month: number | string | TimeNewOptions | null = 1,
    day: number | string | TimeNewOptions | null = 1,
    hour: number | string | TimeNewOptions | null = 0,
    min: number | string | TimeNewOptions | null = 0,
    sec: number | string | Rational | TimeNewOptions | null = 0,
    zone: string | number | TimeNewOptions | null = null,
    options: TimeNewOptions = {},
  ): Time {
    const given = [year, month, day, hour, min, sec, zone];
    const kwargsAt = given.findIndex(isTimeNewOptions);
    if (kwargsAt !== -1) {
      options = given[kwargsAt] as TimeNewOptions;
      given[kwargsAt] = TIME_NEW_DEFAULTS[kwargsAt];
    }
    [year, month, day, hour, min, sec, zone] = given as [
      typeof year,
      typeof month,
      typeof day,
      typeof hour,
      typeof min,
      typeof sec,
      typeof zone,
    ];
    const { in: inZone = null } = options;
    if (zone != null && inZone != null) {
      throw new ArgumentError("timezone argument given as positional and keyword arguments");
    }
    if (year === undefined) return Time.#atInstant(Temporal.Now.instant(), inZone);
    return new Time(
      year as number | string,
      month as number | string | null,
      day as number | string | null,
      hour as number | string | null,
      min as number | string | null,
      sec as number | string | Rational | null,
      (zone as string | number | null) ?? inZone,
    );
  }

  /**
   * The instant-taking construction path MRI's `time_new_timew` is: the
   * receiver's seat is the epoch, and the wall clock and the `utc_offset` are
   * read OFF it. Building through the public constructor instead would hand
   * the wall clock back to `toZonedDateTime`, whose `compatible`
   * disambiguation picks the earlier offset for the repeated hour after a DST
   * fall-back — so `Time.at(t)` could answer an instant an hour from `t`.
   */
  static #atInstant(instant: Temporal.Instant, zone: string | number | null = null): Time {
    const timeZoneId =
      zone == null ? nowTimeZoneId() : typeof zone === "number" ? of2str(zone) : zone;
    const zoned = instant.toZonedDateTimeISO(timeZoneId);
    seatedTime = { zoned, instant, timeZoneId: typeof zone === "number" ? null : timeZoneId };
    return new Time(0);
  }

  /**
   * Ruby `Time.at(seconds, microseconds_with_frac = 0)` (`time.c`
   * `time_s_at`), which builds a time in the LOCAL zone from the seconds since
   * the Epoch. Both arguments take the Integer, Float or Rational MRI's
   * `num_exact` takes, and the sum is carried exactly and then floored at the
   * nanosecond, MRI's own seat: `Time.at(946684800, 123456.789).nsec` is
   * `123456789`, and `Time.at(-0.5).to_i` is `-1`.
   *
   * A `Time` is taken too — MRI's `time_s_at` reads its `timespec` and answers
   * a Time naming the same instant, in the argument's OWN zone rather than the
   * local one: `Time.at(Time.new(2020, 1, 1, 0, 0, 0, "+05:00")).utc_offset` is
   * `18000` under any `TZ`, and `Time.at(Time.utc(2020, 1, 1)).utc?` is true.
   * A second argument alongside it is a `TypeError` (`num_exact`), not a
   * microsecond, because `time_s_at` reaches `Time` before `num_exact` runs.
   */
  static at(
    seconds: number | bigint | Rational | Time,
    microsecondsWithFrac: number | bigint | Rational = 0,
  ): Time {
    if (seconds instanceof Time) {
      if (microsecondsWithFrac !== 0) {
        throw new TypeError("can't convert Time into an exact number");
      }
      return Time.#atInstant(seconds.#instant, seconds.#timeZoneId ?? seconds.#utcOffset);
    }
    const timew = numExact(seconds)
      .mul(1_000_000_000)
      .add(numExact(microsecondsWithFrac).mul(1_000));
    const nanoseconds =
      timew.numerator / timew.denominator - (timew.numerator % timew.denominator < 0n ? 1n : 0n);
    return Time.#atInstant(Temporal.Instant.fromEpochNanoseconds(nanoseconds));
  }

  /**
   * Ruby `Time.utc(year, month, day, hour = 0, min = 0, sec = 0, usec = 0)`.
   * MRI's seventh positional is the microsecond, not a zone — `Time.utc` names
   * its zone in the method — so it folds into `sec` here. MRI holds the
   * sub-second as a `Rational` (`time.c`, `time_s_mkutc` -> `time_new_timew`),
   * so the fold goes through `Rational` rather than a double, and passing
   * `usec` truncates `sec` to a whole second exactly as MRI's does:
   * `Time.utc(2008, 3, 1, 6, 0, 0.3, 5).nsec` is `5000`.
   */
  static utc(
    year: number | string,
    month: number | string | null = 1,
    day: number | string | null = 1,
    hour: number | string | null = 0,
    min: number | string | null = 0,
    sec: number | string | Rational | null = 0,
    usec?: number,
  ): Time {
    return new Time(
      year,
      month,
      day,
      hour,
      min,
      usec === undefined
        ? sec
        : new Rational(sec instanceof Rational ? sec.toI() : obj2vint(sec ?? 0), 1).add(
            new Rational(Math.round(usec * 1_000), 1_000_000_000),
          ),
      "UTC",
    );
  }

  /**
   * Ruby `Time.mktime(year, month, day, hour = 0, min = 0, sec = 0, usec = 0)`,
   * the `Time.local` alias, which builds in the LOCAL zone. As with
   * {@link Time.utc}, the seventh positional is the microsecond, and passing it
   * truncates `sec` to a whole second.
   */
  static mktime(
    year: number | string,
    month?: number | string | null,
    day?: number | string | null,
    hour?: number | string | null,
    min?: number | string | null,
    sec?: number | string | Rational | null,
    usec?: number,
  ): Time;
  /**
   * MRI's ten-argument form (`time.c` `time_arg`: `if (argc == 10)`), which is
   * the `Time#to_a` splat — `[sec, min, hour, day, month, year, wday, yday,
   * isdst, zone]`, the components in reverse. `wday`, `yday` and `zone` are
   * read as `Qnil` whatever they hold, and `isdst` picks the occurrence of a
   * wall clock a DST fall-back repeats: under `TZ=America/New_York`,
   * `Time.local(0, 30, 1, 2, 11, 2008, nil, nil, true, nil)` is `-0400` and the
   * same call with `false` is `-0500`.
   */
  static mktime(
    sec: number | string | Rational | null,
    min: number | string | null,
    hour: number | string | null,
    day: number | string | null,
    month: number | string | null,
    year: number | string,
    wday: null,
    yday: null,
    isdst: boolean | null,
    zone: null,
  ): Time;
  static mktime(...args: unknown[]): Time {
    if (args.length === 10) {
      const [sec, min, hour, day, month, year, , , isdst] = args as [
        number | string | Rational | null,
        number | string | null,
        number | string | null,
        number | string | null,
        number | string | null,
        number | string,
        null,
        null,
        boolean | null,
        null,
      ];
      return Time.#mktimeIsdst(Time.mktime(year, month, day, hour, min, sec), isdst);
    }
    const [year, month, day, hour, min, sec, usec] = args as [
      number | string,
      (number | string | null)?,
      (number | string | null)?,
      (number | string | null)?,
      (number | string | null)?,
      (number | string | Rational | null)?,
      number?,
    ];
    return new Time(
      year,
      month ?? 1,
      day ?? 1,
      hour ?? 0,
      min ?? 0,
      usec === undefined
        ? (sec ?? 0)
        : new Rational(sec instanceof Rational ? sec.toI() : obj2vint(sec ?? 0), 1).add(
            new Rational(Math.round(usec * 1_000), 1_000_000_000),
          ),
    );
  }

  /**
   * MRI's `isdst` argument (`time.c` `time_arg`, then `find_time_t`'s
   * `!NIL_P(vtm->isdst)` search): a wall clock a DST fall-back repeats names
   * two instants, and `isdst` picks the one whose flag matches. The
   * constructor already seated the later — the `nil` `isdst` reading — so only
   * the earlier occurrence has to be tried.
   */
  static #mktimeIsdst(time: Time, isdst: boolean | null): Time {
    if (isdst == null || time.#timeZoneId == null || time.isdst === isdst) return time;
    const earlier = time.#plain.toZonedDateTime(time.#timeZoneId, { disambiguation: "earlier" });
    const candidate = Time.#atInstant(earlier.toInstant(), time.#timeZoneId);
    return candidate.isdst === isdst ? candidate : time;
  }

  /**
   * Ruby `Time.local`, the singleton `Time.mktime` is aliased to
   * (`time.c`: both names bind `time_s_mktime`), so it takes the same
   * positionals — both forms — and builds in the LOCAL zone too.
   */
  static local(
    year: number | string,
    month?: number | string | null,
    day?: number | string | null,
    hour?: number | string | null,
    min?: number | string | null,
    sec?: number | string | Rational | null,
    usec?: number,
  ): Time;
  static local(
    sec: number | string | Rational | null,
    min: number | string | null,
    hour: number | string | null,
    day: number | string | null,
    month: number | string | null,
    year: number | string,
    wday: null,
    yday: null,
    isdst: boolean | null,
    zone: null,
  ): Time;
  static local(...args: unknown[]): Time {
    return (Time.mktime as (...args: unknown[]) => Time)(...args);
  }

  /**
   * Ruby `Time.new(year, month, day, hour = 0, min = 0, sec = 0, zone = nil)`,
   * which builds a time in the *local* zone unless `zone` gives an offset.
   * `Time.utc` is the UTC entry point, as in Ruby, and `zone` takes the
   * spellings MRI's `utc_offset` argument takes — see `utcOffsetArgument`.
   *
   * `sec` takes the `Rational` MRI's does — the form `datetime_to_time`
   * (`date_core.c:9053-9055`) itself passes as
   * `f_add(INT2FIX(m_sec(dat)), m_sf_in_sec(dat))`.
   *
   * MRI admits a 60th second and, with no leap-second table loaded, rolls it
   * into the next minute: `Time.utc(2015, 6, 30, 23, 59, 60)` is
   * `2015-07-01 00:00:00 UTC` and its `#sec` is `0`. `Temporal` rejects the
   * value outright (`RejectTime`: `0 <= 60 <= 59`), so the roll is spelled here
   * rather than in the slot. A 61st second is `ArgumentError` there and here.
   * Every other positional is range-checked here too, ahead of the
   * `Temporal.PlainDateTime` construction, because `Temporal` raises its own
   * `RangeError` with its own wording where MRI raises `ArgumentError` naming
   * the field (`time.c` `obj2ubits` / `validate_vtm`). MRI's `hour` upper bound
   * is 24, not 23 — `Time.utc(2015, 6, 30, 24)` is `2015-07-01 00:00:00 UTC`,
   * the same roll `sec == 60` takes, and it admits only a zero `min`/`sec`.
   * `mday` is bounded at 31 and nothing narrower: the month's own length is
   * never checked, and `timegmw` normalizes the overflow, so
   * `Time.utc(2015, 2, 29)` is `2015-03-01 00:00:00 UTC` and
   * `Time.utc(2015, 2, 31)` is the 3rd of March. `Temporal.PlainDateTime`
   * rejects both outright, so the day is carried in as `1` and added back.
   *
   * Every positional but the year also takes `nil`, which MRI defaults to the
   * field's own default rather than rejecting (`time.c` `time_utc_or_local`) —
   * so `Time.utc(2004, 6, 24, 16, 24, nil)` is a whole minute, the shape
   * `AcceptsMultiparameterTime` hands it for a form field left blank — and a
   * String, which `obj2vint` / `month_arg` convert.
   *
   * That MRI reading is why `Time#toDatetime`'s `s == 60` fold
   * (`date_core.c:8913-8915`) is unreachable through the constructor on both
   * runtimes; the C carries it for a `right/`-zoneinfo build, which is not a
   * shape trails has.
   */
  constructor(
    year: number | string,
    month: number | string | null = 1,
    day: number | string | null = 1,
    hour: number | string | null = 0,
    min: number | string | null = 0,
    sec: number | string | Rational | null = 0,
    zone: string | number | null = null,
  ) {
    if (seatedTime !== null) {
      const seat = seatedTime;
      seatedTime = null;
      this.#plainMemo = null;
      this.#utcOffsetMemo = null;
      this.#zoned = seat.zoned;
      this.#instant = seat.instant;
      this.#timeZoneId = seat.timeZoneId;
      return;
    }
    year = obj2vint(year);
    month = month == null ? 1 : monthArg(month);
    day = day == null ? 1 : obj2vint(day);
    hour = hour == null ? 0 : obj2vint(hour);
    min = min == null ? 0 : obj2vint(min);
    if (sec == null) sec = 0;
    else if (typeof sec === "string") sec = obj2vint(sec);
    const nsec = subsecNanoseconds(sec);
    const wholeSec = sec instanceof Rational ? sec.div(1) : Math.floor(sec);
    obj2ubits(month, 4);
    obj2ubits(day, 5);
    obj2ubits(hour, 5);
    obj2ubits(min, 6);
    obj2ubits(wholeSec, 6);
    validateVtmRange("mon", month, 1, 12);
    validateVtmRange("mday", day, 1, 31);
    validateVtmRange("hour", hour, 0, 24);
    validateVtmRange("min", min, 0, hour === 24 ? 0 : 59);
    validateVtmRange("sec", wholeSec, 0, hour === 24 ? 0 : 60);
    const plain = new Temporal.PlainDateTime(
      year,
      month,
      1,
      hour === 24 ? 23 : hour,
      min,
      wholeSec === 60 ? 59 : wholeSec,
      Math.floor(nsec / 1_000_000),
      Math.floor(nsec / 1_000) % 1_000,
      nsec % 1_000,
    ).add({ days: day - 1 });
    this.#zoned = null;
    this.#plainMemo =
      hour === 24 ? plain.add({ hours: 1 }) : wholeSec === 60 ? plain.add({ seconds: 1 }) : plain;
    const utcOffset = zone == null ? nowTimeZoneId() : utcOffsetArgument(zone);
    this.#timeZoneId = typeof utcOffset === "number" ? null : utcOffset;
    // A wall clock a DST fall-back repeats names two instants, and MRI's
    // `find_time_t` (`time.c`) settles on the STANDARD-time one when `isdst` is
    // `nil`: under `TZ=America/New_York`, `Time.local(2005, 10, 30, 1, 0, 0)` is
    // `-0500` and its `isdst` is false. `Temporal`'s default `"compatible"`
    // picks the earlier occurrence instead, so the later one is asked for by
    // name. For the "spring forward" gap the two agree — MRI rolls
    // `2005-04-03 02:30` forward to `03:30 -0400`, and so does `"later"`.
    const disambiguation = { disambiguation: "later" } as const;
    this.#utcOffsetMemo =
      typeof utcOffset === "number"
        ? utcOffset
        : Number(this.#plain.toZonedDateTime(utcOffset, disambiguation).offsetNanoseconds) /
          1_000_000_000;
    this.#instant = this.#plain
      .toZonedDateTime(this.#timeZoneId ?? of2str(this.#utcOffset), disambiguation)
      .toInstant();
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

  /** Ruby `Time#mday`, the `day` alias (`time.c` binds both to `time_mday`). */
  get mday(): number {
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

  /** Ruby `Time#nsec` — the fraction of a second, in nanoseconds. */
  get nsec(): number {
    return (
      this.#plain.millisecond * 1_000_000 + this.#plain.microsecond * 1_000 + this.#plain.nanosecond
    );
  }

  /** Ruby `Time#usec` — the fraction of a second, in microseconds. */
  get usec(): number {
    return this.#plain.millisecond * 1_000 + this.#plain.microsecond;
  }

  /**
   * Ruby `Time#subsec` — the fraction of a second. MRI answers a Rational
   * carrying the full precision of the `Float` it was built from; a JS number
   * is the nearest analogue, so this is `nsec` over a billion.
   */
  get subsec(): number {
    return this.nsec / 1_000_000_000;
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
    return tzdataAbbreviation(this.#instant.toZonedDateTimeISO(this.#timeZoneId));
  }

  /** Ruby `Time#utc_offset`, the receiver's offset from UTC in seconds. */
  get utcOffset(): number {
    return this.#utcOffset;
  }

  /** Ruby `Time#gmt_offset`, the `utc_offset` alias. */
  get gmtOffset(): number {
    return this.#utcOffset;
  }

  /**
   * Ruby `Time#isdst` (`ruby/time.c` `time_isdst`), true when the receiver's
   * zone is observing daylight saving. A time built from an offset rather than
   * a zone has no zone to ask, and MRI answers `false` — `Time.new(2008, 7, 1,
   * 0, 0, 0, "-04:00").isdst` is false where the same instant in
   * `America/New_York` is true. The standard offset is the smaller of the
   * zone's January and July offsets, the same reading {@link zone} takes for
   * its abbreviation, so a negative-DST zone falls out the same way.
   */
  get isdst(): boolean {
    if (this.#timeZoneId == null || this.#timeZoneId === "UTC") return false;
    const zoned = this.#instant.toZonedDateTimeISO(this.#timeZoneId);
    const january = Number(zoned.with({ month: 1, day: 1 }).offsetNanoseconds);
    const july = Number(zoned.with({ month: 7, day: 1 }).offsetNanoseconds);
    return Number(zoned.offsetNanoseconds) > Math.min(january, july);
  }

  /** Ruby `Time#dst?`, the `isdst` alias (`ruby/time.c` `time_isdst`). */
  isDst(): boolean {
    return this.isdst;
  }

  /**
   * Ruby `Time#to_time` (ruby/date, `date_core.c` `time_to_time`,
   * `date_core.c:8860-8864`), which answers `self` — MRI's `::Time` value IS
   * the receiver. trails' is `Temporal.ZonedDateTime` (RFC 0088's mapping
   * table), so `self` is converted to it here, keeping the receiver's zone
   * where it has one and its offset where it does not.
   */
  toTime(): Temporal.ZonedDateTime {
    return this.#instant.toZonedDateTimeISO(this.#timeZoneId ?? of2str(this.#utcOffset));
  }

  /**
   * Ruby `Time#to_date` (ruby/date, `date_core.c` `time_to_date`,
   * `date_core.c:8872-8892`), the receiver's civil day: the C builds it under
   * `GREGORIAN` — a `::Time` is proleptic Gregorian, so 1582-10-13 is a real
   * day for it — and then `set_sg(dat, DEFAULT_SG)` puts the reform back, which
   * is why `Time.utc(1582, 10, 13).to_date` reads `1582-10-03`.
   *
   * The C reaches `d_simple_new_internal` directly, so this goes through the
   * same {@link SEAT} that {@link Time#toDatetime} does, and for the same
   * reason: `set_sg(dat, DEFAULT_SG)` (`date_core.c:5787-5800`) is not a field
   * assignment — on the simple arm it runs `get_s_jd(x)` and `clear_civil(x)`
   * *before* storing the new `sg`, so the `HAVE_CIVIL` triple the build wrote
   * is resolved to a day under the `GREGORIAN` the build used and discarded.
   * That eager resolve is `c_civil_to_jd(ry, m, d, GREGORIAN)` (`get_s_jd`,
   * `date_core.c:1168-1187`), which is the call below. Handing the public
   * constructor the triple instead re-derives `nth` through
   * `valid_gregorian_p` / `valid_civil_p` — re-validating a date the C has
   * already established is buildable, which is exactly what the seat exists to
   * skip — and would resolve it under `Date.ITALY`, answering a different day
   * for every date before the reform.
   */
  toDate(): Temporal.PlainDate {
    const y = this.year;
    const m = this.mon;
    const d = this.day;

    const [nth, ry] = decodeYear(y, -1);

    return new Date(SEAT, nth, cCivilToJd(ry, m, d, Date.GREGORIAN), Date.ITALY).toDate();
  }

  /**
   * Ruby `Time#to_datetime` (ruby/date, `date_core.c` `time_to_datetime`,
   * `date_core.c:8901-8935`), the same `GREGORIAN`-then-`set_sg` build as
   * {@link Time#toDate} with the time of day, the sub-second and the receiver's
   * `utc_offset` carried across. A leap second — `sec == 60` — is stored as
   * `59`, which the gem's `DateTime` has no room for. That fold is unreachable
   * from the constructor on MRI too — a `::Time` built without a `right/`
   * zoneinfo rolls the 60th second into the next minute and `#sec` answers `0`
   * (see the constructor) — and is kept for the same reason the C keeps it.
   *
   * The C reaches `d_complex_new_internal` directly, so the whole second, the
   * sub-second `sf` in NANOSECONDS and the offset `of` in SECONDS each land in
   * their own field — and this goes through the same {@link SEAT}, rather than
   * the public constructor, for that reason: that one takes the second and its
   * fraction as one `second` and the offset as a fraction of a day, which is a
   * lossy spelling of what the C hands over exactly.
   *
   * **The `HAVE_CIVIL | HAVE_TIME` the C's flags word names is not observable
   * on the result, and this is why the seat below is the `HAVE_JD | HAVE_DF`
   * one.** `time_to_datetime`'s very next statement is
   * `set_sg(dat, DEFAULT_SG)`, and `set_sg` (`date_core.c:5787-5800`) is not a
   * field assignment: on the complex arm it runs `get_c_jd(x)`, `get_c_df(x)`
   * and `clear_civil(x)` *before* storing the new `sg`. So the civil triple and
   * the time of day the flags word promised are resolved to a day and a
   * day-fraction and then discarded, under the `GREGORIAN` the build used —
   * `c_virtual_sg` still reads it at that point — and never under `DEFAULT_SG`.
   * That eager resolve is exactly `jd_local_to_utc(c_civil_to_jd(ry, m, d,
   * GREGORIAN), time_to_df(h, min, s), of)` and `df_local_to_utc(time_to_df(h,
   * min, s), of)` (`get_c_jd`, `date_core.c:1264-1294`; `get_c_df`,
   * `date_core.c:1208-1225`), which is what the two calls below are. Handing a
   * civil seat the triple and deferring instead would resolve it under
   * `Date.ITALY` on first read and answer a different day for every date before
   * the reform — `Time.utc(1582, 10, 13).to_datetime` is `1582-10-03`, which is
   * the `GREGORIAN` reading, not the `ITALY` one.
   */
  toDatetime(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const y = this.year;
    const m = this.mon;
    const d = this.day;

    const h = this.hour;
    const min = this.min;
    let s = this.sec;
    if (s === 60) s = 59;

    const sf = new Rational(this.nsec, 1);
    const of = this.utcOffset;

    const [nth, ry] = decodeYear(y, -1);

    const jd = cCivilToJd(ry, m, d, Date.GREGORIAN);
    const df = timeToDf(h, min, s);
    return new DateTime(
      SEAT,
      nth,
      jdLocalToUtc(jd, df, of),
      dfLocalToUtc(df, of),
      sf,
      of,
      Date.ITALY,
    ).toDatetime();
  }

  /**
   * `zone` is a getter rather than a value because reading it builds a
   * `Temporal.ZonedDateTime` to find the tzdata abbreviation, and only `%Z`
   * ever asks for it — computing it eagerly made every `Time#strftime` pay for
   * a directive it usually does not carry.
   */
  strftime(format: string): string {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return strftime(
      {
        year: this.year,
        jd: cCivilToJd(this.year, this.mon, this.day),
        nth: 0n,
        gregorianP: true,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        nsec: new Rational(this.nsec, 1),
        get zone(): string {
          return self.zone ?? "";
        },
        utcOffset: this.utcOffset,
      },
      format,
    );
  }

  /**
   * Ruby `Time#utc?` (`ruby/time.c` `time_utc_p`, not vendored — the gem's
   * `lib/time.rb` and `date_core.c` both duck-type it), true for the times
   * `Time.utc` builds. A time built from an offset is not a UTC time even when
   * the offset is zero, which is the distinction `#to_s` and `#xmlschema`
   * print.
   */
  isUtc(): boolean {
    return this.#timeZoneId === "UTC";
  }

  /**
   * Ruby `Time#getutc` (`ruby/time.c` `time_getutc`), the same instant in UTC.
   * `lib/time.rb`'s `httpdate` reaches it as `dup.utc`, an in-place conversion
   * of a copy; trails' `Time` is immutable, so the copy is the answer here.
   */
  getutc(): Time {
    const plain = this.#plain.add({ seconds: -this.#utcOffset });
    return new Time(
      plain.year,
      plain.month,
      plain.day,
      plain.hour,
      plain.minute,
      new Rational(plain.second, 1).add(new Rational(this.nsec, 1_000_000_000)),
      "UTC",
    );
  }

  /**
   * Ruby `Time#getlocal(utc_offset = nil)` (`ruby/time.c` `time_getlocaltime`),
   * the same instant read in the local zone, or at `utc_offset` when one is
   * given — `Time.utc(...).getlocal(0).utc_offset` is `0` and
   * `.getlocal("+05:00")` moves the wall clock five hours east. Like
   * {@link Time#getutc} it answers a copy, because trails' `Time` is immutable.
   *
   * An offset spelling — `"+05:00"`, `"Z"`, a seconds Integer — is read the way
   * the constructor's `utc_offset` is, so the answer carries the offset and no
   * zone, and its `zone` is `nil` as MRI's is. MRI also takes a zone OBJECT
   * here, the one thing a JS string cannot be; a zone identifier stands in for
   * it, and seats the answer in that zone.
   */
  getlocal(utcOffset: number | string | null = null): Time {
    if (typeof utcOffset === "string" && !isZoneIdentifier(utcOffset)) {
      return Time.#atInstant(this.#instant, utcOffsetArgument(utcOffset));
    }
    return Time.#atInstant(this.#instant, utcOffset);
  }

  /**
   * Ruby `Time#to_s` (`ruby/time.c` `time_to_s`), which is `#inspect` without
   * the sub-second: `"%Y-%m-%d %H:%M:%S UTC"` for a UTC time and
   * `"%Y-%m-%d %H:%M:%S %z"` for every other, the C writing the two formats
   * out as separate string literals exactly as this does.
   */
  toS(): string {
    return this.strftime(this.isUtc() ? "%Y-%m-%d %H:%M:%S UTC" : "%Y-%m-%d %H:%M:%S %z");
  }

  /**
   * Ruby `Time#asctime` (`ruby/time.c` `time_asctime`), the `asctime(3)`
   * spelling — a blank-padded day of month, and no zone at all, so a local time
   * and a UTC one print alike.
   */
  asctime(): string {
    return this.strftime("%a %b %e %H:%M:%S %Y");
  }

  /**
   * Ruby `Time#xmlschema(fraction_digits = 0)` (`ruby/lib/time.rb`), the
   * ISO 8601 spelling XML Schema's `dateTime` names: `%FT%T`, then the
   * requested number of sub-second digits, then `Z` for a UTC time or the
   * `%:z` offset for any other.
   */
  xmlschema(fractionDigits = 0): string {
    fractionDigits = Math.trunc(fractionDigits);
    let s = this.strftime("%FT%T");
    if (fractionDigits > 0) {
      s += this.strftime(`.%${fractionDigits}N`);
    }
    return s + (this.isUtc() ? "Z" : this.strftime("%:z"));
  }

  /** Ruby `Time#iso8601` (`ruby/lib/time.rb`, `alias iso8601 xmlschema`). */
  declare iso8601: (fractionDigits?: number) => string;

  /**
   * Ruby `Time#rfc2822` (`ruby/lib/time.rb`), RFC 2822's date-time. A UTC time
   * prints the `-0000` RFC 2822 reserves for "the local zone is unknown", not
   * `+0000`; every other prints its own `%z` offset.
   */
  rfc2822(): string {
    return this.strftime("%a, %d %b %Y %T ") + (this.isUtc() ? "-0000" : this.strftime("%z"));
  }

  /**
   * Ruby `Time#httpdate` (`ruby/lib/time.rb`), RFC 2616's preferred date
   * format: the receiver taken to UTC and printed with the literal `GMT` zone.
   */
  httpdate(): string {
    return this.getutc().strftime("%a, %d %b %Y %T GMT");
  }

  /**
   * ActiveSupport `Time#acts_like_time?`
   * (`active_support/core_ext/time/acts_like.rb:5-8`), the marker Rails hangs on
   * a reopened `::Time` so `Object#acts_like?` finds it with `respond_to?`. This
   * class is trails' `::Time`, so the reopening ports literally here and
   * `Object.actsLike` answers the `:time` arm for it through `respond_to?`,
   * exactly as Ruby does — no predicate arm stands in.
   *
   * @noRailsEquivalent PERMANENT — Rails defines it in activesupport, which
   * cannot reopen this package's class; the marker lives on the class itself
   * instead (RFC 0098, `time-with-zone-residue-structural-blockers`).
   */
  actsLikeTime(): boolean {
    return true;
  }
}

Time.prototype.iso8601 = Time.prototype.xmlschema;
