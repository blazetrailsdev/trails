import { Rational } from "@blazetrails/ruby-compat";
import { ERANGE } from "./date.js";
import { rbTimeZoneAbbreviation, type Time } from "./time.js";

/**
 * The `struct vtm` fields `rb_strftime` reads (`vendor/ruby/v3.3.11/timev.h:5-22`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StrftimeVtm {
  year: number;
  mon: number;
  mday: number;
  hour: number;
  min: number;
  sec: number;
  wday: number;
  yday: number;
  utcOffset: number;
  zone: unknown;
}

const LEFT = 0;
const CHCASE = 1;
const LOWER = 2;
const UPPER = 3;

function BIT_OF(n: number): number {
  return 1 << n;
}

const INT_MAX = 2147483647;

function range(low: number, item: number, hi: number): number {
  return Math.max(low, Math.min(item, hi));
}

function div(x: number, y: number): number {
  return Math.floor(x / y);
}

function mod(x: number, y: number): number {
  return x - Math.floor(x / y) * y;
}

/** `case_conv` (`vendor/ruby/v3.3.11/strftime.c:199-218`). */
function caseConv(s: string, flags: number): string {
  switch (flags & (BIT_OF(UPPER) | BIT_OF(LOWER))) {
    case BIT_OF(UPPER):
      return s.replace(/[a-z]+/g, (c) => c.toUpperCase());
    case BIT_OF(LOWER):
      return s.replace(/[A-Z]+/g, (c) => c.toLowerCase());
    default:
      return s;
  }
}

function printfD(zero: boolean, width: number, val: number | bigint): string {
  const negative = val < 0;
  const digits = String(negative ? -val : val);
  if (zero) return (negative ? "-" : "") + digits.padStart(width - (negative ? 1 : 0), "0");
  return ((negative ? "-" : "") + digits).padStart(width, " ");
}

function printfSigned(width: boolean, precision: number, val: number): string {
  const sign = val < 0 ? "-" : "+";
  const digits = String(Math.abs(val));
  if (width) return (sign + digits).padStart(precision, " ");
  return sign + digits.padStart(precision, "0");
}

