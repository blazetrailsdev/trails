import { Temporal } from "@js-temporal/polyfill";
import { describe, it, expect } from "vitest";
import {
  ArgumentError,
  Date,
  DateTime,
  dNewByFrags,
  dtNewByFrags,
  type DateParts,
} from "./date.js";
import { Time } from "./time.js";
import { Rational } from "@blazetrails/ruby-compat";

function valuesAt(h: DateParts, ...keys: (keyof DateParts)[]): unknown[] {
  return keys.map((k) => h[k] ?? null);
}

describe("TestDateParse", () => {
  it(" parse", () => {
    const cases: [[string, boolean], (number | string | null)[]][] = [
      [
        ["Sat Aug 28 02:55:50 1999", false],
        [1999, 8, 28, 2, 55, 50, null, null, 6],
      ],
      [
        ["Sat Aug 28 02:55:50 02", false],
        [2, 8, 28, 2, 55, 50, null, null, 6],
      ],
      [
        ["Sat Aug 28 02:55:50 02", true],
        [2002, 8, 28, 2, 55, 50, null, null, 6],
      ],
      [
        ["Sat Aug 28 02:55:50 0002", false],
        [2, 8, 28, 2, 55, 50, null, null, 6],
      ],
      [
        ["Sat Aug 28 02:55:50 0002", true],
        [2, 8, 28, 2, 55, 50, null, null, 6],
      ],

      [
        ["Sat Aug 28 02:29:34 JST 1999", false],
        [1999, 8, 28, 2, 29, 34, "JST", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 MET DST 1999", false],
        [1999, 8, 28, 2, 29, 34, "MET DST", 2 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 AMT 1999", false],
        [1999, 8, 28, 2, 29, 34, "AMT", null, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 PMT 1999", false],
        [1999, 8, 28, 2, 29, 34, "PMT", null, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 PMT -1999", false],
        [-1999, 8, 28, 2, 29, 34, "PMT", null, 6],
      ],

      [
        ["Sat Aug 28 02:29:34 JST 02", false],
        [2, 8, 28, 2, 29, 34, "JST", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 JST 02", true],
        [2002, 8, 28, 2, 29, 34, "JST", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 JST 0002", false],
        [2, 8, 28, 2, 29, 34, "JST", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 JST 0002", true],
        [2, 8, 28, 2, 29, 34, "JST", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 AEST 0002", true],
        [2, 8, 28, 2, 29, 34, "AEST", 10 * 3600, 6],
      ],

      [
        ["Sat Aug 28 02:29:34 GMT+09 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT+09", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT+0900 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT+0900", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT+09:00 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT+09:00", 9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT-09 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT-09", -9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT-0900 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT-0900", -9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT-09:00 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT-09:00", -9 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT-090102 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT-090102", -9 * 3600 - 60 - 2, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT-09:01:02 0002", false],
        [2, 8, 28, 2, 29, 34, "GMT-09:01:02", -9 * 3600 - 60 - 2, 6],
      ],

      [
        ["Sat Aug 28 02:29:34 GMT Standard Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "GMT Standard Time", 0 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 Mountain Standard Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "Mountain Standard Time", -7 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 Mountain Daylight Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "Mountain Daylight Time", -6 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 Mexico Standard Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "Mexico Standard Time", -6 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 E. Australia Standard Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "E. Australia Standard Time", 10 * 3600, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 W.  Central  Africa  Standard  Time 2000", false],
        [2000, 8, 28, 2, 29, 34, "W. Central Africa Standard Time", 1 * 3600, 6],
      ],

      [
        ["1999-05-23 23:55:21", false],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["1999-05-23 23:55:21+0900", false],
        [1999, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["1999-05-23 23:55:21-0900", false],
        [1999, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["1999-05-23 23:55:21+09:00", false],
        [1999, 5, 23, 23, 55, 21, "+09:00", 9 * 3600, null],
      ],
      [
        ["1999-05-23T23:55:21-09:00", false],
        [1999, 5, 23, 23, 55, 21, "-09:00", -9 * 3600, null],
      ],
      [
        ["1999-05-23 23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["1999-05-23T23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["-1999-05-23T23:55:21Z", false],
        [-1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["-1999-05-23T23:55:21Z", true],
        [-1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["19990523T23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],

      [
        ["+011985-04-12", false],
        [11985, 4, 12, null, null, null, null, null, null],
      ],
      [
        ["+011985-04-12T10:15:30", false],
        [11985, 4, 12, 10, 15, 30, null, null, null],
      ],
      [
        ["-011985-04-12", false],
        [-11985, 4, 12, null, null, null, null, null, null],
      ],
      [
        ["-011985-04-12T10:15:30", false],
        [-11985, 4, 12, 10, 15, 30, null, null, null],
      ],

      [
        ["02-04-12", false],
        [2, 4, 12, null, null, null, null, null, null],
      ],
      [
        ["02-04-12", true],
        [2002, 4, 12, null, null, null, null, null, null],
      ],
      [
        ["0002-04-12", false],
        [2, 4, 12, null, null, null, null, null, null],
      ],
      [
        ["0002-04-12", true],
        [2, 4, 12, null, null, null, null, null, null],
      ],

      [
        ["19990523", true],
        [1999, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["-19990523", true],
        [-1999, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["990523", true],
        [1999, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["0523", false],
        [null, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["23", false],
        [null, null, 23, null, null, null, null, null, null],
      ],

      [
        ["19990523 235521", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["990523 235521", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["0523 2355", false],
        [null, 5, 23, 23, 55, null, null, null, null],
      ],
      [
        ["23 2355", false],
        [null, null, 23, 23, 55, null, null, null, null],
      ],

      [
        ["19990523T235521", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["990523T235521", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["19990523T235521.99", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["990523T235521.99", true],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["0523T2355", false],
        [null, 5, 23, 23, 55, null, null, null, null],
      ],

      [
        ["19990523T235521+0900", true],
        [1999, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["990523T235521-0900", true],
        [1999, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["19990523T235521.99+0900", true],
        [1999, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["990523T235521.99-0900", true],
        [1999, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["0523T2355Z", false],
        [null, 5, 23, 23, 55, null, "Z", 0, null],
      ],

      [
        ["19990523235521.123456+0900", true],
        [1999, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["19990523235521.123456-0900", true],
        [1999, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["19990523235521,123456+0900", true],
        [1999, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["19990523235521,123456-0900", true],
        [1999, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],

      [
        ["990523235521,123456-0900", false],
        [99, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["0523235521,123456-0900", false],
        [null, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["23235521,123456-0900", false],
        [null, null, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["235521,123456-0900", false],
        [null, null, null, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["5521,123456-0900", false],
        [null, null, null, null, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["21,123456-0900", false],
        [null, null, null, null, null, 21, "-0900", -9 * 3600, null],
      ],

      [
        ["3235521,123456-0900", false],
        [null, null, 3, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["35521,123456-0900", false],
        [null, null, null, 3, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["521,123456-0900", false],
        [null, null, null, null, 5, 21, "-0900", -9 * 3600, null],
      ],

      [
        ["23-05-1999", false],
        [1999, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["23-05-1999 23:55:21", false],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["23-05--1999 23:55:21", false],
        [-1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["23-05-'99", false],
        [99, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["23-05-'99", true],
        [1999, 5, 23, null, null, null, null, null, null],
      ],

      [
        ["19990523T23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["19990523235521.1234-100", true],
        [1999, 5, 23, 23, 55, 21, "-100", -1 * 3600, null],
      ],
      [
        ["19990523235521.1234-10", true],
        [1999, 5, 23, 23, 55, 21, "-10", -10 * 3600, null],
      ],

      [
        ["M11.05.23", false],
        [1878, 5, 23, null, null, null, null, null, null],
      ],
      [
        ["T11.05.23 23:55:21+0900", false],
        [1922, 5, 23, 23, 55, 21, "+0900", 9 * 3600, null],
      ],
      [
        ["S11.05.23 23:55:21-0900", false],
        [1936, 5, 23, 23, 55, 21, "-0900", -9 * 3600, null],
      ],
      [
        ["S40.05.23 23:55:21+09:00", false],
        [1965, 5, 23, 23, 55, 21, "+09:00", 9 * 3600, null],
      ],
      [
        ["S40.05.23T23:55:21-09:00", false],
        [1965, 5, 23, 23, 55, 21, "-09:00", -9 * 3600, null],
      ],
      [
        ["H11.05.23 23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["H11.05.23T23:55:21Z", false],
        [1999, 5, 23, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["H31.04.30 23:55:21Z", false],
        [2019, 4, 30, 23, 55, 21, "Z", 0, null],
      ],
      [
        ["H31.04.30T23:55:21Z", false],
        [2019, 4, 30, 23, 55, 21, "Z", 0, null],
      ],

      [
        ["19990523235521", false],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["19990523235521.123", false],
        [1999, 5, 23, 23, 55, 21, null, null, null],
      ],
      [
        ["19990523235521.123[-9]", false],
        [1999, 5, 23, 23, 55, 21, "-9", -(9 * 3600), null],
      ],
      [
        ["19990523235521.123[+9]", false],
        [1999, 5, 23, 23, 55, 21, "+9", +(9 * 3600), null],
      ],
      [
        ["19990523235521.123[9]", false],
        [1999, 5, 23, 23, 55, 21, "9", +(9 * 3600), null],
      ],
      [
        ["19990523235521.123[9 ]", false],
        [1999, 5, 23, 23, 55, 21, "9 ", +(9 * 3600), null],
      ],
      [
        ["19990523235521.123[-9.50]", false],
        [1999, 5, 23, 23, 55, 21, "-9.50", -(9 * 3600 + 30 * 60), null],
      ],
      [
        ["19990523235521.123[+9.50]", false],
        [1999, 5, 23, 23, 55, 21, "+9.50", +(9 * 3600 + 30 * 60), null],
      ],
      [
        ["19990523235521.123[-5:EST]", false],
        [1999, 5, 23, 23, 55, 21, "EST", -5 * 3600, null],
      ],
      [
        ["19990523235521.123[+9:JST]", false],
        [1999, 5, 23, 23, 55, 21, "JST", 9 * 3600, null],
      ],
      [
        ["19990523235521.123[+12:XXX YYY ZZZ]", false],
        [1999, 5, 23, 23, 55, 21, "XXX YYY ZZZ", 12 * 3600, null],
      ],
      [
        ["235521.123", false],
        [null, null, null, 23, 55, 21, null, null, null],
      ],
      [
        ["235521.123[-9]", false],
        [null, null, null, 23, 55, 21, "-9", -9 * 3600, null],
      ],
      [
        ["235521.123[+9]", false],
        [null, null, null, 23, 55, 21, "+9", +9 * 3600, null],
      ],
      [
        ["235521.123[-9 ]", false],
        [null, null, null, 23, 55, 21, "-9 ", -9 * 3600, null],
      ],
      [
        ["235521.123[-5:EST]", false],
        [null, null, null, 23, 55, 21, "EST", -5 * 3600, null],
      ],
      [
        ["235521.123[+9:JST]", false],
        [null, null, null, 23, 55, 21, "JST", +9 * 3600, null],
      ],

      [
        ["Sun, 22 Aug 1999 00:45:29 -0400", false],
        [1999, 8, 22, 0, 45, 29, "-0400", -4 * 3600, 0],
      ],
      [
        ["Sun, 22 Aug 1999 00:45:29 -9959", false],
        [1999, 8, 22, 0, 45, 29, "-9959", -(99 * 3600 + 59 * 60), 0],
      ],
      [
        ["Sun, 22 Aug 1999 00:45:29 +9959", false],
        [1999, 8, 22, 0, 45, 29, "+9959", +(99 * 3600 + 59 * 60), 0],
      ],
      [
        ["Sun, 22 Aug 05 00:45:29 -0400", true],
        [2005, 8, 22, 0, 45, 29, "-0400", -4 * 3600, 0],
      ],
      [
        ["Sun, 22 Aug 49 00:45:29 -0400", true],
        [2049, 8, 22, 0, 45, 29, "-0400", -4 * 3600, 0],
      ],
      [
        ["Sun, 22 Aug 1999 00:45:29 GMT", false],
        [1999, 8, 22, 0, 45, 29, "GMT", 0, 0],
      ],
      [
        ["Sun,\u000022\r\nAug\r\n1999\r\n00:45:29\r\nGMT", false],
        [1999, 8, 22, 0, 45, 29, "GMT", 0, 0],
      ],
      [
        ["Sun, 22 Aug 1999 00:45 GMT", false],
        [1999, 8, 22, 0, 45, null, "GMT", 0, 0],
      ],
      [
        ["Sun, 22 Aug -1999 00:45 GMT", false],
        [-1999, 8, 22, 0, 45, null, "GMT", 0, 0],
      ],
      [
        ["Sun, 22 Aug 99 00:45:29 UT", true],
        [1999, 8, 22, 0, 45, 29, "UT", 0, 0],
      ],
      [
        ["Sun, 22 Aug 0099 00:45:29 UT", true],
        [99, 8, 22, 0, 45, 29, "UT", 0, 0],
      ],

      [
        ["Tuesday, 02-Mar-99 11:20:32 GMT", true],
        [1999, 3, 2, 11, 20, 32, "GMT", 0, 2],
      ],

      [
        ["2000-01-31 13:20:00-5", false],
        [2000, 1, 31, 13, 20, 0, "-5", -5 * 3600, null],
      ],

      [
        ["2000-01-31 13:20:00-5.5", false],
        [2000, 1, 31, 13, 20, 0, "-5.5", -5 * 3600 - 30 * 60, null],
      ],
      [
        ["2000-01-31 13:20:00-5,5", false],
        [2000, 1, 31, 13, 20, 0, "-5,5", -5 * 3600 - 30 * 60, null],
      ],
      [
        ["2000-01-31 13:20:00+3.5", false],
        [2000, 1, 31, 13, 20, 0, "+3.5", 3 * 3600 + 30 * 60, null],
      ],
      [
        ["2000-01-31 13:20:00+3,5", false],
        [2000, 1, 31, 13, 20, 0, "+3,5", 3 * 3600 + 30 * 60, null],
      ],

      [
        ["2000-01-31 13:20:00 Z", false],
        [2000, 1, 31, 13, 20, 0, "Z", 0 * 3600, null],
      ],
      [
        ["2000-01-31 13:20:00 H", false],
        [2000, 1, 31, 13, 20, 0, "H", 8 * 3600, null],
      ],
      [
        ["2000-01-31 13:20:00 M", false],
        [2000, 1, 31, 13, 20, 0, "M", 12 * 3600, null],
      ],
      [
        ["2000-01-31 13:20 M", false],
        [2000, 1, 31, 13, 20, null, "M", 12 * 3600, null],
      ],
      [
        ["2000-01-31 13:20:00 S", false],
        [2000, 1, 31, 13, 20, 0, "S", -6 * 3600, null],
      ],
      [
        ["2000-01-31 13:20:00 A", false],
        [2000, 1, 31, 13, 20, 0, "A", 1 * 3600, null],
      ],
      [
        ["2000-01-31 13:20:00 P", false],
        [2000, 1, 31, 13, 20, 0, "P", -3 * 3600, null],
      ],

      [
        ["1999.5.2", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["1999.05.02", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["-1999.05.02", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["0099.5.2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["0099.5.2", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["'99.5.2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["'99.5.2", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2.5.1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02.05.1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02.05.-1999", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2.5.0099", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2.5.0099", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2.5.'99", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2.5.'99", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["08-DEC-1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["31-JAN-1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["31-JAN--1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],

      [
        ["08-DEC-88", false],
        [88, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["08-DEC-88", true],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["08-DEC-0088", false],
        [88, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["08-DEC-0088", true],
        [88, 12, 8, null, null, null, null, null, null],
      ],

      [
        ["DEC-08-1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["JAN-31-1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["JAN-31--1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["JAN-1999", false],
        [1999, 1, null, null, null, null, null, null, null],
      ],
      [
        ["JAN--1999", false],
        [-1999, 1, null, null, null, null, null, null, null],
      ],

      [
        ["1988-DEC-08", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["1999-JAN-31", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["-1999-JAN-31", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],

      [
        ["0088-DEC-08", false],
        [88, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["0088-DEC-08", true],
        [88, 12, 8, null, null, null, null, null, null],
      ],

      [
        ["'88/12/8", false],
        [88, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["'88/12/8", true],
        [1988, 12, 8, null, null, null, null, null, null],
      ],

      [
        ["08/dec/1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["31/jan/1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["31/jan/-1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["08.dec.1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["31.jan.1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["31.jan.-1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],

      [
        ["dec/08/1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["jan/31/1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan/31/-1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan/31", false],
        [null, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan/1988", false],
        [1988, 1, null, null, null, null, null, null, null],
      ],
      [
        ["dec.08.1988", false],
        [1988, 12, 8, null, null, null, null, null, null],
      ],
      [
        ["jan.31.1999", false],
        [1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan.31.-1999", false],
        [-1999, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan.31", false],
        [null, 1, 31, null, null, null, null, null, null],
      ],
      [
        ["jan.1988", false],
        [1988, 1, null, null, null, null, null, null, null],
      ],

      [
        ["Jan 1", false],
        [null, 1, 1, null, null, null, null, null, null],
      ],
      [
        ["Jul 11", false],
        [null, 7, 11, null, null, null, null, null, null],
      ],
      [
        ["July 11", false],
        [null, 7, 11, null, null, null, null, null, null],
      ],
      [
        ["Sept 23", false],
        [null, 9, 23, null, null, null, null, null, null],
      ],
      [
        ["Sep. 23", false],
        [null, 9, 23, null, null, null, null, null, null],
      ],
      [
        ["Sept. 23", false],
        [null, 9, 23, null, null, null, null, null, null],
      ],
      [
        ["September 23", false],
        [null, 9, 23, null, null, null, null, null, null],
      ],
      [
        ["October 1st", false],
        [null, 10, 1, null, null, null, null, null, null],
      ],
      [
        ["October 23rd", false],
        [null, 10, 23, null, null, null, null, null, null],
      ],
      [
        ["October 25th 1999", false],
        [1999, 10, 25, null, null, null, null, null, null],
      ],
      [
        ["October 25th -1999", false],
        [-1999, 10, 25, null, null, null, null, null, null],
      ],
      [
        ["october 25th 1999", false],
        [1999, 10, 25, null, null, null, null, null, null],
      ],
      [
        ["OCTOBER 25th 1999", false],
        [1999, 10, 25, null, null, null, null, null, null],
      ],
      [
        ["oCtoBer 25th 1999", false],
        [1999, 10, 25, null, null, null, null, null, null],
      ],
      [
        ["aSep 23", false],
        [null, null, 23, null, null, null, null, null, null],
      ],

      [
        ["Sept 1990", false],
        [1990, 9, null, null, null, null, null, null, null],
      ],
      [
        ["Sept '90", false],
        [90, 9, null, null, null, null, null, null, null],
      ],
      [
        ["Sept '90", true],
        [1990, 9, null, null, null, null, null, null, null],
      ],
      [
        ["1990/09", false],
        [1990, 9, null, null, null, null, null, null, null],
      ],
      [
        ["09/1990", false],
        [1990, 9, null, null, null, null, null, null, null],
      ],
      [
        ["aSep '90", false],
        [90, null, null, null, null, null, null, null, null],
      ],

      [
        ["'90", false],
        [90, null, null, null, null, null, null, null, null],
      ],
      [
        ["'90", true],
        [1990, null, null, null, null, null, null, null, null],
      ],

      [
        ["Jun", false],
        [null, 6, null, null, null, null, null, null, null],
      ],
      [
        ["June", false],
        [null, 6, null, null, null, null, null, null, null],
      ],
      [
        ["Sep", false],
        [null, 9, null, null, null, null, null, null, null],
      ],
      [
        ["Sept", false],
        [null, 9, null, null, null, null, null, null, null],
      ],
      [
        ["September", false],
        [null, 9, null, null, null, null, null, null, null],
      ],
      [
        ["aSep", false],
        [null, null, null, null, null, null, null, null, null],
      ],

      [
        ["1st", false],
        [null, null, 1, null, null, null, null, null, null],
      ],
      [
        ["2nd", false],
        [null, null, 2, null, null, null, null, null, null],
      ],
      [
        ["3rd", false],
        [null, null, 3, null, null, null, null, null, null],
      ],
      [
        ["4th", false],
        [null, null, 4, null, null, null, null, null, null],
      ],
      [
        ["29th", false],
        [null, null, 29, null, null, null, null, null, null],
      ],
      [
        ["31st", false],
        [null, null, 31, null, null, null, null, null, null],
      ],
      [
        ["1sta", false],
        [null, null, null, null, null, null, null, null, null],
      ],

      [
        ["Sat Aug 28 02:29:34 GMT CE 2000", false],
        [2000, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT C.E. 2000", false],
        [2000, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT BCE 2000", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT B.C.E. 2000", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT AD 2000", false],
        [2000, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT A.D. 2000", false],
        [2000, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT BC 2000", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT B.C. 2000", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT 2000 BC", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT 2000 BCE", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT 2000 B.C.", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],
      [
        ["Sat Aug 28 02:29:34 GMT 2000 B.C.E.", false],
        [-1999, 8, 28, 2, 29, 34, "GMT", 0, 6],
      ],

      [
        ["Tuesday, May 18, 1999 Published at 13:36 GMT 14:36 UK", false],
        [1999, 5, 18, 13, 36, null, "GMT", 0, 2],
      ],
      [
        ["July 20, 2000 Web posted at: 3:37 p.m. EDT (1937 GMT)", false],
        [2000, 7, 20, 15, 37, null, "EDT", -4 * 3600, null],
      ],
      [
        ["12:54 p.m. EDT, September 11, 2006", false],
        [2006, 9, 11, 12, 54, null, "EDT", -4 * 3600, null],
      ],
      [
        ["February 04, 2001 at 10:59 AM PST", false],
        [2001, 2, 4, 10, 59, null, "PST", -8 * 3600, null],
      ],
      [
        ["Monday May 08, @01:55PM", false],
        [null, 5, 8, 13, 55, null, null, null, 1],
      ],
      [
        ["06.June 2005", false],
        [2005, 6, 6, null, null, null, null, null, null],
      ],

      [
        ["8:00 pm lt", false],
        [null, null, null, 20, 0, null, "lt", null, null],
      ],
      [
        ["4:00 AM, Jan. 12, 1990", false],
        [1990, 1, 12, 4, 0, null, null, null, null],
      ],
      [
        ["Jan. 12 4:00 AM 1990", false],
        [1990, 1, 12, 4, 0, null, null, null, null],
      ],
      [
        ["1990-01-12 04:00:00+00", false],
        [1990, 1, 12, 4, 0, 0, "+00", 0, null],
      ],
      [
        ["1990-01-11 20:00:00-08", false],
        [1990, 1, 11, 20, 0, 0, "-08", -8 * 3600, null],
      ],
      [
        ["1990/01/12 04:00:00", false],
        [1990, 1, 12, 4, 0, 0, null, null, null],
      ],
      [
        ["Thu Jan 11 20:00:00 PST 1990", false],
        [1990, 1, 11, 20, 0, 0, "PST", -8 * 3600, 4],
      ],
      [
        ["Fri Jan 12 04:00:00 GMT 1990", false],
        [1990, 1, 12, 4, 0, 0, "GMT", 0, 5],
      ],
      [
        ["Thu, 11 Jan 1990 20:00:00 -0800", false],
        [1990, 1, 11, 20, 0, 0, "-0800", -8 * 3600, 4],
      ],
      [
        ["12-January-1990, 04:00 WET", false],
        [1990, 1, 12, 4, 0, null, "WET", 0 * 3600, null],
      ],
      [
        ["jan 2 3 am +4 5", false],
        [5, 1, 2, 3, null, null, "+4", 4 * 3600, null],
      ],
      [
        ["jan 2 3 am +4 5", true],
        [2005, 1, 2, 3, null, null, "+4", 4 * 3600, null],
      ],
      [
        ["fri1feb3bc4pm+5", false],
        [-2, 2, 1, 16, null, null, "+5", 5 * 3600, 5],
      ],
      [
        ["fri1feb3bc4pm+5", true],
        [-2, 2, 1, 16, null, null, "+5", 5 * 3600, 5],
      ],
      [
        ["03 feb 1st", false],
        [3, 2, 1, null, null, null, null, null, null],
      ],

      [
        ["July 4, '79", true],
        [1979, 7, 4, null, null, null, null, null, null],
      ],
      [
        ["4th July '79", true],
        [1979, 7, 4, null, null, null, null, null, null],
      ],

      [
        ["Sunday", false],
        [null, null, null, null, null, null, null, null, 0],
      ],
      [
        ["Mon", false],
        [null, null, null, null, null, null, null, null, 1],
      ],
      [
        ["Tue", false],
        [null, null, null, null, null, null, null, null, 2],
      ],
      [
        ["Wed", false],
        [null, null, null, null, null, null, null, null, 3],
      ],
      [
        ["Thurs", false],
        [null, null, null, null, null, null, null, null, 4],
      ],
      [
        ["Friday", false],
        [null, null, null, null, null, null, null, null, 5],
      ],
      [
        ["Sat.", false],
        [null, null, null, null, null, null, null, null, 6],
      ],
      [
        ["sat.", false],
        [null, null, null, null, null, null, null, null, 6],
      ],
      [
        ["SAT.", false],
        [null, null, null, null, null, null, null, null, 6],
      ],
      [
        ["sAt.", false],
        [null, null, null, null, null, null, null, null, 6],
      ],

      [
        ["09:55", false],
        [null, null, null, 9, 55, null, null, null, null],
      ],
      [
        ["09:55:30", false],
        [null, null, null, 9, 55, 30, null, null, null],
      ],
      [
        ["09:55:30am", false],
        [null, null, null, 9, 55, 30, null, null, null],
      ],
      [
        ["09:55:30pm", false],
        [null, null, null, 21, 55, 30, null, null, null],
      ],
      [
        ["09:55:30a.m.", false],
        [null, null, null, 9, 55, 30, null, null, null],
      ],
      [
        ["09:55:30p.m.", false],
        [null, null, null, 21, 55, 30, null, null, null],
      ],
      [
        ["09:55:30pm GMT", false],
        [null, null, null, 21, 55, 30, "GMT", 0, null],
      ],
      [
        ["09:55:30p.m. GMT", false],
        [null, null, null, 21, 55, 30, "GMT", 0, null],
      ],
      [
        ["09:55+0900", false],
        [null, null, null, 9, 55, null, "+0900", 9 * 3600, null],
      ],
      [
        ["09 AM", false],
        [null, null, null, 9, null, null, null, null, null],
      ],
      [
        ["09am", false],
        [null, null, null, 9, null, null, null, null, null],
      ],
      [
        ["09 A.M.", false],
        [null, null, null, 9, null, null, null, null, null],
      ],
      [
        ["09 PM", false],
        [null, null, null, 21, null, null, null, null, null],
      ],
      [
        ["09pm", false],
        [null, null, null, 21, null, null, null, null, null],
      ],
      [
        ["09 P.M.", false],
        [null, null, null, 21, null, null, null, null, null],
      ],

      [
        ["9h22m23s", false],
        [null, null, null, 9, 22, 23, null, null, null],
      ],
      [
        ["9h 22m 23s", false],
        [null, null, null, 9, 22, 23, null, null, null],
      ],
      [
        ["9h22m", false],
        [null, null, null, 9, 22, null, null, null, null],
      ],
      [
        ["9h 22m", false],
        [null, null, null, 9, 22, null, null, null, null],
      ],
      [
        ["9h", false],
        [null, null, null, 9, null, null, null, null, null],
      ],
      [
        ["9h 22m 23s am", false],
        [null, null, null, 9, 22, 23, null, null, null],
      ],
      [
        ["9h 22m 23s pm", false],
        [null, null, null, 21, 22, 23, null, null, null],
      ],
      [
        ["9h 22m am", false],
        [null, null, null, 9, 22, null, null, null, null],
      ],
      [
        ["9h 22m pm", false],
        [null, null, null, 21, 22, null, null, null, null],
      ],
      [
        ["9h am", false],
        [null, null, null, 9, null, null, null, null, null],
      ],
      [
        ["9h pm", false],
        [null, null, null, 21, null, null, null, null, null],
      ],

      [
        ["00:00", false],
        [null, null, null, 0, 0, null, null, null, null],
      ],
      [
        ["01:00", false],
        [null, null, null, 1, 0, null, null, null, null],
      ],
      [
        ["11:00", false],
        [null, null, null, 11, 0, null, null, null, null],
      ],
      [
        ["12:00", false],
        [null, null, null, 12, 0, null, null, null, null],
      ],
      [
        ["13:00", false],
        [null, null, null, 13, 0, null, null, null, null],
      ],
      [
        ["23:00", false],
        [null, null, null, 23, 0, null, null, null, null],
      ],
      [
        ["24:00", false],
        [null, null, null, 24, 0, null, null, null, null],
      ],

      [
        ["00:00 AM", false],
        [null, null, null, 0, 0, null, null, null, null],
      ],
      [
        ["12:00 AM", false],
        [null, null, null, 0, 0, null, null, null, null],
      ],
      [
        ["01:00 AM", false],
        [null, null, null, 1, 0, null, null, null, null],
      ],
      [
        ["11:00 AM", false],
        [null, null, null, 11, 0, null, null, null, null],
      ],
      [
        ["00:00 PM", false],
        [null, null, null, 12, 0, null, null, null, null],
      ],
      [
        ["12:00 PM", false],
        [null, null, null, 12, 0, null, null, null, null],
      ],
      [
        ["01:00 PM", false],
        [null, null, null, 13, 0, null, null, null, null],
      ],
      [
        ["11:00 PM", false],
        [null, null, null, 23, 0, null, null, null, null],
      ],

      [
        ["2000-01-02 1", false],
        [2000, 1, 2, 1, null, null, null, null, null],
      ],
      [
        ["2000-01-02 23", false],
        [2000, 1, 2, 23, null, null, null, null, null],
      ],
      [
        ["2000-01-02 24", false],
        [2000, 1, 2, 24, null, null, null, null, null],
      ],
      [
        ["1 03:04:05", false],
        [null, null, 1, 3, 4, 5, null, null, null],
      ],
      [
        ["02 03:04:05", false],
        [null, null, 2, 3, 4, 5, null, null, null],
      ],
      [
        ["31 03:04:05", false],
        [null, null, 31, 3, 4, 5, null, null, null],
      ],

      [
        ["", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        [" ", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["          ", true],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\t", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\n", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\v", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\f", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\r", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["\t\n\v\f\r ", false],
        [null, null, null, null, null, null, null, null, null],
      ],
      [
        ["1999-05-23\t\n\v\f\r 21:34:56", false],
        [1999, 5, 23, 21, 34, 56, null, null, null],
      ],
    ];
    for (const [x, y] of cases) {
      const h = Date._parse(...x);
      const a = valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "zone", "offset", "wday");
      if (y[1] === -1) {
        a[1] = -1;
        a[2] = h.yday ?? null;
      }
      const l = `<failed at ${x[0]}>`;
      expect(a, l).toEqual(y);
      if (y[6] != null) {
        const h2 = Date._parse(x[0], x[1]);
        // eslint-disable-next-line vitest/no-conditional-expect -- Ruby's `if y[6]` guards it too
        expect(h2.zone, l).toBe(y[6]);
      }
    }
  });

  it(" parse slash exp", () => {
    const cases: [[string, boolean], (number | null)[]][] = [
      [
        ["2/5/1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02/05/1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["02/05/-1999", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["05/02", false],
        [null, 5, 2, null, null, null, null, null, null],
      ],
      [
        [" 5/ 2", false],
        [null, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2/5/'99", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5/0099", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5/0099", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["2/5 1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5-1999", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["2/5--1999", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["99/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["99/5/2", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["1999/5/2", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["1999/05/02", false],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["-1999/05/02", false],
        [-1999, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["0099/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["0099/5/2", true],
        [99, 5, 2, null, null, null, null, null, null],
      ],

      [
        ["'99/5/2", false],
        [99, 5, 2, null, null, null, null, null, null],
      ],
      [
        ["'99/5/2", true],
        [1999, 5, 2, null, null, null, null, null, null],
      ],
    ];
    for (const [x, y] of cases) {
      const h = Date._parse(...x);
      const a = valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "zone", "offset", "wday");
      if (y[1] === -1) {
        a[1] = -1;
        a[2] = h.yday ?? null;
      }
      expect(a, `<failed at ${x[0]}>`).toEqual(y);
    }
  });

  it(" parse  2", () => {
    let h = Date._parse("22:45:59.5");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 1)]);
    h = Date._parse("22:45:59.05");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 2)]);
    h = Date._parse("22:45:59.005");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 3)]);
    h = Date._parse("22:45:59.0123");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(123, 10 ** 4)]);

    h = Date._parse("224559.5");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 1)]);
    h = Date._parse("224559.05");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 2)]);
    h = Date._parse("224559.005");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(5, 10 ** 3)]);
    h = Date._parse("224559.0123");
    expect(secFrag(h)).toEqual([22, 45, 59, new Rational(123, 10 ** 4)]);

    h = Date._parse("2006-w15-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);
    h = Date._parse("2006w155");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);
    h = Date._parse("06w155", false);
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([6, 15, 5]);
    h = Date._parse("06w155", true);
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, 5]);

    h = Date._parse("2006-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, null]);
    h = Date._parse("2006w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([2006, 15, null]);

    h = Date._parse("-w15-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, 5]);
    h = Date._parse("-w155");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, 5]);

    h = Date._parse("-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, null]);
    h = Date._parse("-w15");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, 15, null]);

    h = Date._parse("-w-5");
    expect(valuesAt(h, "cwyear", "cweek", "cwday")).toEqual([null, null, 5]);

    h = Date._parse("--11-29");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, 29]);
    h = Date._parse("--1129");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, 29]);
    h = Date._parse("--11");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, 11, null]);
    h = Date._parse("---29");
    expect(valuesAt(h, "year", "mon", "mday")).toEqual([null, null, 29]);
    h = Date._parse("-333");
    expect(valuesAt(h, "year", "yday")).toEqual([null, 333]);

    h = Date._parse("2006-333");
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("2006333");
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("06333", false);
    expect(valuesAt(h, "year", "yday")).toEqual([6, 333]);
    h = Date._parse("06333", true);
    expect(valuesAt(h, "year", "yday")).toEqual([2006, 333]);
    h = Date._parse("333");
    expect(valuesAt(h, "year", "yday")).toEqual([null, 333]);

    h = Date._parse("");
    expect(h).toEqual({});
  });

  it("parse", () => {
    expect(Date.parse().equals(new Date().toDate())).toBe(true);
    expect(Date.parse("2002-03-14").equals(new Date(2002, 3, 14).toDate())).toBe(true);

    expect(
      DateTime.parse("2002-03-14T11:22:33Z").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, 0).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33+09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(9, 24)).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33-09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(-9, 24)).toDatetime(),
      ),
    ).toBe(true);
    expect(
      DateTime.parse("2002-03-14T11:22:33.123456789-09:00").equals(
        new DateTime(2002, 3, 14, 11, 22, 33, new Rational(-9, 24))
          .plus(new Rational(123456789, 1000000000 * 86400))
          .toDatetime(),
      ),
    ).toBe(true);
  });

  it("parse  2", () => {
    let d1 = dtParse("2004-03-13T22:45:59.5");
    let d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 1 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.05");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 2 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.005");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(5, 10 ** 3 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.0123");
    d2 = dtParse("2004-03-13T22:45:59");
    expect(d2.plus(new Rational(123, 10 ** 4 * 86400)).equals(d1)).toBe(true);
    d1 = dtParse("2004-03-13T22:45:59.5");
    d1 = d1.plus(new Rational(1, 2 * 86400));
    d2 = dtParse("2004-03-13T22:46:00");
    expect(d2.equals(d1)).toBe(true);
  });

  it(" parse odd offset", () => {
    let h = DateTime._parse("2001-02-03T04:05:06+1");
    expect(h.offset).toBe(3600);
    h = DateTime._parse("2001-02-03T04:05:06+123");
    expect(h.offset).toBe(4980);
    h = DateTime._parse("2001-02-03T04:05:06+12345");
    expect(h.offset).toBe(5025);
  });

  it(" parse too long year", () => {
    let str = "Jan 1" + "0".repeat(100_000);
    let h = Date._parse(str, true, { limit: 100_010 });
    expect(String(h.year).length - 1).toBe(100_000);
    expect(h.mon).toBe(1);

    str = "Jan - 1" + "0".repeat(100_000);
    h = Date._parse(str, true, { limit: 100_010 });
    expect(h.mon).toBe(1);
    expect(h).not.toHaveProperty("year");
  });

  it("parse utf8", () => {
    const h = DateTime._parse("Sun\u{3000}Aug 16 01:02:03 \u{65e5}\u{672c} 2009");
    expect(h.year).toBe(2009);
    expect(h.mon).toBe(8);
    expect(h.mday).toBe(16);
    expect(h.wday).toBe(0);
    expect(h.hour).toBe(1);
    expect(h.min).toBe(2);
    expect(h.sec).toBe(3);
    expect(h.zone).toBe("\u{65e5}\u{672c}");
  });

  it("parse  time", () => {
    const methods = ["toS", "asctime", "iso8601", "rfc2822", "httpdate", "xmlschema"] as const;

    let t = Time.utc(2001, 2, 3, 4, 5, 6);
    for (const m of methods) {
      const d = dtParse(t[m]());
      expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([2001, 2, 3, 4, 5, 6]);
    }

    t = Time.mktime(2001, 2, 3, 4, 5, 6);
    for (const m of methods) {
      if (m === "httpdate") continue;
      const d = dtParse(t[m]());
      expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([2001, 2, 3, 4, 5, 6]);
    }
  });

  it("parse  comp", () => {
    const n = new DateTime(DateTime.now());

    let d = dtParse("073");
    expect([d.year, d.yday, d.hour, d.min, d.sec]).toEqual([n.year, 73, 0, 0, 0]);
    d = dtParse("13");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([n.year, n.mon, 13, 0, 0, 0]);

    d = dtParse("Mar 13");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([n.year, 3, 13, 0, 0, 0]);
    d = dtParse("Mar 2004");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([2004, 3, 1, 0, 0, 0]);
    d = dtParse("23:55");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([
      n.year,
      n.mon,
      n.mday,
      23,
      55,
      0,
    ]);
    d = dtParse("23:55:30");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([
      n.year,
      n.mon,
      n.mday,
      23,
      55,
      30,
    ]);

    d = dtParse("Sun 23:55");
    const d2 = d.minus(d.wday) as DateTime;
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([
      d2.year,
      d2.mon,
      d2.mday,
      23,
      55,
      0,
    ]);
    d = dtParse("Aug 23:55");
    expect([d.year, d.mon, d.mday, d.hour, d.min, d.sec]).toEqual([n.year, 8, 1, 23, 55, 0]);
  });

  it("parse  d to s", () => {
    const d = new Date(2002, 3, 14);
    expect(Date.parse(d.toS()).equals(d.toDate())).toBe(true);

    const dt = new DateTime(2002, 3, 14, 11, 22, 33, new Rational(9, 24));
    expect(DateTime.parse(dt.toS()).equals(dt.toDatetime())).toBe(true);
  });
  it("parse  ex", () => {
    expect(() => Date.parse("")).toThrow(Date.Error);
    expect(() => DateTime.parse("")).toThrow(Date.Error);
    expect(() => Date.parse("2001-02-29")).toThrow(Date.Error);
    expect(() => DateTime.parse("2001-02-29T23:59:60")).toThrow(Date.Error);
    assertNothingRaised(() => DateTime.parse("2001-03-01T23:59:60"));
    expect(() => DateTime.parse("2001-03-01T23:59:61")).toThrow(Date.Error);
    expect(() => Date.parse("23:55")).toThrow(Date.Error);

    expect(rescueArgumentError(() => Date.parse("")) instanceof Date.Error).toBeTruthy();
    expect(rescueArgumentError(() => DateTime.parse("")) instanceof Date.Error).toBeTruthy();
  });

  it(" iso8601", () => {
    let h = Date._iso8601("01-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("--02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("---03T04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("2001-02-03T04:05");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("2001-02-03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("2001-02-03T04:05:06,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);
    h = Date._iso8601("2001-02");
    expect(valuesAt(h, "year", "mon")).toEqual([2001, 2]);

    h = Date._iso8601("010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("--0203T040506Z");
    expect(ymdhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("---03T040506Z");
    expect(ymdhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("010203T0405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203T0405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203T040506");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203T040506,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203T040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203T040506.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._iso8601("200102030405");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, null, null]);
    h = Date._iso8601("20010203040506");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203040506,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._iso8601("20010203040506Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("20010203040506.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._iso8601("01-023T04:05:06Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("2001-023T04:05:06Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("-023T04:05:06Z");
    expect(ydhms(h)).toEqual([null, 23, 4, 5, 6, 0]);

    h = Date._iso8601("01023T040506Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("2001023T040506Z");
    expect(ydhms(h)).toEqual([2001, 23, 4, 5, 6, 0]);
    h = Date._iso8601("-023T040506Z");
    expect(ydhms(h)).toEqual([null, 23, 4, 5, 6, 0]);

    h = Date._iso8601("01-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w02-3T04:05:06Z");
    expect(cwhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w-3T04:05:06Z");
    expect(cwhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("01w023T040506Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("2001w023T040506Z");
    expect(cwhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w023T040506Z");
    expect(cwhms(h)).toEqual([null, 2, 3, 4, 5, 6, 0]);
    h = Date._iso8601("-w-3T040506Z");
    expect(cwhms(h)).toEqual([null, null, 3, 4, 5, 6, 0]);

    h = Date._iso8601("04:05");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, null, null]);
    h = Date._iso8601("04:05:06");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("04:05:06,07");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 0]);
    h = Date._iso8601("04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._iso8601("040506,07");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._iso8601("040506.07+0100");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._iso8601("");
    expect(h).toEqual({});

    h = Date._iso8601(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._iso8601(1 as unknown as string)).toThrow(TypeError);
  });

  it(" rfc3339", () => {
    let h = Date._rfc3339("2001-02-03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc3339("2001-02-03 04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc3339("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._rfc3339("");
    expect(h).toEqual({});

    h = Date._rfc3339(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._rfc3339(1 as unknown as string)).toThrow(TypeError);
  });

  it(" xmlschema", () => {
    let h = Date._xmlschema("2001-02-03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._xmlschema("2001-02-03Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, 0]);
    h = Date._xmlschema("2001-02-03+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, 3600]);

    h = Date._xmlschema("2001-02-03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._xmlschema("2001-02-03T04:05:06.07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._xmlschema("2001-02-03T04:05:06.07Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._xmlschema("2001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("04:05:06");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, null]);
    h = Date._xmlschema("04:05:06Z");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 0]);
    h = Date._xmlschema("04:05:06+01:00");
    expect(ymdhms(h)).toEqual([null, null, null, 4, 5, 6, 3600]);

    h = Date._xmlschema("2001-02");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, null]);
    h = Date._xmlschema("2001-02Z");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, 0]);
    h = Date._xmlschema("2001-02+01:00");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, 3600]);
    h = Date._xmlschema("2001-02-01:00");
    expect(ymdhms(h)).toEqual([2001, 2, null, null, null, null, -3600]);

    h = Date._xmlschema("2001");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, null]);
    h = Date._xmlschema("2001Z");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, 0]);
    h = Date._xmlschema("2001+01:00");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, 3600]);
    h = Date._xmlschema("2001-01:00");
    expect(ymdhms(h)).toEqual([2001, null, null, null, null, null, -3600]);

    h = Date._xmlschema("--02");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, null]);
    h = Date._xmlschema("--02Z");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, 0]);
    h = Date._xmlschema("--02+01:00");
    expect(ymdhms(h)).toEqual([null, 2, null, null, null, null, 3600]);

    h = Date._xmlschema("92001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([92001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("-92001-02-03T04:05:06.07+01:00");
    expect(ymdhms(h)).toEqual([-92001, 2, 3, 4, 5, 6, 3600]);

    h = Date._xmlschema("");
    expect(h).toEqual({});

    h = Date._xmlschema(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._xmlschema(1 as unknown as string)).toThrow(TypeError);
  });

  it(" rfc2822", () => {
    let h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 UT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 EST");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, -5 * 3600]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0000");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._rfc2822("Sat, 03 Feb 50 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([1950, 2, 3, 4, 5, 6, 3600]);
    h = Date._rfc2822("Sat, 03 Feb 49 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2049, 2, 3, 4, 5, 6, 3600]);
    h = Date._rfc2822("Sat, 03 Feb 100 04:05:06 +0100");
    expect(ymdhms(h)).toEqual([2000, 2, 3, 4, 5, 6, 3600]);

    const h1 = Date._rfc2822("Sat, 3 Feb 2001 04:05:06 UT");
    const h2 = Date._rfc822("Sat, 3 Feb 2001 04:05:06 UT");
    expect(h1).toEqual(h2);

    h = Date._rfc2822("");
    expect(h).toEqual({});

    h = Date._rfc2822(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._rfc2822(1 as unknown as string)).toThrow(TypeError);
  });

  it(" httpdate", () => {
    let h = Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);

    h = Date._httpdate("Saturday, 03-Feb-01 04:05:06 GMT");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);

    h = Date._httpdate("Sat Feb  3 04:05:06 2001");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._httpdate("Sat Feb 03 04:05:06 2001");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);

    h = Date._httpdate("");
    expect(h).toEqual({});

    h = Date._httpdate(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._httpdate(1 as unknown as string)).toThrow(TypeError);
  });

  it(" jisx0301", () => {
    let h = Date._jisx0301("13.02.03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._jisx0301("H13.02.03");
    expect(ymdhms(h)).toEqual([2001, 2, 3, null, null, null, null]);
    h = Date._jisx0301("S63.02.03");
    expect(ymdhms(h)).toEqual([1988, 2, 3, null, null, null, null]);
    h = Date._jisx0301("H31.04.30");
    expect(ymdhms(h)).toEqual([2019, 4, 30, null, null, null, null]);
    h = Date._jisx0301("H31.05.01");
    expect(ymdhms(h)).toEqual([2019, 5, 1, null, null, null, null]);
    h = Date._jisx0301("R01.05.01");
    expect(ymdhms(h)).toEqual([2019, 5, 1, null, null, null, null]);

    h = Date._jisx0301("H13.02.03T04:05:06");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._jisx0301("H13.02.03T04:05:06,07");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, null]);
    h = Date._jisx0301("H13.02.03T04:05:06Z");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 0]);
    h = Date._jisx0301("H13.02.03T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2001, 2, 3, 4, 5, 6, 3600]);

    h = Date._jisx0301("H31.04.30T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, null]);
    h = Date._jisx0301("H31.04.30T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, null]);
    h = Date._jisx0301("H31.04.30T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, 0]);
    h = Date._jisx0301("H31.04.30T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 4, 30, 4, 5, 6, 3600]);

    h = Date._jisx0301("H31.05.01T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("H31.05.01T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("H31.05.01T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 0]);
    h = Date._jisx0301("H31.05.01T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 3600]);

    h = Date._jisx0301("R01.05.01T04:05:06");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("R01.05.01T04:05:06,07");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, null]);
    h = Date._jisx0301("R01.05.01T04:05:06Z");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 0]);
    h = Date._jisx0301("R01.05.01T04:05:06.07+0100");
    expect(ymdhms(h)).toEqual([2019, 5, 1, 4, 5, 6, 3600]);

    h = Date._jisx0301("");
    expect(h).toEqual({});

    h = Date._jisx0301(null as unknown as string);
    expect(h).toEqual({});

    expect(() => Date._jisx0301(1 as unknown as string)).toThrow(TypeError);
  });

  it("iso8601", () => {
    expect(Date.iso8601()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.iso8601()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.iso8601("2001-02-03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._iso8601("2001-02-03"))).toBe(Date.ITALY + 10);

    const dt = DateTime.iso8601("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._iso8601("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("rfc3339", () => {
    expect(Date.rfc3339()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc3339()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.rfc3339("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc3339("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    const dt = DateTime.rfc3339("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc3339("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("xmlschema", () => {
    expect(Date.xmlschema()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.xmlschema()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.xmlschema("2001-02-03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._xmlschema("2001-02-03"))).toBe(Date.ITALY + 10);

    const dt = DateTime.xmlschema("2001-02-03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._xmlschema("2001-02-03T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("rfc2822", () => {
    expect(Date.rfc2822()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc2822()).toBeInstanceOf(Temporal.PlainDateTime);
    expect(Date.rfc822()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.rfc822()).toBeInstanceOf(Temporal.PlainDateTime);

    let d = Date.rfc2822("Sat, 3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
    d = Date.rfc2822("3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._rfc2822("3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);

    let dt = DateTime.rfc2822("Sat, 3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc2822("Sat, 3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
    dt = DateTime.rfc2822("3 Feb 2001 04:05:06 +0700", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._rfc2822("3 Feb 2001 04:05:06 +0700"))).toBe(Date.ITALY + 10);
  });

  it("httpdate", () => {
    expect(Date.httpdate()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.httpdate()).toBeInstanceOf(Temporal.PlainDateTime);

    const d = Date.httpdate("Sat, 03 Feb 2001 04:05:06 GMT", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT"))).toBe(Date.ITALY + 10);

    const dt = DateTime.httpdate("Sat, 03 Feb 2001 04:05:06 GMT", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+00:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._httpdate("Sat, 03 Feb 2001 04:05:06 GMT"))).toBe(Date.ITALY + 10);
  });

  it("jisx0301", () => {
    expect(Date.jisx0301()).toBeInstanceOf(Temporal.PlainDate);
    expect(DateTime.jisx0301()).toBeInstanceOf(Temporal.PlainDateTime);

    let d = Date.jisx0301("H13.02.03", Date.ITALY + 10);
    expect(d.equals(Date.civil(2001, 2, 3))).toBe(true);
    expect(startOf(Date._jisx0301("H13.02.03"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("H31.04.30", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 4, 30))).toBe(true);
    expect(startOf(Date._jisx0301("H31.04.30"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("H31.05.01", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 5, 1))).toBe(true);
    expect(startOf(Date._jisx0301("H31.05.01"))).toBe(Date.ITALY + 10);

    d = Date.jisx0301("R01.05.01", Date.ITALY + 10);
    expect(d.equals(Date.civil(2019, 5, 1))).toBe(true);
    expect(startOf(Date._jisx0301("R01.05.01"))).toBe(Date.ITALY + 10);

    let dt = DateTime.jisx0301("H13.02.03T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2001, 2, 3, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H13.02.03T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("H31.04.30T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 4, 30, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H31.04.30T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("H31.05.01T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 5, 1, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("H31.05.01T04:05:06+07:00"))).toBe(Date.ITALY + 10);

    dt = DateTime.jisx0301("R01.05.01T04:05:06+07:00", Date.ITALY + 10);
    expect(dt.equals(new DateTime(2019, 5, 1, 4, 5, 6, "+07:00").toDatetime())).toBe(true);
    expect(dtStartOf(Date._jisx0301("R01.05.01T04:05:06+07:00"))).toBe(Date.ITALY + 10);
  });

  it("given string", () => {
    let s = "2001-02-03T04:05:06Z";
    let s0 = s;

    expect(Date._parse(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._iso8601(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._rfc3339(s)).not.toEqual({});
    expect(s).toEqual(s0);

    expect(Date._xmlschema(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "Sat, 3 Feb 2001 04:05:06 UT";
    s0 = s;
    expect(Date._rfc2822(s)).not.toEqual({});
    expect(s).toEqual(s0);
    expect(Date._rfc822(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "Sat, 03 Feb 2001 04:05:06 GMT";
    s0 = s;
    expect(Date._httpdate(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H13.02.03T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H31.04.30T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);

    s = "H31.05.01T04:05:06,07Z";
    s0 = s;
    expect(Date._jisx0301(s)).not.toEqual({});
    expect(s).toEqual(s0);
  });

  it("length limit", () => {
    expect(() => Date._parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date._jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => Date.parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => Date.jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => DateTime.parse("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.iso8601("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc3339("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.xmlschema("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc2822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.rfc822("1".repeat(1000))).toThrow(ArgumentError);
    expect(() => DateTime.jisx0301("1".repeat(1000))).toThrow(ArgumentError);

    expect(() => Date._parse("Jan " + "9".repeat(1000000))).toThrow(ArgumentError);
  });
});

function dtParse(str: string): DateTime {
  return dtNewByFrags(Date._parse(str));
}

function rescueArgumentError(block: () => unknown): unknown {
  try {
    block();
  } catch (e) {
    if (e instanceof ArgumentError) return e;
    throw e;
  }
  return null;
}

function assertNothingRaised<T>(block: () => T): T {
  return block();
}

function ymdhms(h: DateParts): unknown[] {
  return valuesAt(h, "year", "mon", "mday", "hour", "min", "sec", "offset");
}

function startOf(h: DateParts): number {
  return dNewByFrags(h, Date.ITALY + 10).start;
}

function dtStartOf(h: DateParts): number {
  return dtNewByFrags(h, Date.ITALY + 10).start;
}

function ydhms(h: DateParts): unknown[] {
  return valuesAt(h, "year", "yday", "hour", "min", "sec", "offset");
}

function cwhms(h: DateParts): unknown[] {
  return valuesAt(h, "cwyear", "cweek", "cwday", "hour", "min", "sec", "offset");
}

function secFrag(h: DateParts): unknown[] {
  return valuesAt(h, "hour", "min", "sec", "secFraction");
}
