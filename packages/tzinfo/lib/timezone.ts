/**
 * TZInfo 2 stand-in, backed by the built-in Intl API and the tzdata that
 * `@blazetrails/date` carries. ActiveSupport::TimeZone wraps a `Timezone`.
 *
 * @boundary-file: `Intl.DateTimeFormat#formatToParts` requires a JS `Date`
 *   input, so this file traffics in `Date` for offset/abbrev/DST lookups and
 *   for the `local`-to-UTC ambiguity search.
 */

import {
  DateTime,
  Time,
  Timezone as DateTimezone,
  tzdataAbbreviation,
  tzdataAbbreviationChanges,
  tzdataBaseOffsets,
  tzdataIsdstFlips,
  tzdataOffsetInstant,
} from "@blazetrails/date";
import {
  ArgumentError,
  Rational,
  StandardError,
  TopLevel,
  rbModName,
} from "@blazetrails/ruby-compat";
import { OffsetTimezonePeriod } from "./offset-timezone-period.js";
import { TimezoneOffset } from "./timezone-offset.js";
import { TimezonePeriod } from "./timezone-period.js";
import type { TimezoneProxy } from "./timezone-proxy.js";
import { TransitionsTimezonePeriod } from "./transitions-timezone-period.js";
import { TimezoneTransition } from "./timezone-transition.js";
import { DataTimezoneInfo } from "./data-sources/data-timezone-info.js";
import { Timestamp } from "./timestamp.js";

export class AmbiguousTime extends Error {
  override name = "AmbiguousTime";
}

export class PeriodNotFound extends Error {
  override name = "PeriodNotFound";
}

export class UnknownTimezone extends StandardError {}

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

const localFormatters = new Map<string, Intl.DateTimeFormat>();

const fixedZoneInfos = new Map<string, { abbreviation: string; utcOffsetSeconds: number } | null>();
const fixedZoneAbbreviations = new Map<string, string>();

function getZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  const at = Math.floor(date.getTime() / 1000);
  const instant = tzdataOffsetInstant(ianaName, at);
  if (instant !== at) date = new Date(instant * 1000);
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
  const interval = { start, end, info: lookupZoneInfo(ianaName, date) };
  intervals.splice(lo, 0, interval);
  return interval;
}

function lookupZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  const abbreviation = tzdataAbbreviation(ianaName, Math.floor(date.getTime() / 1000))!;

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

/** @noRailsEquivalent CONVERGEABLE tzinfo-timezone-reads-the-data-source */
function _abbrAt(ianaName: string, date: Date): string {
  const fixed = fixedZoneAbbreviations.get(ianaName);
  if (fixed !== undefined) return fixed;
  const interval = zoneInterval(ianaName, date);
  if (interval?.abbr !== undefined) return interval.abbr;
  const result = new DateTimezone(ianaName).abbr(Time.at(new Rational(date.getTime(), 1000)));
  getZoneInfo(ianaName, date);
  if (fixedZoneInfos.get(ianaName) != null) fixedZoneAbbreviations.set(ianaName, result);
  else if (interval) interval.abbr = result;
  return result;
}

/** @perf 190x — CONVERGEABLE tzinfo-timezone-reads-the-data-source */
const _periodsCache = new Map<string, TimezonePeriod[]>();

/** @perf 1.7x — CONVERGEABLE tzinfo-timezone-reads-the-data-source */
const _offsetPeriodsCache = new Map<string, OffsetTimezonePeriod>();

