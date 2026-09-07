import { FloatDomainError, FrozenError, NoMethodError } from "@blazetrails/ruby-compat";
import { Temporal } from "@js-temporal/polyfill";
import {
  ArgumentError,
  cmp,
  equals as cmpEquals,
  greaterThan,
  greaterThanOrEqual,
  isBetween,
  lessThan,
  lessThanOrEqual,
  Rational,
  rubyClass,
} from "@blazetrails/ruby-compat";
import { rbWarning } from "./rb-warning.js";

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

function objClassName(obj: object): string {
  const klass = obj.constructor as typeof Date;
  return Object.hasOwn(klass, "_railsClassName") ? klass._railsClassName : klass.name;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export interface StrftimeSubject {
  year: number | bigint;
  jd: number;
  nth: bigint;
  gregorianP: boolean;
  mon: number;
  day: number;
  wday: number;
  yday: number;
  hour: number;
  min: number;
  sec: number;
  nsec: Rational;
  zone: string;
  utcOffset: number;
}

/** @internal */
function temporalSubject(
  value: Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime | Temporal.Instant,
): StrftimeSubject {
  if (value instanceof Temporal.Instant) return temporalSubject(value.toZonedDateTimeISO("UTC"));

  const zoned = value instanceof Temporal.ZonedDateTime ? value : null;
  const plain =
    zoned !== null
      ? zoned.toPlainDateTime()
      : value instanceof Temporal.PlainDateTime
        ? value
        : value.toPlainDateTime();
  const of = zoned === null ? 0 : zoned.offsetNanoseconds / SECOND_IN_NANOSECONDS;

  return {
    year: plain.year,
    jd: cCivilToJd(plain.year, plain.month, plain.day),
    nth: 0n,
    gregorianP: true,
    mon: plain.month,
    day: plain.day,
    wday: cJdToWday(cCivilToJd(plain.year, plain.month, plain.day)),
    yday: cJdToOrdinal(cCivilToJd(plain.year, plain.month, plain.day))[1],
    hour: plain.hour,
    min: plain.minute,
    sec: plain.second,
    nsec: new Rational(
      BigInt(plain.millisecond) * 1000000n +
        BigInt(plain.microsecond) * 1000n +
        BigInt(plain.nanosecond),
      1n,
    ),
    zone: of2str(of),
    utcOffset: of,
  };
}

/** @internal */
function epochSeconds(subject: StrftimeSubject): number {
  return (
    (subject.jd - UNIX_EPOCH_IN_CJD) * DAY_IN_SECONDS +
    timeToDf(subject.hour, subject.min, subject.sec) -
    subject.utcOffset
  );
}

/** @internal */
function msecs(subject: StrftimeSubject): number {
  return Number(
    (subject.nsec.numerator * 1000n) / (subject.nsec.denominator * BigInt(SECOND_IN_NANOSECONDS)),
  );
}

/** @internal */
function cwyear(subject: StrftimeSubject): number | bigint {
  const [ry] = cJdToCommercial(subject.jd);
  if (subject.nth === 0n) return ry;
  return encodeYear(subject.nth, ry, subject.gregorianP ? -1 : +1);
}

/** @internal */
function cweek(subject: StrftimeSubject): number {
  const [, rw] = cJdToCommercial(subject.jd);
  return rw;
}

/** @internal */
function wnumx(subject: StrftimeSubject, f: number): number {
  const [, rw] = cJdToWeeknum(subject.jd, f);
  return rw;
}

/** @internal */
function formatOffset(
  utcOffset: number,
  colons: number,
  precision: number,
  left: boolean,
  padding: string,
): string {
  let off = utcOffset;
  const aoff = Math.abs(off);

  const hl = Math.floor(aoff / 3600) < 10 ? 1 : 2;
  let hw = 2;
  if (left && hl === 1) hw = 1;

  switch (colons) {
    case 0:
      precision = precision <= 3 + hw ? hw : precision - 3;
      break;
    case 1:
      precision = precision <= 4 + hw ? hw : precision - 4;
      break;
    case 2:
      precision = precision <= 7 + hw ? hw : precision - 7;
      break;
    default:
      if (aoff % 3600 === 0) precision = precision <= 1 + hw ? hw : precision - 1;
      else if (aoff % 60 === 0) precision = precision <= 4 + hw ? hw : precision - 4;
      else precision = precision <= 7 + hw ? hw : precision - 7;
      break;
  }

  let out = "";
  if (padding === " " && precision > hl) {
    out += " ".repeat(precision - hl);
    precision = hl;
  }
  if (off < 0) {
    off = -off;
    out += "-";
  } else {
    out += "+";
  }
  out += String(Math.floor(off / 3600)).padStart(precision, "0");
  off = off % 3600;
  if (colons === 3 && off === 0) return out;
  if (1 <= colons) out += ":";
  out += pad2(Math.floor(off / 60));
  off = off % 60;
  if (colons === 3 && off === 0) return out;
  if (2 <= colons) out += `:${pad2(off)}`;
  return out;
}

/** @internal */
function fmt(
  padding: string,
  left: boolean,
  precision: number,
  defPad: string,
  defPrec: number,
  val: number | bigint,
): string {
  if (precision <= 0) precision = defPrec;
  if (left) precision = 1;
  const sign = val < 0 ? "-" : "";
  const digits = String(typeof val === "bigint" ? (val < 0n ? -val : val) : Math.abs(val));
  return padding === "0" || (padding === "" && defPad === "0")
    ? sign + digits.padStart(Math.max(precision - sign.length, 0), "0")
    : (sign + digits).padStart(precision, " ");
}

/** @internal */
function flagFound(precision: number, localeE: boolean, localeO: boolean): boolean {
  return precision > 0 || localeE || localeO;
}

/** @internal */
function fillPadding(padding: string, left: boolean, precision: number, i: number): string {
  if (!left && precision > i) return (padding === "" ? " " : padding).repeat(precision - i);
  return "";
}

/** @internal */
function subsecDigits(nsec: Rational, precision: number): string {
  const den = nsec.denominator * BigInt(SECOND_IN_NANOSECONDS);
  let n = nsec.numerator % den;
  let digits = "";
  for (let i = 0; i < precision; i++) {
    n *= 10n;
    digits += n / den;
    n %= den;
  }
  return digits;
}

/** @internal */
const INT_MAX = 2147483647;

/** @noRailsEquivalent PERMANENT */
export class ERANGE extends Error {
  constructor(format: string) {
    super(format);
    this.name = "Errno::ERANGE";
  }
}

/** @noRailsEquivalent PERMANENT */
export const Errno = { ERANGE };

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
function dateStrftime(
  subject: StrftimeSubject,
  format: string,
  maxsize: number,
): string | undefined {
  const hour12 = subject.hour % 12 === 0 ? 12 : subject.hour % 12;
  let out = "";
  let f = 0;

  while (f < format.length) {
    if (format[f] !== "%") {
      out += format[f];
      f++;
      continue;
    }

    const sp = f;
    let precision = -1;
    let left = false;
    let padding = "";
    let colons = 0;
    let upper = false;
    let lower = false;
    let chcase = false;
    let localeE = false;
    let localeO = false;
    let g = f + 1;
    let spec: string | undefined;

    for (;;) {
      const c = format[g];
      if (c === "^") {
        if (flagFound(precision, localeE, localeO)) {
          spec = c;
          break;
        }
        upper = true;
        g++;
        continue;
      }
      if (c === "#") {
        if (flagFound(precision, localeE, localeO)) {
          spec = c;
          break;
        }
        chcase = true;
        g++;
        continue;
      }
      if (c === "_") {
        if (flagFound(precision, localeE, localeO)) {
          spec = c;
          break;
        }
        padding = " ";
        g++;
        continue;
      }
      if (c === "-") {
        if (flagFound(precision, localeE, localeO)) {
          spec = c;
          break;
        }
        left = true;
        g++;
        continue;
      }
      if (c !== undefined && isdigit(c)) {
        if (c === "0") padding = "0";
        const [prec, e] = strtoul(format, g);
        if (prec > INT_MAX || prec > maxsize) return undefined;
        precision = prec;
        g = e;
        continue;
      }
      if (c === "E") {
        localeE = true;
        if (format[g + 1] !== undefined && "cCxXyY".includes(format[g + 1])) {
          g++;
          continue;
        }
        spec = c;
        break;
      }
      if (c === "O") {
        localeO = true;
        if (format[g + 1] !== undefined && "deHkIlmMSuUVwWy".includes(format[g + 1])) {
          g++;
          continue;
        }
        spec = c;
        break;
      }
      if (c === ":") {
        let l = 0;
        while (format[g + l] === ":") l++;
        if (format[g + l] === "z") {
          colons = l;
          g += l;
          continue;
        }
      }
      spec = c;
      break;
    }

    const num = (defPad: string, defPrec: number, val: number | bigint): string =>
      fmt(padding, left, precision, defPad, defPrec, val);
    const text = (value: string): string =>
      fillPadding(padding, left, precision, value.length) +
      (upper ? value.toUpperCase() : lower ? value.toLowerCase() : value);
    const recur = (fmt: string): string => {
      const i = strftime(subject, fmt);
      const cased = upper ? i.toUpperCase() : i;
      return fillPadding(padding, left, precision, i.length) + cased;
    };

    let formatted: string | undefined;
    switch (spec) {
      case "Y":
        formatted =
          typeof subject.year === "bigint"
            ? num("0", 4, subject.year)
            : num("0", 0 <= subject.year ? 4 : 5, subject.year);
        break;
      case "C":
        formatted = num("0", 2, div(subject.year, 100));
        break;
      case "g":
      case "y":
        formatted = num("0", 2, mod(spec === "g" ? cwyear(subject) : subject.year, 100));
        break;
      case "m":
        formatted = num("0", 2, subject.mon);
        break;
      case "d":
      case "e":
        formatted = num(spec === "d" ? "0" : " ", 2, subject.day);
        break;
      case "j":
        formatted = num("0", 3, subject.yday);
        break;
      case "F":
        formatted = recur("%Y-%m-%d");
        break;
      case "x":
      case "D":
        formatted = recur("%m/%d/%y");
        break;
      case "c":
        formatted = recur("%a %b %e %H:%M:%S %Y");
        break;
      case "T":
      case "X":
        formatted = recur("%H:%M:%S");
        break;
      case "R":
        formatted = recur("%H:%M");
        break;
      case "r":
        formatted = recur("%I:%M:%S %p");
        break;
      case "v":
        formatted = recur("%e-%^b-%Y");
        break;
      case "+":
        formatted = recur("%a %b %e %H:%M:%S %Z %Y");
        break;
      case "G":
        formatted = num("0", 0 <= cwyear(subject) ? 4 : 5, cwyear(subject));
        break;
      case "V":
        formatted = num("0", 2, cweek(subject));
        break;
      case "U":
      case "W":
        formatted = num("0", 2, wnumx(subject, spec === "U" ? 0 : 1));
        break;
      case "Q":
        formatted = num("0", 1, epochSeconds(subject) * 1000 + msecs(subject));
        break;
      case "A":
        if (chcase) upper = true;
        formatted = text(DAY_NAMES[subject.wday]);
        break;
      case "a":
        if (chcase) upper = true;
        formatted = text(ABBR_DAY_NAMES[subject.wday]);
        break;
      case "B":
        if (chcase) upper = true;
        formatted = text(MONTH_NAMES[subject.mon - 1]);
        break;
      case "b":
      case "h":
        if (chcase) upper = true;
        formatted = text(ABBR_MONTH_NAMES[subject.mon - 1]);
        break;
      case "u":
        formatted = num("0", 1, subject.wday === 0 ? 7 : subject.wday);
        break;
      case "w":
        formatted = num("0", 1, subject.wday);
        break;
      case "H":
      case "k":
        formatted = num(spec === "H" ? "0" : " ", 2, subject.hour);
        break;
      case "I":
      case "l":
        formatted = num(spec === "I" ? "0" : " ", 2, hour12);
        break;
      case "M":
        formatted = num("0", 2, subject.min);
        break;
      case "S":
        formatted = num("0", 2, subject.sec);
        break;
      case "L":
      case "N": {
        const w = spec === "L" ? 3 : 9;
        if (precision <= 0) precision = w;
        formatted = subsecDigits(subject.nsec, precision);
        break;
      }
      case "s":
        formatted = num("0", 1, epochSeconds(subject));
        break;
      case "P":
      case "p":
        if ((spec === "p" && chcase) || (spec === "P" && !chcase && !upper)) {
          upper = false;
          lower = true;
        }
        formatted = text(subject.hour < 12 ? "AM" : "PM");
        break;
      case "z":
        if (colons > 3) break;
        formatted = formatOffset(subject.utcOffset, colons, precision, left, padding);
        break;
      case "Z":
        if (chcase) {
          upper = false;
          lower = true;
        }
        formatted = text(subject.zone);
        break;
      case "n":
        formatted = text("\n");
        break;
      case "t":
        formatted = text("\t");
        break;
      case "%":
        formatted = text("%");
        break;
    }

    if (formatted === undefined) {
      out += spec === undefined ? format.slice(sp) : format.slice(sp, g + 1);
      f = spec === undefined ? format.length : g + 1;
      continue;
    }
    if (out.length + formatted.length > maxsize) return undefined;
    out += formatted;
    f = g + 1;
  }

  return out;
}

const SMALLBUF = 100;

export function strftime(
  value:
    | StrftimeSubject
    | Temporal.PlainDate
    | Temporal.PlainDateTime
    | Temporal.ZonedDateTime
    | Temporal.Instant,
  format: string,
): string {
  const subject: StrftimeSubject =
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.Instant
      ? temporalSubject(value)
      : value;
  const flen = format.length;
  if (flen === 0) return "";
  const first = dateStrftime(subject, format, SMALLBUF);
  if (first !== undefined) return first;
  for (let size = 1024; ; size *= 2) {
    const len = dateStrftime(subject, format, size);
    if (len !== undefined) return len;
    if (size >= 1024 * flen) throw new ERANGE(format);
  }
}

export { ArgumentError };

/** @internal */
function rbFloat(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const f = Number(val.replace(/_/g, ""));
    if (val.trim() === "" || Number.isNaN(f)) {
      throw new ArgumentError(`invalid value for Float(): ${JSON.stringify(val)}`);
    }
    return f;
  }
  if (val == null) throw new TypeError("can't convert nil into Float");
  const toF = (val as { toF?: () => number }).toF;
  if (typeof toF === "function") return toF.call(val);
  throw new TypeError(`can't convert ${(val as object).constructor.name} into Float`);
}

/** @internal */
function numCoerce(x: unknown, y: unknown): [number, number] {
  if (y != null && Object.getPrototypeOf(x) === Object.getPrototypeOf(y))
    return [y as number, x as number];
  return [rbFloat(y), rbFloat(x)];
}

/** @internal */
const ABBR_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DAYS = "sunday|monday|tuesday|wednesday|thursday|friday|saturday";
const ABBR_DAYS = "sun|mon|tue|wed|thu|fri|sat";

/** @internal */
export interface DateParts {
  jd?: number | bigint;
  year?: number | bigint;
  mon?: number;
  mday?: number;
  yday?: number;
  cwyear?: number | bigint;
  cweek?: number;
  cwday?: number;
  wday?: number;
  wnum0?: number;
  wnum1?: number;
  hour?: number;
  min?: number;
  sec?: number;
  secFraction?: number | bigint | Rational;
  seconds?: number | bigint | Rational;
  zone?: string;
  offset?: number | Rational | null;
  leftover?: string;
  _comp?: boolean;
  _bc?: boolean;
  _fail?: boolean;
  _cent?: number;
  _merid?: number;
}

/** @internal */
type DateFrag =
  | "jd"
  | "year"
  | "mon"
  | "mday"
  | "yday"
  | "cwyear"
  | "cweek"
  | "cwday"
  | "wday"
  | "wnum0"
  | "wnum1"
  | "hour"
  | "min"
  | "sec";

/** @internal */
function cstr2num(s: string): number | bigint {
  const m = /^[+-]?\d*/.exec(s)!;
  if (!/\d/.test(m[0])) return 0;
  return bigNorm(BigInt(m[0]));
}

/** @internal */
function fNegate(x: number | bigint): number | bigint {
  return typeof x === "bigint" ? bigNorm(-x) : -x;
}

/** @internal */
function compYear69(y: number): number {
  return y >= 69 ? y + 1900 : y + 2000;
}

/** @internal */
function monNum(str: string): number {
  return ABBR_MONTH_NAMES.findIndex((m) => m.toLowerCase() === str.slice(0, 3).toLowerCase()) + 1;
}

/** @internal */
function dayNum(str: string): number {
  return ABBR_DAY_NAMES.findIndex((d) => d.toLowerCase() === str.slice(0, 3).toLowerCase());
}

/** @internal */
function issign(c: string | undefined): boolean {
  return c === "-" || c === "+";
}

/** @internal */
function isdigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

/** @internal */
function digitSpan(str: string, s: number, e: number): number {
  let i = 0;
  while (s + i < e && isdigit(str[s + i])) i++;
  return i;
}

/** @internal */
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

/** @internal */
const MAX_WORD_LENGTH = 17;

const ZONETAB = new Map(
  ZONETAB_LIST.split(";").map((e) => {
    const i = e.indexOf(",");
    return [e.slice(0, i), Number(e.slice(i + 1))] as const;
  }),
);

/** @internal */
function zonetab(str: string, len: number): number | undefined {
  return ZONETAB.get(str.slice(0, len).toLowerCase());
}

/** @internal */
function isspace(c: string | undefined): boolean {
  return c === " " || (c !== undefined && c >= "\t" && c <= "\r");
}

/** @internal */
function strtoul(s: string, i: number): [number, number] {
  let v = 0;

  while (isspace(s[i])) i++;
  while (isdigit(s[i])) {
    v = v * 10 + Number(s[i]);
    i++;
  }
  return [v, i];
}

/** @internal */
function rubyScanDigits(s: string, start: number, len: number): [number, number] {
  let v = 0;
  let n = 0;

  while (n < len && isdigit(s[start + n])) {
    v = v * 10 + Number(s[start + n]);
    n++;
  }
  return [v, n];
}

/** @internal */
function strEndWithWord(s: string, l: number, w: string): number {
  let n = w.length;

  if (l <= n || !isspace(s[l - n - 1])) return 0;
  if (s.slice(l - n, l).toLowerCase() !== w) return 0;
  do ++n;
  while (l > n && isspace(s[l - n - 1]));
  return n;
}

/** @internal */
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

/** @internal */
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

/** @internal */
function wholenumP(x: number | bigint | Rational): boolean {
  if (typeof x === "number") return Number.isInteger(x);
  if (typeof x === "bigint") return true;
  return x.denominator === 1n;
}

/** @internal */
function dateZoneToDiff(str: string): number | Rational | null {
  let offset: number | Rational | null = null;
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
            const rat = new Rational(sec, denom).add(hour * 3600);
            offset = rat.denominator === 1n ? Number(rat.numerator) : rat;
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

/** @internal */
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
      hash.year = cstr2num(y.slice(bp, ep));
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

/** @internal */
function subx(
  str: string,
  rep: string,
  pat: RegExp,
  hash: DateParts,
  cb: (m: RegExpExecArray, hash: DateParts) => number,
): string | null {
  const m = pat.exec(str);

  if (m === null) return null;

  const be = m.index;
  const en = m.index + m[0].length;
  const rest = str.slice(0, be) + rep + str.slice(en);
  cb(m, hash);

  return rest;
}

/** @internal */
function parseDayCb(m: RegExpExecArray, hash: DateParts): number {
  hash.wday = dayNum(m[1]);
  return 1;
}

/** @internal */
function parseDay(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_DAYS})[^-/\\d\\s]*`, "i");
  return subx(str, " ", pat, hash, parseDayCb);
}

/** @internal */
const NUMBER = "(?<!\\d)\\d";

/** @internal */
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
  if (f !== undefined) hash.secFraction = new Rational(BigInt(f), 10n ** BigInt(f.length));

  return 1;
}

/** @internal */
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

/** @internal */
function parseTime(str: string, hash: DateParts): string | null {
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
    "[\\p{Alpha}.\\s]+(?:standard|daylight)\\stime(?![\\p{L}\\p{N}_])" +
    "|" +
    "[\\p{Alpha}]+(?:\\sdst)?(?![\\p{L}\\p{N}_])" +
    ")" +
    ")?";
  return subx(str, " ", new RegExp(patSource, "iu"), hash, parseTimeCb);
}

/** @internal */
const BEGIN_ERA = "\\b";
const END_ERA = "(?!(?<!\\.)[a-z])";

/** @internal */
function parseEuCb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  let mon: string | number = m[2];
  const b = m[3];
  const y = m[4];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, b !== undefined && (b[0] === "B" || b[0] === "b"));
  return 1;
}

/** @internal */
function parseEu(str: string, hash: DateParts): string | null {
  const pat = new RegExp(
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
  );
  return subx(str, " ", pat, hash, parseEuCb);
}

/** @internal */
function parseUsCb(m: RegExpExecArray, hash: DateParts): number {
  let mon: string | number = m[1];
  const d = m[2];

  const b = m[3];
  const y = m[4];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, b !== undefined && (b[0] === "B" || b[0] === "b"));
  return 1;
}

/** @internal */
function parseUs(str: string, hash: DateParts): string | null {
  const pat = new RegExp(
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
  );
  return subx(str, " ", pat, hash, parseUsCb);
}

/** @internal */
function parseIsoCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d, false);
  return 1;
}

/** @internal */
function parseIso(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?[-+]?${NUMBER}+)-(\\d+)-('?-?\\d+)`);
  return subx(str, " ", pat, hash, parseIsoCb);
}

