/**
 * ActiveSupport::Duration — mirrors the Rails API as closely as possible.
 */

export type DurationParts = {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;
const SECONDS_PER_MONTH = 30.4375 * SECONDS_PER_DAY;  // 1/12 of 365.25 * 86400
const SECONDS_PER_YEAR = 365.2425 * SECONDS_PER_DAY;

// Part ordering for inspect()
const PART_ORDER: (keyof DurationParts)[] = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
];

function zeroParts(): DurationParts {
  return { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
}

function mergeParts(a: DurationParts, b: DurationParts): DurationParts {
  const result = zeroParts();
  for (const key of PART_ORDER) {
    result[key] = a[key] + b[key];
  }
  return result;
}

export class Duration {
  readonly parts: DurationParts;

  constructor(parts: Partial<DurationParts> = {}) {
    this.parts = {
      years: parts.years ?? 0,
      months: parts.months ?? 0,
      weeks: parts.weeks ?? 0,
      days: parts.days ?? 0,
      hours: parts.hours ?? 0,
      minutes: parts.minutes ?? 0,
      seconds: parts.seconds ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  static seconds(n: number): Duration { return new Duration({ seconds: n }); }
  static minutes(n: number): Duration { return new Duration({ minutes: n }); }
  static hours(n: number): Duration { return new Duration({ hours: n }); }
  static days(n: number): Duration { return new Duration({ days: n }); }
  static weeks(n: number): Duration { return new Duration({ weeks: n }); }
  static months(n: number): Duration { return new Duration({ months: n }); }
  static years(n: number): Duration { return new Duration({ years: n }); }

  // ---------------------------------------------------------------------------
  // Arithmetic
  // ---------------------------------------------------------------------------

  plus(other: Duration | number): Duration {
    if (typeof other === "number") {
      return new Duration(mergeParts(this.parts, { ...zeroParts(), seconds: other }));
    }
    return new Duration(mergeParts(this.parts, other.parts));
  }

  minus(other: Duration | number): Duration {
    if (typeof other === "number") {
      return new Duration(mergeParts(this.parts, { ...zeroParts(), seconds: -other }));
    }
    return this.plus(other.negate());
  }

  times(n: number): Duration {
    const result = zeroParts();
    for (const key of PART_ORDER) {
      result[key] = this.parts[key] * n;
    }
    return new Duration(result);
  }

  dividedBy(n: number): Duration {
    // When dividing by a number, Rails converts to total seconds and creates a seconds-only Duration
    const totalSecs = this.inSeconds();
    return new Duration({ seconds: totalSecs / n });
  }

  negate(): Duration {
    return this.times(-1);
  }

  modulo(other: Duration | number): Duration {
    const thisSecs = this.inSeconds();
    const otherSecs = typeof other === "number" ? other : other.inSeconds();
    return new Duration({ seconds: thisSecs % otherSecs });
  }

  // ---------------------------------------------------------------------------
  // Conversion
  // ---------------------------------------------------------------------------

  inSeconds(): number {
    return (
      this.parts.years * SECONDS_PER_YEAR +
      this.parts.months * SECONDS_PER_MONTH +
      this.parts.weeks * SECONDS_PER_WEEK +
      this.parts.days * SECONDS_PER_DAY +
      this.parts.hours * SECONDS_PER_HOUR +
      this.parts.minutes * SECONDS_PER_MINUTE +
      this.parts.seconds
    );
  }

  inMilliseconds(): number {
    return this.inSeconds() * 1000;
  }

  inMinutes(): number {
    return this.inSeconds() / SECONDS_PER_MINUTE;
  }

  inHours(): number {
    return this.inSeconds() / SECONDS_PER_HOUR;
  }

  inDays(): number {
    return this.inSeconds() / SECONDS_PER_DAY;
  }

  inWeeks(): number {
    return this.inSeconds() / SECONDS_PER_WEEK;
  }

  inMonths(): number {
    return this.inSeconds() / SECONDS_PER_MONTH;
  }

  inYears(): number {
    return this.inSeconds() / SECONDS_PER_YEAR;
  }

  // ---------------------------------------------------------------------------
  // Date application — applies each part sequentially like Rails does
  // ---------------------------------------------------------------------------

  since(date: Date = new Date()): Date {
    return applyDuration(date, this.parts, 1);
  }

  ago(date: Date = new Date()): Date {
    return applyDuration(date, this.parts, -1);
  }

  fromNow(): Date {
    return this.since(new Date());
  }

  until(date: Date = new Date()): Date {
    return this.ago(date);
  }

  after(date: Date = new Date()): Date {
    return this.since(date);
  }

  before(date: Date = new Date()): Date {
    return this.ago(date);
  }

  // ---------------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------------

  inspect(): string {
    const activeParts: string[] = [];

    for (const key of PART_ORDER) {
      const val = this.parts[key];
      if (val !== 0) {
        const abs = Math.abs(val);
        activeParts.push(`${val} ${abs === 1 ? singular(key) : key}`);
      }
    }

    if (activeParts.length === 0) {
      return "0 seconds";
    }

    if (activeParts.length === 1) return activeParts[0];
    if (activeParts.length === 2) return `${activeParts[0]} and ${activeParts[1]}`;

    const last = activeParts[activeParts.length - 1];
    const rest = activeParts.slice(0, -1).join(", ");
    return `${rest}, and ${last}`;
  }

  toString(): string {
    return String(Math.round(this.inSeconds()));
  }

  isEqualTo(other: Duration): boolean {
    for (const key of PART_ORDER) {
      if (this.parts[key] !== other.parts[key]) return false;
    }
    return true;
  }

  eql(other: unknown): boolean {
    if (!(other instanceof Duration)) return false;
    // Rails eql? compares in_seconds values for Duration
    return Math.abs(this.inSeconds() - other.inSeconds()) < 0.001;
  }

  // comparable
  compareTo(other: Duration | number | unknown): number {
    if (typeof other !== "number" && !(other instanceof Duration)) return NaN;
    const a = this.inSeconds();
    const b = typeof other === "number" ? other : (other as Duration).inSeconds();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  isA(klass: unknown): boolean {
    return klass === Duration || this instanceof (klass as any);
  }

  // variable? — true when duration contains calendar units (days, weeks, months, years)
  isVariable(): boolean {
    return (
      this.parts.years !== 0 ||
      this.parts.months !== 0 ||
      this.parts.weeks !== 0 ||
      this.parts.days !== 0
    );
  }

  // ISO 8601 output
  iso8601(options: { precision?: number | null } = {}): string {
    const { years, months, weeks, days, hours, minutes, seconds } = this.parts;

    let datePart = "P";
    if (years !== 0) datePart += `${years}Y`;
    if (months !== 0) datePart += `${months}M`;
    // Rails converts weeks to days in ISO output
    const totalDays = weeks * 7 + days;
    if (totalDays !== 0) datePart += `${totalDays}D`;

    let timePart = "";
    if (hours !== 0) timePart += `${hours}H`;
    if (minutes !== 0) timePart += `${minutes}M`;

    const totalSeconds = seconds;
    if (totalSeconds !== 0 || (datePart === "P" && timePart === "")) {
      const precision = options.precision;
      let secStr: string;
      if (precision == null) {
        secStr = Number.isInteger(totalSeconds) ? String(totalSeconds) : String(totalSeconds);
      } else {
        secStr = totalSeconds.toFixed(precision);
      }
      timePart += `${secStr}S`;
    }

    if (timePart !== "") {
      return datePart + "T" + timePart;
    }
    if (datePart === "P") return "PT0S";
    return datePart;
  }

  // ISO 8601 parsing
  static parse(iso: string): Duration {
    if (!iso || iso === "P" || iso === "PT" || iso === "T" || /^[~.]/.test(iso)) {
      throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    const moreInvalidPatterns = [
      /^P\d+YT$/, /^PW$/, /^P\d+Y\d+W/,
      /^P\d+\.\d+Y\d+\.\d+M/, /^P\d+\.\d+MT\d+\.\d+S/
    ];
    for (const p of moreInvalidPatterns) {
      if (p.test(iso)) throw new Error(`Invalid ISO 8601 duration: "${iso}"`);
    }

    const pattern =
      /^([+-])?P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;

    const match = pattern.exec(iso.replace(/,/g, "."));
    if (!match) throw new Error(`Invalid ISO 8601 duration: "${iso}"`);

    const sign = match[1] === "-" ? -1 : 1;
    const parse = (s: string | undefined) => s ? parseFloat(s.replace(",", ".")) * sign : 0;

    return new Duration({
      years: parse(match[2]),
      months: parse(match[3]),
      weeks: parse(match[4]),
      days: parse(match[5]),
      hours: parse(match[6]),
      minutes: parse(match[7]),
      seconds: parse(match[8]),
    });
  }

  // Build from seconds (Rails' Duration.build)
  static build(value: unknown): Duration {
    if (typeof value !== "number") {
      const typeName = value === null ? "NilClass" : typeof value === "string" ? "String" : String(typeof value);
      throw new TypeError(`can't build an ActiveSupport::Duration from a ${typeName}`);
    }
    return new Duration({ seconds: value });
  }

  /** Sum an array of durations. Mirrors Enumerable#sum for durations. */
  static sum(durations: Duration[]): Duration {
    return durations.reduce((acc, d) => acc.plus(d), new Duration());
  }
}

// ---------------------------------------------------------------------------
// Numeric helpers — functional equivalents of Rails' numeric extensions
// (e.g. `5.minutes` in Ruby → `minutes(5)` in TypeScript)
// ---------------------------------------------------------------------------

/** @example seconds(30).since(date) */
export function seconds(n: number): Duration { return Duration.seconds(n); }
/** @example minutes(5).ago() */
export function minutes(n: number): Duration { return Duration.minutes(n); }
/** @example hours(2).fromNow() */
export function hours(n: number): Duration { return Duration.hours(n); }
/** @example days(3).since(date) */
export function days(n: number): Duration { return Duration.days(n); }
/** @example weeks(1).fromNow() */
export function weeks(n: number): Duration { return Duration.weeks(n); }
/** @example months(6).ago() */
export function months(n: number): Duration { return Duration.months(n); }
/** @example years(2).fromNow() */
export function years(n: number): Duration { return Duration.years(n); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function singular(key: keyof DurationParts): string {
  switch (key) {
    case "years": return "year";
    case "months": return "month";
    case "weeks": return "week";
    case "days": return "day";
    case "hours": return "hour";
    case "minutes": return "minute";
    case "seconds": return "second";
  }
}

/**
 * Apply duration parts to a Date sequentially, matching Rails advance() semantics.
 * direction: 1 for since/after, -1 for ago/before
 */
function applyDuration(date: Date, parts: DurationParts, direction: 1 | -1): Date {
  if (!(date instanceof Date)) {
    throw new TypeError(`expected a time or date, got ${JSON.stringify(date)}`);
  }

  let d = new Date(date.getTime());

  const years = parts.years * direction;
  const months = parts.months * direction;
  const weeks = parts.weeks * direction;
  const days = parts.days * direction;
  const hours = parts.hours * direction;
  const minutes = parts.minutes * direction;
  const seconds = parts.seconds * direction;

  // Integer years via setFullYear for calendar accuracy
  if (Number.isInteger(years) && years !== 0) {
    d.setFullYear(d.getFullYear() + years);
  } else if (years !== 0) {
    d = new Date(d.getTime() + years * SECONDS_PER_YEAR * 1000);
  }

  // Integer months via setMonth for calendar accuracy
  if (Number.isInteger(months) && months !== 0) {
    d.setMonth(d.getMonth() + months);
  } else if (months !== 0) {
    d = new Date(d.getTime() + months * SECONDS_PER_MONTH * 1000);
  }

  // Integer weeks and days via setDate for calendar accuracy
  const intWeeks = Math.trunc(weeks);
  const fracWeeks = weeks - intWeeks;
  if (intWeeks !== 0) {
    d.setDate(d.getDate() + intWeeks * 7);
  }

  const intDays = Math.trunc(days);
  const fracDays = days - intDays;
  if (intDays !== 0) {
    d.setDate(d.getDate() + intDays);
  }

  // Fractional weeks/days + time parts via millisecond arithmetic
  const extraMs =
    fracWeeks * 7 * SECONDS_PER_DAY * 1000 +
    fracDays * SECONDS_PER_DAY * 1000 +
    hours * SECONDS_PER_HOUR * 1000 +
    minutes * SECONDS_PER_MINUTE * 1000 +
    seconds * 1000;

  if (extraMs !== 0) {
    d = new Date(d.getTime() + extraMs);
  }

  return d;
}
