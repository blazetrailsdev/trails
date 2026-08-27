/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */

import { Rational, Temporal, cCivilToJd, strftime, type StrftimeSubject } from "@blazetrails/date";
import { ActiveRecord } from "../../ar-config.js";

const TIME_DB_FORMAT = "%Y-%m-%d %H:%M:%S";
const DATE_DB_FORMAT = "%Y-%m-%d";

/** @internal */
function strftimeSubject(v: {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  dayOfYear: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
  nanosecond: number;
}): StrftimeSubject {
  return {
    year: v.year,
    jd: cCivilToJd(v.year, v.month, v.day),
    nth: 0n,
    gregorianP: true,
    mon: v.month,
    day: v.day,
    wday: v.dayOfWeek % 7,
    yday: v.dayOfYear,
    hour: v.hour,
    min: v.minute,
    sec: v.second,
    nsec: new Rational(v.millisecond * 1_000_000 + v.microsecond * 1_000 + v.nanosecond, 1),
    zone: "",
    utcOffset: 0,
  };
}

function toFsDbWithUsec(subject: StrftimeSubject): string {
  const nsec = subject.nsec.div(1);
  return strftime(subject, TIME_DB_FORMAT) + microsecondFraction(Math.floor(nsec / 1_000));
}

export function defaultSqlTimezone(): string {
  return ActiveRecord.defaultTimezone === "utc" ? "UTC" : Temporal.Now.timeZoneId();
}

export function formatInstantForSql(value: Temporal.Instant): string {
  return toFsDbWithUsec(strftimeSubject(value.toZonedDateTimeISO(defaultSqlTimezone())));
}

export function formatPlainDateTimeForSql(value: Temporal.PlainDateTime): string {
  return toFsDbWithUsec(strftimeSubject(value));
}

export function formatPlainDateForSql(value: Temporal.PlainDate): string {
  return strftime(strftimeSubject(value.toPlainDateTime()), DATE_DB_FORMAT);
}

function bceSuffixed(year: number, superResult: string): string {
  if (year <= 0) {
    const bceYear = String(-year + 1).padStart(4, "0");
    return `${superResult.replace(/^-?\d+/, bceYear)} BC`;
  }
  return superResult;
}

export function formatInstantForSqlPostgres(value: Temporal.Instant): string {
  const z = value.toZonedDateTimeISO(defaultSqlTimezone());
  return bceSuffixed(z.year, formatInstantForSql(value));
}

export function formatPlainDateTimeForSqlPostgres(value: Temporal.PlainDateTime): string {
  return bceSuffixed(value.year, formatPlainDateTimeForSql(value));
}

export function formatPlainDateForSqlPostgres(value: Temporal.PlainDate): string {
  return bceSuffixed(value.year, formatPlainDateForSql(value));
}

export function formatPlainTimeForSql(value: Temporal.PlainTime): string {
  const dt = new Temporal.PlainDateTime(
    2000,
    1,
    1,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    value.nanosecond,
  );
  return formatPlainDateTimeForSql(dt).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

export const formatInstantForSqlMysql = formatInstantForSql;
export const formatPlainDateTimeForSqlMysql = formatPlainDateTimeForSql;
export const formatPlainTimeForSqlMysql = formatPlainTimeForSql;

function microsecondFraction(usec: number): string {
  return usec > 0 ? `.${String(usec).padStart(6, "0")}` : "";
}