/** @noRailsEquivalent CONVERGEABLE tzinfo-timezone-reads-the-data-source */
class _IntlDataTimezoneInfo extends DataTimezoneInfo {
  override periodFor(timestamp: Timestamp): TimezonePeriod {
    const constant = _offsetPeriodsCache.get(this.identifier);
    if (constant) return constant;
    const at = timestamp.value;
    let cached = _periodsCache.get(this.identifier);
    if (!cached) _periodsCache.set(this.identifier, (cached = []));
    for (const period of cached) {
      const start = period.startTransition?.timestampValue ?? -Infinity;
      const end = period.endTransition?.timestampValue ?? Infinity;
      if (start <= at && at < end) return period;
    }
    const [initialBase, baseInstants, bases] = tzdataBaseOffsets(this.identifier) ?? [null, [], []];
    const offsetAt = (seconds: number): TimezoneOffset => {
      const d = new Date(seconds * 1000);
      const observed = getZoneInfo(this.identifier, d).utcOffsetSeconds;
      let i = 0;
      while (i < baseInstants.length && baseInstants[i] <= seconds) i++;
      const base = (i === 0 ? initialBase : bases[i - 1]) ?? observed;
      return new TimezoneOffset(base, observed - base, _abbrAt(this.identifier, d));
    };
    const flips = tzdataIsdstFlips(this.identifier);
    let flipIndex = 0;
    while (flipIndex < flips.length && flips[flipIndex] <= at) flipIndex++;
    let baseIndex = 0;
    while (baseIndex < baseInstants.length && baseInstants[baseIndex] <= at) baseIndex++;
    const zoned = Temporal.Instant.fromEpochMilliseconds(at * 1000 + 1).toZonedDateTimeISO(
      this.identifier,
    );
    const previous = zoned.getTimeZoneTransition("previous");
    const next = zoned.getTimeZoneTransition("next");
    const starts = [
      flips[flipIndex - 1],
      baseInstants[baseIndex - 1],
      previous && previous.epochMilliseconds / 1000,
    ];
    const ends = [flips[flipIndex], baseInstants[baseIndex], next && next.epochMilliseconds / 1000];
    const start = Math.max(...starts.filter((s): s is number => s != null));
    const end = Math.min(...ends.filter((e): e is number => e != null));
    const offset = offsetAt(at);
    if (!Number.isFinite(start) && !Number.isFinite(end)) {
      const period = new OffsetTimezonePeriod(offset);
      _offsetPeriodsCache.set(this.identifier, period);
      return period;
    }
    const period = new TransitionsTimezonePeriod(
      Number.isFinite(start) ? new TimezoneTransition(offset, offsetAt(start - 1), start) : null,
      Number.isFinite(end) ? new TimezoneTransition(offsetAt(end), offset, end) : null,
    );
    cached.push(period);
    return period;
  }

  override periodsForLocal(localTimestamp: Timestamp): TimezonePeriod[] {
    const localTimestampValue = localTimestamp.value;
    const around = [
      getZoneInfo(this.identifier, new Date((localTimestampValue - 86400) * 1000)).utcOffsetSeconds,
      getZoneInfo(this.identifier, new Date((localTimestampValue + 86400) * 1000)).utcOffsetSeconds,
    ];
    const candidates = [...new Set(around)].sort((a, b) => b - a);
    const periods: TimezonePeriod[] = [];
    for (const offset of candidates) {
      const utcTimestampValue = localTimestampValue - offset;
      if (
        getZoneInfo(this.identifier, new Date(utcTimestampValue * 1000)).utcOffsetSeconds === offset
      ) {
        periods.push(this.periodFor(Timestamp.utc(utcTimestampValue)));
      }
    }
    return periods;
  }
}

