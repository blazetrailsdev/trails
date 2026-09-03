import { Temporal } from "@js-temporal/polyfill";
import { tzdataIsdst } from "./tzdata-isdst.js";
import {
  ArgumentError,
  Date,
  DateTime,
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
import { Rational, kernelInteger } from "@blazetrails/ruby-compat";

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

  static at(
    seconds: number | bigint | Rational | Time,
    microsecondsWithFrac?: number | bigint | Rational,
  ): Time {
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

  toR(): Rational {
    return new Rational(this.#instant.epochNanoseconds, 1_000_000_000n);
  }

  toTime(): Temporal.ZonedDateTime {
    return this.#instant.toZonedDateTimeISO(this.#timeZoneId ?? of2str(this.#utcOffset));
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

Time.prototype.iso8601 = Time.prototype.xmlschema;
