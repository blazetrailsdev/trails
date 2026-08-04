/**
 * Ruby's stdlib `::Date` and `::DateTime`, as much of them as trails needs.
 * Rails does not define either class — it only reopens them in
 * `core_ext/date/*.rb`, whose calculations live in activesupport's
 * `time-ext.ts` here, over `Temporal.PlainDate`.
 *
 * `Temporal.PlainDate` is trails' `::Date` value (`TimeWithZone#toDate` returns
 * one), but it answers `dayOfWeek`/`month` rather than Ruby's `wday`/`mon` and
 * has no `strftime`, so it cannot be handed to a method that duck-types a Ruby
 * date. `I18n::Backend::Base#localize` is exactly such a method: it asks for
 * `strftime`, `wday` and `mon`, and picks `date.formats` over `time.formats` by
 * the *absence* of `sec` (i18n/lib/i18n/backend/base.rb:105-115, ported at
 * `./backend/base.ts:245-271`). These wrappers are that duck type, and `Date`'s
 * lack of `sec`/`hour` is the distinction Ruby gets from `Date` not being a
 * `Time`.
 *
 * This lives in `packages/i18n` rather than `packages/activesupport` because
 * `packages/i18n` is a dependency of `packages/activesupport`, and both
 * packages' localization tests drive the same objects.
 */

import { Temporal } from "@js-temporal/polyfill";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ABBR_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ABBR_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * @internal The fields the one C `strftime(3)` behind both `Date#strftime` and
 * `Time#strftime` reads off its receiver. It is not the public surface of
 * either class — `Date` deliberately answers no `hour`/`sec` — so each caller
 * builds one for the call.
 *
 * @noRailsEquivalent PERMANENT — the argument shape of `strftime` below, exported only
 * because TypeScript has no module-private visibility that still reaches
 * `./time.ts`. Not part of the shim's API: nothing outside `date.ts` and
 * `time.ts` constructs one.
 */
export interface StrftimeSubject {
  year: number;
  mon: number;
  day: number;
  wday: number;
  yday: number;
  hour: number;
  min: number;
  sec: number;
  zone: string;
  zoneOffset: string;
}

/**
 * @internal Ruby routes `Date#strftime` and `Time#strftime` through the same C
 * formatter, so trails has one implementation rather than a copy per class.
 *
 * @noRailsEquivalent PERMANENT — Ruby exposes `strftime` only as a method on `Date`,
 * `DateTime` and `Time`, and so does this shim — `I18n::Backend::Base#localize`
 * calls `object.strftime(format)` and nothing else
 * (i18n/lib/i18n/backend/base.rb:91-92). This free function is the shared
 * implementation those three methods delegate to, exported solely because
 * `./time.ts` is a separate module and TypeScript has no visibility between
 * "module-private" and "exported". Callers use `Date#strftime` /
 * `DateTime#strftime` / `Time#strftime`, never this.
 *
 * Only the directives the i18n format strings and the conformance mixins use
 * are recognised; Ruby leaves an unknown directive in place, and so does this.
 * `%z` and `%Z` both come off the subject: `::Date` has no zone of its own and
 * answers UTC, while a `::Time` built through the public constructor is in the
 * local zone and answers its real offset and abbreviation.
 */
