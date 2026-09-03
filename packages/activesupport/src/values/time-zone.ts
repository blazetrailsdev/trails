/**
 * ActiveSupport::TimeZone — mirrors the Rails API.
 *
 * Uses the built-in Intl API for timezone data, wrapping IANA timezone names.
 *
 * @boundary-file: `Intl.DateTimeFormat#formatToParts` requires a JS `Date`
 *   input, so this file traffics in `Date` for offset/abbrev/DST lookups and
 *   for the `local`-to-UTC ambiguity search. The Temporal-aware public surface
 *   lives on `TimeWithZone`; this module is its calculation backend.
 */

import { TimeWithZone } from "../time-with-zone.js";
import { Duration } from "../duration.js";
import { ArgumentError } from "../hash-utils.js";
import { Temporal, Date as RubyDate, Time, tzdataIsdst } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import type { DateParts } from "@blazetrails/date";
import { instantFrom } from "../temporal.js";
import { currentTime } from "../time-travel.js";
import { utcToLocalReturnsUtcOffsetTimes } from "../core-ext/date-and-time/compatibility.js";

const MAPPING: Record<string, string> = {
  "International Date Line West": "Etc/GMT+12",
  "Midway Island": "Pacific/Midway",
  "American Samoa": "Pacific/Pago_Pago",
  Hawaii: "Pacific/Honolulu",
  Alaska: "America/Juneau",
  "Pacific Time (US & Canada)": "America/Los_Angeles",
  Tijuana: "America/Tijuana",
  "Mountain Time (US & Canada)": "America/Denver",
  Arizona: "America/Phoenix",
  Chihuahua: "America/Chihuahua",
  Mazatlan: "America/Mazatlan",
  "Central Time (US & Canada)": "America/Chicago",
  Saskatchewan: "America/Regina",
  Guadalajara: "America/Mexico_City",
  "Mexico City": "America/Mexico_City",
  Monterrey: "America/Monterrey",
  "Central America": "America/Guatemala",
  "Eastern Time (US & Canada)": "America/New_York",
  "Indiana (East)": "America/Indiana/Indianapolis",
  Bogota: "America/Bogota",
  Lima: "America/Lima",
  Quito: "America/Lima",
  "Atlantic Time (Canada)": "America/Halifax",
  Caracas: "America/Caracas",
  "La Paz": "America/La_Paz",
  Santiago: "America/Santiago",
  Newfoundland: "America/St_Johns",
  Brasilia: "America/Sao_Paulo",
  "Buenos Aires": "America/Argentina/Buenos_Aires",
  Montevideo: "America/Montevideo",
  Georgetown: "America/Guyana",
  "Puerto Rico": "America/Puerto_Rico",
  Greenland: "America/Godthab",
  "Mid-Atlantic": "Atlantic/South_Georgia",
  Azores: "Atlantic/Azores",
  "Cape Verde Is.": "Atlantic/Cape_Verde",
  Dublin: "Europe/Dublin",
  Edinburgh: "Europe/London",
  Lisbon: "Europe/Lisbon",
  London: "Europe/London",
  Casablanca: "Africa/Casablanca",
  Monrovia: "Africa/Monrovia",
  UTC: "Etc/UTC",
  Belgrade: "Europe/Belgrade",
  Bratislava: "Europe/Bratislava",
  Budapest: "Europe/Budapest",
  Ljubljana: "Europe/Ljubljana",
  Prague: "Europe/Prague",
  Sarajevo: "Europe/Sarajevo",
  Skopje: "Europe/Skopje",
  Warsaw: "Europe/Warsaw",
  Zagreb: "Europe/Zagreb",
  Brussels: "Europe/Brussels",
  Copenhagen: "Europe/Copenhagen",
  Madrid: "Europe/Madrid",
  Paris: "Europe/Paris",
  Amsterdam: "Europe/Amsterdam",
  Berlin: "Europe/Berlin",
  Bern: "Europe/Zurich",
  Zurich: "Europe/Zurich",
  Rome: "Europe/Rome",
  Stockholm: "Europe/Stockholm",
  Vienna: "Europe/Vienna",
  "West Central Africa": "Africa/Algiers",
  Bucharest: "Europe/Bucharest",
  Cairo: "Africa/Cairo",
  Helsinki: "Europe/Helsinki",
  Kyiv: "Europe/Kiev",
  Riga: "Europe/Riga",
  Sofia: "Europe/Sofia",
  Tallinn: "Europe/Tallinn",
  Vilnius: "Europe/Vilnius",
  Athens: "Europe/Athens",
  Istanbul: "Europe/Istanbul",
  Minsk: "Europe/Minsk",
  Jerusalem: "Asia/Jerusalem",
  Harare: "Africa/Harare",
  Pretoria: "Africa/Johannesburg",
  Kaliningrad: "Europe/Kaliningrad",
  Moscow: "Europe/Moscow",
  "St. Petersburg": "Europe/Moscow",
  Volgograd: "Europe/Volgograd",
  Samara: "Europe/Samara",
  Kuwait: "Asia/Kuwait",
  Riyadh: "Asia/Riyadh",
  Nairobi: "Africa/Nairobi",
  Baghdad: "Asia/Baghdad",
  Tehran: "Asia/Tehran",
  "Abu Dhabi": "Asia/Muscat",
  Muscat: "Asia/Muscat",
  Baku: "Asia/Baku",
  Tbilisi: "Asia/Tbilisi",
  Yerevan: "Asia/Yerevan",
  Kabul: "Asia/Kabul",
  Ekaterinburg: "Asia/Yekaterinburg",
  Islamabad: "Asia/Karachi",
  Karachi: "Asia/Karachi",
  Tashkent: "Asia/Tashkent",
  Chennai: "Asia/Kolkata",
  Kolkata: "Asia/Kolkata",
  Mumbai: "Asia/Kolkata",
  "New Delhi": "Asia/Kolkata",
  Kathmandu: "Asia/Kathmandu",
  Dhaka: "Asia/Dhaka",
  "Sri Jayawardenepura": "Asia/Colombo",
  Almaty: "Asia/Almaty",
  Astana: "Asia/Almaty",
  Novosibirsk: "Asia/Novosibirsk",
  Rangoon: "Asia/Rangoon",
  Bangkok: "Asia/Bangkok",
  Hanoi: "Asia/Bangkok",
  Jakarta: "Asia/Jakarta",
  Krasnoyarsk: "Asia/Krasnoyarsk",
  Beijing: "Asia/Shanghai",
  Chongqing: "Asia/Chongqing",
  "Hong Kong": "Asia/Hong_Kong",
  Urumqi: "Asia/Urumqi",
  "Kuala Lumpur": "Asia/Kuala_Lumpur",
  Singapore: "Asia/Singapore",
  Taipei: "Asia/Taipei",
  Perth: "Australia/Perth",
  Irkutsk: "Asia/Irkutsk",
  Ulaanbaatar: "Asia/Ulaanbaatar",
  Seoul: "Asia/Seoul",
  Osaka: "Asia/Tokyo",
  Sapporo: "Asia/Tokyo",
  Tokyo: "Asia/Tokyo",
  Yakutsk: "Asia/Yakutsk",
  Darwin: "Australia/Darwin",
  Adelaide: "Australia/Adelaide",
  Canberra: "Australia/Canberra",
  Melbourne: "Australia/Melbourne",
  Sydney: "Australia/Sydney",
  Brisbane: "Australia/Brisbane",
  Hobart: "Australia/Hobart",
  Vladivostok: "Asia/Vladivostok",
  Guam: "Pacific/Guam",
  "Port Moresby": "Pacific/Port_Moresby",
  Magadan: "Asia/Magadan",
  Srednekolymsk: "Asia/Srednekolymsk",
  "Solomon Is.": "Pacific/Guadalcanal",
  "New Caledonia": "Pacific/Noumea",
  Fiji: "Pacific/Fiji",
  Kamchatka: "Asia/Kamchatka",
  "Marshall Is.": "Pacific/Majuro",
  Auckland: "Pacific/Auckland",
  Wellington: "Pacific/Auckland",
  "Nuku'alofa": "Pacific/Tongatapu",
  "Tokelau Is.": "Pacific/Fakaofo",
  "Chatham Is.": "Pacific/Chatham",
  Samoa: "Pacific/Apia",
};

