import { I18n } from "@blazetrails/activesupport";

/**
 * ActionView::Helpers::DateHelper — formatting half.
 *
 * Implements `distanceOfTimeInWords`, `timeAgoInWords`, and the
 * `distanceOfTimeInWordsToNow` alias. Date-select tag helpers are part of
 * Phase 5 T3 and not included here.
 */

const MINUTES_IN_YEAR = 525600;
const MINUTES_IN_QUARTER_YEAR = 131400;
const MINUTES_IN_THREE_QUARTERS_YEAR = 394200;

const DEFAULT_DISTANCE_IN_WORDS: Record<string, { one: string; other: string } | string> = {
  half_a_minute: "half a minute",
  less_than_x_seconds: { one: "less than 1 second", other: "less than %{count} seconds" },
  x_seconds: { one: "1 second", other: "%{count} seconds" },
  less_than_x_minutes: { one: "less than a minute", other: "less than %{count} minutes" },
  x_minutes: { one: "1 minute", other: "%{count} minutes" },
  about_x_hours: { one: "about 1 hour", other: "about %{count} hours" },
  x_days: { one: "1 day", other: "%{count} days" },
  about_x_months: { one: "about 1 month", other: "about %{count} months" },
  x_months: { one: "1 month", other: "%{count} months" },
  about_x_years: { one: "about 1 year", other: "about %{count} years" },
  over_x_years: { one: "over 1 year", other: "over %{count} years" },
  almost_x_years: { one: "almost 1 year", other: "almost %{count} years" },
};

export type DistanceOfTimeInput = Date | number | { toDate: () => Date } | { toTime: () => Date };

export interface DistanceOfTimeOptions {
  includeSeconds?: boolean;
  scope?: string;
  locale?: string;
}

/** @internal */
function normalizeDistanceOfTimeArgumentToTime(value: DistanceOfTimeInput): Date {
  // boundary: numeric input is seconds-since-epoch, matching Ruby Time.at(n).
  if (typeof value === "number") return new Date(value * 1000);
  // boundary: public API accepts JS Date as a primary input shape.
  if (value instanceof Date) return value;
  if (value && typeof (value as { toTime?: unknown }).toTime === "function") {
    return (value as { toTime: () => Date }).toTime();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  throw new TypeError(`${String(value)} can't be converted to a Time value`);
}

/** @internal */
function lookupTranslation(
  scope: string,
  key: string,
  locale: string | undefined,
): { one?: string; other?: string } | string | undefined {
  const result = I18n.translate(`${scope}.${key}`, { locale, default: null });
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as { one?: string; other?: string };
  }
  return undefined;
}

/** @internal */
function translateDistance(
  key: string,
  count: number,
  scope: string,
  locale: string | undefined,
): string {
  const looked = lookupTranslation(scope, key, locale) ?? DEFAULT_DISTANCE_IN_WORDS[key];
  if (looked === undefined) return `[missing: ${scope}.${key}]`;
  if (typeof looked === "string") return looked.replace(/%\{count\}/g, String(count));
  const variant = count === 1 ? looked.one : looked.other;
  const template = variant ?? looked.other ?? looked.one ?? "";
  return template.replace(/%\{count\}/g, String(count));
}

/**
 * Reports the approximate distance in time between two dates as a human
 * phrase ("about 1 hour", "3 days", etc.). Mirrors Rails
 * `ActionView::Helpers::DateHelper#distance_of_time_in_words`.
 *
 * - `toTime` defaults to 0 (epoch), matching Rails' default argument.
 * - Numeric inputs are seconds since the Unix epoch (Rails `Time.at(n)`).
 * - With `includeSeconds: true`, sub-minute differences resolve to
 *   "less than N seconds" / "half a minute" / "1 minute".
 */
export function distanceOfTimeInWords(
  fromTime: DistanceOfTimeInput,
  toTime: DistanceOfTimeInput = 0,
  options: DistanceOfTimeOptions = {},
): string {
  const scope = options.scope ?? "datetime.distance_in_words";
  const locale = options.locale;

  let from = normalizeDistanceOfTimeArgumentToTime(fromTime);
  let to = normalizeDistanceOfTimeArgumentToTime(toTime);
  if (from.getTime() > to.getTime()) {
    [from, to] = [to, from];
  }

  const distanceInSeconds = Math.round((to.getTime() - from.getTime()) / 1000);
  const distanceInMinutes = Math.round(distanceInSeconds / 60);

  const t = (key: string, count = 1): string => translateDistance(key, count, scope, locale);

  if (distanceInMinutes <= 1) {
    if (!options.includeSeconds) {
      return distanceInMinutes === 0
        ? t("less_than_x_minutes", 1)
        : t("x_minutes", distanceInMinutes);
    }
    if (distanceInSeconds <= 4) return t("less_than_x_seconds", 5);
    if (distanceInSeconds <= 9) return t("less_than_x_seconds", 10);
    if (distanceInSeconds <= 19) return t("less_than_x_seconds", 20);
    if (distanceInSeconds <= 39) return t("half_a_minute");
    if (distanceInSeconds <= 59) return t("less_than_x_minutes", 1);
    return t("x_minutes", 1);
  }
  if (distanceInMinutes < 45) return t("x_minutes", distanceInMinutes);
  if (distanceInMinutes < 90) return t("about_x_hours", 1);
  if (distanceInMinutes < 1440) return t("about_x_hours", Math.round(distanceInMinutes / 60));
  if (distanceInMinutes < 2520) return t("x_days", 1);
  if (distanceInMinutes < 43200) return t("x_days", Math.round(distanceInMinutes / 1440));
  if (distanceInMinutes < 86400) return t("about_x_months", Math.round(distanceInMinutes / 43200));
  if (distanceInMinutes < 525600) return t("x_months", Math.round(distanceInMinutes / 43200));

  let fromYear = from.getUTCFullYear();
  if (from.getUTCMonth() + 1 >= 3) fromYear += 1;
  let toYear = to.getUTCFullYear();
  if (to.getUTCMonth() + 1 < 3) toYear -= 1;
  let leapYears = 0;
  if (fromYear <= toYear) {
    for (let y = fromYear; y <= toYear; y++) {
      if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) leapYears += 1;
    }
  }
  const minutesWithOffset = distanceInMinutes - leapYears * 1440;
  const remainder = ((minutesWithOffset % MINUTES_IN_YEAR) + MINUTES_IN_YEAR) % MINUTES_IN_YEAR;
  const distanceInYears = Math.trunc(minutesWithOffset / MINUTES_IN_YEAR);
  if (remainder < MINUTES_IN_QUARTER_YEAR) return t("about_x_years", distanceInYears);
  if (remainder < MINUTES_IN_THREE_QUARTERS_YEAR) return t("over_x_years", distanceInYears);
  return t("almost_x_years", distanceInYears + 1);
}

/**
 * Like {@link distanceOfTimeInWords}, but with `toTime` fixed to the
 * current time. Numeric inputs are not accepted, matching Rails.
 */
export function timeAgoInWords(
  fromTime: Exclude<DistanceOfTimeInput, number>,
  options: DistanceOfTimeOptions = {},
): string {
  // boundary: "now" sentinel — JS Date is the canonical wall-clock source here.
  return distanceOfTimeInWords(fromTime, new Date(), options);
}

/** Alias of {@link timeAgoInWords}. */
export const distanceOfTimeInWordsToNow = timeAgoInWords;