/** @internal */
function parseIso21Cb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const w = m[2];
  const d = m[3];

  if (y !== undefined) hash.cwyear = cstr2num(y);
  hash.cweek = Number(w);
  if (d !== undefined) hash.cwday = Number(d);

  return 1;
}

/** @internal */
function parseIso21(str: string, hash: DateParts): string | null {
  const pat = /\b(\d{2}|\d{4})?-?w(\d{2})(?:-?(\d))?\b/i;
  return subx(str, " ", pat, hash, parseIso21Cb);
}

/** @internal */
function parseIso22Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.cwday = Number(d);
  return 1;
}

/** @internal */
function parseIso22(str: string, hash: DateParts): string | null {
  const pat = /-w-(\d)\b/i;
  return subx(str, " ", pat, hash, parseIso22Cb);
}

/** @internal */
function parseIso23Cb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  const d = m[2];

  if (mon !== undefined) hash.mon = Number(mon);
  hash.mday = Number(d);

  return 1;
}

/** @internal */
function parseIso23(str: string, hash: DateParts): string | null {
  const pat = /--(\d{2})?-(\d{2})\b/;
  return subx(str, " ", pat, hash, parseIso23Cb);
}

/** @internal */
function parseIso24Cb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  const d = m[2];

  hash.mon = Number(mon);
  if (d !== undefined) hash.mday = Number(d);

  return 1;
}

/** @internal */
function parseIso24(str: string, hash: DateParts): string | null {
  const pat = /--(\d{2})(\d{2})?\b/;
  return subx(str, " ", pat, hash, parseIso24Cb);
}

/** @internal */
function parseIso25Cb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const d = m[2];

  hash.year = cstr2num(y);
  hash.yday = Number(d);

  return 1;
}

/** @internal */
function parseIso25(str: string, hash: DateParts): string | null {
  const pat0 = /[,.](\d{2}|\d{4})-\d{3}\b/;
  const pat = /\b(\d{2}|\d{4})-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  return subx(str, " ", pat, hash, parseIso25Cb);
}

/** @internal */
function parseIso26Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.yday = Number(d);

  return 1;
}

/** @internal */
function parseIso26(str: string, hash: DateParts): string | null {
  const pat0 = /\d-\d{3}\b/;
  const pat = /\b-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  return subx(str, " ", pat, hash, parseIso26Cb);
}

/** @internal */
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

/** @internal */
const JISX0301_ERA_INITIALS = "mtshr";

/** @internal */
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

/** @internal */
function parseJisCb(m: RegExpExecArray, hash: DateParts): number {
  const e = m[1];
  const y = m[2];
  const mon = m[3];
  const d = m[4];

  const ep = gengo(e[0]);

  hash.year = fAdd(cstr2num(y), ep);
  hash.mon = Number(mon);
  hash.mday = Number(d);

  return 1;
}

/** @internal */
function parseJis(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b([${JISX0301_ERA_INITIALS}])(\\d+)\\.(\\d+)\\.(\\d+)`, "i");
  return subx(str, " ", pat, hash, parseJisCb);
}

/** @internal */
function parseVms11Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  let mon: string | number = m[2];
  const y = m[3];

  mon = monNum(mon);

  s3e(hash, y, String(mon), d, false);
  return 1;
}

/** @internal */
function parseVms11(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)-(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)`, "i");
  return subx(str, " ", pat, hash, parseVms11Cb);
}

/** @internal */
function parseVms12Cb(m: RegExpExecArray, hash: DateParts): number {
  let mon: string | number = m[1];
  const d = m[2];
  const y = m[3];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, false);
  return 1;
}

/** @internal */
function parseVms12(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)(?:-('?-?\\d+))?`, "i");
  return subx(str, " ", pat, hash, parseVms12Cb);
}

/** @internal */
function parseVms(str: string, hash: DateParts): string | null {
  return parseVms11(str, hash) ?? parseVms12(str, hash);
}

/** @internal */
function parseSlaCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d ?? null, false);
  return 1;
}

/** @internal */
function parseSla(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)/\\s*('?\\d+)(?:\\D\\s*('?-?\\d+))?`);
  return subx(str, " ", pat, hash, parseSlaCb);
}

/** @internal */
function parseDotCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d, false);
  return 1;
}

/** @internal */
function parseDot(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)\\.\\s*('?\\d+)\\.\\s*('?-?\\d+)`);
  return subx(str, " ", pat, hash, parseDotCb);
}

/** @internal */
function parseYearCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  hash.year = cstr2num(y);
  return 1;
}

/** @internal */
function parseYear(str: string, hash: DateParts): string | null {
  const pat = /'(\d+)\b/;
  return subx(str, " ", pat, hash, parseYearCb);
}

/** @internal */
function parseMonCb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  hash.mon = monNum(mon);
  return 1;
}

/** @internal */
function parseMon(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_MONTHS})\\S*`, "i");
  return subx(str, " ", pat, hash, parseMonCb);
}

/** @internal */
function parseMdayCb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.mday = Number(d);
  return 1;
}

/** @internal */
function parseMday(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`(${NUMBER}+)(st|nd|rd|th)\\b`, "i");
  return subx(str, " ", pat, hash, parseMdayCb);
}

/** @internal */
function n2i(s: string, f: number, w: number): number {
  return Number(s.slice(f, f + w));
}

/** @internal */
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

    hash.secFraction = new Rational(BigInt(s4), 10n ** BigInt(l4));
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

/** @internal */
function parseDdd(str: string, hash: DateParts): string | null {
  const pat = new RegExp(
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
  );
  return subx(str, " ", pat, hash, parseDddCb);
}

/** @internal */
function parseBcCb(m: RegExpExecArray, hash: DateParts): number {
  hash._bc = true;
  return 1;
}

/** @internal */
function parseBc(str: string, hash: DateParts): string | null {
  const pat = /\b(bc\b|bce\b|b\.c\.|b\.c\.e\.)/i;
  return subx(str, " ", pat, hash, parseBcCb);
}

/** @internal */
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

/** @internal */
function parseFrag(str: string, hash: DateParts): string | null {
  const pat = /^\s*(\d{1,2})\s*$/;
  return subx(str, " ", pat, hash, parseFragCb);
}

/** @internal */
function compYear50(y: number): number {
  return y >= 50 ? y + 1900 : y + 2000;
}

/** @internal */
function match(
  str: string,
  pat: RegExp,
  hash: DateParts,
  cb: (m: RegExpExecArray, hash: DateParts) => number,
): number {
  const m = pat.exec(str);

  if (m === null) return 0;

  cb(m, hash);

  return 1;
}

/** @internal */
function secFraction(f: string): Rational {
  return new Rational(cstr2num(f), 10n ** BigInt(f.length));
}

/** @internal */
function iso8601ExtDatetimeCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;
  let y: number | bigint;

  if (s[1] !== undefined) {
    if (s[3] !== undefined) hash.mday = Number(s[3]);
    if (s[1] !== "-") {
      y = cstr2num(s[1]);
      if (s[1].length < 4) y = compYear69(Number(y));
      hash.year = y;
    }
    if (s[2] === undefined) {
      if (s[1] !== "-") return 0;
    } else {
      hash.mon = Number(s[2]);
    }
  } else if (s[5] !== undefined) {
    hash.yday = Number(s[5]);
    if (s[4] !== undefined) {
      y = cstr2num(s[4]);
      if (s[4].length < 4) y = compYear69(Number(y));
      hash.year = y;
    }
  } else if (s[8] !== undefined) {
    hash.cweek = Number(s[7]);
    hash.cwday = Number(s[8]);
    if (s[6] !== undefined) {
      y = cstr2num(s[6]);
      if (s[6].length < 4) y = compYear69(Number(y));
      hash.cwyear = y;
    }
  } else if (s[9] !== undefined) {
    hash.cwday = Number(s[9]);
  }
  if (s[10] !== undefined) {
    hash.hour = Number(s[10]);
    hash.min = Number(s[11]);
    if (s[12] !== undefined) hash.sec = Number(s[12]);
  }
  if (s[13] !== undefined) {
    hash.secFraction = secFraction(s[13]);
  }
  if (s[14] !== undefined) {
    hash.zone = s[14];
    hash.offset = dateZoneToDiff(s[14]);
  }

  return 1;
}

/** @internal */
function iso8601ExtDatetime(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(?:([-+]?\\d{2,}|-)-(\\d{2})?(?:-(\\d{2}))?|` +
    `([-+]?\\d{2,})?-(\\d{3})|` +
    `(\\d{4}|\\d{2})?-w(\\d{2})-(\\d)|` +
    `-w-(\\d))` +
    `(?:t` +
    `(\\d{2}):(\\d{2})(?::(\\d{2})(?:[,.](\\d+))?)?` +
    `(z|[-+]\\d{2}(?::?\\d{2})?)?)?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, iso8601ExtDatetimeCb);
}

/** @internal */
function iso8601BasDatetimeCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;
  let y: number | bigint;

  if (s[3] !== undefined) {
    hash.mday = Number(s[3]);
    if (s[1] !== "--") {
      y = cstr2num(s[1] as string);
      if ((s[1] as string).length < 4) y = compYear69(Number(y));
      hash.year = y;
    }
    if ((s[2] as string)[0] === "-") {
      if (s[1] !== "--") return 0;
    } else {
      hash.mon = Number(s[2]);
    }
  } else if (s[5] !== undefined) {
    hash.yday = Number(s[5]);
    y = cstr2num(s[4] as string);
    if ((s[4] as string).length < 4) y = compYear69(Number(y));
    hash.year = y;
  } else if (s[6] !== undefined) {
    hash.yday = Number(s[6]);
  } else if (s[9] !== undefined) {
    hash.cweek = Number(s[8]);
    hash.cwday = Number(s[9]);
    y = cstr2num(s[7] as string);
    if ((s[7] as string).length < 4) y = compYear69(Number(y));
    hash.cwyear = y;
  } else if (s[11] !== undefined) {
    hash.cweek = Number(s[10]);
    hash.cwday = Number(s[11]);
  } else if (s[12] !== undefined) {
    hash.cwday = Number(s[12]);
  }
  if (s[13] !== undefined) {
    hash.hour = Number(s[13]);
    hash.min = Number(s[14]);
    if (s[15] !== undefined) hash.sec = Number(s[15]);
  }
  if (s[16] !== undefined) {
    hash.secFraction = secFraction(s[16]);
  }
  if (s[17] !== undefined) {
    hash.zone = s[17];
    hash.offset = dateZoneToDiff(s[17]);
  }

  return 1;
}

/** @internal */
function iso8601BasDatetime(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(?:([-+]?(?:\\d{4}|\\d{2})|--)(\\d{2}|-)(\\d{2})|` +
    `([-+]?(?:\\d{4}|\\d{2}))(\\d{3})|` +
    `-(\\d{3})|` +
    `(\\d{4}|\\d{2})w(\\d{2})(\\d)|` +
    `-w(\\d{2})(\\d)|` +
    `-w-(\\d))` +
    `(?:t?` +
    `(\\d{2})(\\d{2})(?:(\\d{2})(?:[,.](\\d+))?)?` +
    `(z|[-+]\\d{2}(?:\\d{2})?)?)?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, iso8601BasDatetimeCb);
}

/** @internal */
function iso8601ExtTimeCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  hash.hour = Number(s[1]);
  hash.min = Number(s[2]);
  if (s[3] !== undefined) hash.sec = Number(s[3]);
  if (s[4] !== undefined) hash.secFraction = secFraction(s[4]);
  if (s[5] !== undefined) {
    hash.zone = s[5];
    hash.offset = dateZoneToDiff(s[5]);
  }

  return 1;
}

/** @internal */
const iso8601BasTimeCb = iso8601ExtTimeCb;

/** @internal */
function iso8601ExtTime(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(\\d{2}):(\\d{2})(?::(\\d{2})(?:[,.](\\d+))?` + `(z|[-+]\\d{2}(:?\\d{2})?)?)?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, iso8601ExtTimeCb);
}

/** @internal */
function iso8601BasTime(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(\\d{2})(\\d{2})(?:(\\d{2})(?:[,.](\\d+))?` + `(z|[-+]\\d{2}(\\d{2})?)?)?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, iso8601BasTimeCb);
}

/** @internal */
function dateIso8601(str: string): DateParts {
  const hash: DateParts = {};

  if (iso8601ExtDatetime(str, hash)) return hash;
  if (iso8601BasDatetime(str, hash)) return hash;
  if (iso8601ExtTime(str, hash)) return hash;
  iso8601BasTime(str, hash);

  return hash;
}

/** @internal */
function rfc3339Cb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  hash.year = cstr2num(s[1] as string);
  hash.mon = Number(s[2]);
  hash.mday = Number(s[3]);
  hash.hour = Number(s[4]);
  hash.min = Number(s[5]);
  hash.sec = Number(s[6]);
  hash.zone = s[8];
  hash.offset = dateZoneToDiff(s[8] as string);
  if (s[7] !== undefined) hash.secFraction = secFraction(s[7]);

  return 1;
}

/** @internal */
function rfc3339(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(-?\\d{4})-(\\d{2})-(\\d{2})` +
    `(?:t|\\s)` +
    `(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d+))?` +
    `(z|[-+]\\d{2}:\\d{2})\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, rfc3339Cb);
}

/** @internal */
function dateRfc3339(str: string): DateParts {
  const hash: DateParts = {};
  rfc3339(str, hash);
  return hash;
}

/** @internal */
function xmlschemaDatetimeCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  hash.year = cstr2num(s[1] as string);
  if (s[2] !== undefined) hash.mon = Number(s[2]);
  if (s[3] !== undefined) hash.mday = Number(s[3]);
  if (s[4] !== undefined) hash.hour = Number(s[4]);
  if (s[5] !== undefined) hash.min = Number(s[5]);
  if (s[6] !== undefined) hash.sec = Number(s[6]);
  if (s[7] !== undefined) hash.secFraction = secFraction(s[7]);
  if (s[8] !== undefined) {
    hash.zone = s[8];
    hash.offset = dateZoneToDiff(s[8]);
  }

  return 1;
}

/** @internal */
function xmlschemaDatetime(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(-?\\d{4,})(?:-(\\d{2})(?:-(\\d{2}))?)?` +
    `(?:t` +
    `(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d+))?)?` +
    `(z|[-+]\\d{2}:\\d{2})?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, xmlschemaDatetimeCb);
}

/** @internal */
function xmlschemaTimeCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  hash.hour = Number(s[1]);
  hash.min = Number(s[2]);
  if (s[3] !== undefined) hash.sec = Number(s[3]);
  if (s[4] !== undefined) hash.secFraction = secFraction(s[4]);
  if (s[5] !== undefined) {
    hash.zone = s[5];
    hash.offset = dateZoneToDiff(s[5]);
  }

  return 1;
}

/** @internal */
function xmlschemaTime(str: string, hash: DateParts): number {
  const patSource = `^\\s*(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d+))?` + `(z|[-+]\\d{2}:\\d{2})?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, xmlschemaTimeCb);
}

/** @internal */
function xmlschemaTruncCb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  if (s[1] !== undefined) hash.mon = Number(s[1]);
  if (s[2] !== undefined) hash.mday = Number(s[2]);
  if (s[3] !== undefined) hash.mday = Number(s[3]);
  if (s[4] !== undefined) {
    hash.zone = s[4];
    hash.offset = dateZoneToDiff(s[4]);
  }

  return 1;
}