export function strftime(subject: StrftimeSubject, format: string): string {
  const tokens: Record<string, () => string> = {
    Y: () => String(subject.year),
    y: () => pad2(subject.year % 100),
    m: () => pad2(subject.mon),
    d: () => pad2(subject.day),
    e: () => String(subject.day).padStart(2, " "),
    j: () => String(subject.yday).padStart(3, "0"),
    F: () => `${subject.year}-${pad2(subject.mon)}-${pad2(subject.day)}`,
    A: () => DAY_NAMES[subject.wday],
    a: () => ABBR_DAY_NAMES[subject.wday],
    B: () => MONTH_NAMES[subject.mon - 1],
    b: () => ABBR_MONTH_NAMES[subject.mon - 1],
    h: () => ABBR_MONTH_NAMES[subject.mon - 1],
    H: () => pad2(subject.hour),
    M: () => pad2(subject.min),
    S: () => pad2(subject.sec),
    p: () => (subject.hour < 12 ? "AM" : "PM"),
    P: () => (subject.hour < 12 ? "am" : "pm"),
    x: () => `${pad2(subject.mon)}/${pad2(subject.day)}/${pad2(subject.year % 100)}`,
    z: () => subject.zoneOffset,
    Z: () => subject.zone,
    "%": () => "%",
  };

  return format.replace(/%(-?)([A-Za-z%])/g, (match, flag, spec) => {
    const fn = tokens[spec];
    if (!fn) return match;
    let result = fn();
    if (flag === "-") result = result.replace(/^[0 ]+/, "") || "0";
    return result;
  });
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * @internal The alternations `date_parse.c` builds its patterns from
 * (ruby/date, `date_parse.c` `ABBR_MONTHS` / `ABBR_DAYS`). Ruby matches the
 * abbreviation and lets the rest of the name run off the end of the token, so
 * `"Jul"`, `"July"` and `"JULY"` all land on the same month.
 */
const ABBR_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const ABBR_DAYS = "sun|mon|tue|wed|thu|fri|sat";

/**
 * @internal The fields of the Hash `Date._parse` answers — any of them absent
 * when the string named only a fragment — plus the `:_comp` `date_parse.c` sets
 * when the year token is completable and deletes again before answering.
 *
 * `:yday` is the ordinal date's day-of-year, and the time-of-day fields are
 * what `parse_time` and the seconds branches of `parse_ddd_cb` set: `::Date`
 * throws the time away, but `rt_complete_frags` counts the fields present to
 * decide which kind of date the string named, so they have to be recorded.
 */
interface DateParts {
  year?: number;
  mon?: number;
  mday?: number;
  yday?: number;
  hour?: number;
  min?: number;
  sec?: number;
  secFraction?: number;
  zone?: string;
  _comp?: boolean;
}

/**
 * @internal The date and time elements of `rt_complete_frags`' table
 * (`date_core.c:3878-3892`) this shim carries.
 */
type DateFrag = "year" | "mon" | "mday" | "yday" | "hour" | "min" | "sec";

/** @internal `date_parse.c` `comp_year69`: `69` is 1969, `68` is 2068. */
function compYear69(y: number): number {
  return y >= 69 ? y + 1900 : y + 2000;
}

/** @internal `date_parse.c` `mon_num`: an abbreviation, or the head of a full name. */
function monNum(str: string): number {
  return ABBR_MONTH_NAMES.findIndex((m) => m.toLowerCase() === str.slice(0, 3).toLowerCase()) + 1;
}

/**
 * @internal `date_parse.c` `s3e`, which decides which of a match's numeric
 * tokens is the year: a token of more than two digits is one, a shorter one is
 * a month or a day. That is why `"01/01/2012".to_date` is 1 Jan 2012 while
 * `"12/13/2012".to_date` raises
 * (activesupport/lib/active_support/core_ext/string/conversions.rb:38-41), and
 * why `"07/08"` names no year at all.
 *
 * A signed year is never completable (`date_parse.c:172-181`, `:250-251`), so
 * `"-08-07-02"` is year -8 rather than 1992.
 */
function s3e(y: string | null, m: string, d: string | null): DateParts {
  if (y === null && d !== null && d.length > 2) {
    y = d;
    d = null;
  }
  if (y !== null && d === null) {
    if (y.replace(/^[-+]/, "").length > 2) return { year: Number(y), mon: Number(m), _comp: false };
    if (m.length > 2) return { year: Number(m), mon: Number(y), _comp: false };
    return { mon: Number(y), mday: Number(m) };
  }
  if (y === null) return { mon: Number(m), mday: Number(d) };
  if (y.replace(/^[-+]/, "").length < 3 && d !== null && d.length > 2) {
    [y, d] = [d, y];
  }
  return {
    year: Number(y),
    mon: Number(m),
    mday: Number(d),
    _comp: /^\d{1,2}$/.test(y),
  };
}

/** @internal `date_parse.c` `parse_day`: a leading day name is not a date field. */
function parseDay(str: string): string {
  return str.replace(new RegExp(`\\b(${ABBR_DAYS})[^-\\d\\s]*`, "i"), " ");
}

/**
 * @internal `date_parse.c` `NUMBER` (`date_parse.c:259`): a digit that does not
 * continue a longer run, so a width-counted pattern cannot match the tail of
 * one.
 */
const NUMBER = "(?<!\\d)\\d";

/**
 * @internal `date_parse.c` `parse_time2_cb` (`date_parse.c:613-653`): the hour/minute/second of the time
 * text `parse_time` matched, with `p`/`pm` moving the hour into the afternoon.
 */
function parseTime2Cb(m: RegExpExecArray, hash: DateParts): number {
  let h = Number(m[1]);
  const min = m[2] === undefined ? null : Number(m[2]);
  const s = m[3] === undefined ? null : Number(m[3]);
  const f = m[4];
  const p = m[5];

  if (p !== undefined) {
    h %= 12;
    if (p === "P" || p === "p") h += 12;
  }

  hash.hour = h;
  if (min !== null) hash.min = min;
  if (s !== null) hash.sec = s;
  if (f !== undefined) hash.secFraction = Number(f) / 10 ** f.length;

  return 1;
}

/**
 * @internal `date_parse.c` `parse_time_cb` (`date_parse.c:656-686`): the zone comes off the second group
 * of `parse_time`'s match, and the time text itself is re-matched field by
 * field.
 */
function parseTimeCb(m: RegExpExecArray, hash: DateParts): number {
  const patSource =
    "^(\\d+)h?" +
    "(?:\\s*:?\\s*(\\d+)m?" +
    "(?:" +
    "\\s*:?\\s*(\\d+)(?:[,.](\\d+))?s?" +
    ")?" +
    ")?" +
    "(?:\\s*([ap])(?:m\\b|\\.m\\.))?";

  const s1 = m[1];
  const s2 = m[2];

  if (s2 !== undefined) hash.zone = s2;

  const m2 = new RegExp(patSource, "i").exec(s1);
  if (m2 === null) return 0;
  parseTime2Cb(m2, hash);

  return 1;
}

/**
 * @internal `date_parse.c` `parse_time` (`date_parse.c:689-733`): the time of
 * day and its zone. It runs before every date sub-parser and, like all of them,
 * replaces the text it matched with a space (`date_parse.c` `subx`) — so
 * `"07.2008"` reaches `parse_ddd` whole while `"2008070 10:30"` reaches it as
 * its date alone. That removal is what lets `parse_ddd` read a bare two- or
 * three-digit run as a date rather than as minutes.
 *
 * Ruby edits the one String every sub-parser shares; a JS string is immutable,
 * so the edited string is answered instead, as `parse_day` above already does.
 *
 * Ruby turns `IGNORECASE` back off around the two alphabetic zone spellings
 * (`(?-i:…)`); the groups it guards are character classes that already span
 * both cases, so the ported pattern is the same language without the flag.
 */
function parseTime(str: string, hash: DateParts): string {
  const patSource =
    "(" +
    NUMBER +
    "+\\s*" +
    "(?:" +
    "(?:" +
    ":\\s*\\d+" +
    "(?:" +
    "\\s*:\\s*\\d+(?:[,.]\\d*)?" +
    ")?" +
    "|" +
    "h(?:\\s*\\d+m?(?:\\s*\\d+s?)?)?" +
    ")" +
    "(?:" +
    "\\s*" +
    "[ap](?:m\\b|\\.m\\.)" +
    ")?" +
    "|" +
    "[ap](?:m\\b|\\.m\\.)" +
    ")" +
    ")" +
    "(?:" +
    "\\s*" +
    "(" +
    "(?:gmt|utc?)?[-+]\\d+(?:[,.:]\\d+(?::\\d+)?)?" +
    "|" +
    "[A-Za-z.\\s]+(?:standard|daylight)\\stime\\b" +
    "|" +
    "[A-Za-z]+(?:\\sdst)?\\b" +
    ")" +
    ")?";

  const m = new RegExp(patSource, "i").exec(str);
  if (m === null) return str;
  const rest = str.slice(0, m.index) + " " + str.slice(m.index + m[0].length);
  parseTimeCb(m, hash);
  return rest;
}

/** @internal `date_parse.c` `parse_eu`: `2nd July 2008`, `2 Jul 2008`, `3 Feb`. */
function parseEu(str: string): DateParts | null {
  const m = new RegExp(
    `'?(\\d+)[^-\\d\\s]*[-,.\\s]*(${ABBR_MONTHS})[^-\\d\\s]*(?:[,.\\s]+'?([-+]?\\d+)|[-,.\\s]*'?(\\d+))?`,
    "i",
  ).exec(str);
  return m ? s3e(m[3] ?? m[4] ?? null, String(monNum(m[2])), m[1]) : null;
}

/** @internal `date_parse.c` `parse_us`: `Jul 2 2008`, `July 2nd, 2008`, `Feb 2008`. */
function parseUs(str: string): DateParts | null {
  const m = new RegExp(
    `\\b(${ABBR_MONTHS})[^-\\d\\s]*[-,.\\s]+'?(\\d+)[^-\\d\\s]*(?:[,.\\s]+'?([-+]?\\d+)|[-,.\\s]*'?(\\d+))?`,
    "i",
  ).exec(str);
  return m ? s3e(m[3] ?? m[4] ?? null, String(monNum(m[1])), m[2]) : null;
}

/** @internal `date_parse.c` `parse_iso`: `2008-07-02`, and the unpadded `2008-7-2`. */
function parseIso(str: string): DateParts | null {
  const m = /([-+]?\d+)-(\d+)-(-?\d+)/.exec(str);
  return m ? s3e(m[1], m[2], m[3]) : null;
}

/** @internal `date_parse.c` `parse_sla`: `2012/12/13`, `01/01/2012`, `2008/07`. */
function parseSla(str: string): DateParts | null {
  const m = /([-+]?\d+)\/\s*(\d+)(?:\D\s*(-?\d+))?/.exec(str);
  return m ? s3e(m[1], m[2], m[3] ?? null) : null;
}

/** @internal `date_parse.c` `parse_dot`: `2012.12.13`, `01.01.2012`. */
function parseDot(str: string): DateParts | null {
  const m = /([-+]?\d+)\.\s*(\d+)\.\s*(-?\d+)/.exec(str);
  return m ? s3e(m[1], m[2], m[3]) : null;
}

/** @internal `date_parse.c` `n2i`: the `w` digits of `s` from `f`, as a number. */
function n2i(s: string, f: number, w: number): number {
  return Number(s.slice(f, f + w));
}

/**
 * @internal `date_parse.c` `parse_ddd_cb` (`date_parse.c:1768-1965`): an
 * all-digit run, read by its width. A run of 2, 3, 5 or 7 digits followed by a
 * fraction but no second run is a time of day — `"07.2008"` is 7 seconds and a
 * fraction, and names no date at all — while the same widths on their own are a
 * `:mday` (2), a `:yday` (3), or a year and a `:yday` (5 and 7).
 */
function parseDddCb(m: RegExpExecArray, hash: DateParts): number {
  const s1 = m[1];
  const s2 = m[2];
  const s3 = m[3];
  const s4 = m[4];
  const s5 = m[5];

  const cs2 = s2;
  const l2 = s2.length;

  switch (l2) {
    case 2:
      if (s3 === undefined && s4 !== undefined) hash.sec = n2i(cs2, l2 - 2, 2);
      else hash.mday = n2i(cs2, 0, 2);
      break;
    case 4:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 4, 2);
      } else {
        hash.mon = n2i(cs2, 0, 2);
        hash.mday = n2i(cs2, 2, 2);
      }
      break;
    case 6:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 4, 2);
        hash.hour = n2i(cs2, l2 - 6, 2);
      } else {
        let y = n2i(cs2, 0, 2);
        if (s1 === "-") y = -y;
        hash.year = y;
        hash.mon = n2i(cs2, 2, 2);
        hash.mday = n2i(cs2, 4, 2);
      }
      break;
    case 8:
    case 10:
    case 12:
    case 14:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 4, 2);
        hash.hour = n2i(cs2, l2 - 6, 2);
        hash.mday = n2i(cs2, l2 - 8, 2);
        if (l2 >= 10) hash.mon = n2i(cs2, l2 - 10, 2);
        if (l2 === 12) {
          let y = n2i(cs2, l2 - 12, 2);
          if (s1 === "-") y = -y;
          hash.year = y;
        }
        if (l2 === 14) {
          let y = n2i(cs2, l2 - 14, 4);
          if (s1 === "-") y = -y;
          hash.year = y;
          hash._comp = false;
        }
      } else {
        let y = n2i(cs2, 0, 4);
        if (s1 === "-") y = -y;
        hash.year = y;
        hash.mon = n2i(cs2, 4, 2);
        hash.mday = n2i(cs2, 6, 2);
        if (l2 >= 10) hash.hour = n2i(cs2, 8, 2);
        if (l2 >= 12) hash.min = n2i(cs2, 10, 2);
        if (l2 >= 14) hash.sec = n2i(cs2, 12, 2);
        hash._comp = false;
      }
      break;
    case 3:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 3, 1);
      } else hash.yday = n2i(cs2, 0, 3);
      break;
    case 5:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 4, 2);
        hash.hour = n2i(cs2, l2 - 5, 1);
      } else {
        let y = n2i(cs2, 0, 2);
        if (s1 === "-") y = -y;
        hash.year = y;
        hash.yday = n2i(cs2, 2, 3);
      }
      break;
    case 7:
      if (s3 === undefined && s4 !== undefined) {
        hash.sec = n2i(cs2, l2 - 2, 2);
        hash.min = n2i(cs2, l2 - 4, 2);
        hash.hour = n2i(cs2, l2 - 6, 2);
        hash.mday = n2i(cs2, l2 - 7, 1);
      } else {
        let y = n2i(cs2, 0, 4);
        if (s1 === "-") y = -y;
        hash.year = y;
        hash.yday = n2i(cs2, 4, 3);
      }
      break;
  }
  if (s3 !== undefined) {
    const cs3 = s3;
    const l3 = s3.length;

    if (s4 !== undefined) {
      switch (l3) {
        case 2:
        case 4:
        case 6:
          hash.sec = n2i(cs3, l3 - 2, 2);
          if (l3 >= 4) hash.min = n2i(cs3, l3 - 4, 2);
          if (l3 >= 6) hash.hour = n2i(cs3, l3 - 6, 2);
          break;
      }
    } else {
      switch (l3) {
        case 2:
        case 4:
        case 6:
          hash.hour = n2i(cs3, 0, 2);
          if (l3 >= 4) hash.min = n2i(cs3, 2, 2);
          if (l3 >= 6) hash.sec = n2i(cs3, 4, 2);
          break;
      }
    }
  }
  if (s4 !== undefined) {
    const l4 = s4.length;

    hash.secFraction = Number(s4) / 10 ** l4;
  }
  if (s5 !== undefined) {
    hash.zone = s5;
  }

  return 1;
}

