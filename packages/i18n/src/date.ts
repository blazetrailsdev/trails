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
 *
 * `:offset` is `date_zone_to_diff`'s answer for `:zone`, and it is `null`
 * rather than absent when the zone is one Ruby does not know: `date__parse`
 * sets the key from a `nil` return (`date_parse.c:2290-2294`), and Ruby's Hash
 * answers `{... :offset => nil}` there.
 */
interface DateParts {
  year?: number;
  mon?: number;
  mday?: number;
  yday?: number;
  cwyear?: number;
  cweek?: number;
  cwday?: number;
  hour?: number;
  min?: number;
  sec?: number;
  secFraction?: number;
  zone?: string;
  offset?: number | null;
  _comp?: boolean;
  _bc?: boolean;
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

/** @internal `date_parse.c` `issign` (`date_parse.c:63`). */
function issign(c: string): boolean {
  return c === "-" || c === "+";
}

/** @internal `date_parse.c` `isdigit`, the C library's. */
function isdigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

/** @internal `date_parse.c` `digit_span` (`date_parse.c:71-78`): the run of digits at `s`. */
function digitSpan(str: string, s: number, e: number): number {
  let i = 0;
  while (s + i < e && isdigit(str[s + i])) i++;
  return i;
}

/**
 * @internal `zonetab.list` (`date-3.4.1/ext/date/zonetab.list`), the gperf
 * input `zonetab()` is generated from: the abbreviations, the military single
 * letters and the Windows-style full names, each with its offset in seconds,
 * as `name,offset` pairs in the order the list file gives them.
 */
const ZONETAB_LIST =
  "ut,0;gmt,0;est,-18000;edt,-14400;cst,-21600;cdt,-18000;mst,-25200;mdt,-21600;pst,-28800;" +
  "pdt,-25200;a,3600;b,7200;c,10800;d,14400;e,18000;f,21600;g,25200;h,28800;i,32400;k,36000;" +
  "l,39600;m,43200;n,-3600;o,-7200;p,-10800;q,-14400;r,-18000;s,-21600;t,-25200;u,-28800;" +
  "v,-32400;w,-36000;x,-39600;y,-43200;z,0;utc,0;wet,0;at,-7200;brst,-7200;ndt,-5400;art,-10800;" +
  "adt,-10800;brt,-10800;clst,-10800;nst,-9000;ast,-14400;clt,-14400;akdt,-28800;ydt,-28800;" +
  "akst,-32400;hadt,-32400;hdt,-32400;yst,-32400;ahst,-36000;cat,7200;hast,-36000;hst,-36000;" +
  "nt,-39600;idlw,-43200;bst,3600;cet,3600;fwt,3600;met,3600;mewt,3600;mez,3600;swt,3600;" +
  "wat,3600;west,3600;cest,7200;eet,7200;fst,7200;mest,7200;mesz,7200;sast,7200;sst,-39600;" +
  "bt,10800;eat,10800;eest,10800;msk,10800;msd,14400;zp4,14400;zp5,18000;ist,19800;zp6,21600;" +
  "wast,7200;cct,23400;sgt,28800;wadt,28800;jst,32400;kst,32400;east,-21600;gst,36000;" +
  "eadt,39600;idle,43200;nzst,43200;nzt,43200;nzdt,46800;afghanistan,16200;alaskan,-32400;" +
  "arab,10800;arabian,14400;arabic,10800;atlantic,-14400;aus central,34200;aus eastern,36000;" +
  "azores,-3600;canada central,-21600;cape verde,-3600;caucasus,14400;cen. australia,34200;" +
  "central america,-21600;central asia,21600;central europe,3600;central european,3600;" +
  "central pacific,39600;central,-21600;china,28800;dateline,-43200;e. africa,10800;" +
  "e. australia,36000;e. europe,7200;e. south america,-10800;eastern,-18000;egypt,7200;" +
  "ekaterinburg,18000;fiji,43200;fle,7200;greenland,-10800;greenwich,0;gtb,7200;hawaiian,-36000;" +
  "india,19800;iran,12600;jerusalem,7200;korea,32400;mexico,-21600;mid-atlantic,-7200;" +
  "mountain,-25200;myanmar,23400;n. central asia,21600;nepal,20700;new zealand,43200;" +
  "newfoundland,-12600;north asia east,28800;north asia,25200;pacific sa,-14400;pacific,-28800;" +
  "romance,3600;russian,10800;sa eastern,-10800;sa pacific,-18000;sa western,-14400;" +
  "samoa,-39600;se asia,25200;malay peninsula,28800;south africa,7200;sri lanka,21600;" +
  "taipei,28800;tasmania,36000;tokyo,32400;tonga,46800;us eastern,-18000;us mountain,-25200;" +
  "vladivostok,36000;w. australia,28800;w. central africa,3600;w. europe,3600;west asia,18000;" +
  "west pacific,36000;yakutsk,32400;acdt,37800;acst,34200;act,-18000;acwst,31500;aedt,39600;" +
  "aest,36000;aft,16200;almt,21600;anast,43200;anat,43200;aoe,-43200;aqtt,18000;awdt,32400;" +
  "awst,28800;azost,0;azot,-3600;azst,18000;azt,14400;bnt,28800;bot,-14400;btt,21600;cast,28800;" +
  "chadt,49500;chast,45900;chost,32400;chot,28800;chst,36000;chut,36000;cidst,-14400;" +
  "cist,-18000;ckt,-36000;cot,-18000;cvt,-3600;cxt,25200;davt,25200;ddut,36000;easst,-18000;" +
  "ect,-18000;egst,0;egt,-3600;fet,10800;fjst,46800;fjt,43200;fkst,-10800;fkt,-14400;fnt,-7200;" +
  "galt,-21600;gamt,-32400;get,14400;gft,-10800;gilt,43200;gyt,-14400;hkt,28800;hovst,28800;" +
  "hovt,25200;ict,25200;idt,10800;iot,21600;irdt,16200;irkst,32400;irkt,28800;irst,12600;" +
  "kgt,21600;kost,39600;krast,28800;krat,25200;kuyt,14400;lhdt,39600;lhst,37800;lint,50400;" +
  "magst,43200;magt,39600;mart,-30600;mawt,18000;mht,43200;mmt,23400;mut,14400;mvt,18000;" +
  "myt,28800;nct,39600;nfdt,43200;nft,39600;novst,25200;novt,25200;npt,20700;nrt,43200;" +
  "nut,-39600;omsst,25200;omst,21600;orat,18000;pet,-18000;petst,43200;pett,43200;pgt,36000;" +
  "phot,46800;pht,28800;pkt,18000;pmdt,-7200;pmst,-10800;pont,39600;pwt,32400;pyst,-10800;" +
  "qyzt,21600;ret,14400;rott,-10800;sakt,39600;samt,14400;sbt,39600;sct,14400;sret,39600;" +
  "srt,-10800;syot,10800;taht,-36000;tft,18000;tjt,18000;tkt,46800;tlt,32400;tmt,18000;" +
  "tost,50400;tot,46800;trt,10800;tvt,43200;ulast,32400;ulat,28800;uyst,-7200;uyt,-10800;" +
  "uzt,18000;vet,-14400;vlast,39600;vlat,36000;vost,21600;vut,39600;wakt,43200;warst,-10800;" +
  "wft,43200;wgst,-3600;wgt,-7200;wib,25200;wit,32400;wita,28800;wt,0;yakst,36000;yakt,32400;" +
  "yapt,36000;yekst,21600;yekt,18000";

/** @internal `zonetab.h` `MAX_WORD_LENGTH`: the longest key in `zonetab.list`. */
const MAX_WORD_LENGTH = 17;

const ZONETAB = new Map(
  ZONETAB_LIST.split(";").map((e) => {
    const i = e.indexOf(",");
    return [e.slice(0, i), Number(e.slice(i + 1))] as const;
  }),
);

/**
 * @internal `zonetab.h` `zonetab`, the gperf lookup. gperf is run with
 * `GPERF_DOWNCASE` and `gperf_case_strncmp`, so the name matches case-blind.
 */
function zonetab(str: string, len: number): number | undefined {
  return ZONETAB.get(str.slice(0, len).toLowerCase());
}

/** @internal C `isspace` over the ASCII whitespace `date_parse.c` sees. */
function isspace(c: string | undefined): boolean {
  return c === " " || (c !== undefined && c >= "\t" && c <= "\r");
}

/**
 * @internal C `strtoul` base 10, answering the value and the index one past
 * the digits it read, which is `date_zone_to_diff`'s `p`.
 */
function strtoul(s: string, i: number): [number, number] {
  let v = 0;

  while (isspace(s[i])) i++;
  while (isdigit(s[i])) {
    v = v * 10 + Number(s[i]);
    i++;
  }
  return [v, i];
}

/**
 * @internal `ruby_scan_digits`, which reads at most `len` digits and answers
 * both the value and how many digits it took.
 */
function rubyScanDigits(s: string, start: number, len: number): [number, number] {
  let v = 0;
  let n = 0;

  while (n < len && isdigit(s[start + n])) {
    v = v * 10 + Number(s[start + n]);
    n++;
  }
  return [v, n];
}

/**
 * @internal `date_parse.c` `str_end_with_word` (`date_parse.c:369-377`): the
 * length of `w` plus the whitespace before it, when the first `l` characters
 * of `s` end with that whitespace-separated word.
 */
function strEndWithWord(s: string, l: number, w: string): number {
  let n = w.length;

  if (l <= n || !isspace(s[l - n - 1])) return 0;
  if (s.slice(l - n, l).toLowerCase() !== w) return 0;
  do ++n;
  while (l > n && isspace(s[l - n - 1]));
  return n;
}

/**
 * @internal `date_parse.c` `shrunk_size` (`date_parse.c:379-395`): the length
 * the first `l` characters of `s` would have with every whitespace run
 * collapsed to one space, or `0` when that is no shorter than `l`.
 */
function shrunkSize(s: string, l: number): number {
  let ni = 0;
  let sp = false;

  for (let i = 0; i < l; ++i) {
    if (!isspace(s[i])) {
      if (sp) ni++;
      sp = false;
      ni++;
    } else {
      sp = true;
    }
  }
  return ni < l ? ni : 0;
}

/**
 * @internal `date_parse.c` `shrink_space` (`date_parse.c:397-413`). C writes
 * into a caller buffer and answers the length; the shrunk string carries both.
 */
function shrinkSpace(s: string, l: number): string {
  let d = "";
  let sp = false;

  for (let i = 0; i < l; ++i) {
    if (!isspace(s[i])) {
      if (sp) d += " ";
      sp = false;
      d += s[i];
    } else {
      sp = true;
    }
  }
  return d;
}

/**
 * @internal `date_parse.c` `date_zone_to_diff` (`date_parse.c:415-559`): the
 * `:offset` in seconds a `:zone` names. A trailing `standard`, `daylight` or
 * `dst` word comes off first (and `daylight`/`dst` add an hour), then the
 * whitespace-shrunk remainder is looked up in `zonetab`, and only failing that
 * is it read as a numeric offset — `+09:00`, `+0930`, `+9`, `+9.5`, optionally
 * behind a `gmt`/`utc` prefix. `null` is Ruby's `nil`: not a zone it knows.
 *
 * The fractional-hour branch keeps C's `maxDigits` cap of seven decimal places
 * (`date_parse.c:514-517`) and its round-half-to-even on the eighth
 * (`date_parse.c:519-522`), where the comparison character is `'5' + !(sec & 1)`.
 *
 * Ruby answers a Rational for a fractional-hour offset of more than two
 * decimal places (`date_parse.c:522-528`); TypeScript has no Rational, so the
 * division is a `number` there.
 */
function dateZoneToDiff(str: string): number | null {
  let offset: number | null = null;
  let l = str.length;
  let s = str;

  {
    let dst = false;
    let w: number;

    if ((w = strEndWithWord(s, l, "time")) > 0) {
      const wtime = w;
      l -= w;
      if ((w = strEndWithWord(s, l, "standard")) > 0) {
        l -= w;
      } else if ((w = strEndWithWord(s, l, "daylight")) > 0) {
        l -= w;
        dst = true;
      } else {
        l += wtime;
      }
    } else if ((w = strEndWithWord(s, l, "dst")) > 0) {
      l -= w;
      dst = true;
    }

    {
      let zn = s;
      let sl = shrunkSize(s, l);
      let z: number | undefined;

      if (sl <= 0) {
        sl = l;
      } else if (sl <= MAX_WORD_LENGTH) {
        zn = shrinkSpace(s, l);
        sl = zn.length;
      }

      if (sl > 0 && sl <= MAX_WORD_LENGTH) {
        z = zonetab(zn, sl);
      }

      if (z !== undefined) {
        let d = z;
        if (dst) d += 3600;
        offset = d;
        return offset;
      }
    }

    {
      let p: number;
      let sign: boolean;
      let hour: number;
      let min = 0;
      let sec = 0;

      if (
        l > 3 &&
        (s.slice(0, 3).toLowerCase() === "gmt" || s.slice(0, 3).toLowerCase() === "utc")
      ) {
        s = s.slice(3);
        l -= 3;
      }
      if (issign(s[0])) {
        sign = s[0] === "-";
        s = s.slice(1);
        l--;

        const outOfRange = (v: number, min: number, max: number): boolean => v < min || max < v;

        [hour, p] = strtoul(s, 0);
        if (s[p] === ":") {
          if (outOfRange(hour, 0, 23)) return null;
          [min, p] = strtoul(s, p + 1);
          if (outOfRange(min, 0, 59)) return null;
          if (s[p] === ":") {
            [sec] = strtoul(s, p + 1);
            if (outOfRange(sec, 0, 59)) return null;
          }
        } else if (s[p] === "," || s[p] === ".") {
          let n: number;
          const maxDigits = 7;

          if (outOfRange(hour, 0, 23)) return null;

          n = l - ++p;
          if (n > maxDigits) n = maxDigits;
          [sec, n] = rubyScanDigits(s, p, n);
          if ((p += n) < l && s[p] >= (sec % 2 === 0 ? "6" : "5") && s[p] <= "9") {
            sec++;
          }
          sec *= 36;
          if (sign) {
            hour = -hour;
            sec = -sec;
          }
          if (n <= 2) {
            if (n === 1) sec *= 10;
            offset = sec + hour * 3600;
          } else {
            const denom = 10 ** (n - 2);
            offset = sec / denom + hour * 3600;
          }
          return offset;
        } else if (l > 2) {
          if (l >= 1) [hour] = rubyScanDigits(s, 0, 2 - (l % 2));
          if (l >= 3) [min] = rubyScanDigits(s, 2 - (l % 2), 2);
          if (l >= 5) [sec] = rubyScanDigits(s, 4 - (l % 2), 2);
        }
        sec += min * 60 + hour * 3600;
        if (sign) sec = -sec;
        offset = sec;
      }
    }
  }
  return offset;
}

/**
 * @internal `date_parse.c` `s3e` (`date_parse.c:80-253`), which decides which of
 * a match's tokens is the year: a token of more than two characters is one, and
 * so is a token an apostrophe marks (`:99-157`). That is why
 * `"01/01/2012".to_date` is 1 Jan 2012 while `"12/13/2012".to_date` raises
 * (activesupport/lib/active_support/core_ext/string/conversions.rb:38-41), why
 * `"07/08"` names no year at all, and why `"'01-FEB-3"` is 3 February 2001
 * where `"3-FEB-2001"` is the same date the other way round.
 *
 * Each of the three is then read from its first sign or digit (`:159-192`,
 * `:197-221`, `:223-247`), so the apostrophe never reaches the number. A signed
 * year, and one of more than two digits, is not completable (`:167-181`), so
 * `"-08-07-02"` is year -8 rather than 1992.
 *
 * `bc` is the era `parse_eu` and `parse_us` read out of the string itself
 * (`:194-195`), and sets the same `:_bc` `parse_bc` does.
 *
 * Ruby's `m` is a Ruby object that `f_to_s` makes a String (`:86-87`); the
 * ported callers pass the String directly.
 */
function s3e(
  hash: DateParts,
  y: string | null,
  m: string | null,
  d: string | null,
  bc: boolean,
): void {
  let c: boolean | null = null;

  if (y !== null && m !== null && d === null) {
    const oy = y;
    const om = m;
    const od = d;

    y = od;
    m = oy;
    d = om;
  }

  if (y === null) {
    if (d !== null && d.length > 2) {
      y = d;
      d = null;
    }
    if (d !== null && d.length > 0 && d[0] === "'") {
      y = d;
      d = null;
    }
  }

  if (y !== null) {
    let s = 0;
    let ep = y.length;
    const end = y.length;

    while (s < ep && !issign(y[s]) && !isdigit(y[s])) s++;
    if (s < ep) {
      const bp = s;
      if (issign(y[s])) s++;
      const l = digitSpan(y, s, ep);
      ep = s + l;
      if (ep < end) {
        const od = y.slice(bp, ep);

        y = d;
        d = od;
      }
    }
  }

  if (m !== null) {
    if (m[0] === "'" || m.length > 2) {
      const oy = y;
      const om = m;
      const od = d;

      y = om;
      m = od;
      d = oy;
    }
  }

  if (d !== null) {
    if (d[0] === "'" || d.length > 2) {
      const oy = y;
      const od = d;

      y = od;
      d = oy;
    }
  }

  if (y !== null) {
    let s = 0;
    let ep = y.length;
    let sign = false;

    while (s < ep && !issign(y[s]) && !isdigit(y[s])) s++;
    if (s < ep) {
      const bp = s;
      if (issign(y[s])) {
        s++;
        sign = true;
      }
      if (sign) c = false;
      const l = digitSpan(y, s, ep);
      ep = s + l;
      if (l > 2) c = false;
      hash.year = Number(y.slice(bp, ep));
    }
  }

  if (bc) hash._bc = true;

  if (m !== null) {
    let s = 0;
    let ep = m.length;

    while (s < ep && !isdigit(m[s])) s++;
    if (s < ep) {
      const bp = s;
      const l = digitSpan(m, s, ep);
      ep = s + l;
      hash.mon = Number(m.slice(bp, ep));
    }
  }

  if (d !== null) {
    let s = 0;
    let ep = d.length;

    while (s < ep && !isdigit(d[s])) s++;
    if (s < ep) {
      const bp = s;
      const l = digitSpan(d, s, ep);
      ep = s + l;
      hash.mday = Number(d.slice(bp, ep));
    }
  }

  if (c !== null) hash._comp = c;
}

/**
 * @internal `date_parse.c` `subx` (`date_parse.c:318-337`): every sub-parser
 * replaces the text it matched with a space, so a later one reads only what no
 * earlier one took. That leftover is what `parse_frag` is anchored to.
 *
 * Ruby edits the one String they all share (`f_aset2`); a JS string is
 * immutable, so the edited string is answered instead, as `parse_day` below
 * already does. Ruby's `subx` also runs the match and dispatches to the
 * sub-parser's `_cb`; most of the ported sub-parsers inlined their `_cb`, so
 * they hold their own match and this takes it — story
 * `i18n-date-subx-cb-decomposition` extracts those `_cb`s and gives `subx`
 * `date_parse.c:319`'s full parameter list.
 */
function subx(str: string, m: RegExpExecArray): string {
  return str.slice(0, m.index) + " " + str.slice(m.index + m[0].length);
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
  const rest = subx(str, m);
  parseTimeCb(m, hash);
  return rest;
}

/**
 * @internal `date_parse.c` `BEGIN_ERA` / `END_ERA` (`date_parse.c:736-737`): the
 * era spelling `parse_eu` and `parse_us` take is a word of its own, and `"b.c."`
 * ends in the dot that would otherwise end the word.
 */
const BEGIN_ERA = "\\b";
const END_ERA = "(?!(?<!\\.)[a-z])";

/**
 * @internal `date_parse.c` `parse_eu_cb` (`date_parse.c:836-868`): the day, the
 * month, the era and the year, in the order `parse_eu` matches them.
 */
function parseEuCb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  let mon: string | number = m[2];
  const b = m[3];
  const y = m[4];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, b !== undefined && (b[0] === "B" || b[0] === "b"));
  return 1;
}

