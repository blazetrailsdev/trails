/**
 * TZInfo 2 stand-in, backed by the built-in Intl API and the tzdata that
 * `@blazetrails/date` carries. ActiveSupport::TimeZone wraps a `Timezone`.
 *
 * @boundary-file: `Intl.DateTimeFormat#formatToParts` requires a JS `Date`
 *   input, so this file traffics in `Date` for offset/abbrev/DST lookups and
 *   for the `local`-to-UTC ambiguity search.
 */

import {
  Temporal,
  Time,
  Timezone as DateTimezone,
  tzdataAbbreviationChanges,
  tzdataBaseOffsets,
  tzdataIsdst,
  tzdataIsdstFlips,
} from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export class InvalidTimezoneIdentifier extends Error {
  override name = "InvalidTimezoneIdentifier";
}

function toDate(at: Date | Temporal.Instant | Time): Date {
  if (at instanceof Date) return at;
  if (at instanceof Time) return new Date(at.toI() * 1000 + Math.floor(at.nsec / 1_000_000));
  return new Date(at.epochMilliseconds);
}

function ignoringOffset(time: Date | Temporal.Instant | Time): Date {
  if (!(time instanceof Time)) return toDate(time);
  const date = new Date(
    Date.UTC(
      time.year,
      time.mon - 1,
      time.day,
      time.hour,
      time.min,
      time.sec,
      Math.floor(time.nsec / 1_000_000),
    ),
  );
  if (time.year < 100) date.setUTCFullYear(time.year);
  return date;
}

const ETC_GMT_LINKS = new Set([
  "Etc/GMT",
  "Etc/GMT+0",
  "Etc/GMT-0",
  "Etc/GMT0",
  "Etc/Greenwich",
  "GMT",
  "GMT+0",
  "GMT-0",
  "GMT0",
  "Greenwich",
]);

const abbreviationFormatters = new Map<string, Intl.DateTimeFormat>();
const localFormatters = new Map<string, Intl.DateTimeFormat>();

const fixedZoneInfos = new Map<string, { abbreviation: string; utcOffsetSeconds: number } | null>();
const fixedZoneAbbreviations = new Map<string, string>();

function getZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  let fixed = fixedZoneInfos.get(ianaName);
  if (fixed === undefined) {
    const zoned = Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(ianaName);
    fixed =
      zoned.getTimeZoneTransition("next") === null &&
      zoned.getTimeZoneTransition("previous") === null
        ? lookupZoneInfo(ianaName, date)
        : null;
    fixedZoneInfos.set(ianaName, fixed);
  }
  return fixed ?? zoneInterval(ianaName, date)?.info ?? lookupZoneInfo(ianaName, date);
}

interface ZoneInterval {
  start: number;
  end: number;
  info: { abbreviation: string; utcOffsetSeconds: number };
  abbr?: string;
}

const zoneIntervals = new Map<string, ZoneInterval[]>();

function zoneInterval(ianaName: string, date: Date): ZoneInterval | null {
  const ms = date.getTime();
  let intervals = zoneIntervals.get(ianaName);
  if (!intervals) zoneIntervals.set(ianaName, (intervals = []));
  let lo = 0;
  let hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (intervals[mid].end <= ms) lo = mid + 1;
    else hi = mid;
  }
  const hit = intervals[lo];
  if (hit && hit.start <= ms) return hit;
  if (!Number.isFinite(ms)) return null;

  const zoned = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(ianaName);
  const previous = zoned.add({ milliseconds: 1 }).getTimeZoneTransition("previous");
  const next = zoned.getTimeZoneTransition("next");
  let start = previous ? previous.epochMilliseconds : -Infinity;
  let end = next ? next.epochMilliseconds : Infinity;
  for (const flips of [tzdataIsdstFlips(ianaName), tzdataAbbreviationChanges(ianaName)]) {
    for (const flip of flips) {
      const flipMs = flip * 1000;
      if (flipMs <= ms) start = Math.max(start, flipMs);
      else {
        end = Math.min(end, flipMs);
        break;
      }
    }
  }
  const info = lookupZoneInfo(ianaName, date);
  if (Math.abs(info.utcOffsetSeconds - zoned.offsetNanoseconds / 1e9) >= 60) return null;
  const interval = { start, end, info };
  intervals.splice(lo, 0, interval);
  return interval;
}

function lookupZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  let formatter = abbreviationFormatters.get(ianaName);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: ianaName, timeZoneName: "short" });
    abbreviationFormatters.set(ianaName, formatter);
  }
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  let abbreviation = tzPart?.value ?? ianaName;
  if (abbreviation === "UTC" && ETC_GMT_LINKS.has(ianaName)) abbreviation = "GMT";

  const roundedDate = new Date(Math.floor(date.getTime() / 60000) * 60000);

  let localFormatter = localFormatters.get(ianaName);
  if (!localFormatter) {
    localFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaName,
      era: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    localFormatters.set(ianaName, localFormatter);
  }
  const localParts = localFormatter.formatToParts(roundedDate);
  const get = (type: string) => parseInt(localParts.find((p) => p.type === type)?.value ?? "0", 10);

  const era = localParts.find((p) => p.type === "era")?.value;
  const localYear = era === "BC" ? 1 - get("year") : get("year");
  const localMonth = get("month");
  const localDay = get("day");
  let localHour = get("hour");
  if (localHour === 24) localHour = 0;
  const localMinute = get("minute");
  const localSecond = get("second");

  const localAsUtcDate = new Date(Date.UTC(2000, 0, 1, localHour, localMinute, localSecond));
  localAsUtcDate.setUTCFullYear(localYear, localMonth - 1, localDay);
  const localAsUtc = localAsUtcDate.getTime();
  const utcOffsetSeconds = Math.round((localAsUtc - roundedDate.getTime()) / 1000) || 0;

  return { abbreviation, utcOffsetSeconds };
}

/** @noRailsEquivalent PERMANENT */
export class TimezoneTransition {
  readonly offset: TimezoneOffset;
  readonly previousOffset: TimezoneOffset;
  readonly timestampValue: number;

