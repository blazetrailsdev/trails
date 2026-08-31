/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */

import { Temporal, cCivilToJd, strftime, type StrftimeSubject } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
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
    // `RTIME`'s nsec seat, not a Rails `Rational()` call: `vendor/ruby/rational.c:1969` `rb_rational_new`.
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