const daysL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthsL = [
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
const ampm = ["AM", "PM"];

/**
 * `rb_strftime_with_timespec` (`vendor/ruby/v3.3.11/strftime.c:233-917`), on its
 * `timev` arm: `ts` is always `NULL`, as `rb_strftime` passes it.
 */
function rbStrftimeWithTimespec(
  ftime: { s: string; capacity: number },
  format: string,
  time: Time,
  vtm: StrftimeVtm,
  timev: Rational,
  gmt: boolean,
  maxsize: number,
): boolean {
  const formatEnd = format.length;
  let zone: string | null = null;

  if (formatEnd === 0) return false;

  const NEEDS = (n: number): void => {
    if (ftime.s.length >= ftime.capacity || n >= ftime.capacity - ftime.s.length - 1) {
      const nlen = ftime.s.length + n * 2;
      if (nlen > maxsize) throw new ERANGE(format);
      ftime.capacity = nlen;
    }
  };

  let f = 0;
  while (f < formatEnd) {
    let tp = format.indexOf("%", f);
    if (tp === -1) tp = formatEnd;
    NEEDS(tp - f);
    ftime.s += format.slice(f, tp);
    f = tp;
    if (f === formatEnd) break;
    const sp = f;
    let precision = -1;
    let flags = 0;
    let padding = "";
    let colons = 0;
    let i = 0;
    let text = "";

    const FILL_PADDING = (n: number): void => {
      if (!(flags & BIT_OF(LEFT)) && precision > n) {
        NEEDS(precision);
        ftime.s += (padding === "" ? " " : padding).repeat(precision - n);
      } else {
        NEEDS(n);
      }
    };
    const FMT_PRECISION = (defPrec: number): number =>
      flags & BIT_OF(LEFT) ? 1 : precision <= 0 ? defPrec : precision;
    const FMT = (defPad: string, defPrec: number, val: number | bigint): void => {
      precision = FMT_PRECISION(defPrec);
      NEEDS(precision);
      ftime.s += printfD(padding === "0" || (padding === "" && defPad === "0"), precision, val);
      ftime.capacity = Math.max(ftime.capacity, ftime.s.length);
    };
    const FMTV = (defPad: string, defPrec: number, val: number | bigint): void => {
      if (typeof val === "number") return FMT(defPad, defPrec, val);
      precision = FMT_PRECISION(defPrec);
      if (padding === "") padding = defPad;
      const tmp = String(val);
      FILL_PADDING(tmp.length);
      ftime.s += tmp;
      ftime.capacity = Math.max(ftime.capacity, ftime.s.length);
    };
    const STRFTIME = (fmt: string): boolean => {
      const len = ftime.s.length;
      if (!rbStrftimeWithTimespec(ftime, fmt, time, vtm, timev, gmt, maxsize)) return false;
      const s = caseConv(ftime.s.slice(len), flags);
      const n = s.length;
      ftime.s = ftime.s.slice(0, len);
      if (precision > n) {
        NEEDS(precision);
        ftime.s += (padding === "" ? " " : padding).repeat(precision - n);
      }
      ftime.s += s;
      return true;
    };

    let unknown = false;
    again: for (;;) {
      if (++f >= formatEnd) {
        unknown = true;
        break;
      }
      switch (format[f]) {
        case "%":
          FILL_PADDING(1);
          ftime.s += "%";
          break again;
        case "a":
          if (flags & BIT_OF(CHCASE)) {
            flags &= ~(BIT_OF(LOWER) | BIT_OF(CHCASE));
            flags |= BIT_OF(UPPER);
          }
          if (vtm.wday > 6) {
            i = 1;
            text = "?";
          } else {
            i = 3;
            text = daysL[vtm.wday].slice(0, 3);
          }
          break again;
        case "A":
          if (flags & BIT_OF(CHCASE)) {
            flags &= ~(BIT_OF(LOWER) | BIT_OF(CHCASE));
            flags |= BIT_OF(UPPER);
          }
          if (vtm.wday > 6) {
            i = 1;
            text = "?";
          } else {
            i = (text = daysL[vtm.wday]).length;
          }
          break again;
        case "h":
        case "b":
          if (flags & BIT_OF(CHCASE)) {
            flags &= ~(BIT_OF(LOWER) | BIT_OF(CHCASE));
            flags |= BIT_OF(UPPER);
          }
          if (vtm.mon < 1 || vtm.mon > 12) {
            i = 1;
            text = "?";
          } else {
            i = 3;
            text = monthsL[vtm.mon - 1].slice(0, 3);
          }
          break again;
        case "B":
          if (flags & BIT_OF(CHCASE)) {
            flags &= ~(BIT_OF(LOWER) | BIT_OF(CHCASE));
            flags |= BIT_OF(UPPER);
          }
          if (vtm.mon < 1 || vtm.mon > 12) {
            i = 1;
            text = "?";
          } else {
            i = (text = monthsL[vtm.mon - 1]).length;
          }
          break again;
        case "c":
          if (!STRFTIME("%a %b %e %H:%M:%S %Y")) return false;
          break again;
        case "d":
          FMT("0", 2, range(1, vtm.mday, 31));
          break again;
        case "H":
          FMT("0", 2, range(0, vtm.hour, 23));
          break again;
        case "I": {
          let h = range(0, vtm.hour, 23);
          if (h === 0) h = 12;
          else if (h > 12) h -= 12;
          FMT("0", 2, h);
          break again;
        }
        case "j":
          FMT("0", 3, range(1, vtm.yday, 366));
          break again;
        case "m":
          FMT("0", 2, range(1, vtm.mon, 12));
          break again;
        case "M":
          FMT("0", 2, range(0, vtm.min, 59));
          break again;
        case "p":
        case "P":
          if (
            (format[f] === "p" && flags & BIT_OF(CHCASE)) ||
            (format[f] === "P" && !(flags & (BIT_OF(CHCASE) | BIT_OF(UPPER))))
          ) {
            flags &= ~(BIT_OF(UPPER) | BIT_OF(CHCASE));
            flags |= BIT_OF(LOWER);
          }
          text = range(0, vtm.hour, 23) < 12 ? ampm[0] : ampm[1];
          i = 2;
          break again;
        case "s": {
          const sec = timev.div(1);
          FMTV("0", 1, Number.isSafeInteger(sec) ? sec : BigInt(sec));
          break again;
        }
        case "S":
          FMT("0", 2, range(0, vtm.sec, 60));
          break again;
        case "U":
          FMT("0", 2, weeknumberV(vtm, 0));
          break again;
        case "w":
          FMT("0", 1, range(0, vtm.wday, 6));
          break again;
        case "W":
          FMT("0", 2, weeknumberV(vtm, 1));
          break again;
        case "x":
          if (!STRFTIME("%m/%d/%y")) return false;
          break again;
        case "X":
          if (!STRFTIME("%H:%M:%S")) return false;
          break again;
        case "y":
          FMT("0", 2, mod(vtm.year, 100));
          break again;
        case "Y":
          FMT("0", 0 <= vtm.year ? 4 : 5, vtm.year);
          break again;
        case "z": {
          let off = gmt ? 0 : Math.sign(vtm.utcOffset) * Math.round(Math.abs(vtm.utcOffset));
          let sign: number;
          if (off < 0 || (gmt && flags & BIT_OF(LEFT))) {
            off = -off;
            sign = -1;
          } else {
            sign = +1;
          }
          switch (colons) {
            case 0:
              precision = precision <= 5 ? 2 : precision - 3;
              NEEDS(precision + 3);
              break;
            case 1:
              precision = precision <= 6 ? 2 : precision - 4;
              NEEDS(precision + 4);
              break;
            case 2:
              precision = precision <= 9 ? 2 : precision - 7;
              NEEDS(precision + 7);
              break;
            case 3:
              if (off % 3600 === 0) {
                precision = precision <= 3 ? 2 : precision - 1;
                NEEDS(precision + 3);
              } else if (off % 60 === 0) {
                precision = precision <= 6 ? 2 : precision - 4;
                NEEDS(precision + 4);
              } else {
                precision = precision <= 9 ? 2 : precision - 7;
                NEEDS(precision + 9);
              }
              break;
            default:
              f--;
              unknown = true;
              break again;
          }
          let hh = printfSigned(
            padding === " ",
            precision + (padding === " " ? 1 : 0),
            sign * Math.trunc(off / 3600),
          );
          if (sign < 0 && off < 3600) {
            const at = padding === " " ? hh.length - 2 : 0;
            hh = hh.slice(0, at) + "-" + hh.slice(at + 1);
          }
          ftime.s += hh;
          off = off % 3600;
          if (colons === 3 && off === 0) break again;
          if (1 <= colons) ftime.s += ":";
          ftime.s += String(Math.trunc(off / 60)).padStart(2, "0");
          off = off % 60;
          if (colons === 3 && off === 0) break again;
          if (2 <= colons) ftime.s += ":" + String(off).padStart(2, "0");
          break again;
        }
        case "Z":
          if (flags & BIT_OF(CHCASE)) {
            flags &= ~(BIT_OF(UPPER) | BIT_OF(CHCASE));
            flags |= BIT_OF(LOWER);
          }
          if (gmt) {
            i = 3;
            text = "UTC";
            break again;
          }
          if (vtm.zone == null) {
            i = 0;
          } else {
            zone ??= rbTimeZoneAbbreviation(vtm.zone, time);
            text = zone;
            i = text.length;
          }
          break again;
        case "n":
          FILL_PADDING(1);
          ftime.s += "\n";
          break again;
        case "t":
          FILL_PADDING(1);
          ftime.s += "\t";
          break again;
        case "D":
          if (!STRFTIME("%m/%d/%y")) return false;
          break again;
        case "e":
          FMT(" ", 2, range(1, vtm.mday, 31));
          break again;
        case "r":
          if (!STRFTIME("%I:%M:%S %p")) return false;
          break again;
        case "R":
          if (!STRFTIME("%H:%M")) return false;
          break again;
        case "T":
          if (!STRFTIME("%H:%M:%S")) return false;
          break again;
        case "k":
          FMT(" ", 2, range(0, vtm.hour, 23));
          break again;
        case "l": {
          let h = range(0, vtm.hour, 23);
          if (h === 0) h = 12;
          else if (h > 12) h -= 12;
          FMT(" ", 2, h);
          break again;
        }
        case "v":
          if (!STRFTIME("%e-%^b-%4Y")) return false;
          break again;
        case "C":
          FMTV("0", 2, div(vtm.year, 100));
          break again;
        case "E":
          if (format[f + 1] === undefined || !"cCxXyY".includes(format[f + 1])) {
            unknown = true;
            break again;
          }
          continue again;
        case "O":
          if (format[f + 1] === undefined || !"deHkIlmMSuUVwWy".includes(format[f + 1])) {
            unknown = true;
            break again;
          }
          continue again;
        case "V":
          FMT("0", 2, iso8601wknumV(vtm));
          break again;
        case "u":
          FMT("0", 1, vtm.wday === 0 ? 7 : vtm.wday);
          break again;
        case "G":
        case "g": {
          let yv = vtm.year;
          const w = iso8601wknumV(vtm);
          if (vtm.mon === 12 && w === 1) yv = yv + 1;
          else if (vtm.mon === 1 && w >= 52) yv = yv - 1;
          if (format[f] === "G") FMT("0", 0 <= yv ? 4 : 5, yv);
          else FMT("0", 2, mod(yv, 100));
          break again;
        }
        case "L":
        case "N": {
          const w = format[f] === "L" ? 3 : 9;
          if (precision <= 0) precision = w;
          NEEDS(precision);
          const subsec = timev.mod(1);
          let ww = precision;
          let n = subsec.numerator;
          while (9 <= ww) {
            n *= 1000000000n;
            ww -= 9;
          }
          n *= 10n ** BigInt(ww);
          const q = n / subsec.denominator;
          ftime.s += String(q).padStart(precision, "0");
          break again;
        }
        case "F":
          if (!STRFTIME("%Y-%m-%d")) return false;
          break again;
        case "-":
          if (precision > 0) {
            unknown = true;
            break again;
          }
          flags |= BIT_OF(LEFT);
          padding = "";
          precision = 0;
          continue again;
        case "^":
          if (precision > 0) {
            unknown = true;
            break again;
          }
          flags |= BIT_OF(UPPER);
          continue again;
        case "#":
          if (precision > 0) {
            unknown = true;
            break again;
          }
          flags |= BIT_OF(CHCASE);
          continue again;
        case "_":
          if (precision > 0) {
            unknown = true;
            break again;
          }
          padding = " ";
          continue again;
        case ":":
          for (colons = 1; colons <= 3; ++colons) {
            if (f + colons >= formatEnd) {
              unknown = true;
              break again;
            }
            if (format[f + colons] === "z") break;
            if (format[f + colons] !== ":") {
              unknown = true;
              break again;
            }
          }
          f += colons - 1;
          continue again;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          if (format[f] === "0") padding = "0";
          let e = f;
          while (e < formatEnd && format[e] >= "0" && format[e] <= "9") e++;
          const u = Number(format.slice(f, e));
          if (u > INT_MAX) {
            unknown = true;
            break again;
          }
          precision = u;
          f = e - 1;
          continue again;
        }
        default:
          unknown = true;
          break again;
      }
    }

    if (unknown) {
      if (f >= formatEnd) return false;
      text = format.slice(sp, f + 1);
      i = text.length;
      precision = -1;
      flags = 0;
      padding = "";
    }
    if (i) {
      FILL_PADDING(i);
      ftime.s += caseConv(text, flags);
    }
    f++;
  }
  return true;
}