const CANONICAL_ZONE_IDENTIFIERS: Record<string, string> = {
  "Africa/Accra": "Africa/Abidjan",
  "Africa/Addis_Ababa": "Africa/Nairobi",
  "Africa/Asmera": "Africa/Nairobi",
  "Africa/Bamako": "Africa/Abidjan",
  "Africa/Bangui": "Africa/Lagos",
  "Africa/Banjul": "Africa/Abidjan",
  "Africa/Blantyre": "Africa/Maputo",
  "Africa/Brazzaville": "Africa/Lagos",
  "Africa/Bujumbura": "Africa/Maputo",
  "Africa/Conakry": "Africa/Abidjan",
  "Africa/Dakar": "Africa/Abidjan",
  "Africa/Dar_es_Salaam": "Africa/Nairobi",
  "Africa/Djibouti": "Africa/Nairobi",
  "Africa/Douala": "Africa/Lagos",
  "Africa/Freetown": "Africa/Abidjan",
  "Africa/Gaborone": "Africa/Maputo",
  "Africa/Harare": "Africa/Maputo",
  "Africa/Kampala": "Africa/Nairobi",
  "Africa/Kigali": "Africa/Maputo",
  "Africa/Kinshasa": "Africa/Lagos",
  "Africa/Libreville": "Africa/Lagos",
  "Africa/Lome": "Africa/Abidjan",
  "Africa/Luanda": "Africa/Lagos",
  "Africa/Lubumbashi": "Africa/Maputo",
  "Africa/Lusaka": "Africa/Maputo",
  "Africa/Malabo": "Africa/Lagos",
  "Africa/Maseru": "Africa/Johannesburg",
  "Africa/Mbabane": "Africa/Johannesburg",
  "Africa/Mogadishu": "Africa/Nairobi",
  "Africa/Niamey": "Africa/Lagos",
  "Africa/Nouakchott": "Africa/Abidjan",
  "Africa/Ouagadougou": "Africa/Abidjan",
  "Africa/Porto-Novo": "Africa/Lagos",
  "America/Anguilla": "America/Puerto_Rico",
  "America/Antigua": "America/Puerto_Rico",
  "America/Aruba": "America/Puerto_Rico",
  "America/Blanc-Sablon": "America/Puerto_Rico",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cayman": "America/Panama",
  "America/Coral_Harbour": "America/Panama",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Creston": "America/Phoenix",
  "America/Curacao": "America/Puerto_Rico",
  "America/Dominica": "America/Puerto_Rico",
  "America/Godthab": "America/Nuuk",
  "America/Grenada": "America/Puerto_Rico",
  "America/Guadeloupe": "America/Puerto_Rico",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Kralendijk": "America/Puerto_Rico",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Lower_Princes": "America/Puerto_Rico",
  "America/Marigot": "America/Puerto_Rico",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Montserrat": "America/Puerto_Rico",
  "America/Nassau": "America/Toronto",
  "America/Port_of_Spain": "America/Puerto_Rico",
  "America/St_Barthelemy": "America/Puerto_Rico",
  "America/St_Kitts": "America/Puerto_Rico",
  "America/St_Lucia": "America/Puerto_Rico",
  "America/St_Thomas": "America/Puerto_Rico",
  "America/St_Vincent": "America/Puerto_Rico",
  "America/Tortola": "America/Puerto_Rico",
  "Antarctica/DumontDUrville": "Pacific/Port_Moresby",
  "Antarctica/McMurdo": "Pacific/Auckland",
  "Antarctica/Syowa": "Asia/Riyadh",
  "Arctic/Longyearbyen": "Europe/Berlin",
  "Asia/Aden": "Asia/Riyadh",
  "Asia/Bahrain": "Asia/Qatar",
  "Asia/Brunei": "Asia/Kuching",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Kuala_Lumpur": "Asia/Singapore",
  "Asia/Kuwait": "Asia/Riyadh",
  "Asia/Muscat": "Asia/Dubai",
  "Asia/Phnom_Penh": "Asia/Bangkok",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Vientiane": "Asia/Bangkok",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Atlantic/Reykjavik": "Africa/Abidjan",
  "Atlantic/St_Helena": "Africa/Abidjan",
  "Europe/Amsterdam": "Europe/Brussels",
  "Europe/Bratislava": "Europe/Prague",
  "Europe/Busingen": "Europe/Zurich",
  "Europe/Copenhagen": "Europe/Berlin",
  "Europe/Guernsey": "Europe/London",
  "Europe/Isle_of_Man": "Europe/London",
  "Europe/Jersey": "Europe/London",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Ljubljana": "Europe/Belgrade",
  "Europe/Luxembourg": "Europe/Brussels",
  "Europe/Mariehamn": "Europe/Helsinki",
  "Europe/Monaco": "Europe/Paris",
  "Europe/Oslo": "Europe/Berlin",
  "Europe/Podgorica": "Europe/Belgrade",
  "Europe/San_Marino": "Europe/Rome",
  "Europe/Sarajevo": "Europe/Belgrade",
  "Europe/Skopje": "Europe/Belgrade",
  "Europe/Stockholm": "Europe/Berlin",
  "Europe/Vaduz": "Europe/Zurich",
  "Europe/Vatican": "Europe/Rome",
  "Europe/Zagreb": "Europe/Belgrade",
  "Indian/Antananarivo": "Africa/Nairobi",
  "Indian/Christmas": "Asia/Bangkok",
  "Indian/Cocos": "Asia/Yangon",
  "Indian/Comoro": "Africa/Nairobi",
  "Indian/Kerguelen": "Indian/Maldives",
  "Indian/Mahe": "Asia/Dubai",
  "Indian/Mayotte": "Africa/Nairobi",
  "Indian/Reunion": "Asia/Dubai",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Funafuti": "Pacific/Tarawa",
  "Pacific/Majuro": "Pacific/Tarawa",
  "Pacific/Midway": "Pacific/Pago_Pago",
  "Pacific/Ponape": "Pacific/Guadalcanal",
  "Pacific/Saipan": "Pacific/Guam",
  "Pacific/Truk": "Pacific/Port_Moresby",
  "Pacific/Wake": "Pacific/Tarawa",
  "Pacific/Wallis": "Pacific/Tarawa",
};

