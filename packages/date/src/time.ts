import { Temporal } from "@js-temporal/polyfill";
import { tzdataIsdst } from "./tzdata-isdst.js";
import {
  ArgumentError,
  Date,
  DateTime,
  SEAT,
  cCivilToJd,
  dNewByFrags,
  dfLocalToUtc,
  decodeYear,
  fToR,
  jdLocalToUtc,
  of2str,
  strftime,
  timeToDf,
} from "./date.js";
import { Rational, kernelInteger, stringInspect } from "@blazetrails/ruby-compat";

let localTimeZoneId: string | null = null;

function nowTimeZoneId(): string {
  return (localTimeZoneId ??= Temporal.Now.timeZoneId());
}

function systemEpochNs(): bigint {
  return BigInt(Math.round((performance.timeOrigin + performance.now()) * 1_000)) * 1_000n;
}

/** @noRailsEquivalent PERMANENT */
export function resetLocalTimeZoneId(): void {
  localTimeZoneId = null;
}

function divmod(a: number, b: number): [number, number] {
  const q = Math.floor(a / b);
  return [q, a - q * b];
}

function isZoneIdentifier(zone: string): boolean {
  return !/^([+-]|[A-IK-Z]$)/.test(zone);
}

function utcOffsetArgument(zone: string | number): "UTC" | number {
  if (typeof zone === "number") {
    if (!Number.isFinite(zone) || Math.abs(zone) >= 86400) {
      throw new ArgumentError("utc_offset out of range");
    }
    return zone;
  }
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
  throw new ArgumentError(
    `"+HH:MM", "-HH:MM", "UTC" or "A".."I","K".."Z" expected for utc_offset: ${zone}`,
  );
}

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

function primaryZoneId(timeZoneId: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timeZoneId }).resolvedOptions().timeZone;
}

let abbreviationsByPrimaryZoneId: Map<string, readonly [string] | readonly [string, string]>;

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