  constructor(offset: TimezoneOffset, previousOffset: TimezoneOffset, timestampValue: number) {
    this.offset = offset;
    this.previousOffset = previousOffset;
    this.timestampValue = timestampValue;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TimezoneTransition &&
      other.offset.equals(this.offset) &&
      other.previousOffset.equals(this.previousOffset) &&
      other.timestampValue === this.timestampValue
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export class TimezonePeriod {
  readonly abbreviation: string;
  readonly observedUtcOffset: number;
  readonly baseUtcOffset: number;
  private readonly _dst: boolean;

  constructor(
    abbreviation: string,
    observedUtcOffset: number,
    dst: boolean,
    baseUtcOffset = observedUtcOffset,
    transitions: () => (TimezoneTransition | null)[] = () => [null, null],
  ) {
    this.abbreviation = abbreviation;
    this.observedUtcOffset = observedUtcOffset;
    this.baseUtcOffset = baseUtcOffset;
    this._dst = dst;
    this.#transitions = transitions;
  }

  #transitions: (() => (TimezoneTransition | null)[]) | (TimezoneTransition | null)[];

  #boundaries(): (TimezoneTransition | null)[] {
    if (typeof this.#transitions === "function") this.#transitions = this.#transitions();
    return this.#transitions;
  }

  get startTransition(): TimezoneTransition | null {
    return this.#boundaries()[0];
  }

  get endTransition(): TimezoneTransition | null {
    return this.#boundaries()[1];
  }

  get offset(): TimezoneOffset {
    return new TimezoneOffset(this.baseUtcOffset, this.stdOffset, this.abbreviation);
  }

  get abbr(): string {
    return this.abbreviation;
  }

  get utcOffset(): number {
    return this.baseUtcOffset;
  }

  get stdOffset(): number {
    return this.observedUtcOffset - this.baseUtcOffset;
  }

  get utcTotalOffset(): number {
    return this.observedUtcOffset;
  }

  isDst(): boolean {
    return this._dst;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof TimezonePeriod)) return false;
    if (this.startTransition === null && this.endTransition === null) {
      return (
        other.startTransition === null &&
        other.endTransition === null &&
        other.offset.equals(this.offset)
      );
    }
    return (
      (other.startTransition?.equals(this.startTransition) ?? this.startTransition === null) &&
      (other.endTransition?.equals(this.endTransition) ?? this.endTransition === null)
    );
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

const TZDB_NAMES: readonly string[] = [
  "Africa/Asmara",
  "Africa/Timbuktu",
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Catamarca",
  "America/Argentina/ComodRivadavia",
  "America/Argentina/Cordoba",
  "America/Argentina/Jujuy",
  "America/Argentina/Mendoza",
  "America/Atikokan",
  "America/Atka",
  "America/Ensenada",
  "America/Fort_Wayne",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
  "America/Knox_IN",
  "America/Montreal",
  "America/Nipigon",
  "America/Nuuk",
  "America/Pangnirtung",
  "America/Porto_Acre",
  "America/Rainy_River",
  "America/Rosario",
  "America/Santa_Isabel",
  "America/Shiprock",
  "America/Thunder_Bay",
  "America/Virgin",
  "America/Yellowknife",
  "Antarctica/South_Pole",
  "Asia/Ashkhabad",
  "Asia/Choibalsan",
  "Asia/Chongqing",
  "Asia/Chungking",
  "Asia/Dacca",
  "Asia/Harbin",
  "Asia/Ho_Chi_Minh",
  "Asia/Istanbul",
  "Asia/Kashgar",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Macao",
  "Asia/Tel_Aviv",
  "Asia/Thimbu",
  "Asia/Ujung_Pandang",
  "Asia/Ulan_Bator",
  "Asia/Yangon",
  "Atlantic/Faroe",
  "Atlantic/Jan_Mayen",
  "Australia/ACT",
  "Australia/Canberra",
  "Australia/Currie",
  "Australia/LHI",
  "Australia/NSW",
  "Australia/North",
  "Australia/Queensland",
  "Australia/South",
  "Australia/Tasmania",
  "Australia/Victoria",
  "Australia/West",
  "Australia/Yancowinna",
  "Brazil/Acre",
  "Brazil/DeNoronha",
  "Brazil/East",
  "Brazil/West",
  "CET",
  "CST6CDT",
  "Canada/Atlantic",
  "Canada/Central",
  "Canada/Eastern",
  "Canada/Mountain",
  "Canada/Newfoundland",
  "Canada/Pacific",
  "Canada/Saskatchewan",
  "Canada/Yukon",
  "Chile/Continental",
  "Chile/EasterIsland",
  "Cuba",
  "EET",
  "EST",
  "EST5EDT",
  "Egypt",
  "Eire",
  "Etc/GMT",
  "Etc/GMT+0",
  "Etc/GMT+1",
  "Etc/GMT+10",
  "Etc/GMT+11",
  "Etc/GMT+12",
  "Etc/GMT+2",
  "Etc/GMT+3",
  "Etc/GMT+4",
  "Etc/GMT+5",
  "Etc/GMT+6",
  "Etc/GMT+7",
  "Etc/GMT+8",
  "Etc/GMT+9",
  "Etc/GMT-0",
  "Etc/GMT-1",
  "Etc/GMT-10",
  "Etc/GMT-11",
  "Etc/GMT-12",
  "Etc/GMT-13",
  "Etc/GMT-14",
  "Etc/GMT-2",
  "Etc/GMT-3",
  "Etc/GMT-4",
  "Etc/GMT-5",
  "Etc/GMT-6",
  "Etc/GMT-7",
  "Etc/GMT-8",
  "Etc/GMT-9",
  "Etc/GMT0",
  "Etc/Greenwich",
  "Etc/UCT",
  "Etc/UTC",
  "Etc/Universal",
  "Etc/Zulu",
  "Europe/Belfast",
  "Europe/Kyiv",
  "Europe/Nicosia",
  "Europe/Tiraspol",
  "Europe/Uzhgorod",
  "Europe/Zaporozhye",
  "GB",
  "GB-Eire",
  "GMT",
  "GMT+0",
  "GMT-0",
  "GMT0",
  "Greenwich",
  "HST",
  "Hongkong",
  "Iceland",
  "Iran",
  "Israel",
  "Jamaica",
  "Japan",
  "Kwajalein",
  "Libya",
  "MET",
  "MST",
  "MST7MDT",
  "Mexico/BajaNorte",
  "Mexico/BajaSur",
  "Mexico/General",
  "NZ",
  "NZ-CHAT",
  "Navajo",
  "PRC",
  "PST8PDT",
  "Pacific/Chuuk",
  "Pacific/Johnston",
  "Pacific/Kanton",
  "Pacific/Pohnpei",
  "Pacific/Samoa",
  "Pacific/Yap",
  "Poland",
  "Portugal",
  "ROC",
  "ROK",
  "Singapore",
  "Turkey",
  "UCT",
  "US/Alaska",
  "US/Aleutian",
  "US/Arizona",
  "US/Central",
  "US/East-Indiana",
  "US/Eastern",
  "US/Hawaii",
  "US/Indiana-Starke",
  "US/Michigan",
  "US/Mountain",
  "US/Pacific",
  "US/Samoa",
  "UTC",
  "Universal",
  "W-SU",
  "WET",
  "Zulu",
];

const loadedTimezoneIdentifiers = new Set<string>();

/** @noRailsEquivalent PERMANENT */
export class Timezone {
  static all(): Timezone[] {
    return [...new Set([...Intl.supportedValuesOf("timeZone"), ...TZDB_NAMES])]
      .sort()
      .map((id) => new Timezone(id));
  }

  static get(identifier: string): Timezone {
    if (!loadedTimezoneIdentifiers.has(identifier)) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: identifier });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
      }
      loadedTimezoneIdentifiers.add(identifier);
    }
    return new Timezone(identifier);
  }

  readonly identifier: string;
  readonly info: ConstantOffsetDataTimezoneInfo | null;

  constructor(name: string, info: ConstantOffsetDataTimezoneInfo | null = null) {
    this.identifier = name;
    this.info = info;
  }

  equals(tz: unknown): boolean {
    return tz instanceof Timezone && this.identifier === tz.identifier;
  }

  eql(tz: unknown): boolean {
    return this.equals(tz);
  }

  get name(): string {
    return this.identifier;
  }

  toString(): string {
    return this.friendlyIdentifier();
  }

  friendlyIdentifier(skipFirstPart = false): string {
    const id = this.identifier;
    const parts = id.split("/");
    if (parts.length === 0) return this.identifier;
    if (parts.length === 1) return parts[0];

    const prefix = skipFirstPart ? "" : `${parts[0]} - `;
    const rest = parts.slice(1).map((part) => {
      part = part.replace(/_/g, " ");
      if (/[a-z]/.test(part)) {
        part = part.replace(/([^M][a-z])([A-Z])/g, "$1 $2");
        part = part.replace(/([M][a-bd-z])([A-Z])/g, "$1 $2");
        part = part.replace(/([A-Z])([A-Z])/g, "$1'$2");
      }
      return part;
    });
    return `${prefix}${rest.reverse().join(", ")}`;
  }

  abbr(time: Date | Temporal.Instant): string {
    if (this.info) return this.info.constantOffset.abbreviation;
    const fixed = fixedZoneAbbreviations.get(this.identifier);
    if (fixed !== undefined) return fixed;
    const interval = zoneInterval(this.identifier, toDate(time));
    if (interval?.abbr !== undefined) return interval.abbr;
    const abbreviation = new DateTimezone(this.identifier).abbr(
      Time.at(new Rational(toDate(time).getTime(), 1000)),
    );
    const result =
      abbreviation === "UTC" && ETC_GMT_LINKS.has(this.identifier) ? "GMT" : abbreviation;
    getZoneInfo(this.identifier, toDate(time));
    if (fixedZoneInfos.get(this.identifier) != null)
      fixedZoneAbbreviations.set(this.identifier, result);
    else if (interval) interval.abbr = result;
    return result;
  }

  observedUtcOffset(time: Date | Temporal.Instant): number {
    if (this.info) return this.info.constantOffset.observedUtcOffset;
    return getZoneInfo(this.identifier, toDate(time)).utcOffsetSeconds;
  }

  isDst(time: Date | Temporal.Instant | Time): boolean {
    if (this.info) return this.info.constantOffset.stdOffset !== 0;
    return tzdataIsdst(this.identifier, Math.floor(toDate(time).getTime() / 1000));
  }

  get canonicalIdentifier(): string {
    return this.identifier;
  }

  periodForUtc(time: Time): TimezonePeriod {
    const d = toDate(time);
    const observed = this.observedUtcOffset(d);
    const dst = this.isDst(d);
    if (this.info) {
      const offset = this.info.constantOffset;
      return new TimezonePeriod(offset.abbreviation, observed, dst, offset.baseUtcOffset);
    }
    const at = Math.floor(d.getTime() / 1000);
    const flips = tzdataIsdstFlips(this.identifier);
    let flipIndex = 0;
    while (flipIndex < flips.length && flips[flipIndex] <= at) flipIndex++;
    const lastFlip = flips[flipIndex - 1];
    const [initialBase, baseInstants, bases] = tzdataBaseOffsets(this.identifier) ?? [
      observed,
      [],
      [],
    ];
    let baseIndex = 0;
    while (baseIndex < baseInstants.length && baseInstants[baseIndex] <= at) baseIndex++;
    const base = baseIndex === 0 ? initialBase : bases[baseIndex - 1];
    const periodAt = (seconds: number) =>
      this.periodForUtc(Time.at(new Rational(seconds * 1000, 1000)).getutc());
    const zoned = () =>
      Temporal.Instant.fromEpochMilliseconds(at * 1000 + 1).toZonedDateTimeISO(this.identifier);
    const period: TimezonePeriod = new TimezonePeriod(this.abbr(d), observed, dst, base, () => {
      const previous = zoned().getTimeZoneTransition("previous");
      const next = zoned().getTimeZoneTransition("next");
      const starts = [
        lastFlip,
        baseInstants[baseIndex - 1],
        previous && previous.epochMilliseconds / 1000,
      ];
      const ends = [
        flips[flipIndex],
        baseInstants[baseIndex],
        next && next.epochMilliseconds / 1000,
      ];
      const start = Math.max(...starts.filter((s): s is number => s != null));
      const end = Math.min(...ends.filter((e): e is number => e != null));
      return [
        Number.isFinite(start)
          ? new TimezoneTransition(period.offset, periodAt(start - 1).offset, start)
          : null,
        Number.isFinite(end)
          ? new TimezoneTransition(periodAt(end).offset, period.offset, end)
          : null,
      ];
    });
    return period;
  }

  periodsForLocal(time: Time): TimezonePeriod[] {
    if (this.info) return [this.periodForUtc(time)];
    const localMs = ignoringOffset(time).getTime();
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
    dst: boolean | null = null,
    block?: (periods: TimezonePeriod[]) => TimezonePeriod,
  ): TimezonePeriod {
    const periods = this.periodsForLocal(time);
    if (periods.length === 1) return periods[0];
    if (periods.length === 0) {
      throw new PeriodNotFound(
        `${ignoringOffset(time).toISOString().slice(0, 19)} is not valid for ${this.identifier}`,
      );
    }
    if (dst !== null) {
      const matching = periods.filter((period) => period.isDst() === dst);
      if (matching.length === 1) return matching[0];
    }
    if (block) return block(periods);
    throw new AmbiguousTime(
      `${ignoringOffset(time).toISOString().slice(0, 19)} is an ambiguous local time for ${this.identifier}`,
    );
  }

  currentPeriod(): TimezonePeriod {
    return this.periodForUtc(Time.now());
  }

  utcToLocal(time: Time): Time {
    if (this.info) return time.getlocal(this.info.constantOffset.observedUtcOffset);
    return time.getlocal(this.identifier);
  }

  localToUtc(
    time: Time | Temporal.PlainDateTime | Temporal.ZonedDateTime,
    dst: boolean | null = null,
  ): Time {
    if (time instanceof Temporal.ZonedDateTime) time = time.toPlainDateTime();
    if (time instanceof Temporal.PlainDateTime)
      time = Time.utc(
        time.year,
        time.month,
        time.day,
        time.hour,
        time.minute,
        time.second,
        time.millisecond * 1_000 + time.microsecond + time.nanosecond / 1_000,
      );
    const local = Time.at(new Rational(ignoringOffset(time).getTime(), 1000)).getutc();
    const localMs = toDate(local).getTime();
    const period = this.periodForLocal(local, dst);
    const utcNs = BigInt(localMs - period.observedUtcOffset * 1000) * 1_000_000n;
    return Time.at(new Rational(utcNs + BigInt(time.nsec % 1_000_000), 1_000_000_000n)).getutc();
  }
}