/** `strftime_size_limit` (`vendor/ruby/v3.3.11/strftime.c:919-926`). */
function strftimeSizeLimit(formatLen: number): number {
  const limit = formatLen * (1 * 1024 * 1024);
  if (limit < 1024) return 1024;
  return limit;
}

/**
 * `rb_strftime` (`vendor/ruby/v3.3.11/strftime.c:928-936`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbStrftime(
  format: string,
  time: Time,
  vtm: StrftimeVtm,
  timev: Rational,
  gmt: boolean,
): string | null {
  const result = { s: "", capacity: 0 };
  if (
    !rbStrftimeWithTimespec(result, format, time, vtm, timev, gmt, strftimeSizeLimit(format.length))
  )
    return null;
  return result.s;
}

/** `isleap` (`vendor/ruby/v3.3.11/strftime.c:962-966`). */
function isleap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

interface Tm {
  tmYear: number;
  tmMon: number;
  tmMday: number;
  tmWday: number;
  tmYday: number;
}

/** `vtm2tm_noyear` (`vendor/ruby/v3.3.11/strftime.c:969-992`). */
function vtm2tmNoyear(vtm: StrftimeVtm): Tm {
  return {
    tmYear: mod(vtm.year, 400) + 100,
    tmMon: vtm.mon - 1,
    tmMday: vtm.mday,
    tmWday: vtm.wday,
    tmYday: vtm.yday - 1,
  };
}