const COUNTRY_ZONE_IDENTIFIER_ADDITIONS: Record<string, string[]> = {
  AQ: ["Asia/Singapore"],
  AU: ["Asia/Tokyo"],
  BV: [],
  HM: [],
  RU: ["Europe/Simferopol"],
  TF: ["Asia/Dubai"],
  VN: ["Asia/Bangkok"],
};

declare global {
  namespace Intl {
    interface Locale {
      getTimeZones(): string[] | undefined;
    }
  }
}

const UTC_OFFSET_WITH_COLON = "%s%02d:%02d";
const UTC_OFFSET_WITHOUT_COLON = UTC_OFFSET_WITH_COLON.replaceAll(":", "");

const zoneCache = new Map<string, TimeZone>();
let zones: TimeZone[] | null = null;
const countryZonesMemo = new Map<string, TimeZone[]>();
let zonesMapMemo: Record<string, TimeZone> | null = null;

/** @noRailsEquivalent PERMANENT */
export class InvalidTimezoneIdentifier extends Error {
  override name = "InvalidTimezoneIdentifier";
}

function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto !== Object.prototype && proto !== null) {
      return `#<${(value.constructor as { name?: string } | undefined)?.name ?? "Object"}>`;
    }
    const pairs = Object.entries(value).map(([k, v]) => `${inspect(k)}=>${inspect(v)}`);
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

