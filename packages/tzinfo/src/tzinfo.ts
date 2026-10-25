/**
 * TZInfo 2 stand-in, backed by the built-in Intl API and the tzdata that
 * `@blazetrails/date` carries. ActiveSupport::TimeZone wraps a `Timezone`.
 *
 * @boundary-file: `Intl.DateTimeFormat#formatToParts` requires a JS `Date`
 *   input, so this file traffics in `Date` for offset/abbrev/DST lookups and
 *   for the `local`-to-UTC ambiguity search.
 */

import { Temporal, Time, tzdataIsdst } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export class InvalidTimezoneIdentifier extends Error {
  override name = "InvalidTimezoneIdentifier";
}

export function toDate(at: Date | Temporal.Instant | Time): Date {
  if (at instanceof Date) return at;
  if (at instanceof Time) return new Date(at.toZonedDateTime().toInstant().epochMilliseconds);
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

export function getZoneInfo(
  ianaName: string,
  date: Date,
): { abbreviation: string; utcOffsetSeconds: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaName,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  let abbreviation = tzPart?.value ?? ianaName;
  if (abbreviation === "UTC" && ETC_GMT_LINKS.has(ianaName)) abbreviation = "GMT";

  const roundedDate = new Date(Math.floor(date.getTime() / 60000) * 60000);

  const localFormatter = new Intl.DateTimeFormat("en-US", {
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

  isDst(time: Date | Temporal.Instant | Time): boolean {
    return tzdataIsdst(this.identifier, Math.floor(toDate(time).getTime() / 1000));
  }

  periodForUtc(time: Time): TimezonePeriod {
    const d = toDate(time);
    return new TimezonePeriod(this.abbr(d), this.observedUtcOffset(d), this.isDst(d));
  }

  periodsForLocal(time: Time): TimezonePeriod[] {
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
    dst: boolean | null = true,
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

  utcToLocal(time: Time): Temporal.ZonedDateTime {
    return time.toZonedDateTime().toInstant().toZonedDateTimeISO(this.identifier);
  }

  localToUtc(time: Time, dst: boolean | null = true): Time {
    const local = Time.at(new Rational(ignoringOffset(time).getTime(), 1000)).getutc();
    const localMs = toDate(local).getTime();
    const period = this.periodForLocal(local, dst);
    return Time.at(new Rational(localMs - period.observedUtcOffset * 1000, 1000)).getutc();
  }
}
