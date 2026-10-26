import { fixDiv } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import { Date as RubyDate } from "@blazetrails/date";

export class Date {
  static YEAR_MONTHS = 12;
  static MONTH_DAYS = [null, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  static MONTH_DAYS_LEAP = [null, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  static YEAR_SECONDS = 31_536_000;
  static SEASON_SECONDS = 7_862_400;
  static MONTH_SECONDS = 2_592_000;
  static FORTNIGHT_SECONDS = 1_209_600;
  static WEEK_SECONDS = 604_800;
  static WEEKEND_SECONDS = 172_800;
  static DAY_SECONDS = 86_400;
  static MONTHS: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  static DAYS: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  static isCouldBeDay(day: number): boolean {
    return day >= 1 && day <= 31;
  }

  static isCouldBeMonth(month: number): boolean {
    return month >= 1 && month <= 12;
  }

  static isCouldBeYear(year: number): boolean {
    return year >= 1 && year <= 9999;
  }

  static makeYear(year: number, bias: number): number {
    if (String(year).length > 2) return year;
    const startYear = Chronic.timeClass().now().year - bias;
    const century = fixDiv(startYear, 100) * 100;
    let fullYear = century + year;
    if (fullYear < startYear) fullYear += 100;
    return fullYear;
  }

  static isMonthOverflow(year: number, month: number, day: number): boolean {
    if (RubyDate.isLeap(year)) {
      return day > Date.MONTH_DAYS_LEAP[month]!;
    } else {
      return day > Date.MONTH_DAYS[month]!;
    }
  }
}

Chronic.Date = Date;