/** @internal */
function xmlschemaTrunc(str: string, hash: DateParts): number {
  const patSource = `^\\s*(?:--(\\d{2})(?:-(\\d{2}))?|---(\\d{2}))` + `(z|[-+]\\d{2}:\\d{2})?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, xmlschemaTruncCb);
}

/** @internal */
function dateXmlschema(str: string): DateParts {
  const hash: DateParts = {};

  if (xmlschemaDatetime(str, hash)) return hash;
  if (xmlschemaTime(str, hash)) return hash;
  xmlschemaTrunc(str, hash);

  return hash;
}

/** @internal */
function rfc2822Cb(m: RegExpExecArray, hash: DateParts): number {
  const s1 = m[1];
  const s2 = m[2];
  const s3 = m[3];
  const s4 = m[4];
  const s5 = m[5];
  const s6 = m[6];
  const s7 = m[7];
  const s8 = m[8];

  if (s1 !== undefined) {
    hash.wday = dayNum(s1);
  }
  hash.mday = Number(s2);
  hash.mon = monNum(s3);
  let y = Number(s4);
  if (s4.length < 4) y = compYear50(y);
  hash.year = y;
  hash.hour = Number(s5);
  hash.min = Number(s6);
  if (s7 !== undefined) hash.sec = Number(s7);
  hash.zone = s8;
  hash.offset = dateZoneToDiff(s8);

  return 1;
}

/** @internal */
function rfc2822(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(?:(${ABBR_DAYS})\\s*,\\s+)?` +
    `(\\d{1,2})\\s+` +
    `(${ABBR_MONTHS})\\s+` +
    `(-?\\d{2,})\\s+` +
    `(\\d{2}):(\\d{2})(?::(\\d{2}))?\\s*` +
    `([-+]\\d{4}|ut|gmt|e[sd]t|c[sd]t|m[sd]t|p[sd]t|[a-ik-z])\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, rfc2822Cb);
}

/** @internal */
function dateRfc2822(str: string): DateParts {
  const hash: DateParts = {};
  rfc2822(str, hash);
  return hash;
}

/** @internal */
function httpdateType1Cb(m: RegExpExecArray, hash: DateParts): number {
  hash.wday = dayNum(m[1]);
  hash.mday = Number(m[2]);
  hash.mon = monNum(m[3]);
  hash.year = Number(m[4]);
  hash.hour = Number(m[5]);
  hash.min = Number(m[6]);
  hash.sec = Number(m[7]);
  hash.zone = m[8];
  hash.offset = 0;

  return 1;
}

/** @internal */
function httpdateType1(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(${ABBR_DAYS})\\s*,\\s+` +
    `(\\d{2})\\s+` +
    `(${ABBR_MONTHS})\\s+` +
    `(-?\\d{4})\\s+` +
    `(\\d{2}):(\\d{2}):(\\d{2})\\s+` +
    `(gmt)\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, httpdateType1Cb);
}

/** @internal */
function httpdateType2Cb(m: RegExpExecArray, hash: DateParts): number {
  hash.wday = dayNum(m[1]);
  hash.mday = Number(m[2]);
  hash.mon = monNum(m[3]);
  let y = Number(m[4]);
  if (y >= 0 && y <= 99) y = compYear69(y);
  hash.year = y;
  hash.hour = Number(m[5]);
  hash.min = Number(m[6]);
  hash.sec = Number(m[7]);
  hash.zone = m[8];
  hash.offset = 0;

  return 1;
}

/** @internal */
function httpdateType2(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(${DAYS})\\s*,\\s+` +
    `(\\d{2})\\s*-\\s*` +
    `(${ABBR_MONTHS})\\s*-\\s*` +
    `(\\d{2})\\s+` +
    `(\\d{2}):(\\d{2}):(\\d{2})\\s+` +
    `(gmt)\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, httpdateType2Cb);
}

/** @internal */
function httpdateType3Cb(m: RegExpExecArray, hash: DateParts): number {
  hash.wday = dayNum(m[1]);
  hash.mon = monNum(m[2]);
  hash.mday = Number(m[3]);
  hash.hour = Number(m[4]);
  hash.min = Number(m[5]);
  hash.sec = Number(m[6]);
  hash.year = Number(m[7]);

  return 1;
}

/** @internal */
function httpdateType3(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*(${ABBR_DAYS})\\s+` +
    `(${ABBR_MONTHS})\\s+` +
    `(\\d{1,2})\\s+` +
    `(\\d{2}):(\\d{2}):(\\d{2})\\s+` +
    `(\\d{4})\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, httpdateType3Cb);
}

/** @internal */
function dateHttpdate(str: string): DateParts {
  const hash: DateParts = {};

  if (httpdateType1(str, hash)) return hash;
  if (httpdateType2(str, hash)) return hash;
  httpdateType3(str, hash);

  return hash;
}

/** @internal */
const JISX0301_DEFAULT_ERA = "H";

/** @internal */
function jisx0301Cb(m: RegExpExecArray, hash: DateParts): number {
  const s: (string | undefined)[] = m;

  const ep = gengo(s[1] === undefined ? JISX0301_DEFAULT_ERA : s[1][0]);
  hash.year = fAdd(cstr2num(s[2] as string), ep);
  hash.mon = Number(s[3]);
  hash.mday = Number(s[4]);
  if (s[5] !== undefined) {
    hash.hour = Number(s[5]);
    if (s[6] !== undefined) hash.min = Number(s[6]);
    if (s[7] !== undefined) hash.sec = Number(s[7]);
  }
  if (s[8] !== undefined) hash.secFraction = secFraction(s[8]);
  if (s[9] !== undefined) {
    hash.zone = s[9];
    hash.offset = dateZoneToDiff(s[9]);
  }

  return 1;
}

/** @internal */
function jisx0301(str: string, hash: DateParts): number {
  const patSource =
    `^\\s*([${JISX0301_ERA_INITIALS}])?(\\d{2})\\.(\\d{2})\\.(\\d{2})` +
    `(?:t` +
    `(?:(\\d{2}):(\\d{2})(?::(\\d{2})(?:[,.](\\d*))?)?` +
    `(z|[-+]\\d{2}(?::?\\d{2})?)?)?)?\\s*$`;
  return match(str, new RegExp(patSource, "i"), hash, jisx0301Cb);
}

/** @internal */
function dateJisx0301(str: string): DateParts {
  let hash: DateParts = {};
  if (jisx0301(str, hash)) return hash;
  hash = dateIso8601(str);

  return hash;
}

const JULIAN_EPOCH_DATE = "-4712-01-01";

const JULIAN_EPOCH_DATETIME_RFC3339 = "Mon, 1 Jan -4712 00:00:00 +0000";

const JULIAN_EPOCH_DATETIME_HTTPDATE = "Mon, 01 Jan -4712 00:00:00 GMT";

const JULIAN_EPOCH_DATETIME = `${JULIAN_EPOCH_DATE}T00:00:00+00:00`;

const ABBREVIATED_DAY_NAME_LENGTH = 3;
const ABBREVIATED_MONTH_NAME_LENGTH = 3;

/** @internal */
function numPatternP(s: string): boolean {
  let i = 0;
  if (isdigit(s[i])) return true;
  if (s[i] === "%") {
    i++;
    if (s[i] === "E" || s[i] === "O") i++;
    const c = s[i];
    if (c !== undefined && ("CDdeFGgHIjkLlMmNQRrSsTUuVvWwXxYy".includes(c) || isdigit(c))) {
      return true;
    }
  }
  return false;
}

/** @internal */
function readDigits(str: string, slen: number, si: number, width: number): [l: number, n: number] {
  if (!width) return [0, 0];

  let l = 0;
  while (si + l < slen && isdigit(str[si + l])) {
    if (++l === width) break;
  }

  if (l === 0) return [0, 0];

  return [l, Number(str.slice(si, si + l))];
}

/** @internal */
function validRangeP(v: number, a: number, b: number): boolean {
  return !(v < a || v > b);
}

/** @internal */
function headMatchP(len: number, name: string, str: string, slen: number, si: number): boolean {
  return (
    slen - si >= len && str.slice(si, si + len).toLowerCase() === name.slice(0, len).toLowerCase()
  );
}

/** @internal */
function dateStrptimeInternal(str: string, fmt: string, hash: DateParts): number {
  const slen = str.length;
  const flen = fmt.length;
  let si = 0;
  let fi = 0;

  const fail = (): number => {
    hash._fail = true;
    return 0;
  };
  const failP = (): boolean => hash._fail === true;

  const readDigitsAt = (width: number): number | null => {
    const [l, n] = readDigits(str, slen, si, width);
    if (l === 0) return null;
    si += l;
    return n;
  };
  const readDigitsMax = (): number | null => readDigitsAt(Number.POSITIVE_INFINITY);
  const recur = (f: string): boolean => {
    const l = dateStrptimeInternal(str.slice(si), f, hash);
    if (failP()) return false;
    si += l;
    return true;
  };
  const headMatch = (len: number, name: string): boolean => headMatchP(len, name, str, slen, si);

  while (fi < flen) {
    if (isspace(fmt[fi])) {
      while (si < slen && isspace(str[si])) si++;
      while (++fi < flen && isspace(fmt[fi]));
      continue;
    }

    if (si >= slen) return fail();

    if (fmt[fi] !== "%") {
      if (str[si] !== fmt[fi]) return fail();
      si++;
      fi++;
      continue;
    }

    let ordinal = false;
    again: for (;;) {
      fi++;
      const c = fmt[fi] ?? "";

      switch (c) {
        case "E":
          if (fmt[fi + 1] !== undefined && "cCxXyY".includes(fmt[fi + 1])) continue again;
          fi--;
          ordinal = true;
          break;
        case "O":
          if (fmt[fi + 1] !== undefined && "deHImMSuUVwWy".includes(fmt[fi + 1])) continue again;
          fi--;
          ordinal = true;
          break;
        case ":": {
          let i: number;
          for (i = 1; i < 3 && fi + i < flen && fmt[fi + i] === ":"; ++i);
          if (fmt[fi + i] === "z") {
            fi += i - 1;
            continue again;
          }
          return fail();
        }

        case "A":
        case "a": {
          for (let i = 0; i < DAY_NAMES.length; i++) {
            const dayName = DAY_NAMES[i];
            let l = dayName.length;
            if (headMatch(l, dayName) || headMatch((l = ABBREVIATED_DAY_NAME_LENGTH), dayName)) {
              si += l;
              hash.wday = i;
              break again;
            }
          }
          return fail();
        }
        case "B":
        case "b":
        case "h": {
          for (let i = 0; i < MONTH_NAMES.length; i++) {
            const monthName = MONTH_NAMES[i];
            let l = monthName.length;
            if (
              headMatch(l, monthName) ||
              headMatch((l = ABBREVIATED_MONTH_NAME_LENGTH), monthName)
            ) {
              si += l;
              hash.mon = i + 1;
              break again;
            }
          }
          return fail();
        }

        case "C": {
          const n = numPatternP(fmt.slice(fi + 1)) ? readDigitsAt(2) : readDigitsMax();
          if (n === null) return fail();
          hash._cent = n;
          break again;
        }

        case "c":
          if (!recur("%a %b %e %H:%M:%S %Y")) return 0;
          break again;

        case "D":
          if (!recur("%m/%d/%y")) return 0;
          break again;

        case "d":
        case "e": {
          let n: number | null;
          if (str[si] === " ") {
            si++;
            n = readDigitsAt(1);
          } else {
            n = readDigitsAt(2);
          }
          if (n === null) return fail();
          if (!validRangeP(n, 1, 31)) return fail();
          hash.mday = n;
          break again;
        }

        case "F":
          if (!recur("%Y-%m-%d")) return 0;
          break again;

        case "G": {
          const n = numPatternP(fmt.slice(fi + 1)) ? readDigitsAt(4) : readDigitsMax();
          if (n === null) return fail();
          hash.cwyear = n;
          break again;
        }

        case "g": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 99)) return fail();
          hash.cwyear = n;
          if (hash._cent === undefined) hash._cent = n >= 69 ? 19 : 20;
          break again;
        }

        case "H":
        case "k": {
          let n: number | null;
          if (str[si] === " ") {
            si++;
            n = readDigitsAt(1);
          } else {
            n = readDigitsAt(2);
          }
          if (n === null) return fail();
          if (!validRangeP(n, 0, 24)) return fail();
          hash.hour = n;
          break again;
        }

        case "I":
        case "l": {
          let n: number | null;
          if (str[si] === " ") {
            si++;
            n = readDigitsAt(1);
          } else {
            n = readDigitsAt(2);
          }
          if (n === null) return fail();
          if (!validRangeP(n, 1, 12)) return fail();
          hash.hour = n;
          break again;
        }

        case "j": {
          const n = readDigitsAt(3);
          if (n === null) return fail();
          if (!validRangeP(n, 1, 366)) return fail();
          hash.yday = n;
          break again;
        }

        case "L":
        case "N": {
          let sign = 1;
          if (issign(str[si])) {
            if (str[si] === "-") sign = -1;
            si++;
          }
          const osi = si;
          if (
            (numPatternP(fmt.slice(fi + 1)) ? readDigitsAt(c === "L" ? 3 : 9) : readDigitsMax()) ===
            null
          ) {
            return fail();
          }
          let n = BigInt(str.slice(osi, si));
          if (sign === -1) n = -n;
          hash.secFraction = new Rational(n, 10n ** BigInt(si - osi));
          break again;
        }

        case "M": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 59)) return fail();
          hash.min = n;
          break again;
        }

        case "m": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 1, 12)) return fail();
          hash.mon = n;
          break again;
        }

        case "n":
        case "t":
          if (!recur(" ")) return 0;
          break again;

        case "P":
        case "p": {
          if (slen - si < 2) return fail();
          let c = str[si];
          const hour = c === "P" || c === "p" ? 12 : 0;
          if (!hour && !(c === "A" || c === "a")) return fail();
          if ((c = str[si + 1]!) === ".") {
            if (slen - si < 4 || str[si + 3] !== ".") return fail();
            c = str[(si += 2)]!;
          }
          if (!(c === "M" || c === "m")) return fail();
          si += 2;
          hash._merid = hour;
          break again;
        }

        case "Q": {
          let sign = 1;
          if (str[si] === "-") {
            sign = -1;
            si++;
          }
          const osi = si;
          if (readDigitsMax() === null) return fail();
          let n = BigInt(str.slice(osi, si));
          if (sign === -1) n = -n;
          hash.seconds = new Rational(n, 1000n);
          break again;
        }

        case "R":
          if (!recur("%H:%M")) return 0;
          break again;

        case "r":
          if (!recur("%I:%M:%S %p")) return 0;
          break again;

        case "S": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 60)) return fail();
          hash.sec = n;
          break again;
        }

        case "s": {
          let sign = 1;
          if (str[si] === "-") {
            sign = -1;
            si++;
          }
          const osi = si;
          if (readDigitsMax() === null) return fail();
          let n = BigInt(str.slice(osi, si));
          if (sign === -1) n = -n;
          hash.seconds = n;
          break again;
        }

        case "T":
          if (!recur("%H:%M:%S")) return 0;
          break again;

        case "U":
        case "W": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 53)) return fail();
          if (c === "U") hash.wnum0 = n;
          else hash.wnum1 = n;
          break again;
        }

        case "u": {
          const n = readDigitsAt(1);
          if (n === null) return fail();
          if (!validRangeP(n, 1, 7)) return fail();
          hash.cwday = n;
          break again;
        }

        case "V": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 1, 53)) return fail();
          hash.cweek = n;
          break again;
        }

        case "v":
          if (!recur("%e-%b-%Y")) return 0;
          break again;

        case "w": {
          const n = readDigitsAt(1);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 6)) return fail();
          hash.wday = n;
          break again;
        }

        case "X":
          if (!recur("%H:%M:%S")) return 0;
          break again;

        case "x":
          if (!recur("%m/%d/%y")) return 0;
          break again;

        case "Y": {
          let sign = 1;
          if (issign(str[si])) {
            if (str[si] === "-") sign = -1;
            si++;
          }
          let n = numPatternP(fmt.slice(fi + 1)) ? readDigitsAt(4) : readDigitsMax();
          if (n === null) return fail();
          if (sign === -1) n = -n;
          hash.year = n;
          break again;
        }

        case "y": {
          const n = readDigitsAt(2);
          if (n === null) return fail();
          if (!validRangeP(n, 0, 99)) return fail();
          hash.year = n;
          if (hash._cent === undefined) hash._cent = n >= 69 ? 19 : 20;
          break again;
        }

        case "Z":
        case "z": {
          const m = ZONE_PAT.exec(str.slice(si));
          if (m !== null) {
            const s = m[1];
            const l = m[0].length;
            const o = dateZoneToDiff(s);
            si += l;
            hash.zone = s;
            hash.offset = o;
            break again;
          }
          return fail();
        }

        case "%":
          if (str[si] !== "%") return fail();
          si++;
          break again;

        case "+":
          if (!recur("%a %b %e %H:%M:%S %Z %Y")) return 0;
          break again;

        default:
          if (str[si] !== "%") return fail();
          si++;
          if (fi < flen) {
            if (si >= slen || str[si] !== fmt[fi]) return fail();
            si++;
          }
          break again;
      }
      break;
    }

    if (ordinal) {
      if (str[si] !== fmt[fi]) return fail();
      si++;
      fi++;
      continue;
    }
    fi++;
  }

  return si;
}

/** @internal */
const ZONE_PAT =
  /^((?:gmt|utc?)?[-+]\d+(?:[,.:]\d+(?::\d+)?)?|[a-zA-Z.\s]+(?:standard|daylight)\s+time\b|[a-zA-Z]+(?:\s+dst)?\b)/i;

/** @internal */
function dateStrptime(str: string, fmt: string, hash: DateParts): DateParts | null {
  const si = dateStrptimeInternal(str, fmt, hash);

  if (str.length > si) {
    hash.leftover = str.slice(si);
  }

  if (hash._fail === true) return null;

  const cent = hash._cent;
  delete hash._cent;
  if (cent !== undefined) {
    if (hash.cwyear !== undefined) hash.cwyear = fAdd(hash.cwyear, cent * 100);
    if (hash.year !== undefined) hash.year = fAdd(hash.year, cent * 100);
  }

  const merid = hash._merid;
  delete hash._merid;
  if (merid !== undefined) {
    if (hash.hour !== undefined) hash.hour = (hash.hour % 12) + merid;
  }

  return hash;
}

/** @internal */
/** @internal */
function fAdd(x: number | bigint, y: number | bigint): number | bigint;
function fAdd(
  x: number | bigint | Rational,
  y: number | bigint | Rational,
): number | bigint | Rational;
function fAdd(
  x: number | bigint | Rational,
  y: number | bigint | Rational,
): number | bigint | Rational {
  if (x instanceof Rational) return x.add(y);
  if (y instanceof Rational) return y.add(x);
  if (typeof x === "bigint") return x + BigInt(y);
  if (typeof y === "bigint") return BigInt(x) + y;
  return x + y;
}

function fIdiv(x: number | bigint | Rational, y: number): number {
  if (x instanceof Rational) return x.div(y);
  if (typeof x === "bigint") {
    const d = BigInt(y);
    const q = x / d;
    return Number(x % d !== 0n && x < 0n !== d < 0n ? q - 1n : q);
  }
  return div(x, y);
}

/** @internal */
function fMod(x: number | bigint | Rational, y: number): number | bigint | Rational {
  if (x instanceof Rational) return x.mod(y);
  if (typeof x === "bigint") {
    const d = BigInt(y);
    const r = x % d;
    return r !== 0n && r < 0n !== d < 0n ? r + d : r;
  }
  return mod(x, y);
}

/** @internal */
function rtRewriteFrags(hash: DateParts): DateParts {
  let seconds = hash.seconds;
  delete hash.seconds;
  if (seconds !== undefined) {
    const offset = hash.offset;
    if (offset != null) {
      seconds = fAdd(seconds, offset);
    }

    const d = fIdiv(seconds, DAY_IN_SECONDS);
    let fr = fMod(seconds, DAY_IN_SECONDS);

    const h = fIdiv(fr, HOUR_IN_SECONDS);
    fr = fMod(fr, HOUR_IN_SECONDS);

    const min = fIdiv(fr, MINUTE_IN_SECONDS);
    fr = fMod(fr, MINUTE_IN_SECONDS);

    const sec = fIdiv(fr, 1);
    fr = fMod(fr, 1);

    hash.jd = UNIX_EPOCH_IN_CJD + d;
    hash.hour = h;
    hash.min = min;
    hash.sec = sec;
    hash.secFraction = fr;
  }
  return hash;
}

/** @internal */
function completeFrags(klass: typeof Date | typeof DateTime, parts: DateParts): void {
  const tab: [string | null, DateFrag[]][] = [
    ["time", ["hour", "min", "sec"]],
    [null, ["jd"]],
    ["ordinal", ["year", "yday", "hour", "min", "sec"]],
    ["civil", ["year", "mon", "mday", "hour", "min", "sec"]],
    ["commercial", ["cwyear", "cweek", "cwday", "hour", "min", "sec"]],
    ["wday", ["wday", "hour", "min", "sec"]],
    ["wnum0", ["year", "wnum0", "wday", "hour", "min", "sec"]],
    ["wnum1", ["year", "wnum1", "wday", "hour", "min", "sec"]],
    [null, ["cwyear", "cweek", "wday", "hour", "min", "sec"]],
    [null, ["year", "wnum0", "cwday", "hour", "min", "sec"]],
    [null, ["year", "wnum1", "cwday", "hour", "min", "sec"]],
  ];

  let g: boolean;
  let e = 0;
  let k: string | null = null;
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

  if (g && k !== null && a.length - e) {
    const d = Temporal.Now.plainDateISO();
    const today: Partial<Record<DateFrag, number>> = {
      year: d.year,
      mon: d.month,
      mday: d.day,
      yday: d.dayOfYear,
      cwyear: d.yearOfWeek ?? undefined,
      cweek: d.weekOfYear ?? undefined,
      cwday: d.dayOfWeek,
      wnum0: cJdToWeeknum(cCivilToJd(d.year, d.month, d.day), 0)[1],
      wnum1: cJdToWeeknum(cCivilToJd(d.year, d.month, d.day), 1)[1],
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
    } else if (k === "commercial") {
      for (const el of a) {
        if (parts[el] !== undefined) break;
        parts[el] = today[el];
      }
      parts.cweek ??= 1;
      parts.cwday ??= 1;
    } else if (k === "wday") {
      const d2 = d.subtract({ days: d.dayOfWeek % 7 }).add({ days: parts.wday as number });
      parts.jd = cCivilToJd(d2.year, d2.month, d2.day);
    } else if (k === "wnum0") {
      for (const el of a) {
        if (parts[el] !== undefined) break;
        parts[el] = today[el];
      }
      parts.wnum0 ??= 0;
      parts.wday ??= 0;
    } else if (k === "wnum1") {
      for (const el of a) {
        if (parts[el] !== undefined) break;
        parts[el] = today[el];
      }
      parts.wnum1 ??= 0;
      parts.wday ??= 1;
    }
  }

  if (g && k === "time") {
    if (klass === DateTime || klass.prototype instanceof DateTime) {
      const d = Temporal.Now.plainDateISO();
      parts.jd ??= cCivilToJd(d.year, d.month, d.day);
    }
  }

  if (parts.hour === undefined) parts.hour = 0;
  if (parts.min === undefined) parts.min = 0;
  if (parts.sec === undefined) parts.sec = 0;
  else if (parts.sec > 59) parts.sec = 59;
}

/** @internal */
const UNIX_EPOCH_IN_CJD = 2440588;

/** @internal */
const ITALY = 2299161;

/** @internal */
const ENGLAND = 2361222;

/** @internal */
const JULIAN = Infinity;

/** @internal */
const GREGORIAN = -Infinity;

/** @internal */
const DEFAULT_SG = ITALY;

/** @internal */
const REFORM_BEGIN_YEAR = 1582;
const REFORM_END_YEAR = 1930;

/** @internal */
const JC_PERIOD0 = 1461;
const GC_PERIOD0 = 146097;
const CM_PERIOD0 = 71149239;
const CM_PERIOD = Math.trunc(0xfffffff / CM_PERIOD0) * CM_PERIOD0;
const CM_PERIOD_JCY = (CM_PERIOD / JC_PERIOD0) * 4;
const CM_PERIOD_GCY = (CM_PERIOD / GC_PERIOD0) * 400;

/** @internal */
const REFORM_BEGIN_JD = 2298874;
const REFORM_END_JD = 2426355;

/** @internal */
function cValidStartP(sg: number): boolean {
  if (Number.isNaN(sg)) return false;
  if (!Number.isFinite(sg)) return true;
  if (sg < REFORM_BEGIN_JD || sg > REFORM_END_JD) return false;
  return true;
}

/** @internal */
function val2sg(vsg: number): number {
  if (!cValidStartP(vsg)) {
    rbWarning("invalid start is ignored");
    return DEFAULT_SG;
  }
  return vsg;
}

/** @internal */
const MINUTE_IN_SECONDS = 60;
const HOUR_IN_SECONDS = 3600;
const DAY_IN_SECONDS = 86400;
const SECOND_IN_NANOSECONDS = 1_000_000_000;

/** @internal */
function secToNs(s: number | bigint | Rational): number | bigint | Rational {
  if (s instanceof Rational) return s.mul(SECOND_IN_NANOSECONDS);
  if (typeof s === "bigint") return s * BigInt(SECOND_IN_NANOSECONDS);
  return s * SECOND_IN_NANOSECONDS;
}

/** @internal */
function divDay(d: Rational): [number, Rational] {
  return [d.div(1), d.mod(1)];
}

/** @internal */
function divDf(d: Rational): [number, Rational] {
  const s = dayToSec(d);
  return [s.div(1), s.mod(1)];
}

/** @internal */
function decodeDay(d: Rational): [jd: number, df: number, sf: Rational] {
  const [jd, f1] = divDay(d);
  const [df, f] = divDf(f1);
  return [jd, df, secToNs(f) as Rational];
}

/** @internal */
function nsToSec(n: Rational): Rational {
  return n.quo(SECOND_IN_NANOSECONDS);
}

/** @internal */
const DAY_IN_NANOSECONDS = DAY_IN_SECONDS * SECOND_IN_NANOSECONDS;

/** @internal */
const HALF_DAYS_IN_DAY = new Rational(1, 2);

/** @internal */
const HALF_DAYS_IN_SECONDS = DAY_IN_SECONDS / 2;

/** @internal */
function isecToDay(s: number): Rational {
  return new Rational(s, DAY_IN_SECONDS);
}

/** @internal */
function nsToDay(n: Rational): Rational {
  return n.quo(DAY_IN_NANOSECONDS);
}

/** @internal */
export function dfLocalToUtc(df: number, of: number): number {
  df -= of;
  if (df < 0) df += DAY_IN_SECONDS;
  else if (df >= DAY_IN_SECONDS) df -= DAY_IN_SECONDS;
  return df;
}

/** @internal */
function dfUtcToLocal(df: number, of: number): number {
  df += of;
  if (df < 0) df += DAY_IN_SECONDS;
  else if (df >= DAY_IN_SECONDS) df -= DAY_IN_SECONDS;
  return df;
}

/** @internal */
export function jdLocalToUtc(jd: number, df: number, of: number): number {
  df -= of;
  if (df < 0) return jd - 1;
  if (df >= DAY_IN_SECONDS) return jd + 1;
  return jd;
}

/** @internal */
function jdUtcToLocal(jd: number, df: number, of: number): number {
  df += of;
  if (df < 0) return jd - 1;
  if (df >= DAY_IN_SECONDS) return jd + 1;
  return jd;
}

/** @internal */
export function timeToDf(h: number, min: number, s: number): number {
  return h * HOUR_IN_SECONDS + min * MINUTE_IN_SECONDS + s;
}

/** @internal */
function addFrac(
  jd: number,
  df: number,
  fr2: number | Rational,
): [jd: number, df: number, sf: Rational] {
  df += fr2 instanceof Rational ? fr2.div(1) : Math.floor(fr2);
  if (df >= DAY_IN_SECONDS) {
    jd += 1;
    df -= DAY_IN_SECONDS;
  }
  const sf =
    fr2 instanceof Rational
      ? (secToNs(fr2.mod(1)) as Rational)
      : new Rational(Math.round(secToNs(fr2 - Math.floor(fr2)) as number), 1);
  return [jd, df, sf];
}

/** @internal */
function dfToTime(df: number): [h: number, min: number, s: number] {
  const h = Math.trunc(df / HOUR_IN_SECONDS);
  df %= HOUR_IN_SECONDS;
  return [h, Math.trunc(df / MINUTE_IN_SECONDS), df % MINUTE_IN_SECONDS];
}

/** @internal */
export function cCivilToJd(y: number, m: number, d: number, sg = DEFAULT_SG): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524;
  if (jd < sg) jd -= b;
  return jd;
}

/** @internal */
function cJdToCivil(jd: number, sg = DEFAULT_SG): [ry: number, rm: number, rdom: number] {
  let a: number;
  if (jd < sg) a = jd;
  else {
    const x = Math.floor((jd - 1867216.25) / 36524.25);
    a = jd + 1 + x - Math.floor(x / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dom = b - d - Math.floor(30.6001 * e);
  let m: number;
  let y: number;
  if (e <= 13) {
    m = e - 1;
    y = c - 4716;
  } else {
    m = e - 13;
    y = c - 4715;
  }
  return [y, m, dom];
}

/** @internal */
function canonicalizeJd(nth: bigint, jd: number): [nth: bigint, jd: number] {
  if (jd < 0) {
    nth -= 1n;
    jd += CM_PERIOD;
  }
  if (jd >= CM_PERIOD) {
    nth += 1n;
    jd -= CM_PERIOD;
  }
  return [nth, jd];
}

/** @internal */
function cNthKdayToJd(y: number, m: number, n: number, k: number, sg = DEFAULT_SG): number {
  let rjd2: number;
  if (n > 0) {
    rjd2 = cFindFdom(y, m, sg)! - 1;
  } else {
    rjd2 = cFindLdom(y, m, sg)! + 7;
  }
  return rjd2 - mod(rjd2 - k + 1, 7) + 7 * n;
}

/** @internal */
function cJdToWday(jd: number): number {
  return mod(jd + 1, 7);
}

/** @internal */
function mJulianP(jd: number, sg: number): boolean {
  if (!Number.isFinite(sg)) return sg === JULIAN;
  return jd < sg;
}

/** @internal */
function virtualSg(nth: bigint, sg: number): number {
  if (!Number.isFinite(sg)) return sg;
  if (nth === 0n) return sg;
  else if (nth < 0n) return JULIAN;
  return GREGORIAN;
}

/** @internal */
function div(n: number, d: number): number;
function div(n: bigint, d: number): bigint;
function div(n: number | bigint, d: number): number | bigint;
function div(n: number | bigint, d: number): number | bigint {
  if (typeof n === "bigint") {
    const bd = BigInt(d);
    const q = n / bd;
    return n % bd !== 0n && n < 0n !== bd < 0n ? q - 1n : q;
  }
  return Math.floor(n / d);
}

/** @internal */
function mod(n: number, d: number): number;
function mod(n: bigint, d: number): bigint;
function mod(n: number | bigint, d: number): number | bigint;
function mod(n: number | bigint, d: number): number | bigint {
  if (typeof n === "bigint") return n - BigInt(d) * div(n, d);
  return n - d * div(n, d);
}

/** @internal */
const MONTHTAB: readonly (readonly number[])[] = [
  [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
];

/** @internal */
function cJulianLeapP(y: number): boolean {
  return mod(y, 4) === 0;
}

/** @internal */
function cGregorianLeapP(y: number): boolean {
  return (mod(y, 4) === 0 && y % 100 !== 0) || mod(y, 400) === 0;
}

/** @internal */
function cJulianLastDayOfMonth(y: number, m: number): number {
  return MONTHTAB[cJulianLeapP(y) ? 1 : 0][m];
}

/** @internal */
function cGregorianLastDayOfMonth(y: number, m: number): number {
  return MONTHTAB[cGregorianLeapP(y) ? 1 : 0][m];
}

/** @internal */
function cValidJulianP(y: number, m: number, d: number): [rm: number, rd: number] | null {
  if (m < 0) m += 13;
  if (m < 1 || m > 12) return null;
  const last = cJulianLastDayOfMonth(y, m);
  if (d < 0) d = last + d + 1;
  if (d < 1 || d > last) return null;
  return [m, d];
}

/** @internal */
function cValidGregorianP(y: number, m: number, d: number): [rm: number, rd: number] | null {
  if (m < 0) m += 13;
  if (m < 1 || m > 12) return null;
  const last = cGregorianLastDayOfMonth(y, m);
  if (d < 0) d = last + d + 1;
  if (d < 1 || d > last) return null;
  return [m, d];
}

/** @internal */
function validOrdinalP(
  y: number | bigint,
  d: number,
  sg: number,
): [nth: bigint, rjd: number] | null {
  const style = guessStyle(y, sg);

  if (style === 0) {
    const jd = cValidOrdinalP(Number(y), d, sg);
    if (jd === null) return null;
    return decodeJd(jd);
  }
  const [nth, ry] = decodeYear(y, style);
  const rjd = cValidOrdinalP(ry, d, style);
  if (rjd === null) return null;
  return [nth, rjd];
}

/** @internal */
function validGregorianP(
  y: number | bigint,
  m: number,
  d: number,
): [nth: bigint, ry: number, rm: number, rd: number] | null {
  const [nth, ry] = decodeYear(y, -1);
  const r = cValidGregorianP(ry, m, d);
  if (r === null) return null;
  return [nth, ry, r[0], r[1]];
}

/** @internal */
function fixnumP(y: number | bigint): boolean {
  if (typeof y === "bigint") return -MAX_SAFE_INTEGER_BIG <= y && y <= MAX_SAFE_INTEGER_BIG;
  return Number.isSafeInteger(y);
}

const MAX_SAFE_INTEGER_BIG = BigInt(Number.MAX_SAFE_INTEGER);

/** @internal */
function bigNorm(n: bigint): number | bigint {
  if (-MAX_SAFE_INTEGER_BIG <= n && n <= MAX_SAFE_INTEGER_BIG) return Number(n);
  return n;
}

/** @internal */
export function decodeYear(y: number | bigint, style: number): [nth: bigint, ry: number] {
  const period = style < 0 ? CM_PERIOD_GCY : CM_PERIOD_JCY;
  if (typeof y === "number" && fixnumP(y) && y < Number.MAX_SAFE_INTEGER - 4712) {
    let it = y + 4712;
    const inth = div(it, period);
    if (inth) it = mod(it, period);
    return [BigInt(inth), it - 4712];
  }
  if (typeof y === "number") {
    let t = y + 4712;
    const nth = div(t, period);
    if (nth) t = mod(t, period);
    return [BigInt(nth), Math.trunc(t) - 4712];
  }
  let t = y + 4712n;
  const nth = div(t, period);
  if (nth) t = mod(t, period);
  return [nth, Number(t) - 4712];
}

/** @internal */
function encodeYear(nth: bigint, y: number, style: number): number | bigint {
  const period = style < 0 ? CM_PERIOD_GCY : CM_PERIOD_JCY;
  if (nth === 0n) return y;
  return bigNorm(BigInt(period) * nth + BigInt(y));
}

/** @internal */
function realYearToLong(year: number | bigint): number {
  if (typeof year === "number") return year;
  if (year < BigInt(Number.MIN_SAFE_INTEGER) || year > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("bignum too big to convert into `long'");
  }
  return Number(year);
}