/** @noRailsEquivalent PERMANENT */
export class TimezoneOffset {
  readonly baseUtcOffset: number;
  readonly stdOffset: number;
  readonly abbreviation: string;

  constructor(baseUtcOffset: number, stdOffset: number, abbreviation: string) {
    this.baseUtcOffset = baseUtcOffset;
    this.stdOffset = stdOffset;
    this.abbreviation = abbreviation;
  }

  get observedUtcOffset(): number {
    return this.baseUtcOffset + this.stdOffset;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TimezoneOffset &&
      other.baseUtcOffset === this.baseUtcOffset &&
      other.stdOffset === this.stdOffset &&
      other.abbreviation === this.abbreviation
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export class ConstantOffsetDataTimezoneInfo {
  readonly identifier: string;
  readonly constantOffset: TimezoneOffset;

  constructor(identifier: string, constantOffset: TimezoneOffset) {
    this.identifier = identifier;
    this.constantOffset = constantOffset;
  }

  createTimezone(): Timezone {
    return new Timezone(this.identifier, this);
  }
}

/** @noRailsEquivalent PERMANENT */
export const TZInfo = {
  Timezone,
  DataTimezone: Timezone,
  TimezonePeriod,
  TimezoneOffset,
  AmbiguousTime,
  PeriodNotFound,
  InvalidTimezoneIdentifier,
  DataSources: { ConstantOffsetDataTimezoneInfo },
  Data: { name: "TZInfo::Data" },
};