export class Timezone {
  /** @missingRailsCall get_timezone_info — CONVERGEABLE tzinfo-timezone-reads-the-data-source */
  static get(identifier: string): Timezone {
    if (!loadedTimezoneIdentifiers.has(identifier)) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: identifier });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
      }
      if (
        !this.allIdentifiers().includes(identifier) ||
        tzdataAbbreviation(identifier, 0) === undefined
      ) {
        throw new InvalidTimezoneIdentifier(`Invalid identifier: ${identifier}`);
      }
      loadedTimezoneIdentifiers.add(identifier);
    }
    return new _IntlDataTimezoneInfo(identifier).createTimezone();
  }

  static getProxy(identifier: string): TimezoneProxy {
    return new TopLevel.TZInfo!.TimezoneProxy(identifier);
  }

  static all(): Timezone[] {
    return this.getProxies(this.allIdentifiers());
  }

  static allIdentifiers(): string[] {
    return [...new Set([...Intl.supportedValuesOf("timeZone"), ...TZDB_NAMES])].sort();
  }

  /** @internal */
  private static getProxies(identifiers: readonly string[]): TimezoneProxy[] {
    return identifiers.map((identifier) => this.getProxy(identifier));
  }

  constructor() {}

  get identifier(): string {
    return this.raiseUnknownTimezone();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  periodFor(time: Time | DateTime | Timestamp): TimezonePeriod {
    this.raiseUnknownTimezone();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  periodsForLocal(localTime: Time | DateTime | Timestamp): TimezonePeriod[] {
    this.raiseUnknownTimezone();
  }

  transitionsUpTo(
    to: Time | DateTime | Timestamp,
    // eslint-disable-next-line unused-imports/no-unused-vars
    from: Time | DateTime | Timestamp | null = null,
  ): TimezoneTransition[] {
    this.raiseUnknownTimezone();
  }

  canonicalZone(): Timezone {
    this.raiseUnknownTimezone();
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

  inspect(): string {
    return `#<${rbModName(this.constructor)}: ${this.identifier}>`;
  }

  abbr(time: Time | DateTime | Timestamp = Time.now()): string {
    return this.periodFor(time).abbreviation;
  }

  observedUtcOffset(time: Time | DateTime | Timestamp = Time.now()): number {
    return this.periodFor(time).observedUtcOffset;
  }

  isDst(time: Time | DateTime | Timestamp = Time.now()): boolean {
    return this.periodFor(time).isDst();
  }

  get canonicalIdentifier(): string {
    return this.canonicalZone().identifier;
  }

  periodForUtc(utcTime: Time): TimezonePeriod {
    if (utcTime == null) throw new ArgumentError("utc_time must be specified");
    return this.periodFor(Timestamp.for(utcTime, "treatAsUtc"));
  }

  periodForLocal(
    localTime: Time | DateTime | Timestamp,
    dst: boolean | null = null,
    block?: (periods: TimezonePeriod[]) => TimezonePeriod | TimezonePeriod[] | null,
  ): TimezonePeriod {
    if (localTime == null) throw new ArgumentError("local_time must be specified");
    localTime = Timestamp.for(localTime, "ignore");
    let results: TimezonePeriod | TimezonePeriod[] | null = this.periodsForLocal(localTime);

    if (results.length === 0) {
      throw new PeriodNotFound(
        `${localTime.strftime("%Y-%m-%d %H:%M:%S")} is an invalid local time.`,
      );
    } else if (results.length < 2) {
      return results[0];
    } else {
      if (dst != null) {
        const matches = results.filter((period) => period.isDst() === dst);
        if (matches.length !== 0) results = matches;
      }

      if (results.length < 2) {
        return results[0];
      } else {
        if (block) results = block(results);

        if (results instanceof TimezonePeriod) {
          return results;
        } else if (results != null && results.length === 1) {
          return results[0];
        } else {
          throw new AmbiguousTime(
            `${localTime.strftime("%Y-%m-%d %H:%M:%S")} is an ambiguous local time.`,
          );
        }
      }
    }
  }

  currentPeriod(): TimezonePeriod {
    return this.periodFor(Time.now());
  }

  /** @inventedArm if — CONVERGEABLE tzinfo-timezone-reads-the-data-source */
  utcToLocal(utcTime: Time): Time {
    if (utcTime == null) throw new ArgumentError("utc_time must be specified");
    const period = this.periodForUtc(utcTime);
    if (loadedTimezoneIdentifiers.has(this.identifier)) return utcTime.getlocal(this.identifier);
    return utcTime.getlocal(period.observedUtcOffset);
  }

  localToUtc(
    time: Time | DateTime | Temporal.PlainDateTime | Temporal.ZonedDateTime,
    dst: boolean | null = null,
  ): Time {
    if (time instanceof DateTime) time = time.toTime();
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

  /** @internal */
  private raiseUnknownTimezone(): never {
    throw new UnknownTimezone(
      "TZInfo::Timezone should not be constructed directly (use TZInfo::Timezone.get instead)",
    );
  }
}