/**
 * @internal `date_parse.c` `parse_ddd` (`date_parse.c:1969-2002`): the digit run
 * itself, plus the time and zone that can follow it.
 *
 * @missingRailsCall The `:offset` a bracketed zone (`"[+9:JST]"`) also sets is
 * not read: `date_zone_to_diff` is not ported, and `::Date` discards the zone.
 */
function parseDdd(str: string): DateParts | null {
  const m = new RegExp(
    `([-+]?)(${NUMBER}{2,14})` +
      "(?:" +
      "\\s*" +
      "t?" +
      "\\s*" +
      "(\\d{2,6})?(?:[,.](\\d*))?" +
      ")?" +
      "(?:" +
      "\\s*" +
      "(" +
      "z\\b" +
      "|" +
      "[-+]\\d{1,4}\\b" +
      "|" +
      "\\[[-+]?\\d[^\\]]*\\]" +
      ")" +
      ")?",
    "i",
  ).exec(str);
  if (m === null) return null;
  const hash: DateParts = {};
  parseDddCb(m, hash);
  return hash;
}

/**
 * @internal `date_core.c` `rt_complete_frags` (`date_core.c:3878-4036`), which
 * decides what kind of date the fields name — the entry of its table with the
 * most of them present wins, ties going to the earliest — and then fills the
 * ones the string left out: the fields above the highest it named come from
 * `Date.today`, the ones below it are `1`. `"Feb 3rd".to_date` is this year's 3
 * February — the case Rails tests at
 * `activesupport/test/core_ext/string_ext_test.rb:775` — and `"102".to_date` is
 * this year's 102nd day.
 *
 * Only the `:time`, `:ordinal` and `:civil` entries of that table are carried:
 * the rest are the Julian-day, commercial and week-numbered dates, none of
 * which any sub-parser ported here can produce. `:time` names no date, so it
 * has no completion branch in Ruby either, and the string goes on to raise.
 */