function toDate(at: Date | Temporal.Instant | Time): Date {
  if (at instanceof Date) return at;
  if (at instanceof Time) return new Date(at.toTime().toInstant().epochMilliseconds);
  return new Date(at.epochMilliseconds);
}

function getZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  const abbreviation = tzPart?.value ?? ianaName;

  const roundedDate = new Date(Math.floor(date.getTime() / 60000) * 60000);

  const localFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const localParts = localFormatter.formatToParts(roundedDate);
  const get = (type: string) => parseInt(localParts.find((p) => p.type === type)?.value ?? "0", 10);

  const localYear = get("year");
  const localMonth = get("month");
  const localDay = get("day");
  let localHour = get("hour");
  if (localHour === 24) localHour = 0;
  const localMinute = get("minute");
  const localSecond = get("second");

  const localAsUtc = Date.UTC(
    localYear,
    localMonth - 1,
    localDay,
    localHour,
    localMinute,
    localSecond,
  );
  const utcOffsetSeconds = Math.round((localAsUtc - roundedDate.getTime()) / 1000) || 0;

  return { abbreviation, utcOffsetSeconds };
}

export function getLocalComponents(
  ianaName: string,
  utcDate: Date,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  } as Intl.DateTimeFormatOptions);
  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  let hour = get("hour");
  if (hour === 24) hour = 0;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
    millisecond: utcDate.getMilliseconds(),
  };
}

/** @noRailsEquivalent PERMANENT */
export class TimezonePeriod {
  readonly abbreviation: string;
  readonly observedUtcOffset: number;
  private readonly _dst: boolean;

  constructor(abbreviation: string, observedUtcOffset: number, dst: boolean) {
    this.abbreviation = abbreviation;
    this.observedUtcOffset = observedUtcOffset;
    this._dst = dst;
  }

  isDst(): boolean {
    return this._dst;
  }
}

/** @noRailsEquivalent PERMANENT */
export class PeriodNotFound extends Error {
  override name = "PeriodNotFound";
}

/** @noRailsEquivalent PERMANENT */
export class AmbiguousTime extends Error {
  override name = "AmbiguousTime";
}