/** @internal */
function num2long(n: number): number {
  return Math.trunc(n);
}

/** @internal */
function decodeJd(jd: number | bigint): [nth: bigint, rjd: number] {
  if (typeof jd === "bigint") {
    const nth = div(jd, CM_PERIOD);
    if (nth === 0n) return [nth, Number(jd)];
    return [nth, Number(mod(jd, CM_PERIOD))];
  }
  const nth = div(jd, CM_PERIOD);
  if (nth === 0) return [0n, jd];
  return [BigInt(nth), mod(jd, CM_PERIOD)];
}

/** @internal */
function oldToNew(
  ajd: Rational,
  vof: Rational,
  vsg: number,
): [nth: bigint, jd: number, df: number, sf: Rational, of: number, sg: number] {
  const [jd, df, sf] = decodeDay(ajd.add(HALF_DAYS_IN_DAY));
  const t = dayToSec(vof);
  const of2 = t.round();

  if (t.cmp(of2) !== 0) rbWarning("fraction of offset is ignored");

  const [nth, rjd] = decodeJd(jd);

  let of = of2;
  let sg = vsg;

  if (df < 0 || df >= DAY_IN_SECONDS) throw new DateError("invalid day fraction");

  if (sf.cmp(0) < 0 || sf.cmp(SECOND_IN_NANOSECONDS) >= 0)
    if (of < -DAY_IN_SECONDS || of > DAY_IN_SECONDS) {
      of = 0;
      rbWarning("invalid offset is ignored");
    }

  if (!cValidStartP(sg)) {
    sg = DEFAULT_SG;
    rbWarning("invalid start is ignored");
  }

  return [nth, rjd, df, sf, of, sg];
}

/** @internal */
function encodeJd(nth: bigint, jd: number): number | bigint {
  if (nth === 0n) return jd;
  return bigNorm(BigInt(CM_PERIOD) * nth + BigInt(jd));
}

/** @internal */
function guessStyle(y: number | bigint, sg: number): number {
  let style = 0;

  if (!Number.isFinite(sg)) style = sg;
  else if (!fixnumP(y)) style = y > 0 ? GREGORIAN : JULIAN;
  else {
    if (y < REFORM_BEGIN_YEAR) style = JULIAN;
    else if (y > REFORM_END_YEAR) style = GREGORIAN;
  }
  return style;
}

/** @internal */
function cValidCivilP(y: number, m: number, d: number, sg = DEFAULT_SG): number | null {
  let ry: number;
  let rm: number;
  let rd: number;

  if (m < 0) m += 13;
  if (m < 1 || m > 12) return null;
  if (d < 0) {
    const ldom = cFindLdom(y, m, sg);
    if (ldom === null) return null;
    [ry, rm, rd] = cJdToCivil(ldom + d + 1, sg);
    if (ry !== y || rm !== m) return null;
    d = rd;
  }
  const rjd = cCivilToJd(y, m, d, sg);
  [ry, rm, rd] = cJdToCivil(rjd, sg);
  if (ry !== y || rm !== m || rd !== d) return null;
  return rjd;
}

/** @internal */
function validCivilP(
  y: number | bigint,
  m: number,
  d: number,
  sg: number,
): [nth: bigint, rjd: number] | null {
  const style = guessStyle(y, sg);

  if (style === 0) {
    const jd = cValidCivilP(Number(y), m, d, sg);
    if (jd === null) return null;
    return decodeJd(jd);
  }
  const [nth, ry] = decodeYear(y, style);
  const r = style < 0 ? cValidGregorianP(ry, m, d) : cValidJulianP(ry, m, d);
  if (r === null) return null;
  return [nth, cCivilToJd(ry, r[0], r[1], style)];
}

/** @internal */
function validCommercialP(
  y: number | bigint,
  w: number,
  d: number,
  sg: number,
): [nth: bigint, rjd: number] | null {
  const style = guessStyle(y, sg);

  if (style === 0) {
    const jd = cValidCommercialP(Number(y), w, d, sg);
    if (jd === null) return null;
    return decodeJd(jd);
  }
  const [nth, ry] = decodeYear(y, style);
  const rjd = cValidCommercialP(ry, w, d, style);
  if (rjd === null) return null;
  return [nth, rjd];
}

/** @internal */
function validWeeknumP(
  y: number | bigint,
  w: number,
  d: number,
  f: number,
  sg: number,
): [nth: bigint, rjd: number] | null {
  const style = guessStyle(y, sg);

  if (style === 0) {
    const jd = cValidWeeknumP(Number(y), w, d, f, sg);
    if (jd === null) return null;
    return decodeJd(jd);
  }
  const [nth, ry] = decodeYear(y, style);
  const rjd = cValidWeeknumP(ry, w, d, f, style);
  if (rjd === null) return null;
  return [nth, rjd];
}

/** @internal */
function validNthKdayP(
  y: number | bigint,
  m: number,
  n: number,
  k: number,
  sg: number,
): [nth: bigint, rjd: number] | null {
  const style = guessStyle(y, sg);

  if (style === 0) {
    const jd = cValidNthKdayP(Number(y), m, n, k, sg);
    if (jd === null) return null;
    return decodeJd(jd);
  }
  const [nth, ry] = decodeYear(y, style);
  const rjd = cValidNthKdayP(ry, m, n, k, style);
  if (rjd === null) return null;
  return [nth, rjd];
}

/** @internal */
function plainDateFromJd(jd: number | bigint, sg = DEFAULT_SG): Temporal.PlainDate {
  const [nth, rjd] = decodeJd(jd);
  if (nth !== 0n) throw new DateError("invalid date");
  const [y, m, d] = cJdToCivil(rjd, sg);
  try {
    return Temporal.PlainDate.from({ year: y, month: m, day: d }, { overflow: "reject" });
  } catch {
    throw new DateError("invalid date");
  }
}

/** @internal */
export const SEAT: unique symbol = Symbol("d_simple_new_internal");

/** @internal */
function dupObjWithNewOffset(obj: Date, of: number): Date {
  return obj instanceof DateTime ? obj.newOffset(of) : obj;
}

/** @internal */
function jisx0301DateFormat(jd: number | bigint, y: number | bigint): string {
  if (typeof jd === "number") {
    const d = jd;
    let s: number;
    let c: string;
    if (d < 2405160) return "%Y-%m-%d";
    if (d < 2419614) {
      c = "M";
      s = 1867;
    } else if (d < 2424875) {
      c = "T";
      s = 1911;
    } else if (d < 2447535) {
      c = "S";
      s = 1925;
    } else if (d < 2458605) {
      c = "H";
      s = 1988;
    } else {
      c = "R";
      s = 2018;
    }
    return `${c}${String(Number(y) - s).padStart(2, "0")}.%m.%d`;
  }
  return "%Y-%m-%d";
}

/** @internal */
function cValidTimeP(
  h: number,
  min: number,
  s: number,
): [rh: number, rmin: number, rs: number] | null {
  if (h < 0) h += 24;
  if (min < 0) min += 60;
  if (s < 0) s += 60;
  if (
    h < 0 ||
    h > 24 ||
    min < 0 ||
    min > 59 ||
    s < 0 ||
    s > 59 ||
    (h === 24 && (min > 0 || s > 0))
  ) {
    return null;
  }
  return [h, min, s];
}

/** @internal */
function num2intWithFrac(
  v: number | Rational,
  unitInSeconds: number,
  argcGtN: boolean,
): [whole: number, fr: number | Rational] {
  if (v instanceof Rational) {
    const whole = v.div(1);
    const fr = v.mod(1);
    if (!fr.isZero()) {
      if (argcGtN) throw new DateError("invalid fraction");
      return [whole, fr.mul(unitInSeconds)];
    }
    return [whole, 0];
  }
  const whole = Math.floor(v);
  const fr = v - whole;
  if (fr !== 0) {
    if (argcGtN) throw new DateError("invalid fraction");
    return [whole, fr * unitInSeconds];
  }
  return [whole, 0];
}

/** @internal */
function num2numWithFrac(
  v: number | bigint | Rational,
  unitInSeconds: number,
  argcGtN: boolean,
): [whole: number | bigint, fr: number | Rational] {
  if (typeof v === "bigint") return [v, 0];
  return num2intWithFrac(v, unitInSeconds, argcGtN);
}

/** @internal */
function cValidOrdinalP(y: number, d: number, sg = DEFAULT_SG): number | null {
  let ry2: number;
  let rd2: number;

  if (d < 0) {
    const rjd2 = cFindLdoy(y, sg);
    if (rjd2 === null) return null;

    [ry2, rd2] = cJdToOrdinal(rjd2 + d + 1, sg);
    if (ry2 !== y) return null;
    d = rd2;
  }
  const rjd = cOrdinalToJd(y, d, sg);
  [ry2, rd2] = cJdToOrdinal(rjd, sg);
  if (ry2 !== y || rd2 !== d) return null;
  return rjd;
}