function completeFrags(parts: DateParts): void {
  const tab: [string, DateFrag[]][] = [
    ["time", ["hour", "min", "sec"]],
    ["ordinal", ["year", "yday", "hour", "min", "sec"]],
    ["civil", ["year", "mon", "mday", "hour", "min", "sec"]],
  ];

  let g: boolean;
  let e = 0;
  let k = "";
  let a: DateFrag[] = [];
  {
    let eno = 0;
    let idx = 0;

    for (let i = 0; i < tab.length; i++) {
      const x = tab[i];
      let n = 0;

      for (const j of x[1]) if (parts[j] !== undefined) n++;
      if (n > eno) {
        eno = n;
        idx = i;
      }
    }
    if (eno === 0) g = false;
    else {
      g = true;
      k = tab[idx][0];
      a = tab[idx][1];
      e = eno;
    }
  }

  if (g && a.length - e) {
    const d = Temporal.Now.plainDateISO();
    const today: Partial<Record<DateFrag, number>> = {
      year: d.year,
      mon: d.month,
      mday: d.day,
      yday: d.dayOfYear,
    };

    if (k === "ordinal") {
      if (parts.year === undefined) parts.year = today.year;
      parts.yday ??= 1;
    } else if (k === "civil") {
      for (const el of a) {
        if (parts[el] !== undefined) break;
        parts[el] = today[el];
      }
      parts.mon ??= 1;
      parts.mday ??= 1;
    }
  }
}