function tzdataAbbreviation(zoned: Temporal.ZonedDateTime): string {
  const abbreviations = zoneAbbreviations(zoned.timeZoneId);
  if (abbreviations !== undefined) {
    if (abbreviations.length === 1) return abbreviations[0];
    return tzdataIsdst(zoned.timeZoneId, Math.floor(zoned.epochMilliseconds / 1000))
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

function subsecNanoseconds(sec: number | Rational): number {
  const fraction = (sec instanceof Rational ? sec : fToR(sec)).mod(1);
  if (fraction.isZero()) return 0;
  return fraction.mul(1_000_000_000).div(1);
}

function numExact(v: unknown): Rational {
  if (v instanceof Rational) return v;
  if (typeof v === "bigint") return new Rational(v, 1);
  if (typeof v !== "number") {
    throw new TypeError(
      `can't convert ${(v as object)?.constructor?.name ?? String(v)} into an exact number`,
    );
  }
  return fToR(v);
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function obj2vint(obj: number | string): number {
  if (typeof obj !== "string") return Math.trunc(obj);
  return kernelInteger(obj, 10);
}

function monthArg(obj: number | string): number {
  if (typeof obj === "string") {
    const index = months.indexOf(obj.trim().toLowerCase());
    if (index !== -1) return index + 1;
  }
  return obj2vint(obj);
}

function obj2ubits(obj: number, bits: number): number {
  const usableMask = (1 << bits) - 1;
  if ((obj & usableMask) !== obj) throw new ArgumentError("argument out of range");
  return obj;
}

function validateVtmRange(mem: string, value: number, b: number, e: number): void {
  if (value < b || value > e) throw new ArgumentError(`${mem} out of range`);
}

function isTimeNewOptions(arg: unknown): arg is TimeNewOptions {
  return typeof arg === "object" && arg !== null && !(arg instanceof Rational);
}

const TIME_NEW_DEFAULTS = [undefined, undefined, 1, 0, 0, 0, null];

function rest(str: string, ptr: number): string {
  return str.slice(ptr, ptr + 11);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function parseFixedDigits(str: string, ptr: number, n: number): number | null {
  for (let i = 0; i < n; i++) if (!isDigit(str[ptr + i])) return null;
  return Number(str.slice(ptr, ptr + n));
}

function timeInitParse(
  str: string,
  precision: number,
): [number, number, number, number, number, number | Rational, string | null] {
  const end = str.length;
  let ptr = 0;
  const sign = str[ptr] === "-" || str[ptr] === "+" ? str[ptr++] : "";
  let digits = 0;
  while (isDigit(str[ptr + digits])) digits++;
  if (digits === 0) throw new ArgumentError(`can't parse: ${JSON.stringify(str)}`);
  if (digits < 4) {
    throw new ArgumentError(`year must be 4 or more digits: ${str.slice(ptr, ptr + digits)}`);
  }
  const year = Number(`${sign}${str.slice(ptr, ptr + digits)}`);
  ptr += digits;
  let mon = -1;
  let mday = -1;
  let hour = 0;
  let min = 0;
  let sec: number | Rational = 0;
  if (str[ptr] === "-") {
    const dash = ptr++;
    const parsed = parseFixedDigits(str, ptr, 2);
    if (parsed === null) {
      throw new ArgumentError(`two digits mon is expected after \`-': ${rest(str, dash)}`);
    }
    mon = parsed;
    ptr += 2;
    if (str[ptr] === "-") {
      const mdayDash = ptr++;
      const parsedMday = parseFixedDigits(str, ptr, 2);
      if (parsedMday === null) {
        throw new ArgumentError(`two digits mday is expected after \`-': ${rest(str, mdayDash)}`);
      }
      mday = parsedMday;
      ptr += 2;
    }
  }
  let zone: string | null = null;
  if (ptr === end) {
    if (mon !== -1) throw new ArgumentError("no time information");
  } else {
    const sep = ptr;
    if (str[ptr] === "T") ptr++;
    else while (str[ptr] === " ") ptr++;
    if (ptr === end) {
      if (str[sep] !== "T") throw new ArgumentError(`can't parse: ${JSON.stringify(str)}`);
    } else if (isDigit(str[ptr])) {
      const timeStart = ptr;
      const parsedHour = parseFixedDigits(str, ptr, 2);
      if (parsedHour === null) {
        throw new ArgumentError(`two digits hour is expected: ${rest(str, sep)}`);
      }
      hour = parsedHour;
      ptr += 2;
      if (str[ptr] !== ":") {
        throw new ArgumentError(`missing min part: ${str.slice(timeStart, timeStart + 10)}`);
      }
      let colon = ptr++;
      const parsedMin = parseFixedDigits(str, ptr, 2);
      if (parsedMin === null) {
        throw new ArgumentError(`two digits min is expected after \`:': ${rest(str, colon)}`);
      }
      min = parsedMin;
      ptr += 2;
      if (str[ptr] !== ":") {
        throw new ArgumentError(`missing sec part: ${str.slice(timeStart, timeStart + 10)}`);
      }
      colon = ptr++;
      const parsedSec = parseFixedDigits(str, ptr, 2);
      if (parsedSec === null) {
        throw new ArgumentError(`two digits sec is expected after \`:': ${rest(str, colon)}`);
      }
      sec = parsedSec;
      ptr += 2;
      if (str[ptr] === ".") {
        ptr++;
        let fracDigits = 0;
        while (isDigit(str[ptr + fracDigits])) fracDigits++;
        const parsedFrac = str.slice(ptr, ptr + fracDigits);
        const frac = precision < 0 ? parsedFrac : parsedFrac.slice(0, precision);
        ptr += fracDigits;
        if (frac.length === 0) {
          throw new ArgumentError(
            `subsecond expected after dot: ${str.slice(timeStart, Math.min(ptr, timeStart + 10))}`,
          );
        }
        sec = new Rational(parsedSec, 1).add(new Rational(Number(frac), 10 ** frac.length));
      }
      while (str[ptr] === " ") ptr++;
    }
    if (ptr < end) zone = str.slice(ptr);
  }
  return [year, mon === -1 ? 1 : mon, mday === -1 ? 1 : mday, hour, min, sec, zone];
}

/** @noRailsEquivalent PERMANENT */
export interface TimeNewOptions {
  in?: string | number | null;
  precision?: number | null;
}

/** @noRailsEquivalent PERMANENT */
let seatedTime: {
  zoned: Temporal.ZonedDateTime;
  instant: Temporal.Instant;
  timeZoneId: string | null;
  tzmodeUtc: boolean;
} | null = null;

/** @noRailsEquivalent PERMANENT */
class SubMinuteOffsetZonedDateTime extends Temporal.ZonedDateTime {
  #exactEpochNanoseconds: bigint;

  constructor(instant: Temporal.Instant, utcOffset: number) {
    const truncated = Math.sign(utcOffset) * Math.floor(Math.abs(utcOffset) / 60) * 60 || 0;
    super(
      instant.epochNanoseconds + BigInt(Math.round((utcOffset - truncated) * 1_000_000_000)),
      of2str(utcOffset),
    );
    this.#exactEpochNanoseconds = instant.epochNanoseconds;
    Object.defineProperty(this, "epochNanoseconds", {
      value: instant.epochNanoseconds,
      configurable: true,
    });
    Object.defineProperty(this, "epochMilliseconds", {
      value: instant.epochMilliseconds,
      configurable: true,
    });
  }

  override toInstant(): Temporal.Instant {
    return Temporal.Instant.fromEpochNanoseconds(this.#exactEpochNanoseconds);
  }

  override withTimeZone(timeZone: Temporal.TimeZoneLike): Temporal.ZonedDateTime {
    return this.toInstant().toZonedDateTimeISO(timeZone as Temporal.TimeZoneLike & string);
  }
}

export class Time {
  #plainMemo: Temporal.PlainDateTime | null;
  /** @internal */
  #zoned: Temporal.ZonedDateTime | null;
  /** @internal */
  #instant: Temporal.Instant;
  /** @internal */
  #timeZoneId: string | null;
  /** @internal */
  #tzmodeUtc: boolean;
  /** @internal */
  #utcOffsetMemo: number | null;

  /** @internal */
  get #plain(): Temporal.PlainDateTime {
    return (this.#plainMemo ??= this.#zoned!.toPlainDateTime());
  }

  /** @internal */
  get #utcOffset(): number {
    return (this.#utcOffsetMemo ??= Number(this.#zoned!.offsetNanoseconds) / 1_000_000_000);
  }

  static now({ in: inZone = null }: { in?: string | number | null } = {}): Time {
    return Time.#atInstant(Temporal.Instant.fromEpochNanoseconds(systemEpochNs()), inZone);
  }

  static new(
    year?: number | string | TimeNewOptions,
    month: number | string | TimeNewOptions | null | undefined = undefined,
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
    if (year === undefined)
      return Time.#atInstant(Temporal.Instant.fromEpochNanoseconds(systemEpochNs()), inZone);
    if (typeof year === "string" && month === undefined) {
      const [y, mon, mday, hour, min, sec, zoneStr] = timeInitParse(year, options.precision ?? 9);
      return new Time(y, mon, mday, hour, min, sec, zoneStr ?? inZone);
    }
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

  static #atInstant(
    instant: Temporal.Instant,
    zone: string | number | null = null,
    tzmodeUtc?: boolean,
  ): Time {
    const timeZoneId =
      zone == null ? nowTimeZoneId() : typeof zone === "number" ? of2str(zone) : zone;
    const zoned = instant.toZonedDateTimeISO(timeZoneId);
    seatedTime = {
      zoned,
      instant,
      timeZoneId: typeof zone === "number" ? null : timeZoneId,
      tzmodeUtc: tzmodeUtc ?? (zone != null && zoned.timeZoneId === "UTC"),
    };
    return new Time(0);
  }

  static at(seconds: unknown, microsecondsWithFrac?: unknown): Time {
    if (seconds instanceof Time) {
      if (microsecondsWithFrac !== undefined) {
        throw new TypeError("can't convert Time into an exact number");
      }
      return Time.#atInstant(
        seconds.#instant,
        seconds.#timeZoneId ?? seconds.#utcOffset,
        seconds.#tzmodeUtc,
      );
    }
    const timew = numExact(seconds)
      .mul(1_000_000_000)
      .add(numExact(microsecondsWithFrac ?? 0).mul(1_000));
    const nanoseconds =
      timew.numerator / timew.denominator - (timew.numerator % timew.denominator < 0n ? 1n : 0n);
    return Time.#atInstant(Temporal.Instant.fromEpochNanoseconds(nanoseconds));
  }

  static utc(
    year: number | string,
    month: number | string | null = 1,
    day: number | string | null = 1,
    hour: number | string | null = 0,
    min: number | string | null = 0,
    sec: number | string | Rational | null = 0,
    usec?: number | Rational,
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
            numExact(usec).quo(1_000_000),
          ),
      "UTC",
    );
  }

  static mktime(
    ...args:
      | [
          year: number | string,
          month?: number | string | null,
          day?: number | string | null,
          hour?: number | string | null,
          min?: number | string | null,
          sec?: number | string | Rational | null,
          usec?: number | Rational,
        ]
      | [
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
        ]
  ): Time {
    if (args.length === 10) {
      const [sec, min, hour, day, month, year, , , isdst] = args;
      return Time.#mktimeIsdst(Time.mktime(year, month, day, hour, min, sec), isdst);
    }
    const [year, month, day, hour, min, sec, usec] = args;
    return new Time(
      year,
      month ?? 1,
      day ?? 1,
      hour ?? 0,
      min ?? 0,
      usec === undefined
        ? (sec ?? 0)
        : new Rational(sec instanceof Rational ? sec.toI() : obj2vint(sec ?? 0), 1).add(
            numExact(usec).quo(1_000_000),
          ),
    );
  }

  static #mktimeIsdst(time: Time, isdst: boolean | null): Time {
    if (isdst == null || time.#timeZoneId == null || time.isdst === isdst) return time;
    const earlier = time.#plain.toZonedDateTime(time.#timeZoneId, { disambiguation: "earlier" });
    const candidate = Time.#atInstant(earlier.toInstant(), time.#timeZoneId, time.#tzmodeUtc);
    return candidate.isdst === isdst ? candidate : time;
  }

  static local(...args: Parameters<typeof Time.mktime>): Time {
    return Time.mktime(...args);
  }

  /**
   * `vendor/ruby/lib/time.rb:39-54` — a hash of timezones mapped to hour
   * differences from UTC, the set RFC 2822 and ISO 8601 specify.
   */
  static readonly ZoneOffset: Record<string, number> = {
    UTC: 0,
    Z: 0,
    UT: 0,
    GMT: 0,
    EST: -5,
    EDT: -4,
    CST: -6,
    CDT: -5,
    MST: -7,
    MDT: -6,
    PST: -8,
    PDT: -7,
    A: +1,
    B: +2,
    C: +3,
    D: +4,
    E: +5,
    F: +6,
    G: +7,
    H: +8,
    I: +9,
    K: +10,
    L: +11,
    M: +12,
    N: -1,
    O: -2,
    P: -3,
    Q: -4,
    R: -5,
    S: -6,
    T: -7,
    U: -8,
    V: -9,
    W: -10,
    X: -11,
    Y: -12,
  };

  /**
   * `vendor/ruby/lib/time.rb:81-96` — the number of seconds the specified time
   * zone differs from UTC, or `nil` when the offset cannot be determined.
   */
  static zoneOffset(zone: string, year: number = Time.now().year): number | null {
    let off: number | null = null;
    let t: Time | undefined;
    zone = zone.toUpperCase();
    const m = /^([+-])(\d\d)(:?)(\d\d)(?:\3(\d\d))?$/.exec(zone);
    if (m) {
      off =
        (m[1] === "-" ? -1 : 1) *
        ((Number(m[2]) * 60 + Number(m[4])) * 60 + (m[5] === undefined ? 0 : Number(m[5])));
    } else if (/^[+-]\d\d$/.test(zone)) {
      off = parseInt(zone, 10) * 3600;
    } else if (zone in Time.ZoneOffset) {
      off = Time.ZoneOffset[zone] * 3600;
    } else if (
      (() => {
        try {
          return (t = Time.local(year, 1, 1)).zone!.toUpperCase() === zone;
        } catch {
          return false;
        }
      })()
    ) {
      off = t!.utcOffset;
    } else if (
      (() => {
        try {
          return (t = Time.local(year, 7, 1)).zone!.toUpperCase() === zone;
        } catch {
          return false;
        }
      })()
    ) {
      off = t!.utcOffset;
    }
    return off;
  }

  /** `vendor/ruby/lib/time.rb:98-121` */
  static #isZoneUtc(zone: string): boolean {
    return /^(?:-00:00|-0000|-00|UTC|Z|UT)$/i.test(zone);
  }

  /** `vendor/ruby/lib/time.rb:124-140` */
  static #forceZone(t: Time, zone: string, offset: number | null = null): Time {
    if (Time.#isZoneUtc(zone)) {
      return t.getutc();
    } else if ((offset ??= Time.zoneOffset(zone)) != null) {
      t = t.getlocal();
      if (t.utcOffset !== offset) {
        t = t.getlocal(offset);
      }
      return t;
    } else {
      return t.getlocal();
    }
  }

  /** `vendor/ruby/lib/time.rb:142` */
  static readonly #LeapYearMonthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  /** `vendor/ruby/lib/time.rb:143` */
  static readonly #CommonYearMonthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /** `vendor/ruby/lib/time.rb:144-150` */
  static #monthDays(y: number, m: number): number {
    if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) {
      return Time.#LeapYearMonthDays[m - 1];
    } else {
      return Time.#CommonYearMonthDays[m - 1];
    }
  }

  /** `vendor/ruby/lib/time.rb:153-193` */
  static #applyOffset(
    year: number,
    mon: number,
    day: number,
    hour: number,
    min: number,
    sec: number,
    off: number,
  ): [number, number, number, number, number, number] {
    let o: number;
    if (off < 0) {
      off = -off;
      [off, o] = divmod(off, 60);
      if (o !== 0) {
        sec += o;
        [o, sec] = divmod(sec, 60);
        off += o;
      }
      [off, o] = divmod(off, 60);
      if (o !== 0) {
        min += o;
        [o, min] = divmod(min, 60);
        off += o;
      }
      [off, o] = divmod(off, 24);
      if (o !== 0) {
        hour += o;
        [o, hour] = divmod(hour, 24);
        off += o;
      }
      if (off !== 0) {
        day += off;
        const days = Time.#monthDays(year, mon);
        if (days < day) {
          mon += 1;
          if (12 < mon) {
            mon = 1;
            year += 1;
          }
          day = 1;
        }
      }
    } else if (0 < off) {
      [off, o] = divmod(off, 60);
      if (o !== 0) {
        sec -= o;
        [o, sec] = divmod(sec, 60);
        off -= o;
      }
      [off, o] = divmod(off, 60);
      if (o !== 0) {
        min -= o;
        [o, min] = divmod(min, 60);
        off -= o;
      }
      [off, o] = divmod(off, 24);
      if (o !== 0) {
        hour -= o;
        [o, hour] = divmod(hour, 24);
        off -= o;
      }
      if (off !== 0) {
        day -= off;
        if (day < 1) {
          mon -= 1;
          if (mon < 1) {
            year -= 1;
            mon = 12;
          }
          day = Time.#monthDays(year, mon);
        }
      }
    }
    return [year, mon, day, hour, min, sec];
  }

  /**
   * `vendor/ruby/lib/time.rb:195-272`. Ruby's `now.respond_to?(:getlocal)`
   * guard admits any object answering `#mon`/`#day`/`#year`; `now` is typed
   * `Time` here, so the guard is statically true and the branch it protects is
   * the only one reachable. `offYear` is likewise `nil` in Ruby only when
   * `year` and `now` are both absent, where `month_days(nil, mon)` raises; JS
   * arithmetic on `undefined` cannot raise, so that arm skips its day
   * correction instead of failing.
   */
  static #makeTime(
    date: string,
    year: number | undefined,
    yday: number | undefined,
    mon: number | undefined,
    day: number | undefined,
    hour: number | undefined,
    min: number | undefined,
    sec: number | undefined,
    secFraction: Rational | undefined,
    zone: string | undefined,
    now: Time | null,
  ): Time {
    if (
      year == null &&
      yday == null &&
      mon == null &&
      day == null &&
      hour == null &&
      min == null &&
      sec == null &&
      secFraction == null
    ) {
      throw new ArgumentError(`no time information in ${stringInspect(date)}`);
    }

    let off: number | null = null;
    let offYear: number | undefined;
    if (year != null || now != null) {
      offYear = year ?? now!.year;
      if (zone != null) off = Time.zoneOffset(zone, offYear);
    }

    if (yday != null) {
      if (!(1 <= yday && yday <= 366)) {
        throw new ArgumentError(`yday ${yday} out of range`);
      }
      [mon, day] = divmod(yday - 1, 31);
      mon += 1;
      day += 1;
      const t = Time.#makeTime(
        date,
        year,
        undefined,
        mon,
        day,
        hour,
        min,
        sec,
        secFraction,
        zone,
        now,
      );
      const diff = yday - t.yday;
      if (diff === 0) return t;
      day += diff;
      let mday: number;
      if (day > 28 && day > (mday = Time.#monthDays(offYear!, mon))) {
        if ((mon += 1) > 12) {
          throw new ArgumentError(`yday ${yday} out of range`);
        }
        day -= mday;
      }
      return Time.#makeTime(
        date,
        year,
        undefined,
        mon,
        day,
        hour,
        min,
        sec,
        secFraction,
        zone,
        now,
      );
    }

    if (now != null) {
      if (off != null) {
        if (now.utcOffset !== off) now = now.getlocal(off);
      } else {
        now = now.getlocal();
      }
    }

    let usec: number | Rational | undefined;
    if (secFraction != null) usec = secFraction.mul(1_000_000);

    if (now != null) {
      fill: {
        if (year != null) break fill;
        year = now.year;
        if (mon != null) break fill;
        mon = now.mon;
        if (day != null) break fill;
        day = now.day;
        if (hour != null) break fill;
        hour = now.hour;
        if (min != null) break fill;
        min = now.min;
        if (sec != null) break fill;
        sec = now.sec;
        if (secFraction != null) break fill;
        usec = now.usec;
      }
    }

    year ??= 1970;
    mon ??= 1;
    day ??= 1;
    hour ??= 0;
    min ??= 0;
    sec ??= 0;
    usec ??= 0;

    if (year !== offYear) {
      off = null;
      if (zone != null) off = Time.zoneOffset(zone, year);
    }

    if (off != null) {
      [year, mon, day, hour, min, sec] = Time.#applyOffset(year, mon, day, hour, min, sec, off);
      const t = Time.utc(year, mon, day, hour, min, sec, usec);
      return Time.#forceZone(t, zone!, off);
    } else {
      return Time.local(year, mon, day, hour, min, sec, usec);
    }
  }

  /**
   * `vendor/ruby/lib/time.rb:381-387` — takes a string representation of a
   * Time and attempts to parse it using a heuristic. Missing pieces of the
   * date are inferred from `now`. Ruby's `block_given?` is the trailing
   * `block` parameter, so `comp` is `!block_given?` as in Ruby.
   */
  static parse(
    date: string,
    now: Time | null = Time.now(),
    block?: (year: number) => number,
  ): Time {
    const comp = block === undefined;
    const d = Date._parse(date, comp);
    let year = d.year === undefined ? undefined : Number(d.year);
    if (year != null && !comp) year = block(year);
    return Time.#makeTime(
      date,
      year,
      d.yday,
      d.mon,
      d.mday,
      d.hour,
      d.min,
      d.sec,
      d.secFraction === undefined ? undefined : numExact(d.secFraction),
      d.zone,
      now,
    );
  }

  /**
   * `vendor/ruby/lib/time.rb:456-506` — parses `date` according to `format`.
   * Ruby's `block_given?` is the trailing `block` parameter. Ruby's
   * `Date.strptime(date, format)` is spelled `dNewByFrags(Date._strptime(date,
   * format))` — RFC 0088's opt-in seam onto the gem-shaped `Date` — because
   * `Date.strptime` answers a `Temporal.PlainDate`, from which neither
   * `Date#to_time` nor `Date#yday` is reachable. `Date#to_time` answers a
   * `Temporal.ZonedDateTime` — RFC 0088's mapping for a `::Time` value — while
   * this method answers a `Time`, so the `to_time` arm re-seats that value on
   * its own instant rather than reading a wall clock back off it.
   */
  static strptime(
    date: string,
    format: string,
    now: Time | null = Time.now(),
    block?: (year: number) => number,
  ): Time {
    const d = Date._strptime(date, format);
    if (d == null) {
      throw new ArgumentError(`invalid date or strptime format - \`${date}' \`${format}'`);
    }
    let t: Time;
    const seconds = d.seconds;
    if (seconds != null) {
      let usec: number | Rational;
      const secFraction = d.secFraction;
      if (secFraction != null) {
        usec = numExact(secFraction).mul(1000000);
        if (numExact(seconds).cmp(0) < 0) usec = usec.mul(-1);
      } else {
        usec = 0;
      }
      t = Time.at(seconds, usec);
      const zone = d.zone;
      if (zone != null) {
        t = Time.#forceZone(t, zone);
      }
    } else {
      let year = d.year === undefined ? undefined : Number(d.year);
      if (year != null && block !== undefined) year = block(year);
      let yday = d.yday;
      if (
        (d.cwyear != null && year == null) ||
        ((d.cwday != null || d.cweek != null) && !(d.mon != null && d.mday != null))
      ) {
        return Time.#atInstant(dNewByFrags(Date._strptime(date, format)).toTime().toInstant());
      }
      if (
        (d.wnum0 != null || d.wnum1 != null) &&
        yday == null &&
        !(d.mon != null && d.mday != null)
      ) {
        yday = dNewByFrags(Date._strptime(date, format)).yday;
      }
      t = Time.#makeTime(
        date,
        year,
        yday,
        d.mon,
        d.mday,
        d.hour,
        d.min,
        d.sec,
        d.secFraction === undefined ? undefined : numExact(d.secFraction),
        d.zone,
        now,
      );
    }
    return t;
  }

  /** `vendor/ruby/lib/time.rb:485-488` */
  static readonly MonthValue: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  /**
   * `vendor/ruby/lib/time.rb:508-563` — parses `date` as a date-time defined by
   * RFC 2822 and converts it to a Time object. Aliased as `rfc822`.
   */
  static rfc2822(date: string): Time {
    const m =
      /^\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*,\s*)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,})\s+(\d{2})\s*:\s*(\d{2})(?:\s*:\s*(\d\d))?\s+([+-]\d{4}|UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[A-IK-Z])/i.exec(
        date,
      );
    if (m != null) {
      let day = Number(m[1]);
      let mon = Time.MonthValue[m[2].toUpperCase()];
      let year = Number(m[3]);
      const shortYearP = m[3].length <= 3;
      let hour = Number(m[4]);
      let min = Number(m[5]);
      let sec = m[6] ? Number(m[6]) : 0;
      const zone = m[7];

      if (shortYearP) {
        year = year < 50 ? 2000 + year : 1900 + year;
      }

      const off = Time.zoneOffset(zone);
      [year, mon, day, hour, min, sec] = Time.#applyOffset(year, mon, day, hour, min, sec, off!);
      const t = Time.utc(year, mon, day, hour, min, sec);
      return Time.#forceZone(t, zone, off);
    } else {
      throw new ArgumentError(`not RFC 2822 compliant date: ${stringInspect(date)}`);
    }
  }

  /** `vendor/ruby/lib/time.rb:564` */
  declare static rfc822: (date: string) => Time;

  /**
   * `vendor/ruby/lib/time.rb:566-598` — parses `date` as an HTTP-date defined
   * by RFC 2616 and converts it to a Time object.
   */
  static httpdate(date: string): Time {
    let m: RegExpExecArray | null;
    if (
      /^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT\s*$/i.test(
        date,
      )
    ) {
      return Time.rfc2822(date).getutc();
    } else if (
      (m =
        /^\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) (\d\d):(\d\d):(\d\d) GMT\s*$/i.exec(
          date,
        )) != null
    ) {
      let year = Number(m[3]);
      if (year < 50) {
        year += 2000;
      } else {
        year += 1900;
      }
      return Time.utc(year, m[2], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
    } else if (
      (m =
        /^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d\d| \d) (\d\d):(\d\d):(\d\d) (\d{4})\s*$/i.exec(
          date,
        )) != null
    ) {
      return Time.utc(
        Number(m[6]),
        Time.MonthValue[m[1].toUpperCase()],
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
      );
    } else {
      throw new ArgumentError(`not RFC 2616 compliant date: ${stringInspect(date)}`);
    }
  }

  /**
   * `vendor/ruby/lib/time.rb:620-653` — parses `time` as a dateTime defined by
   * the XML Schema and converts it to a Time object. Aliased as `iso8601`.
   */
  static xmlschema(time: string): Time {
    const m =
      /^\s*(-?\d+)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(Z|[+-]\d\d(?::?\d\d)?)?\s*$/i.exec(
        time,
      );
    if (m != null) {
      let year = Number(m[1]);
      let mon = Number(m[2]);
      let day = Number(m[3]);
      let hour = Number(m[4]);
      let min = Number(m[5]);
      let sec = Number(m[6]);
      let usec: number | Rational = 0;
      if (m[7] != null) {
        const digits = m[7].slice(1);
        usec = new Rational(BigInt(digits), 10n ** BigInt(digits.length)).mul(1000000);
      }
      if (m[8] != null) {
        const zone = m[8];
        const off = Time.zoneOffset(zone);
        [year, mon, day, hour, min, sec] = Time.#applyOffset(year, mon, day, hour, min, sec, off!);
        const t = Time.utc(year, mon, day, hour, min, sec, usec);
        return Time.#forceZone(t, zone, off);
      } else {
        return Time.local(year, mon, day, hour, min, sec, usec);
      }
    } else {
      throw new ArgumentError(`invalid xmlschema format: ${stringInspect(time)}`);
    }
  }

  /** `vendor/ruby/lib/time.rb:653` */
  declare static iso8601: (time: string) => Time;

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
      this.#tzmodeUtc = seat.tzmodeUtc;
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
    this.#tzmodeUtc = zone != null && this.#timeZoneId === "UTC";
    const disambiguation = { disambiguation: "later" } as const;
    this.#utcOffsetMemo =
      typeof utcOffset === "number"
        ? utcOffset
        : Number(this.#plain.toZonedDateTime(utcOffset, disambiguation).offsetNanoseconds) /
          1_000_000_000;
    this.#instant =
      this.#timeZoneId == null
        ? this.#plain
            .toZonedDateTime("UTC")
            .toInstant()
            .subtract({ nanoseconds: Math.round(this.#utcOffset * 1_000_000_000) })
        : this.#plain.toZonedDateTime(this.#timeZoneId, disambiguation).toInstant();
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

  get mday(): number {
    return this.#plain.day;
  }

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

  get nsec(): number {
    return (
      this.#plain.millisecond * 1_000_000 + this.#plain.microsecond * 1_000 + this.#plain.nanosecond
    );
  }

  get usec(): number {
    return this.#plain.millisecond * 1_000 + this.#plain.microsecond;
  }

  get subsec(): number {
    return this.nsec / 1_000_000_000;
  }

  get yday(): number {
    return this.#plain.dayOfYear;
  }

  get zone(): string | null {
    if (this.#timeZoneId == null) return null;
    return tzdataAbbreviation(this.#instant.toZonedDateTimeISO(this.#timeZoneId));
  }

  get utcOffset(): number {
    return this.#utcOffset;
  }

  get gmtOffset(): number {
    return this.#utcOffset;
  }

  get isdst(): boolean {
    if (this.#timeZoneId == null || this.#timeZoneId === "UTC") return false;
    return tzdataIsdst(this.#timeZoneId, Math.floor(this.#instant.epochMilliseconds / 1000));
  }

  isDst(): boolean {
    return this.isdst;
  }

  toI(): number {
    const nanoseconds = this.#instant.epochNanoseconds;
    const seconds = nanoseconds / 1_000_000_000n - (nanoseconds % 1_000_000_000n < 0n ? 1n : 0n);
    return Number(seconds);
  }

  toF(): number {
    return this.toR().toF();
  }

  toR(): Rational {
    return new Rational(this.#instant.epochNanoseconds, 1_000_000_000n);
  }

  toTime(): Temporal.ZonedDateTime {
    if (this.#timeZoneId != null) return this.#instant.toZonedDateTimeISO(this.#timeZoneId);
    const utcOffset = this.#utcOffset;
    if (utcOffset % 60 !== 0) return new SubMinuteOffsetZonedDateTime(this.#instant, utcOffset);
    return this.#instant.toZonedDateTimeISO(of2str(utcOffset));
  }

  toDate(): Temporal.PlainDate {
    const y = this.year;
    const m = this.mon;
    const d = this.day;

    const [nth, ry] = decodeYear(y, -1);

    return new Date(SEAT, nth, cCivilToJd(ry, m, d, Date.GREGORIAN), Date.ITALY).toDate();
  }

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

  compare(other: unknown): number | null {
    if (!(other instanceof Time)) return null;
    const n = this.#instant.epochNanoseconds - other.#instant.epochNanoseconds;
    if (n === 0n) return 0;
    return n > 0n ? 1 : -1;
  }

  eql(other: unknown): boolean {
    if (!(other instanceof Time)) return false;
    return this.#instant.epochNanoseconds === other.#instant.epochNanoseconds;
  }

  isUtc(): boolean {
    return this.#tzmodeUtc;
  }

  plus(offset: number | bigint | Rational | Time): Time {
    if (offset instanceof Time) {
      throw new TypeError("time + time?");
    }
    return this.#timeAdd(offset, 1);
  }

  minus(offset: number | bigint | Rational | Time): Time | number {
    if (offset instanceof Time) {
      return (
        Number(this.#instant.epochNanoseconds - offset.#instant.epochNanoseconds) / 1_000_000_000
      );
    }
    return this.#timeAdd(offset, -1);
  }

  #timeAdd(offset: number | bigint | Rational, sign: 1 | -1): Time {
    const timew = numExact(offset).mul(1_000_000_000 * sign);
    const nanoseconds =
      timew.numerator / timew.denominator - (timew.numerator % timew.denominator < 0n ? 1n : 0n);
    return Time.#atInstant(
      Temporal.Instant.fromEpochNanoseconds(this.#instant.epochNanoseconds + nanoseconds),
      this.#timeZoneId ?? this.#utcOffset,
    );
  }

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

  getlocal(utcOffset: number | string | null = null): Time {
    if (typeof utcOffset === "string" && !isZoneIdentifier(utcOffset)) {
      return Time.#atInstant(this.#instant, utcOffsetArgument(utcOffset));
    }
    return Time.#atInstant(this.#instant, utcOffset);
  }

  toS(): string {
    return this.strftime(this.isUtc() ? "%Y-%m-%d %H:%M:%S UTC" : "%Y-%m-%d %H:%M:%S %z");
  }

  asctime(): string {
    return this.strftime("%a %b %e %H:%M:%S %Y");
  }

  xmlschema(fractionDigits = 0): string {
    fractionDigits = Math.trunc(fractionDigits);
    let s = this.strftime("%FT%T");
    if (fractionDigits > 0) {
      s += this.strftime(`.%${fractionDigits}N`);
    }
    return s + (this.isUtc() ? "Z" : this.strftime("%:z"));
  }

  declare iso8601: (fractionDigits?: number) => string;

  rfc2822(): string {
    return this.strftime("%a, %d %b %Y %T ") + (this.isUtc() ? "-0000" : this.strftime("%z"));
  }

  httpdate(): string {
    return this.getutc().strftime("%a, %d %b %Y %T GMT");
  }

  /** @noRailsEquivalent PERMANENT */
  actsLikeTime(): boolean {
    return true;
  }
}

Time.rfc822 = Time.rfc2822;
Time.iso8601 = Time.xmlschema;
Time.prototype.iso8601 = Time.prototype.xmlschema;