/** `iso8601wknum` (`vendor/ruby/v3.3.11/strftime.c:997-1102`). */
function iso8601wknum(timeptr: Tm): number {
  let weeknum = weeknumber(timeptr, 1);
  let jan1day = timeptr.tmWday - (timeptr.tmYday % 7);
  if (jan1day < 0) jan1day += 7;

  switch (jan1day) {
    case 1:
      break;
    case 2:
    case 3:
    case 4:
      weeknum++;
      break;
    case 5:
    case 6:
    case 0:
      if (weeknum === 0) {
        const dec31ly: Tm = { ...timeptr };
        dec31ly.tmYear--;
        dec31ly.tmMon = 11;
        dec31ly.tmMday = 31;
        dec31ly.tmWday = jan1day === 0 ? 6 : jan1day - 1;
        dec31ly.tmYday = 364 + (isleap(dec31ly.tmYear + 1900) ? 1 : 0);
        weeknum = iso8601wknum(dec31ly);
      }
      break;
  }

  if (timeptr.tmMon === 11) {
    const wday = timeptr.tmWday;
    const mday = timeptr.tmMday;
    if (
      (wday === 1 && mday >= 29 && mday <= 31) ||
      (wday === 2 && (mday === 30 || mday === 31)) ||
      (wday === 3 && mday === 31)
    )
      weeknum = 1;
  }
  return weeknum;
}

/** `iso8601wknum_v` (`vendor/ruby/v3.3.11/strftime.c:1104-1110`). */
function iso8601wknumV(vtm: StrftimeVtm): number {
  return iso8601wknum(vtm2tmNoyear(vtm));
}

/** `weeknumber` (`vendor/ruby/v3.3.11/strftime.c:1118-1134`). */
function weeknumber(timeptr: Tm, firstweekday: number): number {
  let wday = timeptr.tmWday;
  if (firstweekday === 1) {
    if (wday === 0) wday = 6;
    else wday--;
  }
  let ret = Math.trunc((timeptr.tmYday + 7 - wday) / 7);
  if (ret < 0) ret = 0;
  return ret;
}

/** `weeknumber_v` (`vendor/ruby/v3.3.11/strftime.c:1136-1142`). */
function weeknumberV(vtm: StrftimeVtm, firstweekday: number): number {
  return weeknumber(vtm2tmNoyear(vtm), firstweekday);
}
