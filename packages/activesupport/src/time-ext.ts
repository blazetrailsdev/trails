/**
 * Time/Date extension functions following Rails' ActiveSupport::CoreExt::Time
 * and ActiveSupport::CoreExt::Date patterns.
 *
 * All functions operate on JavaScript Date objects (local time).
 */

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayIndex(day: string): number {
  const idx = DAY_NAMES.indexOf(day.toLowerCase());
  if (idx === -1) throw new Error(`Unknown day: ${day}`);
  return idx;
}

function clone(date: Date): Date {
  return new Date(date.getTime());
}

// ---------------------------------------------------------------------------
// Day boundaries
// ---------------------------------------------------------------------------

export function beginningOfDay(date: Date): Date {
  const d = clone(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function middleOfDay(date: Date): Date {
  const d = clone(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = clone(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Hour boundaries
// ---------------------------------------------------------------------------

export function beginningOfHour(date: Date): Date {
  const d = clone(date);
  d.setMinutes(0, 0, 0);
  return d;
}

export function endOfHour(date: Date): Date {
  const d = clone(date);
  d.setMinutes(59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Minute boundaries
// ---------------------------------------------------------------------------

export function beginningOfMinute(date: Date): Date {
  const d = clone(date);
  d.setSeconds(0, 0);
  return d;
}

export function endOfMinute(date: Date): Date {
  const d = clone(date);
  d.setSeconds(59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Week boundaries
// startDay: 0 = Sunday (default Rails), 1 = Monday
// ---------------------------------------------------------------------------

export function beginningOfWeek(date: Date, startDay = 1): Date {
  const d = clone(date);
  const currentDay = d.getDay();
  let diff = currentDay - startDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date, startDay = 1): Date {
  const d = beginningOfWeek(date, startDay);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Month boundaries
// ---------------------------------------------------------------------------

export function beginningOfMonth(date: Date): Date {
  const d = clone(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = clone(date);
  // First day of next month, then go back 1ms
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - 1);
  return d;
}

// ---------------------------------------------------------------------------
// Quarter boundaries
// ---------------------------------------------------------------------------

export function beginningOfQuarter(date: Date): Date {
  const d = clone(date);
  const month = d.getMonth(); // 0-11
  const quarterStartMonth = Math.floor(month / 3) * 3;
  d.setMonth(quarterStartMonth, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfQuarter(date: Date): Date {
  const d = clone(date);
  const month = d.getMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  d.setMonth(quarterEndMonth + 1, 1);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() - 1);
  return d;
}

// ---------------------------------------------------------------------------
// Year boundaries
// ---------------------------------------------------------------------------

export function beginningOfYear(date: Date): Date {
  const d = clone(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfYear(date: Date): Date {
  const d = clone(date);
  d.setMonth(11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// next/prev Week/Month/Year/Day
// ---------------------------------------------------------------------------

export function nextWeek(date: Date, day = "monday"): Date {
  const targetDay = dayIndex(day);
  const d = clone(date);
  // Move to next week's Monday first (or any day in next week)
  d.setDate(d.getDate() + 7);
  // Then set to desired day of that week
  const bow = beginningOfWeek(d, 1); // Monday-based
  const diff = (targetDay - 1 + 7) % 7; // offset from Monday
  bow.setDate(bow.getDate() + diff);
  bow.setHours(0, 0, 0, 0);
  return bow;
}

export function prevWeek(date: Date, day = "monday"): Date {
  const targetDay = dayIndex(day);
  const d = clone(date);
  d.setDate(d.getDate() - 7);
  const bow = beginningOfWeek(d, 1);
  const diff = (targetDay - 1 + 7) % 7;
  bow.setDate(bow.getDate() + diff);
  bow.setHours(0, 0, 0, 0);
  return bow;
}

export function nextMonth(date: Date): Date {
  const d = clone(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // Handle month overflow (e.g. Jan 31 -> Feb 28)
  if (d.getDate() !== day) {
    d.setDate(0); // last day of previous month
  }
  return d;
}

export function prevMonth(date: Date): Date {
  const d = clone(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() - 1);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

export function nextYear(date: Date): Date {
  const d = clone(date);
  const month = d.getMonth();
  const day = d.getDate();
  d.setFullYear(d.getFullYear() + 1);
  // Handle leap day (Feb 29 -> Feb 28)
  if (d.getMonth() !== month) {
    d.setDate(0);
  }
  if (d.getDate() !== day && d.getMonth() === month) {
    d.setDate(0);
  }
  return d;
}

export function prevYear(date: Date): Date {
  const d = clone(date);
  const month = d.getMonth();
  d.setFullYear(d.getFullYear() - 1);
  if (d.getMonth() !== month) {
    d.setDate(0);
  }
  return d;
}

export function nextDay(date: Date): Date {
  const d = clone(date);
  d.setDate(d.getDate() + 1);
  return d;
}

export function prevDay(date: Date): Date {
  const d = clone(date);
  d.setDate(d.getDate() - 1);
  return d;
}

// Alias used in Rails
export { nextDay as tomorrow, prevDay as yesterday };

// ---------------------------------------------------------------------------
// next/prev occurring
// ---------------------------------------------------------------------------

export function nextOccurring(date: Date, day: string): Date {
  const targetDay = dayIndex(day);
  const d = clone(date);
  let diff = targetDay - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function prevOccurring(date: Date, day: string): Date {
  const targetDay = dayIndex(day);
  const d = clone(date);
  let diff = d.getDay() - targetDay;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return d;
}

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

export function advance(
  date: Date,
  options: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
  },
): Date {
  let d = clone(date);

  if (options.years) {
    const month = d.getMonth();
    d.setFullYear(d.getFullYear() + options.years);
    if (d.getMonth() !== month) d.setDate(0);
  }

  if (options.months) {
    const targetMonth = d.getMonth() + options.months;
    const expectedMonth = ((targetMonth % 12) + 12) % 12;
    d.setMonth(targetMonth);
    if (d.getMonth() !== expectedMonth) d.setDate(0);
  }

  let ms = 0;
  if (options.weeks) ms += options.weeks * 7 * 24 * 3600 * 1000;
  if (options.days) ms += options.days * 24 * 3600 * 1000;
  if (options.hours) ms += options.hours * 3600 * 1000;
  if (options.minutes) ms += options.minutes * 60 * 1000;
  if (options.seconds) ms += options.seconds * 1000;

  d = new Date(d.getTime() + ms);
  return d;
}

// ---------------------------------------------------------------------------
// Seconds calculations
// ---------------------------------------------------------------------------

export function secondsSinceMidnight(date: Date): number {
  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds() +
    date.getMilliseconds() / 1000
  );
}

export function secondsUntilEndOfDay(date: Date): number {
  return 86399 - Math.floor(secondsSinceMidnight(date));
}

// ---------------------------------------------------------------------------
// Days/year helpers
// ---------------------------------------------------------------------------

export function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  // month is 1-indexed
  return new Date(year, month, 0).getDate();
}

export function daysInYear(year: number): number {
  return leapYear(year) ? 366 : 365;
}

// ---------------------------------------------------------------------------
// all* ranges
// ---------------------------------------------------------------------------

export function allDay(date: Date): { start: Date; end: Date } {
  return { start: beginningOfDay(date), end: endOfDay(date) };
}

export function allWeek(date: Date): { start: Date; end: Date } {
  return { start: beginningOfWeek(date), end: endOfWeek(date) };
}

export function allMonth(date: Date): { start: Date; end: Date } {
  return { start: beginningOfMonth(date), end: endOfMonth(date) };
}

export function allQuarter(date: Date): { start: Date; end: Date } {
  return { start: beginningOfQuarter(date), end: endOfQuarter(date) };
}

export function allYear(date: Date): { start: Date; end: Date } {
  return { start: beginningOfYear(date), end: endOfYear(date) };
}

// ---------------------------------------------------------------------------
// ago / since
// ---------------------------------------------------------------------------

export function ago(date: Date, seconds: number): Date {
  return new Date(date.getTime() - seconds * 1000);
}

export function since(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

// ---------------------------------------------------------------------------
// changeDate
// ---------------------------------------------------------------------------

export function changeDate(
  date: Date,
  options: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    min?: number;
    sec?: number;
  },
): Date {
  const d = clone(date);
  if (options.year !== undefined) d.setFullYear(options.year);
  if (options.month !== undefined) d.setMonth(options.month - 1); // 1-indexed
  if (options.day !== undefined) d.setDate(options.day);
  if (options.hour !== undefined) d.setHours(options.hour, 0, 0, 0);
  if (options.min !== undefined) d.setMinutes(options.min, 0, 0);
  if (options.sec !== undefined) d.setSeconds(options.sec, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Boolean predicates
// ---------------------------------------------------------------------------

export function onWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function onWeekend(date: Date): boolean {
  return !onWeekday(date);
}

export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function isTomorrow(date: Date): boolean {
  const tomorrow = nextDay(new Date());
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
}

export function isYesterday(date: Date): boolean {
  const yesterday = prevDay(new Date());
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * floor — rounds time down to nearest multiple of ms.
 */
export function floor(date: Date, ms: number): Date {
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/**
 * ceil — rounds time up to nearest multiple of ms.
 */
export function ceil(date: Date, ms: number): Date {
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/**
 * secFraction — returns the sub-second fraction of a Date as a float.
 */
export function secFraction(date: Date): number {
  return date.getMilliseconds() / 1000;
}

/**
 * toFs — formats a Date as a string using various named formats.
 */
export function toFs(date: Date, format: string = "default"): string {
  switch (format) {
    case "db":
      return date
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");
    case "long":
      return (
        date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 8)
      );
    case "short":
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 5)
      );
    case "rfc822":
    case "rfc2822":
      return date.toUTCString();
    case "iso8601":
    case "xmlschema":
      return date.toISOString();
    case "inspect":
      return date.toISOString();
    default:
      return (
        date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " " +
        date.toTimeString().slice(0, 8)
      );
  }
}

/**
 * xmlschema — returns ISO 8601 representation.
 */
export function xmlschema(date: Date): string {
  return date.toISOString();
}

/**
 * lastWeek — returns the start of last week.
 */
export function lastWeek(date: Date, startDay = "monday"): Date {
  return prevWeek(date, startDay);
}

/**
 * toDate — returns a Date object representing just the date portion.
 */
export function toDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * toTime — alias, returns same date (in TS, Date represents both date and time).
 */
export function toTime(date: Date): Date {
  return new Date(date.getTime());
}

/**
 * formattedOffset — returns the UTC offset formatted as ±HH:MM.
 */
export function formattedOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const h = String(Math.floor(absMin / 60)).padStart(2, "0");
  const m = String(absMin % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}