/** @noRailsEquivalent PERMANENT */
export class Timezone {
  static get(identifier: string): Timezone {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: identifier });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
    }
    return new Timezone(identifier);
  }

  readonly identifier: string;

  constructor(name: string) {
    this.identifier = name;
  }

  get name(): string {
    return this.identifier;
  }

  toString(): string {
    return this.identifier;
  }

  abbr(time: Date | Temporal.Instant): string {
    return getZoneInfo(this.identifier, toDate(time)).abbreviation;
  }

  observedUtcOffset(time: Date | Temporal.Instant): number {
    return getZoneInfo(this.identifier, toDate(time)).utcOffsetSeconds;
  }

  isDst(time: Date | Temporal.Instant): boolean {
    return tzdataIsdst(this.identifier, Math.floor(toDate(time).getTime() / 1000));
  }

  periodForUtc(time: Time): TimezonePeriod {
    const d = toDate(time);
    return new TimezonePeriod(this.abbr(d), this.observedUtcOffset(d), this.isDst(d));
  }

  periodsForLocal(time: Time): TimezonePeriod[] {
    const localMs = toDate(time).getTime();
    const DAY = 86_400_000;
    const around = [
      getZoneInfo(this.identifier, new Date(localMs - DAY)).utcOffsetSeconds,
      getZoneInfo(this.identifier, new Date(localMs + DAY)).utcOffsetSeconds,
    ];
    const candidates = [...new Set(around)].sort((a, b) => b - a);
    const periods: TimezonePeriod[] = [];
    for (const offset of candidates) {
      const utc = Time.at(new Rational(localMs - offset * 1000, 1000)).getutc();
      if (getZoneInfo(this.identifier, toDate(utc)).utcOffsetSeconds === offset) {
        periods.push(this.periodForUtc(utc));
      }
    }
    return periods;
  }

  periodForLocal(
    time: Time,
    dst: boolean | null = true,
    block?: (periods: TimezonePeriod[]) => TimezonePeriod,
  ): TimezonePeriod {
    const periods = this.periodsForLocal(time);
    if (periods.length === 1) return periods[0];
    if (periods.length === 0) {
      throw new PeriodNotFound(
        `${toDate(time).toISOString().slice(0, 19)} is not valid for ${this.identifier}`,
      );
    }
    if (dst !== null) {
      const matching = periods.filter((period) => period.isDst() === dst);
      if (matching.length === 1) return matching[0];
    }
    if (block) return block(periods);
    throw new AmbiguousTime(
      `${toDate(time).toISOString().slice(0, 19)} is an ambiguous local time for ${this.identifier}`,
    );
  }

  utcToLocal(time: Time): Temporal.ZonedDateTime {
    return time.toTime().toInstant().toZonedDateTimeISO(this.identifier);
  }

  localToUtc(time: Time, dst: boolean | null = true): Time {
    const localMs = toDate(time).getTime();
    const period = this.periodForLocal(time, dst);
    return Time.at(new Rational(localMs - period.observedUtcOffset * 1000, 1000)).getutc();
  }
}

/**
 * Ruby `Time.new`'s fractional-seconds argument (`parts.fetch(:sec, 0) +
 * parts.fetch(:sec_fraction, 0)`), which Temporal cannot take as a Rational —
 * it wants the sub-second remainder split across its millisecond / microsecond
 * / nanosecond components.
 *
 * @noRailsEquivalent Ruby's Time carries a Rational sub-second seat; Temporal
 * carries three integer components. This is the conversion between them.
 */
function secFractionToNanosecond(secFraction: DateParts["secFraction"]): number {
  if (secFraction == null) return 0;
  return secFraction instanceof Rational
    ? secFraction.mul(1_000_000_000).toI()
    : Math.trunc(Number(secFraction) * 1_000_000_000);
}

/**
 * Ruby `Time#utc` on a Time built with an explicit `offset` — the instant that
 * local wall clock names at that offset.
 *
 * @noRailsEquivalent Ruby's Time holds its own UTC offset; a
 * `Temporal.PlainDateTime` does not, so the offset has to be applied here.
 */
function utcInstantOf(
  time: Temporal.PlainDateTime,
  offset: NonNullable<DateParts["offset"]>,
): Temporal.Instant {
  const seconds = offset instanceof Rational ? offset.toF() : Number(offset);
  return time
    .toZonedDateTime("UTC")
    .toInstant()
    .subtract({ nanoseconds: Math.round(seconds * 1e9) });
}

export class TimeZone {
  readonly name: string;
  readonly tzinfo: Timezone;
  readonly #utcOffset: number | null;

  constructor(name: string, utcOffset: number | null = null, tzinfo: Timezone | null = null) {
    this.name = name;
    this.#utcOffset = utcOffset;
    this.tzinfo = tzinfo ?? TimeZone.findTzinfo(name);
  }

  static secondsToUtcOffset(seconds: number, colon = true): string {
    const format = colon ? UTC_OFFSET_WITH_COLON : UTC_OFFSET_WITHOUT_COLON;
    const sign = seconds < 0 ? "-" : "+";
    const hours = Math.trunc(Math.abs(seconds) / 3600);
    const minutes = Math.trunc((Math.abs(seconds) % 3600) / 60);
    return format
      .replace("%s", sign)
      .replace("%02d", String(hours).padStart(2, "0"))
      .replace("%02d", String(minutes).padStart(2, "0"));
  }