/** @internal `date_parse.c` `parse_eu` (`date_parse.c:869-916`): `2nd July 2008`, `2 Jul 2008`, `3 Feb`. */
function parseEu(str: string, hash: DateParts): string | null {
  const m = new RegExp(
    `('?${NUMBER}+)[^-\\d\\s]*` +
      "\\s*" +
      `(${ABBR_MONTHS})[^-\\d\\s']*` +
      "(?:" +
      "\\s*" +
      "(?:" +
      BEGIN_ERA +
      "(c(?:e|\\.e\\.)|b(?:ce|\\.c\\.e\\.)|a(?:d|\\.d\\.)|b(?:c|\\.c\\.))" +
      END_ERA +
      ")?" +
      "\\s*" +
      "('?-?\\d+(?:(?:st|nd|rd|th)\\b)?)" +
      ")?",
    "i",
  ).exec(str);
  if (m === null) return null;
  parseEuCb(m, hash);
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_us_cb` (`date_parse.c:917-950`): the same four
 * tokens, with the month first.
 */
function parseUsCb(m: RegExpExecArray, hash: DateParts): number {
  let mon: string | number = m[1];
  const d = m[2];

  const b = m[3];
  const y = m[4];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, b !== undefined && (b[0] === "B" || b[0] === "b"));
  return 1;
}

/**
 * @internal `date_parse.c` `parse_us` (`date_parse.c:951-996`): `Jul 2 2008`,
 * `July 2nd, 2008`, `Feb 2008`.
 *
 * Ruby writes the two runs before the year possessively (`\s*+,?\s*+`); JS has
 * no possessive quantifier, and the greedy spelling matches the same language
 * here because neither the era nor the year can begin with a space or a comma.
 */
function parseUs(str: string, hash: DateParts): string | null {
  const m = new RegExp(
    `\\b(${ABBR_MONTHS})[^-\\d\\s']*` +
      "\\s*" +
      "('?\\d+)[^-\\d\\s']*" +
      "(?:" +
      "\\s*,?" +
      "\\s*" +
      "(c(?:e|\\.e\\.)|b(?:ce|\\.c\\.e\\.)|a(?:d|\\.d\\.)|b(?:c|\\.c\\.))?" +
      "\\s*" +
      "('?-?\\d+)" +
      ")?",
    "i",
  ).exec(str);
  if (m === null) return null;
  parseUsCb(m, hash);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_iso`: `2008-07-02`, and the unpadded `2008-7-2`. */
function parseIso(str: string, hash: DateParts): string | null {
  const m = /([-+]?\d+)-(\d+)-(-?\d+)/.exec(str);
  if (m === null) return null;
  s3e(hash, m[1], m[2], m[3], false);
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_iso21` (`date_parse.c:1035-1070`): the
 * commercial week date, `"2001-W05-6"` and the yearless `"-W061"`.
 */
function parseIso21(str: string, hash: DateParts): string | null {
  const m = /\b(\d{2}|\d{4})?-?w(\d{2})(?:-?(\d))?\b/i.exec(str);
  if (m === null) return null;
  const y = m[1];
  const w = m[2];
  const d = m[3];

  if (y !== undefined) hash.cwyear = Number(y);
  hash.cweek = Number(w);
  if (d !== undefined) hash.cwday = Number(d);

  return subx(str, m);
}

/** @internal `date_parse.c` `parse_iso22` (`date_parse.c:1073-1099`): `"-W-6"`, a commercial day alone. */
function parseIso22(str: string, hash: DateParts): string | null {
  const m = /-w-(\d)\b/i.exec(str);
  if (m === null) return null;
  hash.cwday = Number(m[1]);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_iso23` (`date_parse.c:1103-1134`): `"--02-03"`, and `"---03"`. */
function parseIso23(str: string, hash: DateParts): string | null {
  const m = /--(\d{2})?-(\d{2})\b/.exec(str);
  if (m === null) return null;
  const mon = m[1];
  const d = m[2];

  if (mon !== undefined) hash.mon = Number(mon);
  hash.mday = Number(d);

  return subx(str, m);
}

/** @internal `date_parse.c` `parse_iso24` (`date_parse.c:1138-1169`): the unseparated `"--0203"`. */
function parseIso24(str: string, hash: DateParts): string | null {
  const m = /--(\d{2})(\d{2})?\b/.exec(str);
  if (m === null) return null;
  const mon = m[1];
  const d = m[2];

  hash.mon = Number(mon);
  if (d !== undefined) hash.mday = Number(d);

  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_iso25` (`date_parse.c:1173-1219`): the ordinal
 * date `"2001-034"`. `pat0` declines the run that is a second fraction
 * (`"1.2001-034"`), which `parse_ddd` reads instead.
 */
function parseIso25(str: string, hash: DateParts): string | null {
  const pat0 = /[,.](\d{2}|\d{4})-\d{3}\b/;
  const pat = /\b(\d{2}|\d{4})-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  const m = pat.exec(str);
  if (m === null) return null;
  hash.year = Number(m[1]);
  hash.yday = Number(m[2]);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_iso26` (`date_parse.c:1223-1265`): the yearless ordinal date `"-034"`. */
function parseIso26(str: string, hash: DateParts): string | null {
  const pat0 = /\d-\d{3}\b/;
  const pat = /\b-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  const m = pat.exec(str);
  if (m === null) return null;
  hash.yday = Number(m[1]);
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_iso2` (`date_parse.c:1269-1287`): the ISO
 * spellings `parse_iso` does not take.
 */
function parseIso2(str: string, hash: DateParts): string | null {
  return (
    parseIso21(str, hash) ??
    parseIso22(str, hash) ??
    parseIso23(str, hash) ??
    parseIso24(str, hash) ??
    parseIso25(str, hash) ??
    parseIso26(str, hash)
  );
}

/**
 * @internal `date_parse.c` `JISX0301_ERA_INITIALS` (`date_parse.c:1290`): the
 * initials of the Japanese eras `parse_jis` takes.
 */
const JISX0301_ERA_INITIALS = "mtshr";

/** @internal `date_parse.c` `gengo` (`date_parse.c:1293-1307`): the year an era counts from. */
function gengo(c: string): number {
  let e: number;

  switch (c) {
    case "M":
    case "m":
      e = 1867;
      break;
    case "T":
    case "t":
      e = 1911;
      break;
    case "S":
    case "s":
      e = 1925;
      break;
    case "H":
    case "h":
      e = 1988;
      break;
    case "R":
    case "r":
      e = 2018;
      break;
    default:
      e = 0;
      break;
  }
  return e;
}

/**
 * @internal `date_parse.c` `parse_jis` (`date_parse.c:1309-1346`): the JIS X
 * 0301 date, `"H13.02.03"` — Heisei 13, which is 2001.
 */
function parseJis(str: string, hash: DateParts): string | null {
  const m = new RegExp(`\\b([${JISX0301_ERA_INITIALS}])(\\d+)\\.(\\d+)\\.(\\d+)`, "i").exec(str);
  if (m === null) return null;
  const e = m[1];
  const y = m[2];
  const mon = m[3];
  const d = m[4];

  const ep = gengo(e[0]);

  hash.year = Number(y) + ep;
  hash.mon = Number(mon);
  hash.mday = Number(d);

  return subx(str, m);
}

/** @internal `date_parse.c` `parse_vms11` (`date_parse.c:1349-1388`): `"3-FEB-2001"`. */
function parseVms11(str: string, hash: DateParts): string | null {
  const m = new RegExp(`('?-?${NUMBER}+)-(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)`, "i").exec(str);
  if (m === null) return null;
  const d = m[1];
  let mon = m[2];
  const y = m[3];

  mon = String(monNum(mon));

  s3e(hash, y, mon, d, false);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_vms12` (`date_parse.c:1391-1431`): `"FEB-3-2001"`, and `"FEB-3"`. */
function parseVms12(str: string, hash: DateParts): string | null {
  const m = new RegExp(`\\b(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)(?:-('?-?\\d+))?`, "i").exec(str);
  if (m === null) return null;
  let mon = m[1];
  const d = m[2];
  const y = m[3];

  mon = String(monNum(mon));

  s3e(hash, y ?? null, mon, d, false);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_vms` (`date_parse.c:1433-1444`): the VMS date, either way round. */
function parseVms(str: string, hash: DateParts): string | null {
  return parseVms11(str, hash) ?? parseVms12(str, hash);
}

/** @internal `date_parse.c` `parse_sla`: `2012/12/13`, `01/01/2012`, `2008/07`. */
function parseSla(str: string, hash: DateParts): string | null {
  const m = /([-+]?\d+)\/\s*(\d+)(?:\D\s*(-?\d+))?/.exec(str);
  if (m === null) return null;
  s3e(hash, m[1], m[2], m[3] ?? null, false);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_dot`: `2012.12.13`, `01.01.2012`. */
function parseDot(str: string, hash: DateParts): string | null {
  const m = /([-+]?\d+)\.\s*(\d+)\.\s*(-?\d+)/.exec(str);
  if (m === null) return null;
  s3e(hash, m[1], m[2], m[3], false);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_year` (`date_parse.c:1662-1688`): the year alone, `"'01"`. */
function parseYear(str: string, hash: DateParts): string | null {
  const m = /'(\d+)\b/.exec(str);
  if (m === null) return null;
  hash.year = Number(m[1]);
  return subx(str, m);
}

/** @internal `date_parse.c` `parse_mon` (`date_parse.c:1692-1718`): the month alone, `"Feb"`. */
function parseMon(str: string, hash: DateParts): string | null {
  const m = new RegExp(`\\b(${ABBR_MONTHS})\\S*`, "i").exec(str);
  if (m === null) return null;
  hash.mon = monNum(m[1]);
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_mday` (`date_parse.c:1722-1748`): the day of
 * the month alone, `"3rd"`. It sits directly above `parse_ddd`, so an ordinal
 * suffix is what tells the two apart.
 */
function parseMday(str: string, hash: DateParts): string | null {
  const m = new RegExp(`(${NUMBER}+)(st|nd|rd|th)\\b`, "i").exec(str);
  if (m === null) return null;
  hash.mday = Number(m[1]);
  return subx(str, m);
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
  let s5 = m[5];

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
    const cs5 = s5;
    let l5 = s5.length;

    hash.zone = s5;

    if (cs5[0] === "[") {
      const s1 = 1;
      let s2: number;
      let zone: string;

      l5 -= 2;
      s2 = cs5.slice(s1, s1 + l5).indexOf(":");
      if (s2 !== -1) {
        s2 = s1 + s2 + 1;
        zone = s5.slice(s2, s2 + (l5 - (s2 - s1)));
        s5 = s5.slice(s1, s1 + (s2 - s1));
      } else {
        zone = s5.slice(s1, s1 + l5);
        if (isdigit(cs5[s1])) s5 = "+" + zone;
        else s5 = zone;
      }
      hash.zone = zone;
      hash.offset = dateZoneToDiff(s5);
    }
  }

  return 1;
}

/**
 * @internal `date_parse.c` `parse_ddd` (`date_parse.c:1968-2002`): the digit run
 * itself, plus the time and zone that can follow it.
 */
function parseDdd(str: string, hash: DateParts): string | null {
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
  parseDddCb(m, hash);
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_bc` (`date_parse.c:2003-2019`): the era
 * suffix. It runs after whichever date sub-parser matched and only records
 * `:_bc`; the tail of `date__parse` is what negates the year. It is a `SUBS`
 * like every sub-parser above, and `parse_frag` runs on what it leaves — so
 * `"3rd 5 bc"` is the 3rd at 5 o'clock, the era gone from the string before
 * the anchored pattern reads the `5`.
 */
function parseBc(str: string, hash: DateParts): string | null {
  const m = /\b(bc\b|bce\b|b\.c\.|b\.c\.e\.)/i.exec(str);
  if (m === null) return null;
  hash._bc = true;
  return subx(str, m);
}

/**
 * @internal `date_parse.c` `parse_frag_cb` (`date_parse.c:2021-2043`): the one
 * or two digits left over once every sub-parser has taken its text. They are
 * the `:mday` when the string named an `:hour` but no `:mday`, and the `:hour`
 * when it named a `:mday` but no `:hour` — so `"11pm 5"` is the 5th at 23:00.
 */
function parseFragCb(m: RegExpExecArray, hash: DateParts): number {
  const s = m[1];

  if (hash.hour !== undefined && hash.mday === undefined) {
    const n = Number(s);
    if (n >= 1 && n <= 31) hash.mday = n;
  }
  if (hash.mday !== undefined && hash.hour === undefined) {
    const n = Number(s);
    if (n >= 0 && n <= 24) hash.hour = n;
  }

  return 1;
}

/**
 * @internal `date_parse.c` `parse_frag` (`date_parse.c:2044-2052`): its pattern
 * is anchored to the whole string, so it matches only once every earlier
 * sub-parser's `subx` has emptied the string of everything it took.
 *
 * It is the last thing `date__parse` runs on the string, so the leftover its
 * own `subx` answers is what no one reads — Ruby's caller drops it too.
 */
function parseFrag(str: string, hash: DateParts): string | null {
  const m = /^\s*(\d{1,2})\s*$/.exec(str);
  if (m === null) return null;
  parseFragCb(m, hash);
  return subx(str, m);
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
   * such as `"Feb 3rd"` comes back without a `:year`, and a string no
   * sub-parser matched at all comes back as the empty Hash `date__parse`
   * built up front (`date_parse.c:2166-2294`) rather than as a distinguished
   * value: `Date._parse("not a date")` is `{}`. `Date.parse` raises on it the
   * way `rt__valid_date_frags_p` (`date_core.c:4185-4220`) does, by finding no
   * buildable combination of fields.
   *
   * Ruby's sub-parsers all `set_hash` into the one Hash it built up front, so a
   * later one overwrites what `parse_time` put there, and each `subx`es the text
   * it matched out of the one String they share so the next one reads only the
   * leftover. The ported ones do both: they take that Hash, and answer the
   * edited string rather than editing it in place. `:_comp` starts out as `comp`
   * (`date_parse.c:2172`) and only ever turns false, so an absent one is `comp`,
   * and the year is completed only within `0..99` (`date_parse.c:2267-2287`).
   */
  static _parse(str: string, comp = true): DateParts {
    const hash: DateParts = {};
    str = parseDay(str);
    str = parseTime(str, hash);
    let rest: string | null = null;
    if (/[a-z]/i.test(str) && /\d/.test(str)) {
      // date_parse.c:2180 — HAVE_ELEM_P(HAVE_ALPHA | HAVE_DIGIT)
      rest = parseEu(str, hash) ?? parseUs(str, hash);
    }
    rest ??=
      parseIso(str, hash) ??
      parseJis(str, hash) ??
      parseVms(str, hash) ??
      parseSla(str, hash) ??
      parseDot(str, hash) ??
      parseIso2(str, hash) ??
      parseYear(str, hash) ??
      parseMon(str, hash) ??
      parseMday(str, hash) ??
      parseDdd(str, hash);
    if (rest !== null) str = rest;
    if (/[a-z]/i.test(str)) str = parseBc(str, hash) ?? str;
    if (/\d/.test(str)) parseFrag(str, hash);
    if (hash._bc) {
      if (hash.cwyear !== undefined) hash.cwyear = -hash.cwyear + 1;
      if (hash.year !== undefined) hash.year = -hash.year + 1;
    }
    delete hash._bc;
    if (comp && hash._comp !== false) {
      if (hash.cwyear !== undefined && hash.cwyear >= 0 && hash.cwyear <= 99) {
        hash.cwyear = compYear69(hash.cwyear);
      }
      if (hash.year !== undefined && hash.year >= 0 && hash.year <= 99) {
        hash.year = compYear69(hash.year);
      }
    }
    {
      const zone = hash.zone;
      if (zone !== undefined && hash.offset == null) hash.offset = dateZoneToDiff(zone);
    }
    delete hash._comp;
    return hash;
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