/** @internal */
function cFindFdoy(y: number, sg = DEFAULT_SG): number | null {
  for (let d = 1; d < 31; d++) {
    const rjd = cValidCivilP(y, 1, d, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/** @internal */
function cFindLdoy(y: number, sg = DEFAULT_SG): number | null {
  for (let i = 0; i < 30; i++) {
    const rjd = cValidCivilP(y, 12, 31 - i, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/** @internal */
function cFindFdom(y: number, m: number, sg = DEFAULT_SG): number | null {
  for (let d = 1; d < 31; d++) {
    const rjd = cValidCivilP(y, m, d, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/** @internal */
function cFindLdom(y: number, m: number, sg = DEFAULT_SG): number | null {
  for (let i = 0; i < 30; i++) {
    const rjd = cValidCivilP(y, m, 31 - i, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/** @internal */
function cOrdinalToJd(y: number, d: number, sg = DEFAULT_SG): number {
  return cFindFdoy(y, sg)! + d - 1;
}

/** @internal */
function cJdToOrdinal(jd: number, sg = DEFAULT_SG): [ry: number, rd: number] {
  const [ry] = cJdToCivil(jd, sg);
  const rjd = cFindFdoy(ry, sg)!;
  return [ry, jd - rjd + 1];
}

/** @internal */
function cCommercialToJd(y: number, w: number, d: number, sg = DEFAULT_SG): number {
  const rjd2 = cFindFdoy(y, sg)! + 3;
  return rjd2 - mod(rjd2, 7) + 7 * (w - 1) + (d - 1);
}

/** @internal */
function cJdToCommercial(jd: number, sg = DEFAULT_SG): [ry: number, rw: number, rd: number] {
  const [a] = cJdToCivil(jd - 3, sg);
  let ry: number;
  let c2 = cCommercialToJd(a + 1, 1, 1, sg);
  if (jd >= c2) ry = a + 1;
  else {
    c2 = cCommercialToJd(a, 1, 1, sg);
    ry = a;
  }
  const rw = 1 + div(jd - c2, 7);
  let rd = mod(jd + 1, 7);
  if (rd === 0) rd = 7;
  return [ry, rw, rd];
}

/** @internal */
function cValidCommercialP(y: number, w: number, d: number, sg = DEFAULT_SG): number | null {
  if (d < 0) d += 8;
  if (w < 0) {
    const c2 = cJdToCommercial(cCommercialToJd(y + 1, 1, 1, sg) + w * 7, sg);
    if (c2[0] !== y) return null;
    w = c2[1];
  }
  const rjd = cCommercialToJd(y, w, d, sg);
  const [ry, rw, rd] = cJdToCommercial(rjd, sg);
  if (y !== ry || w !== rw || d !== rd) return null;
  return rjd;
}

/** @internal */
function cWeeknumToJd(y: number, w: number, d: number, f: number, sg = DEFAULT_SG): number {
  const rjd2 = cFindFdoy(y, sg)! + 6;
  return rjd2 - mod(rjd2 - f + 1, 7) - 7 + 7 * w + d;
}

/** @internal */
function cJdToWeeknum(
  jd: number,
  f: number,
  sg = DEFAULT_SG,
): [ry: number, rw: number, rd: number] {
  const [ry] = cJdToCivil(jd, sg);
  const rjd = cFindFdoy(ry, sg)! + 6;
  const j = jd - (rjd - mod(rjd - f + 1, 7)) + 7;
  return [ry, div(j, 7), mod(j, 7)];
}

/** @internal */
function cValidWeeknumP(
  y: number,
  w: number,
  d: number,
  f: number,
  sg = DEFAULT_SG,
): number | null {
  if (d < 0) d += 7;
  if (w < 0) {
    const w2 = cJdToWeeknum(cWeeknumToJd(y + 1, 1, f, f, sg) + w * 7, f, sg);
    if (w2[0] !== y) return null;
    w = w2[1];
  }
  const rjd = cWeeknumToJd(y, w, d, f, sg);
  const [ry, rw, rd] = cJdToWeeknum(rjd, f, sg);
  if (y !== ry || w !== rw || d !== rd) return null;
  return rjd;
}

/** @internal */
function cJdToNthKday(
  jd: number,
  sg = DEFAULT_SG,
): [ry: number, rm: number, rn: number, rk: number] {
  const [ry, rm] = cJdToCivil(jd, sg);
  const rjd = cFindFdom(ry, rm, sg)!;
  return [ry, rm, div(jd - rjd, 7) + 1, cJdToWday(jd)];
}

/** @internal */
function cValidNthKdayP(
  y: number,
  m: number,
  n: number,
  k: number,
  sg = DEFAULT_SG,
): number | null {
  if (k < 0) k += 7;
  if (n < 0) {
    const t = y * 12 + m;
    const ny = div(t, 12);
    const nm = mod(t, 12) + 1;

    const rjd2 = cNthKdayToJd(ny, nm, 1, k, sg);
    const [ry2, rm2, rn2] = cJdToNthKday(rjd2 + n * 7, sg);
    if (ry2 !== y || rm2 !== m) return null;
    n = rn2;
  }
  const rjd = cNthKdayToJd(y, m, n, k, sg);
  const [ry, rm, rn, rk] = cJdToNthKday(rjd, sg);
  if (y !== ry || m !== rm || n !== rn || k !== rk) return null;
  return rjd;
}

/** @internal */
function rtValidJdP(jd: number | bigint): number | bigint {
  return jd;
}

/** @internal */
function rtValidOrdinalP(y: number | bigint, d: number, sg = DEFAULT_SG): number | bigint | null {
  const r = validOrdinalP(y, d, sg);
  if (r === null) return null;
  return encodeJd(r[0], r[1]);
}

/** @internal */
function rtValidCivilP(
  y: number | bigint,
  m: number,
  d: number,
  sg = DEFAULT_SG,
): number | bigint | null {
  const r = validCivilP(y, m, d, sg);
  if (r === null) return null;
  return encodeJd(r[0], r[1]);
}

/** @internal */
function rtValidCommercialP(
  y: number | bigint,
  w: number,
  d: number,
  sg = DEFAULT_SG,
): number | bigint | null {
  const r = validCommercialP(y, w, d, sg);
  if (r === null) return null;
  return encodeJd(r[0], r[1]);
}

/** @internal */
function rtValidWeeknumP(
  y: number | bigint,
  w: number,
  d: number,
  f: number,
  sg = DEFAULT_SG,
): number | bigint | null {
  const r = validWeeknumP(y, w, d, f, sg);
  if (r === null) return null;
  return encodeJd(r[0], r[1]);
}

/** @internal */
function rtValidDateFragsP(parts: DateParts, sg = DEFAULT_SG): number | bigint | null {
  if (parts.jd !== undefined) {
    const d = rtValidJdP(parts.jd);
    if (d !== null) return d;
  }

  if (parts.yday !== undefined && parts.year !== undefined) {
    const d = rtValidOrdinalP(parts.year, parts.yday, sg);
    if (d !== null) return d;
  }

  if (parts.mday !== undefined && parts.mon !== undefined && parts.year !== undefined) {
    const d = rtValidCivilP(parts.year, parts.mon, parts.mday, sg);
    if (d !== null) return d;
  }

  {
    let wday = parts.cwday;
    if (wday === undefined) {
      wday = parts.wday;
      if (wday !== undefined) if (wday === 0) wday = 7;
    }
    if (wday !== undefined && parts.cweek !== undefined && parts.cwyear !== undefined) {
      const d = rtValidCommercialP(parts.cwyear, parts.cweek, wday, sg);
      if (d !== null) return d;
    }
  }

  {
    let wday = parts.wday;
    if (wday === undefined) {
      wday = parts.cwday;
      if (wday !== undefined) if (wday === 7) wday = 0;
    }
    if (wday !== undefined && parts.wnum0 !== undefined && parts.year !== undefined) {
      const d = rtValidWeeknumP(parts.year, parts.wnum0, wday, 0, sg);
      if (d !== null) return d;
    }
  }

  {
    let wday = parts.wday;
    if (wday === undefined) wday = parts.cwday;
    if (wday !== undefined) wday = mod(wday - 1, 7);

    if (wday !== undefined && parts.wnum1 !== undefined && parts.year !== undefined) {
      const d = rtValidWeeknumP(parts.year, parts.wnum1, wday, 1, sg);
      if (d !== null) return d;
    }
  }
  return null;
}

/** @internal */
export function dNewByFrags(hash: DateParts | null, sg = DEFAULT_SG): Date {
  let jd: number | bigint | null;

  if (hash === null) throw new DateError("invalid date");

  if (
    hash.jd === undefined &&
    hash.yday === undefined &&
    hash.year !== undefined &&
    hash.mon !== undefined &&
    hash.mday !== undefined
  ) {
    jd = rtValidCivilP(hash.year, hash.mon, hash.mday, sg);
  } else {
    hash = rtRewriteFrags(hash);
    completeFrags(Date, hash);
    try {
      jd = rtValidDateFragsP(hash, sg);
    } catch {
      jd = null;
    }
  }

  if (jd === null) throw new DateError("invalid date");
  const [nth, rjd] = decodeJd(jd);
  return new Date(SEAT, nth, rjd, sg);
}

/** @internal */
export function of2str(of: number): string {
  const s = of < 0 ? "-" : "+";
  const a = of < 0 ? -of : of;
  const h = Math.floor(a / HOUR_IN_SECONDS);
  const m = Math.floor((a % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS);
  return `${s}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** @internal */
export function dtNewByFrags(hash: DateParts | null, sg = DEFAULT_SG): DateTime {
  let jd: number | bigint | null;

  if (hash === null) throw new DateError("invalid date");

  if (
    hash.jd === undefined &&
    hash.yday === undefined &&
    hash.year !== undefined &&
    hash.mon !== undefined &&
    hash.mday !== undefined
  ) {
    jd = rtValidCivilP(hash.year, hash.mon, hash.mday, sg);

    if (hash.hour === undefined) hash.hour = 0;
    if (hash.min === undefined) hash.min = 0;
    if (hash.sec === undefined) hash.sec = 0;
    else if (hash.sec === 60) hash.sec = 59;
  } else {
    hash = rtRewriteFrags(hash);
    completeFrags(DateTime, hash);
    try {
      jd = rtValidDateFragsP(hash, sg);
    } catch {
      jd = null;
    }
  }

  if (jd === null) throw new DateError("invalid date");

  const rt = cValidTimeP(hash.hour ?? 0, hash.min ?? 0, hash.sec ?? 0);
  if (rt === null) throw new DateError("invalid date");
  const [rh, rmin, rs] = rt;

  const df = timeToDf(rh, rmin, rs);

  const t: number | bigint | Rational | null | undefined = hash.secFraction;
  const ns = t == null ? 0 : secToNs(t);
  const sf = ns instanceof Rational ? ns : new Rational(ns, 1);

  const to = hash.offset;
  let of = to == null ? 0 : to instanceof Rational ? to.toI() : Math.trunc(to);
  if (of < -DAY_IN_SECONDS || of > DAY_IN_SECONDS) {
    of = 0;
    rbWarning("invalid offset is ignored");
  }

  const [nth, rjd] = decodeJd(jd);
  return new DateTime(SEAT, nth, jdLocalToUtc(rjd, df, of), dfLocalToUtc(df, of), sf, of, sg);
}

/** @internal */
function round(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** @internal */
interface ParseOpt {
  limit?: number | null;
}

/** @internal */
function getLimit(opt: ParseOpt | undefined): number {
  if (opt !== undefined) {
    const limit = opt.limit;
    if (limit == null) return Infinity;
    return limit;
  }
  return 128;
}

/** @internal */
function checkLimit(str: string | null | undefined, opt: ParseOpt | undefined): void {
  if (str == null) return;
  if (typeof str !== "string") {
    throw new TypeError(
      `no implicit conversion of ${(str as object)?.constructor?.name ?? String(str)} into String`,
    );
  }
  const slen = new TextEncoder().encode(str).length;
  const limit = getLimit(opt);
  if (slen > limit) {
    throw new ArgumentError(`string length (${slen}) exceeds the limit ${limit}`);
  }
}

/** @internal */
function dayToSec(d: Rational): Rational {
  return d.mul(DAY_IN_SECONDS);
}

/** @internal */
function offsetToSec(vof: number | bigint | Rational | string): number | null {
  if (typeof vof === "bigint") return offsetToSec(new Rational(vof, 1));
  if (typeof vof !== "number" && typeof vof !== "string" && !(vof instanceof Rational)) {
    expectNumeric(vof);
    throw new TypeError("expected Rational");
  }
  if (typeof vof === "number") {
    if (Number.isInteger(vof)) {
      if (vof !== -1 && vof !== 0 && vof !== 1) return null;
      return vof * DAY_IN_SECONDS;
    }
    const n = vof * DAY_IN_SECONDS;
    if (n < -DAY_IN_SECONDS || n > DAY_IN_SECONDS) return null;
    const rof = round(n);
    if (rof !== n) rbWarning("fraction of offset is ignored");
    return rof;
  }
  if (vof instanceof Rational) {
    const vs = dayToSec(vof);
    let n: number;
    if (vs.denominator === 1n) {
      n = Number(vs.numerator);
    } else {
      n = vs.round();
      if (vs.cmp(n) !== 0) rbWarning("fraction of offset is ignored");
      if (n < -DAY_IN_SECONDS || n > DAY_IN_SECONDS) return null;
    }
    return n;
  }
  const vs = dateZoneToDiff(vof);
  if (vs === null || vs instanceof Rational) return null;
  if (vs < -DAY_IN_SECONDS || vs > DAY_IN_SECONDS) return null;
  return vs;
}

/** @internal */
function addFracTo(ret: Date, fr2: number | Rational): Date {
  if (fr2 instanceof Rational ? fr2.isZero() : fr2 === 0) return ret;
  return ret.plus(fr2);
}

/** @internal */
function val2off(vof: number | bigint | Rational | string): number {
  return offsetToSec(vof) ?? 0;
}

/** @internal */
class DateError extends ArgumentError {
  constructor(message: string) {
    super(message);
    this.name = "Date::Error";
  }
}

export class DateInfinity {
  readonly #d: number | null;

  constructor(d: number = 1) {
    this.#d = cmp(d, 0);
  }

  protected d(): number | null {
    return this.#d;
  }

  isZero(): false {
    return false;
  }

  isFinite(): false {
    return false;
  }

  isInfinite(): number | null {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method 'nonzero?' for nil");
    return d !== 0 ? d : null;
  }

  isNan(): boolean {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method 'zero?' for nil");
    return d === 0;
  }

  abs(): DateInfinity {
    return new (this.constructor as new (d?: number) => DateInfinity)();
  }

  negate(): DateInfinity {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method '-@' for nil");
    return new (this.constructor as new (d?: number) => DateInfinity)(-d);
  }

  identity(): DateInfinity {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method '+@' for nil");
    return new (this.constructor as new (d?: number) => DateInfinity)(+d);
  }

  compareTo(other: unknown): number | null {
    if (other instanceof DateInfinity) return cmp(this.d(), other.d());
    if (other === Number.POSITIVE_INFINITY) return cmp(this.d(), 1);
    if (other === Number.NEGATIVE_INFINITY) return cmp(this.d(), -1);
    if (typeof other === "number" || other instanceof Rational) return this.d();
    const coerce = (other as { coerce?: (x: unknown) => [number, number] } | null)?.coerce;
    if (typeof coerce === "function") {
      const [l, r] = coerce.call(other, this);
      return cmp(l, r);
    }
    return null;
  }

  readonly [rubyClass] = "Date::Infinity";

  lessThan = lessThan;

  lessThanOrEqual = lessThanOrEqual;

  greaterThan = greaterThan;

  greaterThanOrEqual = greaterThanOrEqual;

  equals = cmpEquals;

  isBetween = isBetween;

  coerce(other: unknown): [number, number] {
    if (typeof other === "number" || other instanceof Rational) {
      const d = this.d();
      if (d === null) throw new NoMethodError("undefined method '-@' for nil");
      return [-d, d];
    } else {
      return numCoerce(this, other);
    }
  }

  toF(): number {
    if (this.#d === 0) return 0;
    if (this.#d === null) throw new NoMethodError("undefined method '>' for nil");
    if (this.#d > 0) {
      return Number.POSITIVE_INFINITY;
    } else {
      return Number.NEGATIVE_INFINITY;
    }
  }
}

/** @noRailsEquivalent PERMANENT */
/** @internal */
function simpleDatP(dat: Date): boolean {
  return !dat.complexDatP();
}

/** @internal */
interface DateData {
  nth: bigint;
  jd?: number;
  df?: number;
  sf?: Rational;
  of?: number;
  sg: number;
  civil?: [ry: number, rm: number, rdom: number];
  time?: [rh: number, rmin: number, rs: number];
}

/** @internal */
function kNumericP(other: unknown): other is number | bigint | Rational {
  return typeof other === "number" || typeof other === "bigint" || other instanceof Rational;
}

/** @internal */
function expectNumeric(x: unknown): void {
  if (!kNumericP(x)) throw new TypeError("expected numeric");
}

/** @internal */
export function fToR(x: number): Rational {
  if (!Number.isFinite(x)) throw new FloatDomainError(String(x));
  let n = x;
  let d = 1n;
  while (!Number.isInteger(n)) {
    n *= 2;
    d *= 2n;
  }
  return new Rational(BigInt(n), d);
}

/** @internal */
function fMul12(n: number | bigint | Rational): number | bigint | Rational {
  if (n instanceof Rational) return n.mul(12);
  return typeof n === "bigint" ? n * 12n : n * 12;
}

/** @internal */
function fCmp(x: unknown, y: number): number {
  if (typeof x === "number" && typeof y === "number") {
    const c = x - y;
    if (c > 0) return 1;
    else if (c < 0) return -1;
    return 0;
  }
  const cmp = (x as { cmp?: (y: number) => number | null | undefined } | null)?.cmp;
  const c = typeof cmp === "function" ? cmp.call(x, y) : null;
  if (c === null || c === undefined) {
    const klass = x === null || x === undefined ? String(x) : (x.constructor?.name ?? "Object");
    throw new ArgumentError(`comparison of ${klass} with ${y} failed`);
  }
  return c > 0 ? 1 : c < 0 ? -1 : 0;
}

/** @internal */
function* dLiteUptoEnum(self: Date, max: Date): Generator<Date> {
  let date = self;
  while (date.cmp(max)! <= 0) {
    yield date;
    date = date.plus(1);
  }
}

/** @internal */
function* dLiteDowntoEnum(self: Date, min: Date): Generator<Date> {
  let date = self;
  while (date.cmp(min)! >= 0) {
    yield date;
    date = date.plus(-1);
  }
}

/** @internal */
function* dLiteStepEnum(
  self: Date,
  limit: Date,
  step: number | bigint | Rational,
): Generator<Date> {
  let date = self;
  const c = fCmp(step, 0);
  if (c < 0) {
    while (date.cmp(limit)! >= 0) {
      yield date;
      date = date.plus(step);
    }
  } else if (c === 0) {
    for (;;) yield date;
  } else {
    while (date.cmp(limit)! <= 0) {
      yield date;
      date = date.plus(step);
    }
  }
}

/** @internal */
function minusDd(self: Date, other: Date): Rational {
  let n = self.nth - other.nth;
  let d: number;
  [n, d] = canonicalizeJd(n, self.mJd() - other.mJd());
  let df = self.mDf() - other.mDf();
  let sf = self.mSf().add(other.mSf().mul(-1));

  if (df < 0) {
    d -= 1;
    df += DAY_IN_SECONDS;
  } else if (df >= DAY_IN_SECONDS) {
    d += 1;
    df -= DAY_IN_SECONDS;
  }

  if (sf.cmp(0) < 0) {
    df -= 1;
    sf = sf.add(SECOND_IN_NANOSECONDS);
  } else if (sf.cmp(SECOND_IN_NANOSECONDS) >= 0) {
    df += 1;
    sf = sf.add(-SECOND_IN_NANOSECONDS);
  }

  let r = new Rational(n === 0n ? 0n : n * BigInt(CM_PERIOD), 1);
  if (d) r = r.add(d);
  if (df) r = r.add(isecToDay(df));
  if (!sf.isZero()) r = r.add(nsToDay(sf));
  return r;
}

/** @internal */
function checkNumeric(obj: unknown, field: string): void {
  if (!kNumericP(obj)) throw new TypeError(`invalid ${field} (not numeric)`);
}

/** @internal */
function cmpGen(self: Date, other: unknown): number | null {
  if (kNumericP(other)) return self.ajd.cmp(other);
  else if (other instanceof Date) return self.ajd.cmp(other.ajd);
  return null;
}

/** @internal */
function cmpDd(self: Date, other: Date): number {
  self.mCanonicalizeJd();
  other.mCanonicalizeJd();
  const aNth = self.nth;
  const bNth = other.nth;
  if (aNth === bNth) {
    const aJd = self.mJd();
    const bJd = other.mJd();
    if (aJd === bJd) {
      const aDf = self.mDf();
      const bDf = other.mDf();
      if (aDf === bDf) {
        const aSf = self.mSf();
        const bSf = other.mSf();
        const a = aSf.numerator * bSf.denominator;
        const b = bSf.numerator * aSf.denominator;
        if (a === b) return 0;
        else if (a < b) return -1;
        else return 1;
      } else if (aDf < bDf) return -1;
      else return 1;
    } else if (aJd < bJd) return -1;
    else return 1;
  } else if (aNth < bNth) return -1;
  else return 1;
}

/** @internal */
function equalGen(self: Date, other: unknown): boolean | null {
  if (kNumericP(other)) return new Rational(self.jd, 1).cmp(other) === 0;
  else if (other instanceof Date) return self.jd == other.jd;
  return null;
}

function deconstructKeys(
  self: Date,
  keys: string[] | null,
  isDatetime: boolean,
): Record<string, unknown> {
  const h: Record<string, unknown> = {};

  if (keys === null) {
    h["year"] = self.year;
    h["month"] = self.mon;
    h["day"] = self.day;
    h["yday"] = self.yday;
    h["wday"] = self.wday;
    if (isDatetime) {
      const dt = self as DateTime;
      h["hour"] = dt.hour;
      h["min"] = dt.min;
      h["sec"] = dt.sec;
      h["sec_fraction"] = dt.secFraction;
      h["zone"] = dt.zone;
    }

    return h;
  }
  if (!Array.isArray(keys)) {
    throw new TypeError(
      `wrong argument type ${(keys as object)?.constructor?.name ?? typeof keys} (expected Array or nil)`,
    );
  }

  for (const key of keys) {
    if (key === "year") h[key] = self.year;
    if (key === "month") h[key] = self.mon;
    if (key === "day") h[key] = self.day;
    if (key === "yday") h[key] = self.yday;
    if (key === "wday") h[key] = self.wday;
    if (isDatetime) {
      const dt = self as DateTime;
      if (key === "hour") h[key] = dt.hour;
      if (key === "min") h[key] = dt.min;
      if (key === "sec") h[key] = dt.sec;
      if (key === "sec_fraction") h[key] = dt.secFraction;
      if (key === "zone") h[key] = dt.zone;
    }
  }
  return h;
}

export class Date {
  static _railsClassName = "Date";

  static Error = DateError;

  static ITALY = ITALY;

  static ENGLAND = ENGLAND;

  static JULIAN = JULIAN;

  static GREGORIAN = GREGORIAN;

  static MONTHNAMES: readonly (string | null)[] = Object.freeze([null, ...MONTH_NAMES]);

  static ABBR_MONTHNAMES: readonly (string | null)[] = Object.freeze([null, ...ABBR_MONTH_NAMES]);

  static DAYNAMES: readonly string[] = Object.freeze([...DAY_NAMES]);

  static ABBR_DAYNAMES: readonly string[] = Object.freeze([...ABBR_DAY_NAMES]);

  /** @internal */
  #jd?: number;

  /** @internal */
  #df?: number;
  #sf?: Rational;
  #of?: number;

  /** @internal */
  nth: bigint;

  /** @internal */
  sg: number;

  /** @internal */
  #civil?: [ry: number, rm: number, rdom: number];

  /** @internal */
  #fr2: number | Rational = 0;

  constructor(year?: number | bigint, month?: number, day?: number | Rational, start?: number);
  constructor(date: Temporal.PlainDate, start?: number);
  /** @internal */
  constructor(
    seat: typeof SEAT,
    nth: bigint,
    rjd: number,
    sg: number,
    df?: number,
    sf?: Rational,
    of?: number,
  );
  constructor(
    year: number | bigint | typeof SEAT | Temporal.PlainDate = -4712,
    month?: number | bigint,
    day: number | Rational = 1,
    start = DEFAULT_SG,
    df?: number,
    sf?: Rational,
    of?: number,
  ) {
    if (year instanceof Temporal.PlainDate) {
      const sg = val2sg((month as number | undefined) ?? DEFAULT_SG);
      const [nth, ry] = decodeYear(year.year, -1);
      this.nth = nth;
      this.#jd = cCivilToJd(ry, year.month, year.day, virtualSg(nth, sg));
      this.sg = sg;
      return;
    }
    if (typeof year === "symbol") {
      this.nth = month as bigint;
      this.#jd = day as number;
      this.sg = start;
      this.#df = df;
      this.#sf = sf;
      this.#of = of;
      return;
    }
    month ??= 1;
    checkNumeric(day, "day");
    checkNumeric(month, "month");
    checkNumeric(year, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(day, 1, false);
    this.#fr2 = fr2;
    if (guessStyle(year, sg) < 0) {
      const r = validGregorianP(year, month as number, d);
      if (r === null) throw new DateError("invalid date");
      const [nth, ry, rm, rd] = r;
      this.nth = nth;
      this.sg = sg;
      this.#civil = [ry, rm, rd];
    } else {
      const r = validCivilP(year, month as number, d, sg);
      if (r === null) throw new DateError("invalid date");
      const [nth, rjd] = r;
      this.nth = nth;
      this.#jd = rjd;
      this.sg = sg;
    }
  }

  /** @internal */
  #getSJd(): number {
    if (this.#jd === undefined) {
      const [year, mon, mday] = this.#civil as [number, number, number];
      this.#jd = cCivilToJd(year, mon, mday, virtualSg(this.nth, this.sg));
    }
    return this.#jd;
  }

  /** @internal */
  mLocalJd(): number {
    if (simpleDatP(this)) return this.#getSJd();
    return jdUtcToLocal(this.#getSJd(), this.#df!, this.#of!);
  }

  /** @internal */
  complexDatP(): boolean {
    return this.#df !== undefined;
  }

  /** @internal */
  mLocalDf(): number {
    if (simpleDatP(this)) return 0;
    return dfUtcToLocal(this.#df!, this.#of!);
  }

  /** @internal */
  mFr(): number | Rational {
    if (simpleDatP(this)) return 0;
    let fr = isecToDay(this.mLocalDf());
    const sf = this.mSf();
    if (!sf.isZero()) fr = fr.add(nsToDay(sf));
    return fr;
  }

  /** @internal */
  #getCCivil(): [ry: number, rm: number, rdom: number] {
    return (this.#civil ??= cJdToCivil(this.mLocalJd(), virtualSg(this.nth, this.sg)));
  }

  static isValidJd(jd: unknown, start: number = DEFAULT_SG): boolean {
    if (!kNumericP(jd)) return false;
    val2sg(start);
    return true;
  }

  static isValidCivil(
    year: unknown,
    month: unknown,
    mday: unknown,
    start: number = DEFAULT_SG,
  ): boolean {
    if (!kNumericP(year)) return false;
    if (!kNumericP(month)) return false;
    if (!kNumericP(mday)) return false;
    const sg = val2sg(start);
    if (guessStyle(year as number, sg) < 0) {
      return validGregorianP(year as number, month as number, mday as number) !== null;
    }
    return validCivilP(year as number, month as number, mday as number, sg) !== null;
  }

  static isValidDate(
    year: unknown,
    month: unknown,
    mday: unknown,
    start: number = DEFAULT_SG,
  ): boolean {
    return Date.isValidCivil(year, month, mday, start);
  }

  static isValidOrdinal(year: unknown, yday: unknown, start: number = DEFAULT_SG): boolean {
    if (!kNumericP(year)) return false;
    if (!kNumericP(yday)) return false;
    return cValidOrdinalP(year as number, yday as number, val2sg(start)) !== null;
  }

  static isValidCommercial(
    cwyear: unknown,
    cweek: unknown,
    cwday: unknown,
    start: number = DEFAULT_SG,
  ): boolean {
    if (!kNumericP(cwyear)) return false;
    if (!kNumericP(cweek)) return false;
    if (!kNumericP(cwday)) return false;
    return (
      cValidCommercialP(cwyear as number, cweek as number, cwday as number, val2sg(start)) !== null
    );
  }

  static isJulianLeap(year: unknown): boolean {
    checkNumeric(year, "year");
    const [, ry] = decodeYear(year as number, +1);
    return cJulianLeapP(ry);
  }

  static isGregorianLeap(year: unknown): boolean {
    checkNumeric(year, "year");
    const [, ry] = decodeYear(year as number, -1);
    return cGregorianLeapP(ry);
  }

  static isLeap(year: unknown): boolean {
    return Date.isGregorianLeap(year);
  }

  static jd(jd: number | bigint | Rational = 0, start = DEFAULT_SG): Temporal.PlainDate {
    checkNumeric(jd, "jd");
    const [j, fr2] = num2numWithFrac(jd, 1, false);
    const [nth, rjd] = decodeJd(j);
    const ret = new Date(SEAT, nth, rjd, val2sg(start));
    return addFracTo(ret, fr2).toDate();
  }

  static ordinal(
    year: number | bigint = -4712,
    yday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    checkNumeric(yday, "yday");
    checkNumeric(year, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(yday, 1, false);
    const r = validOrdinalP(year, d, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, r[0], r[1], sg), fr2).toDate();
  }

  static civil(
    year = -4712,
    month = 1,
    mday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    const ret = new Date(year, month, mday, start);
    return addFracTo(ret, ret.#fr2).toDate();
  }

  static commercial(
    cwyear: number | bigint = -4712,
    cweek = 1,
    cwday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    checkNumeric(cwday, "cwday");
    checkNumeric(cweek, "cweek");
    checkNumeric(cwyear, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(cwday, 1, false);
    const r = validCommercialP(cwyear, cweek, d, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, r[0], r[1], sg), fr2).toDate();
  }

  static weeknum(
    year: number | bigint = -4712,
    week = 0,
    day: number | Rational = 1,
    firstday = 0,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(day, 1, false);
    const r = validWeeknumP(year, week, d, firstday, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, r[0], r[1], sg), fr2).toDate();
  }

  static nthKday(
    year: number | bigint = -4712,
    month = 1,
    n = 1,
    k: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    const sg = val2sg(start);
    const [rk, fr2] = num2intWithFrac(k, 1, false);
    const r = validNthKdayP(year, month, n, rk, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, r[0], r[1], sg), fr2).toDate();
  }

  static today(start = DEFAULT_SG): Temporal.PlainDate {
    const sg = val2sg(start);
    const tm = Temporal.Now.plainDateISO();

    const y = tm.year;
    const m = tm.month;
    const d = tm.day;

    const [nth, ry] = decodeYear(y, -1);

    return new Date(SEAT, nth, cCivilToJd(ry, m, d, GREGORIAN), sg).toDate();
  }

  static _strptime(str: string, fmt = "%F"): DateParts | null {
    const hash: DateParts = {};
    return dateStrptime(str, fmt, hash);
  }

  static strptime(str = JULIAN_EPOCH_DATE, fmt = "%F", start = DEFAULT_SG): Temporal.PlainDate {
    return dNewByFrags(Date._strptime(str, fmt), val2sg(start)).toDate();
  }

  static _parse(str: string, comp = true, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    str = str.replace(/[^-+',./:@\p{Alphabetic}\p{Nd}[\]]+/gu, " ");
    const hash: DateParts = {};
    str = parseDay(str, hash) ?? str;
    str = parseTime(str, hash) ?? str;
    let rest: string | null = null;
    if (/[a-z]/i.test(str) && /\d/.test(str)) {
      rest = parseEu(str, hash) ?? parseUs(str, hash);
    }
    if (rest === null && /\d/.test(str) && str.includes("-")) rest = parseIso(str, hash);
    if (rest === null && /\d/.test(str) && str.includes(".")) rest = parseJis(str, hash);
    if (rest === null && /[a-z]/i.test(str) && /\d/.test(str) && str.includes("-")) {
      rest = parseVms(str, hash);
    }
    if (rest === null && /\d/.test(str) && str.includes("/")) rest = parseSla(str, hash);
    if (rest === null && /\d/.test(str) && str.includes(".")) rest = parseDot(str, hash);
    if (rest === null && /\d/.test(str)) rest = parseIso2(str, hash);
    if (rest === null && /\d/.test(str)) rest = parseYear(str, hash);
    if (rest === null && /[a-z]/i.test(str)) rest = parseMon(str, hash);
    if (rest === null && /\d/.test(str)) rest = parseMday(str, hash);
    if (rest === null && /\d/.test(str)) rest = parseDdd(str, hash);
    if (rest !== null) str = rest;
    if (/[a-z]/i.test(str)) str = parseBc(str, hash) ?? str;
    if (/\d/.test(str)) parseFrag(str, hash);
    if (hash._bc) {
      if (hash.cwyear !== undefined) hash.cwyear = fAdd(fNegate(hash.cwyear), 1);
      if (hash.year !== undefined) hash.year = fAdd(fNegate(hash.year), 1);
    }
    delete hash._bc;
    if (comp && hash._comp !== false) {
      if (hash.cwyear !== undefined && hash.cwyear >= 0 && hash.cwyear <= 99) {
        hash.cwyear = compYear69(Number(hash.cwyear));
      }
      if (hash.year !== undefined && hash.year >= 0 && hash.year <= 99) {
        hash.year = compYear69(Number(hash.year));
      }
    }
    {
      const zone = hash.zone;
      if (zone !== undefined && hash.offset == null) hash.offset = dateZoneToDiff(zone);
    }
    delete hash._comp;
    return hash;
  }

  static parse(
    str = JULIAN_EPOCH_DATE,
    comp = true,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return dNewByFrags(Date._parse(str, comp, opt), val2sg(start)).toDate();
  }

  static _iso8601(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateIso8601(str);
  }

  static iso8601(str = JULIAN_EPOCH_DATE, start = DEFAULT_SG, opt?: ParseOpt): Temporal.PlainDate {
    return dNewByFrags(Date._iso8601(str, opt), val2sg(start)).toDate();
  }

  static _rfc3339(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateRfc3339(str);
  }

  static rfc3339(
    str = JULIAN_EPOCH_DATETIME,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return dNewByFrags(Date._rfc3339(str, opt), val2sg(start)).toDate();
  }

  static _xmlschema(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateXmlschema(str);
  }

  static xmlschema(
    str = JULIAN_EPOCH_DATE,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return dNewByFrags(Date._xmlschema(str, opt), val2sg(start)).toDate();
  }

  static _rfc2822(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateRfc2822(str);
  }

  static _rfc822(str: string, opt?: ParseOpt): DateParts {
    return Date._rfc2822(str, opt);
  }

  static rfc2822(
    str = JULIAN_EPOCH_DATETIME_RFC3339,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return dNewByFrags(Date._rfc2822(str, opt), val2sg(start)).toDate();
  }

  static rfc822(
    str = JULIAN_EPOCH_DATETIME_RFC3339,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return Date.rfc2822(str, start, opt);
  }

  static _httpdate(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateHttpdate(str);
  }

  static httpdate(
    str = JULIAN_EPOCH_DATETIME_HTTPDATE,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDate {
    return dNewByFrags(Date._httpdate(str, opt), val2sg(start)).toDate();
  }

  static _jisx0301(str: string, opt?: ParseOpt): DateParts {
    checkLimit(str, opt);
    return dateJisx0301(str);
  }

  static jisx0301(str = JULIAN_EPOCH_DATE, start = DEFAULT_SG, opt?: ParseOpt): Temporal.PlainDate {
    return dNewByFrags(Date._jisx0301(str, opt), val2sg(start)).toDate();
  }

  get year(): number | bigint {
    const nth = this.nth;
    const year = this.#getCCivil()[0];

    if (nth === 0n) return year;
    return encodeYear(nth, year, this.isGregorian ? -1 : +1);
  }

  get mon(): number {
    return this.#getCCivil()[1];
  }

  get month(): number {
    return this.#getCCivil()[1];
  }

  get day(): number {
    return this.#getCCivil()[2];
  }

  get mday(): number {
    return this.#getCCivil()[2];
  }

  get dayFraction(): number | Rational {
    if (simpleDatP(this)) return 0;
    return this.mFr();
  }

  get cwyear(): number | bigint {
    const nth = this.nth;
    const [ry] = cJdToCommercial(this.mLocalJd(), virtualSg(this.nth, this.start));

    if (nth === 0n) return ry;
    return encodeYear(nth, ry, this.isGregorian ? -1 : +1);
  }

  get cweek(): number {
    const [, rw] = cJdToCommercial(this.mLocalJd(), virtualSg(this.nth, this.start));
    return rw;
  }

  get cwday(): number {
    let w = this.wday;
    if (w === 0) w = 7;
    return w;
  }

  get jd(): number | bigint {
    return encodeJd(this.nth, this.mLocalJd());
  }

  get mjd(): number | bigint {
    const r = this.jd;
    if (typeof r === "bigint") return r - 2400001n;
    return r - 2400001;
  }

  get ld(): number | bigint {
    const r = this.jd;
    if (typeof r === "bigint") return r - 2299160n;
    return r - 2299160;
  }

  get wday(): number {
    return cJdToWday(this.mLocalJd());
  }

  get isSunday(): boolean {
    return this.wday === 0;
  }

  get isMonday(): boolean {
    return this.wday === 1;
  }

  get isTuesday(): boolean {
    return this.wday === 2;
  }

  get isWednesday(): boolean {
    return this.wday === 3;
  }

  get isThursday(): boolean {
    return this.wday === 4;
  }

  get isFriday(): boolean {
    return this.wday === 5;
  }

  get isSaturday(): boolean {
    return this.wday === 6;
  }

  isNthKday(n: number, k: number): boolean {
    if (k !== this.wday) return false;

    const rjd = cNthKdayToJd(
      this.#getCCivil()[0],
      this.#getCCivil()[1],
      n,
      k,
      virtualSg(this.nth, this.start),
    );
    if (this.mLocalJd() !== rjd) return false;
    return true;
  }

  get yday(): number {
    const [, rd] = cJdToOrdinal(this.mLocalJd(), virtualSg(this.nth, this.sg));
    return rd;
  }

  get isJulian(): boolean {
    return mJulianP(this.#getSJd(), virtualSg(this.nth, this.sg));
  }

  get isGregorian(): boolean {
    return !this.isJulian;
  }

  get isLeap(): boolean {
    if (this.isGregorian) return cGregorianLeapP(this.#getCCivil()[0]);

    const sg = virtualSg(this.nth, this.start);
    const rjd = cCivilToJd(this.#getCCivil()[0], 3, 1, sg);
    const [, , rd] = cJdToCivil(rjd - 1, sg);
    return rd === 29;
  }

  get start(): number {
    return this.sg;
  }

  /** @internal */
  dat(): DateData {
    return {
      nth: this.nth,
      jd: this.#jd,
      df: this.#df,
      sf: this.#sf,
      of: this.#of,
      sg: this.sg,
      civil: this.#civil,
    };
  }

  initializeCopy(date: Date): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${objClassName(this)}: ${this.inspect()}`);
    }
    if ((this as Date) === date) return this;
    const bdat = date.dat();
    if (simpleDatP(date)) {
      if (simpleDatP(this)) {
        this.nth = bdat.nth;
        this.#jd = bdat.jd;
        this.sg = bdat.sg;
        this.#civil = bdat.civil;
      } else {
        this.nth = bdat.nth;
        this.#jd = bdat.jd;
        this.#df = 0;
        this.#sf = new Rational(0, 1);
        this.#of = 0;
        this.sg = bdat.sg;
        this.#civil = bdat.civil;
      }
    } else {
      if (!this.complexDatP()) throw new ArgumentError("cannot load complex into simple");
      this.nth = bdat.nth;
      this.#jd = bdat.jd;
      this.#df = bdat.df;
      this.#sf = bdat.sf;
      this.#of = bdat.of;
      this.sg = bdat.sg;
      this.#civil = bdat.civil;
    }
    return this;
  }

  dup(): this {
    return (new (this.constructor as typeof Date)(SEAT, 0n, 0, DEFAULT_SG) as this).initializeCopy(
      this,
    );
  }

  newStart(start = DEFAULT_SG): this {
    return new (this.constructor as typeof Date)(
      SEAT,
      this.nth,
      this.#getSJd(),
      val2sg(start),
      this.#df,
      this.#sf,
      this.#of,
    ) as this;
  }

  italy(): this {
    return this.newStart(ITALY);
  }

  england(): this {
    return this.newStart(ENGLAND);
  }

  julian(): this {
    return this.newStart(JULIAN);
  }

  gregorian(): this {
    return this.newStart(GREGORIAN);
  }

  plus(other: number | bigint | Rational): this {
    expectNumeric(other);
    if (typeof other === "number" && Number.isInteger(other)) {
      let nth = this.nth;
      let t = other;
      if (div(t, CM_PERIOD)) {
        nth = nth + BigInt(div(t, CM_PERIOD));
        t = mod(t, CM_PERIOD);
      }

      let jd: number;
      if (!t) jd = this.mJd();
      else {
        jd = this.mJd() + t;
        [nth, jd] = canonicalizeJd(nth, jd);
      }

      return this.dNewInternal(nth, jd, this.mDf(), this.mSf(), this.mOf());
    }

    if (typeof other === "bigint") {
      let s: number;
      if (other > 0n) s = +1;
      else {
        s = -1;
        other = -other;
      }

      let nth = other / BigInt(CM_PERIOD);
      let jd = Number(other % BigInt(CM_PERIOD));

      if (s < 0) {
        nth = -nth;
        jd = -jd;
      }

      if (!jd) jd = this.mJd();
      else {
        jd = this.mJd() + jd;
        [nth, jd] = canonicalizeJd(nth, jd);
      }

      if (nth === 0n) nth = this.nth;
      else nth = this.nth + nth;

      return this.dNewInternal(nth, jd, this.mDf(), this.mSf(), this.mOf());
    }

    let nth: bigint;
    let jd: number;
    let df: number;
    let sf: Rational;

    if (typeof other === "number") {
      let o = other;
      let s: number;
      if (o > 0) s = +1;
      else {
        s = -1;
        o = -o;
      }

      let tmp = Math.trunc(o);
      o = o - tmp;

      if (!Math.floor(tmp / CM_PERIOD)) {
        nth = 0n;
        jd = tmp;
      } else {
        const i = Math.trunc(tmp / CM_PERIOD);
        const f = tmp / CM_PERIOD - i;
        nth = BigInt(Math.floor(i));
        jd = Math.trunc(f * CM_PERIOD);
      }

      o *= DAY_IN_SECONDS;
      tmp = Math.trunc(o);
      o = o - tmp;
      df = tmp;
      o *= SECOND_IN_NANOSECONDS;
      sf = new Rational(Math.round(o), 1);

      if (s < 0) {
        jd = -jd;
        df = -df;
        sf = sf.mul(-1);
      }
    } else {
      if (wholenumP(other)) return this.plus(bigNorm(other.numerator));

      let s: number;
      if (other.numerator > 0n) s = +1;
      else {
        s = -1;
        other = other.mul(-1);
      }

      nth = BigInt(other.div(CM_PERIOD));
      let t = other.mod(CM_PERIOD);

      jd = t.div(1);
      t = t.mod(1);

      t = t.mul(DAY_IN_SECONDS);
      df = t.div(1);
      t = t.mod(1);

      sf = t.mul(SECOND_IN_NANOSECONDS);

      if (s < 0) {
        nth = -nth;
        jd = -jd;
        df = -df;
        sf = sf.mul(-1);
      }
    }

    if (sf.isZero()) sf = this.mSf();
    else {
      sf = this.mSf().add(sf);
      if (sf.numerator < 0n) {
        df -= 1;
        sf = sf.add(SECOND_IN_NANOSECONDS);
      } else if (sf.numerator >= BigInt(SECOND_IN_NANOSECONDS) * sf.denominator) {
        df += 1;
        sf = sf.add(-SECOND_IN_NANOSECONDS);
      }
    }

    if (!df) df = this.mDf();
    else {
      df = this.mDf() + df;
      if (df < 0) {
        jd -= 1;
        df += DAY_IN_SECONDS;
      } else if (df >= DAY_IN_SECONDS) {
        jd += 1;
        df -= DAY_IN_SECONDS;
      }
    }

    if (!jd) jd = this.mJd();
    else {
      jd = this.mJd() + jd;
      [nth, jd] = canonicalizeJd(nth, jd);
    }

    if (nth === 0n) nth = this.nth;
    else nth = this.nth + nth;

    return this.dNewInternal(nth, jd, df, sf, this.mOf());
  }

  /** @internal */
  mJd(): number {
    return this.#getSJd();
  }

  /** @internal */
  mSetJd(jd: number): void {
    this.#jd = jd;
  }

  /** @internal */
  mCanonicalizeJd(): void {
    const j = this.mJd();
    let nth = this.nth;
    let jd = j;
    if (jd < 0) {
      nth = nth - 1n;
      jd += CM_PERIOD;
    }
    if (jd >= CM_PERIOD) {
      nth = nth + 1n;
      jd -= CM_PERIOD;
    }
    this.nth = nth;
    this.mSetJd(jd);
    if (jd !== j) this.#civil = undefined;
  }

  get ajd(): Rational {
    if (simpleDatP(this)) {
      const r = this.mRealJd();
      return new Rational(BigInt(r) * 2n - 1n, 2);
    }

    const r = this.mRealJd();
    const df = this.mDf() - HALF_DAYS_IN_SECONDS;
    let ajd = new Rational(r, 1);
    if (df) ajd = ajd.add(isecToDay(df));
    const sf = this.mSf();
    if (!sf.isZero()) ajd = ajd.add(nsToDay(sf));

    return ajd;
  }

  get amjd(): Rational {
    const r = new Rational(BigInt(this.mRealJd()) - 2400001n, 1);
    if (simpleDatP(this)) return r;

    let amjd = r;
    const df = this.mDf();
    if (df) amjd = amjd.add(isecToDay(df));
    const sf = this.mSf();
    if (!sf.isZero()) amjd = amjd.add(nsToDay(sf));

    return amjd;
  }

  /** @internal */
  mRealJd(): number | bigint {
    return encodeJd(this.nth, this.mJd());
  }

  /** @internal */
  mDf(): number {
    return this.#df ?? 0;
  }

  /** @internal */
  mSf(): Rational {
    return this.#sf ?? new Rational(0, 1);
  }

  /** @internal */
  mOf(): number {
    return this.#of ?? 0;
  }

  /** @internal */
  dNewInternal(nth: bigint, rjd: number, df: number, sf: Rational, of: number): this {
    if (!df && sf.isZero() && !of)
      return new (this.constructor as typeof Date)(SEAT, nth, rjd, this.start) as this;
    return new (this.constructor as typeof Date)(SEAT, nth, rjd, this.start, df, sf, of) as this;
  }

  minus(other: Date | number | bigint | Rational): this | Rational {
    if (other instanceof Date) return minusDd(this, other);
    expectNumeric(other);
    if (other instanceof Rational) return this.plus(other.mul(-1));
    return this.plus(-other);
  }

  nextDay(n: number | bigint | Rational = 1): this {
    return this.plus(n);
  }

  prevDay(n: number | bigint | Rational = 1): this {
    return this.minus(n) as this;
  }

  next(): this {
    return this.nextDay();
  }

  succ(): this {
    return this.next();
  }

  rshift(other: number | bigint | Rational): this {
    const o = typeof other === "number" && !Number.isInteger(other) ? fToR(other) : other;
    const base = BigInt(this.year) * 12n + BigInt(this.mon - 1);
    const t: bigint | Rational =
      o instanceof Rational ? new Rational(base, 1).add(o) : base + BigInt(o);
    let y: number | bigint;
    let m: number;
    if (!(t instanceof Rational)) {
      y = bigNorm(div(t, 12));
      m = Number(mod(t, 12)) + 1;
    } else {
      const d12 = t.denominator * 12n;
      let q = t.numerator / d12;
      if (t.numerator % d12 !== 0n && t.numerator < 0n) q -= 1n;
      y = bigNorm(q);
      m = Number((t.numerator - q * d12) / t.denominator) + 1;
    }
    let d = this.mday;
    const sg = this.start;

    let r: [nth: bigint, rjd: number] | null;
    for (;;) {
      r = validCivilP(y, m, d, sg);
      if (r !== null) break;
      if (--d < 1) throw new DateError("invalid date");
    }
    const [nth, rjd] = r;
    const rjd2 = encodeJd(nth, rjd);
    return this.plus(bigNorm(BigInt(rjd2) - BigInt(this.jd)));
  }

  lshift(other: number | bigint | Rational): this {
    return this.rshift(other instanceof Rational ? other.mul(-1) : -other);
  }

  nextMonth(n: number | bigint | Rational = 1): this {
    return this.rshift(n);
  }

  prevMonth(n: number | bigint | Rational = 1): this {
    return this.lshift(n);
  }

  nextYear(n: number | bigint | Rational = 1): this {
    return this.rshift(fMul12(n));
  }

  prevYear(n: number | bigint | Rational = 1): this {
    return this.lshift(fMul12(n));
  }

  step(limit: Date, step?: number | bigint | Rational): Generator<this>;
  step(
    limit: Date,
    step: number | bigint | Rational | undefined,
    block: (date: this) => void,
  ): this;
  step(
    limit: Date,
    step: number | bigint | Rational = 1,
    block?: (date: this) => void,
  ): this | Generator<this> {
    if (block === undefined) return dLiteStepEnum(this, limit, step) as Generator<this>;
    for (const date of dLiteStepEnum(this, limit, step)) block(date as this);
    return this;
  }

  upto(max: Date): Generator<this>;
  upto(max: Date, block: (date: this) => void): this;
  upto(max: Date, block?: (date: this) => void): this | Generator<this> {
    if (block === undefined) return dLiteUptoEnum(this, max) as Generator<this>;
    for (const date of dLiteUptoEnum(this, max)) block(date as this);
    return this;
  }

  downto(min: Date): Generator<this>;
  downto(min: Date, block: (date: this) => void): this;
  downto(min: Date, block?: (date: this) => void): this | Generator<this> {
    if (block === undefined) return dLiteDowntoEnum(this, min) as Generator<this>;
    for (const date of dLiteDowntoEnum(this, min)) block(date as this);
    return this;
  }

  cmp(other: unknown): number | null {
    if (!(other instanceof Date)) return cmpGen(this, other);

    if (!(simpleDatP(this) && simpleDatP(other) && this.isGregorian === other.isGregorian))
      return cmpDd(this, other);

    this.mCanonicalizeJd();
    other.mCanonicalizeJd();
    const aNth = this.nth;
    const bNth = other.nth;
    if (aNth === bNth) {
      const aJd = this.mJd();
      const bJd = other.mJd();
      if (aJd === bJd) return 0;
      else if (aJd < bJd) return -1;
      else return 1;
    } else if (aNth < bNth) return -1;
    else return 1;
  }

  equals(other: unknown): boolean {
    return this.cmp(other) === 0;
  }

  caseEquals(other: unknown): boolean | null {
    if (!(other instanceof Date)) return equalGen(this, other);

    if (!(this.isGregorian === other.isGregorian)) return equalGen(this, other);

    this.mCanonicalizeJd();
    other.mCanonicalizeJd();
    const aNth = this.nth;
    const bNth = other.nth;
    const aJd = this.mLocalJd();
    const bJd = other.mLocalJd();
    return aNth === bNth && aJd === bJd;
  }

  isEql(other: unknown): boolean {
    if (!(other instanceof Date)) return false;
    return this.cmp(other) === 0;
  }

  hash(): number {
    const h: [bigint, number, number, Rational] = [this.nth, this.mJd(), this.mDf(), this.mSf()];
    let v = 0;
    for (const part of [h[0], h[1], h[2], h[3].numerator, h[3].denominator]) {
      v = Math.imul(v ^ Number(BigInt.asIntN(32, BigInt(part))), 0x01000193) | 0;
    }
    return v;
  }

  toTime(): Temporal.ZonedDateTime {
    const self: Date = this.isJulian ? this.gregorian() : this;
    return new Temporal.PlainDateTime(
      realYearToLong(self.year),
      self.mon,
      self.day,
    ).toZonedDateTime(Temporal.Now.timeZoneId());
  }

  /**
   * Ruby `Date#to_date` (ruby/date, `date_core.c` `date_to_date`, `date_core.c:8977-8981`), which
   * answers the receiver's `::Date` value — `self` in MRI, because MRI's
   * `::Date` value *is* the gem object. trails' `::Date` value is
   * `Temporal.PlainDate` (RFC 0088's mapping table), so `self` is converted to
   * it here. `Temporal.PlainDate` is proleptic Gregorian, so a Julian-only
   * civil date — 1500-02-29, a real day under `Date::ITALY` — has no value to
   * convert to and this raises where the gem-shaped object itself is fine
   * ({@link plainDateFromJd}).
   *
   * **RFC 0088 records the raise as the seat's limit** rather than narrowing
   * the default return to the gem-shaped object for those days: its mapping
   * table names the range, which is every Julian leap day a Gregorian century
   * rule removes — 1500-02-29, 1400-02-29, 1300-02-29 and so on back before
   * the 1582 reform. Every static that answers the seat inherits it, since
   * `Date.civil`, `Date.jd`, `Date.ordinal`, `Date.commercial`, `Date.parse`
   * and `Date.strptime` all end here; a caller who needs those days reads the
   * gem-shaped object from {@link dNewByFrags} instead.
   *
   * **This is the opt-in seam RFC 0088 left open**, and it is a conversion
   * method rather than an options argument or a parallel entry point because
   * the gem already names both directions and neither name is invented: the
   * statics answer Temporal through `to_date` / `to_datetime`, and the
   * exported {@link dNewByFrags} / {@link dtNewByFrags} answer the other
   * direction, as does this method's own inverse — the
   * `Temporal.PlainDate` overload of `Date`'s constructor, and the
   * `Temporal.PlainDateTime` / `Temporal.ZonedDateTime` one on `DateTime`.
   * All of them end at `d_simple_new_internal` (`date_core.c:3036`) exactly as
   * `date_s_jd` (`:3377-3387`) does; the overload adds an entry point to that
   * seat, not a seat.
   *
   * ## The seat renders the CIVIL triple, and loses the absolute day
   *
   * A `Temporal.PlainDate` is built from this receiver's civil year/month/day
   * read in the ISO calendar. For a receiver whose `sg` puts the day on the
   * JULIAN side of the reform, that triple names a DIFFERENT absolute day than
   * the one MRI holds, so every Temporal reader derived from the absolute day
   * disagrees with the gem: `dayOfWeek`, `dayOfYear`, and the commercial
   * triple (`yearOfWeek` / `weekOfYear`). MRI computes those from the Julian
   * day itself — `c_jd_to_commercial` / `c_valid_commercial_p`
   * (`vendor/date/ext/date/date_core.c`) — so `Date.commercial(-4712, 1, 1)`
   * has `cwday` 1 in Ruby while the seat reads `dayOfWeek` 4. `dayOfYear`
   * happens to agree wherever the ISO and Julian leap rules coincide, and has
   * the same defect where they do not (1900 under `Date::JULIAN`).
   *
   * **No seat can satisfy both.** Temporal has no Julian calendar —
   * `@js-temporal/polyfill` rejects `calendar: "julian"` and CLDR ships only
   * `gregory` and `iso8601` — so a `PlainDate` reads as exactly one absolute
   * day. A seat for a Julian-side day can carry the civil triple MRI spells OR
   * the absolute day MRI derives the weekday from, never both. Ruby has no
   * counterpart decision to port: `Date#to_date` returns `self`, and the gem
   * never renders into a second calendar system, so this is a seam trails
   * invents because Temporal exists.
   *
   * This is a **ratified RFC 0088 decision (2026-08-18), not an oversight**:
   * the civil spelling is kept and the divergence accepted. Raising on every
   * Julian-side day was tried and withdrawn — jd 0 (`-4712-01-01`) is
   * Julian-side under the default `ITALY` reform, i.e. the base case of
   * `Date.jd` / `Date.ordinal` / `Date.commercial`, and the guard reddened 30
   * ported gem tests. The narrower raise for a civil spelling ISO rejects
   * outright (`Date.civil(1500, 2, 29)`, above) is untouched.
   *
   * Reopen this if either changes: a Temporal calendar admitting Julian
   * appears, or RFC 0088 decides to seat Julian-side days on the gem-shaped
   * `Date` instead. `test-switch-hitter.test.ts` records the test-side
   * consequence — `test_commercial` / `test_fractional` assert through
   * `toString` rather than the week readers for exactly this reason.
   */
  toDate(): Temporal.PlainDate {
    return plainDateFromJd(encodeJd(this.nth, this.mLocalJd()), this.sg);
  }

  toDatetime(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return new DateTime(SEAT, this.nth, this.mJd(), 0, new Rational(0, 1), 0, this.sg).toDatetime();
  }

  inspect(): string {
    const of = this.mOf();
    const sf = this.mSf();
    return (
      `#<${objClassName(this)}: ${this.toS()} ` +
      `((${this.mRealJd()}j,${this.mDf()}s,${sf.denominator === 1n ? sf.numerator : sf.inspect()}n),` +
      `${of < 0 ? "" : "+"}${of}s,${
        Number.isFinite(this.start) ? this.start.toFixed(0) : this.start > 0 ? "Inf" : "-Inf"
      }j)>`
    );
  }

  toS(): string {
    return this.strftime("%Y-%m-%d");
  }

  asctime(): string {
    return this.strftime("%a %b %e %H:%M:%S %Y");
  }

  ctime(): string {
    return this.asctime();
  }

  iso8601(): string {
    return this.strftime("%Y-%m-%d");
  }

  xmlschema(): string {
    return this.iso8601();
  }

  rfc3339(): string {
    return this.strftime("%Y-%m-%dT%H:%M:%S%:z");
  }

  rfc2822(): string {
    return this.strftime("%a, %-d %b %Y %T %z");
  }

  rfc822(): string {
    return this.rfc2822();
  }

  httpdate(): string {
    const dup = dupObjWithNewOffset(this, 0);
    return dup.strftime("%a, %d %b %Y %T GMT");
  }

  jisx0301(): string {
    const fmt = jisx0301DateFormat(encodeJd(this.nth, this.mLocalJd()), this.year);
    return this.strftime(fmt);
  }

  deconstructKeys(keys: string[] | null): Record<string, unknown> {
    return deconstructKeys(this, keys, false);
  }

  marshalDump(): [bigint, number, number, Rational, number, number] {
    return [this.nth, this.mJd(), this.mDf(), this.mSf(), this.mOf(), this.sg];
  }

  marshalLoad(a: unknown[]): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${objClassName(this)}: ${this.inspect()}`);
    }
    if (!Array.isArray(a)) throw new TypeError("expected an array");

    let nth: bigint;
    let jd: number;
    let df: number;
    let sf: Rational;
    let of: number;
    let sg: number;

    switch (a.length) {
      case 2:
      case 3:
        {
          let ajd: Rational;
          let vof: Rational;
          let vsg: unknown;

          if (a.length === 2) {
            ajd = (a[0] as Rational).add(HALF_DAYS_IN_DAY.mul(-1));
            vof = new Rational(0, 1);
            vsg = a[1];
            if (!kNumericP(vsg)) vsg = vsg != null && vsg !== false ? GREGORIAN : JULIAN;
          } else {
            ajd = a[0] as Rational;
            vof = a[1] as Rational;
            vsg = a[2];
          }

          [nth, jd, df, sf, of, sg] = oldToNew(ajd, vof, Number(vsg));
        }
        break;
      case 6:
        {
          nth = a[0] as bigint;
          jd = Number(a[1]);
          df = Number(a[2]);
          sf = a[3] as Rational;
          of = Number(a[4]);
          sg = Number(a[5]);
        }
        break;
      default:
        throw new TypeError("invalid size");
    }

    this.nth = nth;
    this.#jd = jd;
    this.sg = sg;
    this.#civil = undefined;
    if (df || !sf.isZero() || of) {
      this.#df = df;
      this.#sf = sf;
      this.#of = of;
    } else {
      this.#df = undefined;
      this.#sf = undefined;
      this.#of = undefined;
    }
    return this;
  }

  static Infinity = DateInfinity;

  isInfinite(): false {
    return false;
  }

  strftime(format = "%Y-%m-%d"): string {
    return strftime(
      {
        year: this.year,
        jd: this.mLocalJd(),
        nth: this.nth,
        gregorianP: this.isGregorian,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: 0,
        min: 0,
        sec: 0,
        nsec: new Rational(0, 1),
        zone: "+00:00",
        utcOffset: 0,
      },
      format,
    );
  }
}

/** @internal */
const DateWithoutParseStatics: (new (
  year?: number | bigint,
  month?: number,
  day?: number,
  start?: number,
) => Date) &
  (new (seat: typeof SEAT, nth: bigint, rjd: number, sg: number) => Date) &
  Omit<
    typeof Date,
    | "parse"
    | "strptime"
    | "jd"
    | "ordinal"
    | "civil"
    | "commercial"
    | "weeknum"
    | "nthKday"
    | "today"
    | "rfc2822"
    | "rfc822"
    | "httpdate"
    | "iso8601"
    | "rfc3339"
    | "xmlschema"
    | "jisx0301"
  > = Date;

/** @noRailsEquivalent PERMANENT */
export class DateTime extends DateWithoutParseStatics {
  static override _railsClassName = "DateTime";

  /** @internal */
  #jd?: number;
  #df?: number;

  /** @internal */
  #time?: [rh: number, rmin: number, rs: number];

  /** @internal */
  #civil?: [ry: number, rm: number, rdom: number];
  /** @internal */
  #sf: Rational;
  #of: number;

  constructor(
    year?: number | bigint,
    month?: number,
    day?: number | Rational,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  );
  constructor(date: Temporal.PlainDateTime | Temporal.ZonedDateTime, start?: number);
  /** @internal */
  constructor(
    seat: typeof SEAT,
    nth: bigint,
    rjd: number,
    df: number,
    sf: Rational,
    of: number,
    sg: number,
  );
  constructor(
    year?: number | bigint | typeof SEAT | Temporal.PlainDateTime | Temporal.ZonedDateTime,
    month?: number | bigint,
    day?: number | Rational,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ) {
    if (year instanceof Temporal.PlainDateTime || year instanceof Temporal.ZonedDateTime) {
      const sg = val2sg((month as number) ?? DEFAULT_SG);
      const rof = year instanceof Temporal.ZonedDateTime ? year.offsetNanoseconds / 1000000000 : 0;
      const [nth, ry] = decodeYear(year.year, -1);
      const rjd = cCivilToJd(ry, year.month, year.day, virtualSg(nth, sg));
      const localDf = timeToDf(year.hour, year.minute, year.second);
      super(SEAT, nth, rjd, sg);
      this.#jd = jdLocalToUtc(rjd, localDf, rof);
      this.#df = dfLocalToUtc(localDf, rof);
      this.#sf = new Rational(
        year.millisecond * 1000000 + year.microsecond * 1000 + year.nanosecond,
        1,
      );
      this.#of = rof;
      return;
    }
    if (typeof year === "symbol") {
      const nth = month as bigint;
      const rjd = day as number;
      const df = hour as number;
      const sf = minute as Rational;
      const of = second as number;
      super(SEAT, nth, jdUtcToLocal(rjd, df, of), offset as number);
      this.#jd = rjd;
      this.#df = df;
      this.#sf = sf;
      this.#of = of;
      return;
    }
    if (second !== undefined) checkNumeric(second, "second");
    if (minute !== undefined) checkNumeric(minute, "minute");
    if (hour !== undefined) checkNumeric(hour, "hour");
    if (day !== undefined) checkNumeric(day, "day");
    if (month !== undefined) checkNumeric(month, "month");
    if (year !== undefined) checkNumeric(year, "year");
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [d, dFr] = num2intWithFrac(
      day ?? 1,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (dFr !== 0) fr2 = dFr;
    const rof = offset === undefined ? 0 : val2off(offset);
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    let nth: bigint;
    let rjd = 0;
    let rcivil: [ry: number, rm: number, rd: number] | undefined;
    year ??= -4712;
    if (guessStyle(year, sg) < 0) {
      const r = validGregorianP(year, (month as number) ?? 1, d);
      if (r === null) throw new DateError("invalid date");
      const [rnth, ry, rm, rd] = r;
      nth = rnth;
      rcivil = [ry, rm, rd];
    } else {
      const r = validCivilP(year, (month as number) ?? 1, d, sg);
      if (r === null) throw new DateError("invalid date");
      [nth, rjd] = r;
    }
    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    if (rcivil !== undefined) {
      super(year, (month as number) ?? 1, d, sg);
      this.#civil = rcivil;
    } else {
      const rjd2 = jdLocalToUtc(rjd, timeToDf(rh, rmin, rs), rof);
      super(SEAT, nth, rjd2, sg);
      this.#jd = rjd2;
    }
    this.#time = [rh, rmin, rs];
    this.#sf = new Rational(0, 1);
    this.#of = rof;
    if (fr2 instanceof Rational ? !fr2.isZero() : fr2 !== 0) {
      const [jd, df, sf] = addFrac(this.#getCJd(), this.#getCDf(), fr2);
      return new DateTime(SEAT, nth, jd, df, sf, rof, sg) as this;
    }
  }

  /** @internal */
  #getCJd(): number {
    if (this.#jd === undefined) {
      const [year, mon, mday] = this.#civil as [number, number, number];
      const jd = cCivilToJd(year, mon, mday, virtualSg(this.nth, this.start));
      const [rh, rmin, rs] = this.#time as [number, number, number];
      this.#jd = jdLocalToUtc(jd, timeToDf(rh, rmin, rs), this.#of);
    }
    return this.#jd;
  }

  /** @internal */
  #getCDf(): number {
    if (this.#df === undefined) {
      const [rh, rmin, rs] = this.#time as [number, number, number];
      this.#df = dfLocalToUtc(timeToDf(rh, rmin, rs), this.#of);
    }
    return this.#df;
  }

  static jd(
    jd: number | bigint | Rational = 0,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    const rof = offset === undefined ? 0 : val2off(offset);
    if (second !== undefined) checkNumeric(second, "second");
    if (minute !== undefined) checkNumeric(minute, "minute");
    if (hour !== undefined) checkNumeric(hour, "hour");
    checkNumeric(jd, "jd");
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [rjd, jdFr] = num2numWithFrac(
      jd,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (jdFr !== 0) fr2 = jdFr;

    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    const localDf = timeToDf(rh, rmin, rs);
    const [nth, rrjd] = decodeJd(rjd);
    const [rjd2, df, sf] = addFrac(
      jdLocalToUtc(rrjd, localDf, rof),
      dfLocalToUtc(localDf, rof),
      fr2,
    );
    return new DateTime(SEAT, nth, rjd2, df, sf, rof, sg).toDatetime();
  }

  static ordinal(
    year: number | bigint = -4712,
    yday: number | Rational = 1,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    const rof = offset === undefined ? 0 : val2off(offset);
    if (second !== undefined) checkNumeric(second, "second");
    if (minute !== undefined) checkNumeric(minute, "minute");
    if (hour !== undefined) checkNumeric(hour, "hour");
    checkNumeric(yday, "yday");
    checkNumeric(year, "year");
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [d, dFr] = num2intWithFrac(
      yday,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (dFr !== 0) fr2 = dFr;

    const r = validOrdinalP(year, d, sg);
    if (r === null) throw new DateError("invalid date");
    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    const localDf = timeToDf(rh, rmin, rs);
    const [nth, rrjd] = r;
    const [rjd2, df, sf] = addFrac(
      jdLocalToUtc(rrjd, localDf, rof),
      dfLocalToUtc(localDf, rof),
      fr2,
    );
    return new DateTime(SEAT, nth, rjd2, df, sf, rof, sg).toDatetime();
  }

  static civil(
    year = -4712,
    month = 1,
    mday: number | Rational = 1,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return new DateTime(year, month, mday, hour, minute, second, offset, start).toDatetime();
  }

  static commercial(
    cwyear: number | bigint = -4712,
    cweek = 1,
    cwday: number | Rational = 1,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    const rof = offset === undefined ? 0 : val2off(offset);
    if (second !== undefined) checkNumeric(second, "second");
    if (minute !== undefined) checkNumeric(minute, "minute");
    if (hour !== undefined) checkNumeric(hour, "hour");
    checkNumeric(cwday, "cwday");
    checkNumeric(cweek, "cweek");
    checkNumeric(cwyear, "year");
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [d, dFr] = num2intWithFrac(
      cwday,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (dFr !== 0) fr2 = dFr;

    const r = validCommercialP(cwyear, cweek, d, sg);
    if (r === null) throw new DateError("invalid date");
    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    const localDf = timeToDf(rh, rmin, rs);
    const [nth, rrjd] = r;
    const [rjd2, df, sf] = addFrac(
      jdLocalToUtc(rrjd, localDf, rof),
      dfLocalToUtc(localDf, rof),
      fr2,
    );
    return new DateTime(SEAT, nth, rjd2, df, sf, rof, sg).toDatetime();
  }

  static weeknum(
    year: number | bigint = -4712,
    week = 0,
    day: number | Rational = 1,
    firstday = 0,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    const rof = offset === undefined ? 0 : val2off(offset);
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [d, dFr] = num2intWithFrac(
      day,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (dFr !== 0) fr2 = dFr;

    const r = validWeeknumP(year, week, d, firstday, sg);
    if (r === null) throw new DateError("invalid date");
    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    const localDf = timeToDf(rh, rmin, rs);
    const [nth, rrjd] = r;
    const [rjd2, df, sf] = addFrac(
      jdLocalToUtc(rrjd, localDf, rof),
      dfLocalToUtc(localDf, rof),
      fr2,
    );
    return new DateTime(SEAT, nth, rjd2, df, sf, rof, sg).toDatetime();
  }

  static nthKday(
    year: number | bigint = -4712,
    month = 1,
    n = 1,
    k: number | Rational = 1,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start === undefined ? DEFAULT_SG : val2sg(start);
    const rof = offset === undefined ? 0 : val2off(offset);
    const [s, sFr] = num2intWithFrac(second ?? 0, 1, false);
    const [min, minFr] = num2intWithFrac(
      minute ?? 0,
      MINUTE_IN_SECONDS,
      second !== undefined || offset !== undefined || start !== undefined,
    );
    const [h, hFr] = num2intWithFrac(
      hour ?? 0,
      HOUR_IN_SECONDS,
      minute !== undefined || second !== undefined || offset !== undefined || start !== undefined,
    );
    const [rk, kFr] = num2intWithFrac(
      k,
      DAY_IN_SECONDS,
      hour !== undefined ||
        minute !== undefined ||
        second !== undefined ||
        offset !== undefined ||
        start !== undefined,
    );
    let fr2: number | Rational = 0;
    if (sFr !== 0) fr2 = sFr;
    if (minFr !== 0) fr2 = minFr;
    if (hFr !== 0) fr2 = hFr;
    if (kFr !== 0) fr2 = kFr;

    const r = validNthKdayP(year, month, n, rk, sg);
    if (r === null) throw new DateError("invalid date");
    const rt = cValidTimeP(h, min, s);
    if (rt === null) throw new DateError("invalid date");
    let [rh] = rt;
    const [, rmin, rs] = rt;
    if (rh === 24) {
      rh = 0;
      fr2 = fr2 instanceof Rational ? fr2.add(DAY_IN_SECONDS) : fr2 + DAY_IN_SECONDS;
    }
    const localDf = timeToDf(rh, rmin, rs);
    const [nth, rrjd] = r;
    const [rjd2, df, sf] = addFrac(
      jdLocalToUtc(rrjd, localDf, rof),
      dfLocalToUtc(localDf, rof),
      fr2,
    );
    return new DateTime(SEAT, nth, rjd2, df, sf, rof, sg).toDatetime();
  }

  static now(start = DEFAULT_SG): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const sg = start;
    const tm = Temporal.Now.zonedDateTimeISO();

    const y = tm.year;
    const m = tm.month;
    const d = tm.day;
    const h = tm.hour;
    const min = tm.minute;
    let s = tm.second;
    if (s === 60) s = 59;

    let of = tm.offsetNanoseconds / 1000000000;
    const sf = new Rational(tm.millisecond * 1000000 + tm.microsecond * 1000 + tm.nanosecond, 1);

    if (of < -DAY_IN_SECONDS || of > DAY_IN_SECONDS) {
      of = 0;
      rbWarning("invalid offset is ignored");
    }

    const [nth, ry] = decodeYear(y, -1);

    const rjd = cCivilToJd(ry, m, d, GREGORIAN);
    const df = timeToDf(h, min, s);
    return new DateTime(
      SEAT,
      nth,
      jdLocalToUtc(rjd, df, of),
      dfLocalToUtc(df, of),
      sf,
      of,
      sg,
    ).toDatetime();
  }

  static parse(
    str = JULIAN_EPOCH_DATETIME,
    comp = true,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._parse(str, comp, opt), val2sg(start)).toDatetime();
  }

  static iso8601(
    str = JULIAN_EPOCH_DATETIME,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._iso8601(str, opt), val2sg(start)).toDatetime();
  }

  static rfc3339(
    str = JULIAN_EPOCH_DATETIME,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._rfc3339(str, opt), val2sg(start)).toDatetime();
  }

  static xmlschema(
    str = JULIAN_EPOCH_DATETIME,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._xmlschema(str, opt), val2sg(start)).toDatetime();
  }

  static rfc2822(
    str = JULIAN_EPOCH_DATETIME_RFC3339,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._rfc2822(str, opt), val2sg(start)).toDatetime();
  }

  static rfc822(
    str = JULIAN_EPOCH_DATETIME_RFC3339,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return DateTime.rfc2822(str, start, opt);
  }

  static httpdate(
    str = JULIAN_EPOCH_DATETIME_HTTPDATE,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._httpdate(str, opt), val2sg(start)).toDatetime();
  }

  static jisx0301(
    str = JULIAN_EPOCH_DATETIME,
    start = DEFAULT_SG,
    opt?: ParseOpt,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._jisx0301(str, opt), val2sg(start)).toDatetime();
  }

  static override _strptime(str: string, fmt = "%FT%T%z"): DateParts | null {
    return Date._strptime(str, fmt);
  }

  static strptime(
    str = JULIAN_EPOCH_DATETIME,
    fmt = "%FT%T%z",
    start = DEFAULT_SG,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._strptime(str, fmt), val2sg(start)).toDatetime();
  }

  /** @internal */
  override mLocalJd(): number {
    return jdUtcToLocal(this.#getCJd(), this.#getCDf(), this.#of);
  }

  /** @internal */
  override mJd(): number {
    return this.#getCJd();
  }

  /** @internal */
  override mSetJd(jd: number): void {
    this.#jd = jd;
  }

  /** @internal */
  override mDf(): number {
    return this.#getCDf();
  }

  /** @internal */
  override mSf(): Rational {
    return this.#sf;
  }

  /** @internal */
  override mOf(): number {
    return this.#of;
  }

  /** @internal */
  override dNewInternal(nth: bigint, rjd: number, df: number, sf: Rational, of: number): this {
    return new (this.constructor as typeof DateTime)(
      SEAT,
      nth,
      rjd,
      df,
      sf,
      of,
      this.start,
    ) as this;
  }

  /** @internal */
  override complexDatP(): boolean {
    return true;
  }

  override mLocalDf(): number {
    return dfUtcToLocal(this.#getCDf(), this.#of);
  }

  override get isJulian(): boolean {
    return mJulianP(this.#getCJd(), virtualSg(this.nth, this.start));
  }

  newOffset(offset: number | bigint | Rational | string = 0): this {
    const rof = val2off(offset);
    return new DateTime(
      SEAT,
      this.nth,
      this.#getCJd(),
      this.#getCDf(),
      this.#sf,
      rof,
      this.start,
    ) as this;
  }

  override newStart(start = DEFAULT_SG): this {
    return new (this.constructor as typeof DateTime)(
      SEAT,
      this.nth,
      this.#getCJd(),
      this.#getCDf(),
      this.#sf,
      this.#of,
      val2sg(start),
    ) as this;
  }

  override dat(): DateData {
    return {
      nth: this.nth,
      jd: this.#jd,
      df: this.#df,
      sf: this.#sf,
      of: this.#of,
      sg: this.start,
      civil: this.#civil,
      time: this.#time,
    };
  }

  override initializeCopy(date: Date): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${objClassName(this)}: ${this.inspect()}`);
    }
    if ((this as Date) === date) return this;
    const bdat = date.dat();
    this.nth = bdat.nth;
    if (simpleDatP(date)) {
      this.#jd = bdat.jd ?? date.mLocalJd();
      this.#df = 0;
      this.#sf = new Rational(0, 1);
      this.#of = 0;
      this.#civil = bdat.civil;
      this.#time = undefined;
    } else {
      this.#jd = bdat.jd;
      this.#df = bdat.df;
      this.#sf = bdat.sf!;
      this.#of = bdat.of!;
      this.#civil = bdat.civil;
      this.#time = bdat.time;
    }
    this.sg = bdat.sg;
    return this;
  }

  override marshalLoad(a: unknown[]): this {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${objClassName(this)}: ${this.inspect()}`);
    }
    if (!Array.isArray(a)) throw new TypeError("expected an array");

    let nth: bigint;
    let jd: number;
    let df: number;
    let sf: Rational;
    let of: number;
    let sg: number;

    switch (a.length) {
      case 2:
      case 3:
        {
          let ajd: Rational;
          let vof: Rational;
          let vsg: unknown;

          if (a.length === 2) {
            ajd = (a[0] as Rational).add(HALF_DAYS_IN_DAY.mul(-1));
            vof = new Rational(0, 1);
            vsg = a[1];
            if (!kNumericP(vsg)) vsg = vsg != null && vsg !== false ? GREGORIAN : JULIAN;
          } else {
            ajd = a[0] as Rational;
            vof = a[1] as Rational;
            vsg = a[2];
          }

          [nth, jd, df, sf, of, sg] = oldToNew(ajd, vof, Number(vsg));
        }
        break;
      case 6:
        {
          nth = a[0] as bigint;
          jd = Number(a[1]);
          df = Number(a[2]);
          sf = a[3] as Rational;
          of = Number(a[4]);
          sg = Number(a[5]);
        }
        break;
      default:
        throw new TypeError("invalid size");
    }

    this.nth = nth;
    this.#jd = jd;
    this.#df = df;
    this.#sf = sf;
    this.#of = of;
    this.sg = sg;
    this.#civil = undefined;
    this.#time = undefined;
    return this;
  }

  override dup(): this {
    return (
      new (this.constructor as typeof DateTime)(
        SEAT,
        0n,
        0,
        0,
        new Rational(0, 1),
        0,
        DEFAULT_SG,
      ) as this
    ).initializeCopy(this);
  }

  override toTime(): Temporal.ZonedDateTime {
    const self: DateTime = this.isJulian ? this.gregorian() : this;
    const ns = Number(self.#sf.numerator / self.#sf.denominator);
    return new Temporal.PlainDateTime(
      realYearToLong(self.year),
      self.mon,
      self.day,
      self.hour,
      self.min,
      self.sec,
      Math.floor(ns / 1000000),
      Math.floor(ns / 1000) % 1000,
      ns % 1000,
    ).toZonedDateTime(of2str(self.#of));
  }

  override toDate(): Temporal.PlainDate {
    return new Date(SEAT, this.nth, this.mLocalJd(), this.start).toDate();
  }

  toDatetime(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    const [h, min, s] = dfToTime(this.mLocalDf());
    const ns = Number(this.#sf.numerator / this.#sf.denominator);
    const plain = this.toDate().toPlainDateTime({
      hour: h,
      minute: min,
      second: s,
      millisecond: Math.floor(ns / 1000000),
      microsecond: Math.floor(ns / 1000) % 1000,
      nanosecond: ns % 1000,
    });
    if (this.#of === 0) return plain;
    return plain.toZonedDateTime(of2str(this.#of));
  }

  get hour(): number {
    return dfToTime(this.mLocalDf())[0];
  }

  get min(): number {
    return dfToTime(this.mLocalDf())[1];
  }

  get sec(): number {
    return dfToTime(this.mLocalDf())[2];
  }

  get secFraction(): Rational {
    return nsToSec(this.#sf);
  }

  get zone(): string {
    return of2str(this.#of);
  }

  get offset(): Rational {
    return new Rational(this.#of, DAY_IN_SECONDS);
  }

  override toS(): string {
    return this.strftime("%Y-%m-%dT%H:%M:%S%:z");
  }

  /** @internal */
  #iso8601Timediv(n: number): string {
    let fmt = "T%H:%M:%S";
    if (n > 0) fmt += `.%${n}N`;
    fmt += "%:z";
    return this.strftime(fmt);
  }

  iso8601(n = 0): string {
    n = num2long(n);
    return this.strftime("%Y-%m-%d") + this.#iso8601Timediv(n);
  }

  xmlschema(n = 0): string {
    return this.iso8601(n);
  }

  override rfc3339(n = 0): string {
    return this.iso8601(n);
  }

  override jisx0301(n = 0): string {
    n = num2long(n);
    return super.jisx0301() + this.#iso8601Timediv(n);
  }

  override deconstructKeys(keys: string[] | null): Record<string, unknown> {
    return deconstructKeys(this, keys, true);
  }

  override strftime(format = "%Y-%m-%dT%H:%M:%S%:z"): string {
    return strftime(
      {
        year: this.year,
        jd: this.mLocalJd(),
        nth: this.nth,
        gregorianP: this.isGregorian,
        mon: this.mon,
        day: this.day,
        wday: this.wday,
        yday: this.yday,
        hour: this.hour,
        min: this.min,
        sec: this.sec,
        nsec: this.#sf,
        zone: this.zone,
        utcOffset: this.#of,
      },
      format,
    );
  }
}