/**
 * @internal Ruby `Date::Error`, the `ArgumentError` subclass ruby/date defines
 * under `::Date` (`date_core.c` `eDateError` / `Init_date_core`). It is reached
 * as `Date.Error`; this binding only exists so the class body can name it.
 */
class DateError extends ArgumentError {
  constructor(message: string) {
    super(message);
    this.name = "Date::Error";
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `::Date`. Rails never defines the
 * class, only reopens it, so there is no Rails counterpart for a port to
 * converge on; JS has no stdlib equivalent either (`Temporal.PlainDate` answers
 * `dayOfWeek`/`month`, not `wday`/`mon`, and has no `strftime`). trails carries
 * only the members a caller duck-types.
 */
export class Date {
  /**
   * Ruby `Date::Error` (ruby/date, `date_core.c` `Init_date_core`), raised by
   * `Date.parse` and a subclass of `ArgumentError`.
   */
  static Error = DateError;

  /** @internal Ruby's `::Date` value, which has no public reader. */
  readonly #plain: Temporal.PlainDate;

  /** Ruby `Date.new(year, month, day)`. */
  constructor(year: number, month: number, day: number) {
    this.#plain = new Temporal.PlainDate(year, month, day);
  }

  /**
   * Ruby `Date.parse(str, comp = true)`, which runs `Date._parse` and then
   * builds the date from the `:year`/`:mon`/`:mday` it found (ruby/date,
   * `date_core.c` `date_s_parse` → `date__parse` in `date_parse.c`).
   * `String#to_date` delegates straight to it
   * (activesupport/lib/active_support/core_ext/string/conversions.rb:47-48),
   * so every spelling its doc example lists — `"1-1-2012"`, `"01/01/2012"`,
   * `"2012-12-13"` — reaches here, and `activesupport/test/i18n_test.rb:9`
   * passes the unpadded `"2008-7-2"`.
   *
   * `comp` completes a two-digit year, which is why `"080702"` is 2008 here
   * and 0008 through Rails' `::Date.parse(self, false)`.
   *
   * `rt__valid_date_frags_p` (`date_core.c:4185-4220`) tries the ordinal date
   * — a `:year` and a `:yday`, which is what `"2008070"` names — before the
   * civil one, and a string that named only a time of day answers neither and
   * raises.
   */
  static parse(str: string, comp = true): Date {
    const parts = Date._parse(str, comp);
    if (!parts) throw new DateError("invalid date");
    completeFrags(parts);
    let d: Temporal.PlainDate | null = null;
    try {
      if (parts.yday !== undefined && parts.year !== undefined && parts.yday >= 1) {
        d = new Temporal.PlainDate(parts.year, 1, 1).add({ days: parts.yday - 1 });
        if (d.year !== parts.year) d = null;
      } else if (parts.mon !== undefined && parts.mday !== undefined) {
        d = new Temporal.PlainDate(parts.year as number, parts.mon, parts.mday);
      }
    } catch {
      d = null;
    }
    if (d === null) throw new DateError("invalid date");
    return new Date(d.year, d.month, d.day);
  }

  /**
   * Ruby `Date._parse(str, comp = true)` (ruby/date, `date_parse.c`
   * `date__parse`), which runs its sub-parsers in a fixed order and stops at
   * the first that matches: the alphabetic pair first, then the numeric ones.
   * Ruby answers a Hash of whatever fields it found, which is why a fragment
   * such as `"Feb 3rd"` comes back without a `:year`; `null` is the Hash no
   * sub-parser filled at all.
   *
   * Ruby's sub-parsers all `set_hash` into the one Hash it built up front, so a
   * later one overwrites what `parse_time` put there; the ported sub-parsers
   * answer their fields instead, and merging them over `parse_time`'s is that
   * same last-writer-wins. `:_comp` starts out as `comp` (`date_parse.c:2172`)
   * and only ever turns false, so an absent one is `comp`, and the year is
   * completed only within `0..99` (`date_parse.c:2267-2287`).
   *
   * @missingRailsCall `parse_jis`, `parse_vms`, `parse_iso2`, `parse_year`,
   * `parse_mon`, `parse_mday` and `parse_bc` are not ported: they read a
   * calendar Rails never round-trips.
   */
  static _parse(str: string, comp = true): DateParts | null {
    const hash: DateParts = {};
    str = parseDay(str);
    str = parseTime(str, hash);
    let parts: DateParts | null = null;
    if (/[a-z]/i.test(str)) {
      parts = parseEu(str) ?? parseUs(str);
    }
    parts ??= parseIso(str) ?? parseSla(str) ?? parseDot(str) ?? parseDdd(str);
    if (parts === null && Object.keys(hash).length === 0) return null;
    parts = Object.assign(hash, parts);
    if (comp && parts._comp !== false && parts.year !== undefined) {
      if (parts.year >= 0 && parts.year <= 99) parts.year = compYear69(parts.year);
    }
    delete parts._comp;
    return parts;
  }

  get year(): number {
    return this.#plain.year;
  }

  get mon(): number {
    return this.#plain.month;
  }

  get month(): number {
    return this.#plain.month;
  }

  get day(): number {
    return this.#plain.day;
  }

  /** Ruby counts Sunday as 0; `Temporal.PlainDate#dayOfWeek` counts Monday as 1. */
  get wday(): number {
    return this.#plain.dayOfWeek % 7;
  }

  get yday(): number {
    return this.#plain.dayOfYear;
  }

  /**
   * `Date#strftime('%Z')` answers the UTC offset. Ruby's `::Date` has no `zone`
   * reader of its own — only `::DateTime` and `::Time` do — so the value is
   * passed to the formatter rather than exposed as a member.
   */
  strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: 0,
        min: 0,
        sec: 0,
        zone: "+00:00",
        zoneOffset: "+0000",
      },
      format,
    );
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `::DateTime`, a `::Date` that also
 * answers `hour`, `min` and `sec`. Those are what route a `localize` lookup to
 * `time.formats` (i18n/lib/i18n/backend/base.rb:105-115), while `%Z` keeps
 * `::Date`'s offset spelling rather than `::Time`'s `"UTC"`.
 */
export class DateTime extends Date {
  readonly #hour: number;
  readonly #min: number;
  readonly #sec: number;

  /** Ruby `DateTime.new(year, month, day, hour = 0, minute = 0, second = 0)`. */
  constructor(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
    super(year, month, day);
    this.#hour = hour;
    this.#min = minute;
    this.#sec = second;
  }

  get hour(): number {
    return this.#hour;
  }

  get min(): number {
    return this.#min;
  }

  get sec(): number {
    return this.#sec;
  }

  /** `DateTime#zone` is the UTC offset, where `Time#zone` is `"UTC"`. */
  get zone(): string {
    return "+00:00";
  }

  override strftime(format: string): string {
    return strftime(
      {
        year: this.year,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        zone: this.zone,
        zoneOffset: "+0000",
      },
      format,
    );
  }
}