  static find(arg: unknown): TimeZone | null {
    if (arg instanceof TimeZone) return arg;
    if (typeof arg === "string") {
      const cached = zoneCache.get(arg);
      if (cached) return cached;
      let tz: TimeZone;
      try {
        tz = TimeZone.create(arg);
      } catch (error) {
        if (!(error instanceof InvalidTimezoneIdentifier)) throw error;
        return null;
      }
      zoneCache.set(arg, tz);
      return tz;
    }
    if (typeof arg === "number" || arg instanceof Duration) {
      let seconds = arg instanceof Duration ? arg.inSeconds() : arg;
      if (Math.abs(seconds) <= 13) seconds *= 3600;
      return TimeZone.all().find((z) => z.utcOffset === Math.trunc(seconds)) ?? null;
    }
    throw new ArgumentError(`invalid argument to TimeZone[]: ${inspect(arg)}`);
  }

  static findTzinfo(name: string): Timezone {
    return Timezone.get(MAPPING[name] ?? name);
  }
  static create(
    name: string,
    utcOffset: number | null = null,
    tzinfo: Timezone | null = null,
  ): TimeZone {
    return new TimeZone(name, utcOffset, tzinfo);
  }

  static all(): TimeZone[] {
    zones ??= Object.values(TimeZone.zonesMap()).sort((a, b) => a.compareTo(b) ?? 0);
    return zones;
  }

  /**
   * @missingRailsCall in_time_zone — PERMANENT
   * @missingRailsCall utc — PERMANENT
   */
  now(): TimeWithZone {
    return new TimeWithZone(instantFrom(this.timeNow()), this);
  }

  local(
    year: number,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ): TimeWithZone {
    let time = Time.utc(year, month, day, hour, minute, second, millisecond * 1000);
    let period: TimezonePeriod;
    for (;;) {
      try {
        period = this.periodForLocal(time);
        break;
      } catch (error) {
        if (!(error instanceof PeriodNotFound)) throw error;
        time = Time.at(new Rational(toDate(time).getTime() + 3_600_000, 1000)).getutc();
      }
    }
    return new TimeWithZone(
      instantFrom(new Date(toDate(time).getTime() - period.observedUtcOffset * 1000)),
      this,
    );
  }

  parse(str: string, now: TimeWithZone = this.now()): TimeWithZone | undefined {
    return this.partsToTime(RubyDate._parse(str, false), now);
  }

  strptime(str: string, format: string, now: TimeWithZone = this.now()): TimeWithZone | undefined {
    return this.partsToTime(RubyDate._strptime(str, format), now);
  }

  /**
   * `at(*args)` (time_zone.rb:378-380): `Time.at(*args).utc.in_time_zone(self)`.
   *
   *   Time.zone.at(946684800.0)           # => Fri, 31 Dec 1999 14:00:00 HST -10:00
   *   Time.at(946684800, 123456.789).nsec # => 123456789
   *
   * `getutc` is Ruby's `Time#utc` on an immutable receiver (trails' `::Time`
   * has no in-place conversion), and `toTime().toInstant()` is the instant a
   * `TimeWithZone` holds where Ruby's `in_time_zone` takes the `::Time` itself.
   *
   * @missingRailsCall in_time_zone — PERMANENT: `Time.at(*args).utc.in_time_zone(self)`
   *   (time_zone.rb:379-381) round-trips through the `Time` core-ext to land in
   *   `self`; trails builds the `TimeWithZone` directly from the epoch instant,
   *   and `in_time_zone`'s own `TimeZone` arm is that same constructor call
   *   (core-ext/date-and-time/zones.ts `timeWithZone`). Routing through it would
   *   close a `values/time-zone` -> `zones` -> `values/time-zone` module cycle
   *   (zones.ts:17 imports `TimeZone` from this file, and `timeWithZone` is not
   *   exported), which ESM cannot express — for no behavioural difference.
   * @missingRailsCall utc — PERMANENT. `Time.at(*args).utc` (time_zone.rb:379-381). trails'
   *   `at` reaches the same instant through `Time#getutc` (packages/date
   *   time.ts:783) — ruby/time's own `utc`/`getutc` pair — because the ported
   *   `Time` is immutable and carries no in-place `utc`. Pre-existing: surfaced
   *   only once `DateTime#utc` (date_time/calculations.rb:184) was ported and
   *   `utc` entered the population.
   */
  at(
    seconds: number | bigint | Rational,
    microsecondsWithFrac: number | bigint | Rational = 0,
  ): TimeWithZone {
    return new TimeWithZone(
      Time.at(seconds, microsecondsWithFrac).getutc().toTime().toInstant(),
      this,
    );
  }

  get utcOffset(): number {
    if (this.#utcOffset !== null) return this.#utcOffset;
    const now = new Date();
    const jan = getZoneInfo(
      this.tzinfo.identifier,
      new Date(now.getFullYear(), 0, 1),
    ).utcOffsetSeconds;
    const jul = getZoneInfo(
      this.tzinfo.identifier,
      new Date(now.getFullYear(), 6, 1),
    ).utcOffsetSeconds;
    return Math.min(jan, jul);
  }

  utcOffsetAt(date: Date | Temporal.Instant): number {
    return getZoneInfo(this.tzinfo.identifier, toDate(date)).utcOffsetSeconds;
  }

  formattedOffset(colon = true, alternateUtcString: string | null = null): string {
    if (this.utcOffset === 0 && alternateUtcString != null) return alternateUtcString;
    return TimeZone.secondsToUtcOffset(this.utcOffset, colon);
  }

  compareTo(zone: unknown): number | undefined {
    if (typeof (zone as { utcOffset?: unknown } | null | undefined)?.utcOffset !== "number") {
      return undefined;
    }
    const other = zone as TimeZone;
    let result = this.utcOffset < other.utcOffset ? -1 : this.utcOffset > other.utcOffset ? 1 : 0;
    if (result === 0) result = this.name < other.name ? -1 : this.name > other.name ? 1 : 0;
    return result;
  }

  utcToLocal(time: Time): Temporal.ZonedDateTime | Time {
    const t = this.tzinfo.utcToLocal(time);
    return utcToLocalReturnsUtcOffsetTimes()
      ? t
      : Time.utc(
          t.year,
          t.month,
          t.day,
          t.hour,
          t.minute,
          t.second,
          t.millisecond * 1_000 + t.microsecond + t.nanosecond / 1_000,
        );
  }

  localToUtc(time: Time, dst: boolean | null = true): Time {
    return this.tzinfo.localToUtc(time, dst);
  }

  periodForUtc(time: Time): TimezonePeriod {
    return this.tzinfo.periodForUtc(time);
  }

  periodForLocal(time: Time, dst: boolean | null = true): TimezonePeriod {
    return this.tzinfo.periodForLocal(time, dst, (periods) => periods[periods.length - 1]);
  }

  periodsForLocal(time: Time): TimezonePeriod[] {
    return this.tzinfo.periodsForLocal(time);
  }

  abbr(time: Date | Temporal.Instant): string {
    return this.tzinfo.abbr(time);
  }

  isDst(time: Date | Temporal.Instant): boolean {
    return this.tzinfo.isDst(time);
  }

  today(): Temporal.PlainDate {
    return this.now().toDate();
  }

  tomorrow(): Temporal.PlainDate {
    return this.today().add({ days: 1 });
  }

  yesterday(): Temporal.PlainDate {
    return this.today().subtract({ days: 1 });
  }

  iso8601(str: string | null | undefined): TimeWithZone {
    if (str == null) throw new ArgumentError("invalid date");

    const parts = RubyDate._iso8601(str);

    if (parts.year == null) throw new ArgumentError("invalid date");
    const year = Number(parts.year);

    let mon: number;
    let mday: number;
    if (parts.yday != null) {
      let ordinalDate: Temporal.PlainDate;
      try {
        ordinalDate = RubyDate.ordinal(year, parts.yday);
      } catch (error) {
        if (error instanceof RubyDate.Error) throw new ArgumentError("invalid date");
        throw error;
      }
      mon = ordinalDate.month;
      mday = ordinalDate.day;
    } else {
      if (parts.mon == null || parts.mday == null) throw new ArgumentError("invalid date");
      mon = parts.mon;
      mday = parts.mday;
    }

    const nanosecond = secFractionToNanosecond(parts.secFraction);
    let time: Temporal.PlainDateTime;
    try {
      time = Temporal.PlainDateTime.from({
        year,
        month: mon,
        day: mday,
        hour: parts.hour ?? 0,
        minute: parts.min ?? 0,
        second: parts.sec ?? 0,
        millisecond: Math.trunc(nanosecond / 1_000_000),
        microsecond: Math.trunc(nanosecond / 1000) % 1000,
        nanosecond: nanosecond % 1000,
      });
    } catch {
      throw new ArgumentError("argument out of range");
    }

    if (parts.offset != null) {
      return new TimeWithZone(utcInstantOf(time, parts.offset), this);
    }
    return new TimeWithZone(null, this, time);
  }

  rfc3339(str: string): TimeWithZone {
    const parts = RubyDate._rfc3339(str);

    if (Object.keys(parts).length === 0) throw new ArgumentError("invalid date");

    const nanosecond = secFractionToNanosecond(parts.secFraction);
    let time: Temporal.PlainDateTime;
    try {
      time = Temporal.PlainDateTime.from({
        year: Number(parts.year),
        month: parts.mon!,
        day: parts.mday!,
        hour: parts.hour!,
        minute: parts.min!,
        second: parts.sec!,
        millisecond: Math.trunc(nanosecond / 1_000_000),
        microsecond: Math.trunc(nanosecond / 1000) % 1000,
        nanosecond: nanosecond % 1000,
      });
    } catch {
      throw new ArgumentError("argument out of range");
    }

    return new TimeWithZone(utcInstantOf(time, parts.offset!), this);
  }

  isMatch(re: string | RegExp): boolean {
    return (
      re === this.name ||
      re === MAPPING[this.name] ||
      (re instanceof RegExp &&
        (re.test(this.name) || (MAPPING[this.name] != null && re.test(MAPPING[this.name]))))
    );
  }

  static usZones(): TimeZone[] {
    return TimeZone.countryZones("us");
  }

  static countryZones(countryCode: string): TimeZone[] {
    const code = countryCode.toUpperCase();
    let memo = countryZonesMemo.get(code);
    if (memo === undefined) {
      memo = TimeZone.loadCountryZones(code);
      countryZonesMemo.set(code, memo);
    }
    return memo;
  }

  static clear(): void {
    zoneCache.clear();
    countryZonesMemo.clear();
    zones = null;
    zonesMapMemo = null;
  }

  private static loadCountryZones(code: string): TimeZone[] {
    let country: string[] | undefined;
    try {
      country = new Intl.Locale(`und-${code}`).getTimeZones();
    } catch {
      country = undefined;
    }
    const additions = COUNTRY_ZONE_IDENTIFIER_ADDITIONS[code];
    if (country === undefined || (country.length === 0 && additions === undefined)) {
      throw new Error(`Invalid country code: ${code}`);
    }
    const identifiers = country.map((tzId) => CANONICAL_ZONE_IDENTIFIERS[tzId] ?? tzId);
    for (const tzId of additions ?? []) {
      if (!identifiers.includes(tzId)) identifiers.push(tzId);
    }
    return identifiers
      .flatMap((tzId) => {
        if (Object.values(MAPPING).includes(tzId)) {
          const memo: TimeZone[] = [];
          for (const [key, value] of Object.entries(MAPPING)) {
            if (value === tzId) memo.push(TimeZone.find(key)!);
          }
          return memo;
        }
        return [TimeZone.create(tzId, null, Timezone.get(tzId))];
      })
      .sort((a, b) => a.compareTo(b) ?? 0);
  }

  private static zonesMap(): Record<string, TimeZone> {
    zonesMapMemo ??= Object.keys(MAPPING).reduce<Record<string, TimeZone>>((zones, name) => {
      const timezone = TimeZone.find(name);
      if (timezone != null) zones[name] = timezone;
      return zones;
    }, {});
    return zonesMapMemo;
  }

  private partsToTime(parts: DateParts | null, now: TimeWithZone): TimeWithZone | undefined {
    if (parts == null) throw new ArgumentError("invalid date");
    if (Object.keys(parts).length === 0) return undefined;

    if (parts.seconds != null) {
      return this.at(parts.seconds);
    }

    const nanosecond = secFractionToNanosecond(parts.secFraction);
    let time: Temporal.PlainDateTime;
    try {
      time = Temporal.PlainDateTime.from({
        year: Number("year" in parts ? parts.year : now.year),
        month: "mon" in parts ? parts.mon! : now.month,
        day: "mday" in parts ? parts.mday! : parts.year != null || parts.mon != null ? 1 : now.day,
        hour: "hour" in parts ? parts.hour! : 0,
        minute: "min" in parts ? parts.min! : 0,
        second: "sec" in parts ? parts.sec! : 0,
        millisecond: Math.trunc(nanosecond / 1_000_000),
        microsecond: Math.trunc(nanosecond / 1000) % 1000,
        nanosecond: nanosecond % 1000,
      });
    } catch {
      throw new ArgumentError("argument out of range");
    }

    if (parts.offset != null) {
      return new TimeWithZone(utcInstantOf(time, parts.offset), this);
    }
    return new TimeWithZone(null, this, time);
  }

  private timeNow(): Date {
    return currentTime();
  }

  toString(): string {
    return `(GMT${this.formattedOffset()}) ${this.name}`;
  }

  inspect(): string {
    return this.toString();
  }
}

export { MAPPING as ZONES_MAP };
