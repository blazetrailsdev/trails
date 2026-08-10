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
 * `packages/i18n/src/backend/base.ts:245-271`). These wrappers are that duck type, and `Date`'s
 * lack of `sec`/`hour` is the distinction Ruby gets from `Date` not being a
 * `Time`.
 *
 * This lives in `packages/date` rather than `packages/i18n` or
 * `packages/activesupport` because it is Ruby's stdlib `date`, not i18n: the
 * gem ships no date implementation, and `packages/date` is a dependency of
 * both.
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
  year: number | bigint;
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

/**
 * @internal The fields above, read off a `Temporal` value. `date_strftime.c`
 * reads them off the `tmx` the receiver fills in (`date_core.c:7136-7160`), and
 * Ruby's `::Date`/`::Time` *are* those readers — so the gem needs no such seam
 * and this one is trails-only. It is not exported: `strftime` below is the only
 * caller, so a `Temporal` value formats through the same one function as the
 * gem-shaped object rather than through a wrapper class of its own.
 *
 * A `PlainDate` answers the gem's own `::Date` fields — midnight, and `::Date`'s
 * `"+00:00"` zone spelling (`d_lite_strftime`'s `of` of 0) — while a
 * `ZonedDateTime` carries its real offset, which `of2str` spells the way
 * `::DateTime#zone` does.
 *
 * `wday` and `yday` come off the Julian day, as {@link Date#wday} and
 * {@link Date#yday} do, NOT off `Temporal`'s `dayOfWeek`/`dayOfYear`: those are
 * proleptic Gregorian, and the civil triple here means the same date
 * `Date.new` does — read under `Date::ITALY`. Reading them off `Temporal`
 * instead would put `%A` two days from `%s` for a pre-reform subject, since
 * {@link epochSeconds} is the Julian day's.
 */
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

/**
 * @internal `%s`'s value — `tmx_m_secs` (`date_core.c:7103-7116`), which
 * `date_strftime.c:359-361` reads through the `secs` slot of the `tmx_funcs`
 * table. It computes the value from the receiver's own fields rather than
 * reading a `to_i` off it, which is what lets `::Date` (midnight, UTC) answer
 * `%s` at all: `day_to_sec(real_jd - UNIX_EPOCH_IN_CJD)` plus the day-fraction,
 * both in UTC — the subject's are local, so `utcOffset` comes back off.
 *
 * The day is the Julian day, not a `Temporal.PlainDateTime`'s epoch: the two
 * part company before the calendar reform, where MRI puts 0001-01-01T00:00:00Z
 * at -62135769600 and the proleptic Gregorian reading two days later.
 */
function epochSeconds(subject: StrftimeSubject): number {
  return (
    (mLocalJd(subject) - UNIX_EPOCH_IN_CJD) * DAY_IN_SECONDS +
    timeToDf(subject.hour, subject.min, subject.sec) -
    subject.utcOffset
  );
}

/**
 * @internal `tmx_m_msecs` (`date_core.c:7120-7132`), which `%Q`
 * (`date_strftime.c:354-356`) reads: `sec_to_ms(tmx_m_secs)` plus the
 * sub-second's whole milliseconds. `FMTV`'s `"%d"` truncates a fractional
 * millisecond, so the division is integer here.
 */
function msecs(subject: StrftimeSubject): number {
  return Number(
    (subject.nsec.numerator * 1000n) / (subject.nsec.denominator * BigInt(SECOND_IN_NANOSECONDS)),
  );
}

/**
 * @internal `m_local_jd` (`date_core.c:1485-1497`), the Julian day the
 * week-number readers below work off. The subject carries the civil date and no
 * `df`, so the `complex_dat_p` arm's `local_jd` shift has no bearer and the
 * conversion is {@link cCivilToJd} over it. The subject carries the REAL year,
 * `nth` and all, where the C's `c_civil_to_jd` takes the residue `int`, so the
 * conversion back is where the magnitude drops — as it does in the C's own
 * `int` day, which is what these week readers are defined over.
 */
function mLocalJd(subject: StrftimeSubject): number {
  return cCivilToJd(Number(subject.year), subject.mon, subject.day);
}

/**
 * @internal `m_cwyear` (`date_core.c:1848-1856`), which reaches `%G`
 * (`date_strftime.c:238`) and `%g` (`date_strftime.c:251`) as the `cwyear` slot
 * of the `tmx_funcs` table (`date_core.c:7153`, through `m_real_cwyear`) that
 * `tmx_cwyear` (`date_tmx.h:35`) reads.
 */
function cwyear(subject: StrftimeSubject): number {
  const [ry] = cJdToCommercial(mLocalJd(subject));
  return ry;
}

/**
 * @internal `m_cweek` (`date_core.c:1876-1884`), which reaches `%V`
 * (`date_strftime.c:391`) as the `cweek` slot of the `tmx_funcs` table
 * (`date_core.c:7154`) that `tmx_cweek` (`date_tmx.h:36`) reads.
 */
function cweek(subject: StrftimeSubject): number {
  const [, rw] = cJdToCommercial(mLocalJd(subject));
  return rw;
}

/**
 * @internal `m_wnumx` (`date_core.c:1897-1905`) — `%U` is `f == 0`, which
 * `m_wnum0` (`date_core.c:1907-1911`) passes, and `%W` is `f == 1`, which
 * `m_wnum1` (`date_core.c:1913-1917`) passes; `date_strftime.c:381` picks
 * between the two.
 */
function wnumx(subject: StrftimeSubject, f: number): number {
  const [, rw] = cJdToWeeknum(mLocalJd(subject), f);
  return rw;
}

/**
 * @internal `date_strftime.c`'s `%z` arm (`date_strftime.c:625-716`), which
 * picks its spelling from how many colons preceded the directive: none is
 * `"+0900"`, one is `"+09:00"`, two is `"+09:00:00"`, and three is the shortest
 * form that loses nothing — MRI shows the minute and second only when they are
 * nonzero, so `+09:00:00` is `"+09"` while `+05:30` stays `"+05:30"`. All four
 * come off the one offset in seconds, which is why the subject carries a number
 * rather than a string: `%::z` and `%:::z` are the only spellings that can show
 * a sub-minute offset.
 *
 * Unlike every other arm this one does its own width arithmetic rather than
 * going through `FMT`: the width counts the whole rendering, so the C subtracts
 * the punctuation the spelling will add and pads the HOUR field with what is
 * left. `hw` is the hour field's own default width, which the `-` flag narrows
 * to one column for a single-digit hour.
 */
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

/**
 * @internal `date_strftime.c`'s `FMT` macro (`date_strftime.c:105-116`): the
 * directive's own width, defaulting to `defPrec` and collapsed to a single
 * column by the `-` flag, with the arm's own default padding character unless
 * the format string named one.
 */
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

/**
 * @internal `date_strftime.c`'s `FLAG_FOUND` macro
 * (`date_strftime.c:90-93`), which sends a `-` or `_` that follows a width — or
 * a locale extension — straight to `unknown:`, so MRI answers `%3-S` verbatim
 * where `%-3S` is `8`. Its `BIT_OF(COLONS)` arm is the one with no bearer here:
 * `%:` only ever sets the flag on its way to `z`, which is a directive.
 */
function flagFound(precision: number, localeE: boolean, localeO: boolean): boolean {
  return precision > 0 || localeE || localeO;
}

/**
 * @internal `date_strftime.c`'s `FILL_PADDING` macro
 * (`date_strftime.c:95-104`), and the same left-fill the `STRFTIME` macro
 * (`date_strftime.c:117-133`) applies to a recursively expanded format: the
 * blanks that carry an already-formatted `i`-column answer out to the
 * requested width.
 */
function fillPadding(padding: string, left: boolean, precision: number, i: number): string {
  if (!left && precision > i) return (padding === "" ? " " : padding).repeat(precision - i);
  return "";
}

/**
 * @internal `date_strftime.c`'s shared `%L`/`%N` arm
 * (`date_strftime.c:275-315`): the directive's own width prefix, defaulting to
 * `3` for `%L` and `9` for `%N`, scales `tmx_sec_fraction` by `10**precision`
 * and integer-divides — so the answer is the LEADING `precision` digits of the
 * fraction, truncated rather than rounded, zero-padded on the left when the
 * fraction is small and on the right when the width outruns it.
 *
 * The subject's `nsec` is the same `sf` the C holds — a `Rational` wherever the
 * value carries a sub-nanosecond tail — so the arm is exact at any width, as
 * `mul`/`div` (`date_strftime.c:288-303`) are.
 *
 * The C's two operations are `f = mul(f, INT2FIX(10**precision))` then
 * `div(f, INT2FIX(1))`, and they cannot be written that way here: `10**30` is
 * not a JS integer and the product leaves `Number.MAX_SAFE_INTEGER` long before
 * the widths MRI accepts. Long division over the fraction's own numerator and
 * denominator emits the same digits under numbers that stay exact — the C's
 * scale-and-floor through a double would also drop `299999999` to `299999998`.
 */
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

/** @internal C's `INT_MAX` from `limits.h`, the first half of `date_strftime.c:579`'s
 *  precision rejection. */
const INT_MAX = 2147483647;

/**
 * Ruby `Errno::ERANGE`, the `SystemCallError` `date_strftime_alloc` raises
 * through `rb_sys_fail(format)` (`date_core.c:7095`) when the formatter cannot
 * render a directive inside the buffer it is willing to grow to.
 *
 * @noRailsEquivalent PERMANENT — Ruby core, like the `Rational` above. Rails
 * defines no `Errno`; it inherits Ruby's, and `Date#strftime` raises this one.
 */
export class ERANGE extends Error {
  constructor(format: string) {
    super(format);
    this.name = "Errno::ERANGE";
  }
}

/**
 * Ruby's `Errno` module at the name Ruby nests {@link ERANGE} under, so a
 * caller spells the rescue `Errno.ERANGE` as Ruby spells `Errno::ERANGE`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core; see {@link ERANGE}.
 */
export const Errno = { ERANGE };

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
 * The scan mirrors `date_strftime.c`'s `again:` switch
 * (`date_strftime.c:160-235`): the `-` and `_` flags, the padding character and
 * the width are read ahead of EVERY directive. `num` is then the `FMT` / `FMTV`
 * macro over a value arm and `text` is `FILL_PADDING` over a `break` arm or a
 * recursively expanded `STRFTIME` one, each carrying the arm's own default
 * width and padding character rather than a hardcoded pad. A directive with no
 * arm goes out verbatim, flags and all, as `unknown:` (`date_strftime.c:591-599`)
 * does — `%Y`'s five columns for a negative year (`FMT('0', 0 <= y ? 4 : 5)`,
 * `date_strftime.c:236-247`) are why `Date#to_s` renders a pre-1000 date as
 * `0001-01-01`.
 *
 * Only the directives the i18n format strings and the conformance mixins use
 * are recognised; Ruby leaves an unknown directive in place, and so does this.
 * Every flag the C reads is recognised, including the `E` and `O` POSIX locale
 * extensions (`date_strftime.c:523-535`), which set their bit and are then
 * ignored exactly as the C ignores them — each reads on only when the NEXT
 * character is one its own whitelist names, so `%Oy` is `%y` and `%Oz` goes out
 * verbatim.
 * `%z` and `%Z` both come off the subject: `::Date` has no zone of its own and
 * answers UTC, while a `::Time` built through the public constructor is in the
 * local zone and answers its real offset and abbreviation.
 *
 * A `Temporal` value is accepted in place of the subject and read through
 * {@link temporalSubject} — the fields Ruby's `::Date`/`::Time` answer natively.
 *
 * `maxsize` is `1024 * flen`, the size `date_strftime_alloc` doubles its buffer
 * up to before it gives up and `rb_sys_fail`s (`date_core.c:7081-7097`). A JS
 * string grows on its own, so that bound is the only part of the C's buffer
 * machinery that is observable — and it is observable, as the two
 * {@link ERANGE} arms are what `test_strftime` asserts: a precision past it
 * (`date_strftime.c:577-582`) and a rendered field past it
 * (`FILL_PADDING`, `date_strftime.c:124-126`).
 */
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
  const hour12 = subject.hour % 12 === 0 ? 12 : subject.hour % 12;
  const maxsize = 1024 * format.length;
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
        if (prec > INT_MAX || prec > maxsize) throw new ERANGE(format);
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
    // `date_strftime.c`'s `STRFTIME` macro (`date_strftime.c:117-133`): it
    // reads UPPER but never LOWER, unlike the shared text tail at `:603-614`.
    const recur = (fmt: string): string => {
      const i = strftime(subject, fmt);
      const cased = upper ? i.toUpperCase() : i;
      return fillPadding(padding, left, precision, i.length) + cased;
    };

    let formatted: string | undefined;
    switch (spec) {
      case "Y":
        // `date_strftime.c:236-246`: a Fixnum year widens to 5 for the sign,
        // where a Bignum one takes the plain default of 4.
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
    if (formatted.length > maxsize) throw new ERANGE(format);
    out += formatted;
    f = g + 1;
  }

  return out;
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * @internal Ruby core `FloatDomainError`, a `RangeError` subclass, spelled
 * locally for the reason {@link NoMethodError} below is. `rb_num2int` — what
 * `FIX2INT` is for the non-Fixnum operand of `d_lite_rshift`'s `f_idiv` /
 * `f_mod` arm (`date_core.c:6459`) — raises it for a non-finite Float, with the
 * Float's own `to_s` as the message: `Date.new(2000,1,31) >> Float::INFINITY`
 * is `FloatDomainError: Infinity`.
 */
class FloatDomainError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}

/**
 * @internal Ruby core `NoMethodError`. It is here rather than imported because
 * `@blazetrails/date` is the bottom of the dependency graph — activemodel's
 * copy (`attribute-assignment.ts`) imports this package, not the reverse — and
 * because {@link ArgumentError} above already sets the precedent for a Ruby
 * core error class the gem raises being spelled locally.
 *
 * `Date::Infinity` is the one raiser: `lib/date.rb:19` stores `d <=> 0`, which
 * is `nil` for a NaN, and every reader below then calls a method on that `nil`.
 */
class NoMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

/**
 * @internal Ruby `<=>` as `Date::Infinity` uses it, which is three operators:
 * `Float#<=>`, whose NaN arm answers `nil` and is what puts a `nil` in `@d`
 * (`lib/date.rb:19`); `Integer#<=>` for a stored sign; and `NilClass#<=>` —
 * inherited `Object#<=>`, which answers `0` for an identical operand and `nil`
 * otherwise — once that `nil` is stored.
 */
function spaceship(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return a === b ? 0 : null;
  if (a === b) return 0;
  const c = Math.sign(a - b);
  return Number.isNaN(c) ? null : c;
}

/**
 * @internal Ruby `Float()` (`object.c` `rb_Float`), which converts through
 * `to_f` and raises rather than answering `nil`.
 */
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

/**
 * @internal Ruby `Numeric#coerce` (`numeric.c` `num_coerce`), which is what
 * {@link DateInfinity#coerce}'s `else` arm reaches through `super`
 * (ruby/date, `lib/date.rb:54`). Note the pair comes back `[y, x]` — the
 * OTHER operand first — on both arms. `CLASS_OF` is total in Ruby (nil's class
 * is `NilClass`) where `Object.getPrototypeOf(null)` raises, so a nullish `y`
 * short-circuits to the unequal-classes arm that `Float()` then rejects.
 */
function numCoerce(x: unknown, y: unknown): [number, number] {
  if (y != null && Object.getPrototypeOf(x) === Object.getPrototypeOf(y))
    return [y as number, x as number];
  return [rbFloat(y), rbFloat(x)];
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
export interface DateParts {
  jd?: number | bigint;
  year?: number;
  mon?: number;
  mday?: number;
  yday?: number;
  cwyear?: number;
  cweek?: number;
  cwday?: number;
  wday?: number;
  wnum0?: number;
  wnum1?: number;
  hour?: number;
  min?: number;
  sec?: number;
  secFraction?: number | bigint | Rational;
  /**
   * Seconds since the Unix epoch, which `rt_rewrite_frags` expands into a `:jd`
   * and a time of day. No ported sub-parser sets it: it is `Date._strptime`'s
   * `%s`/`%Q`, never anything `date__parse` answers. Both producers build it
   * exactly: `%s` is the C's bignum `n` (`date_strptime.c:415-426`), a
   * `bigint` because Ruby's Integer is arbitrary precision, and `%Q` its
   * `rb_rational_new2(n, INT2FIX(1000))` (`date_strptime.c:428-442`).
   */
  seconds?: number | bigint | Rational;
  zone?: string;
  offset?: number | Rational | null;
  /**
   * The tail of the string `Date._strptime`'s format did not consume
   * (`date_strptime.c:672-677`). `date__parse` never sets it.
   */
  leftover?: string;
  _comp?: boolean;
  _bc?: boolean;
  /** `date_strptime.c`'s `fail()` mark (`date_strptime.c:108-112`). */
  _fail?: boolean;
  /** `%C`/`%g`/`%y`'s century, folded into the year by `date__strptime`. */
  _cent?: number;
  /** `%P`/`%p`'s meridian, folded into the hour by `date__strptime`. */
  _merid?: number;
}

/**
 * @internal The date and time elements of `rt_complete_frags`' table
 * (`date_core.c:3885-3968`).
 */
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

/** @internal `date_parse.c` `comp_year69`: `69` is 1969, `68` is 2068. */
function compYear69(y: number): number {
  return y >= 69 ? y + 1900 : y + 2000;
}

/** @internal `date_parse.c` `mon_num`: an abbreviation, or the head of a full name. */
function monNum(str: string): number {
  return ABBR_MONTH_NAMES.findIndex((m) => m.toLowerCase() === str.slice(0, 3).toLowerCase()) + 1;
}

/** @internal `date_parse.c` `day_num` (`date_parse.c:561-571`): the `ABBR_DAYS` index of a day name. */
function dayNum(str: string): number {
  return ABBR_DAY_NAMES.findIndex((d) => d.toLowerCase() === str.slice(0, 3).toLowerCase());
}

/** @internal `date_parse.c` `issign` (`date_parse.c:63`), also `date_strptime.c:46`. */
function issign(c: string | undefined): boolean {
  return c === "-" || c === "+";
}

/** @internal `date_parse.c` `isdigit`, the C library's. */
function isdigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
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

/** @internal `rational.c` `i_gcd`, the greatest common divisor a Rational reduces by. */
function iGcd(x: bigint, y: bigint): bigint {
  if (x < 0n) x = -x;
  if (y < 0n) y = -y;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Ruby's `Rational` (`rational.c`), as much of it as `date_zone_to_diff`'s
 * fractional-hour offset needs: `rb_rational_new` canonicalizes to lowest terms
 * (`rational.c` `nurat_s_canonicalize_internal`), `+` adds an Integer
 * (`rational.c` `nurat_add`), and `numerator`/`denominator` read the parts back
 * out. A Rational never becomes an Integer on its own in Ruby — the caller asks
 * whether the denominator is one and takes the numerator itself.
 *
 * @noRailsEquivalent PERMANENT — Ruby core, like the `::Date` below it. Rails
 * defines no Rational; it inherits Ruby's, and `Date._parse` answers one for a
 * fractional-hour `:offset`, so trails needs the value type to answer the same.
 */
export class Rational {
  /** `rational.c` `nurat_numerator` (`Rational#numerator`).
   *
   * Ruby's is an Integer — arbitrary precision — so a `bigint` is the JS
   * analogue, not a `number`: a `number` is exact only inside
   * `Number.MAX_SAFE_INTEGER` and a parsed fraction literal of more than
   * sixteen digits (`date_parse.c:2319-2325`) runs straight past it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly numerator: bigint;

  /** `rational.c` `nurat_denominator` (`Rational#denominator`).
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  readonly denominator: bigint;

  constructor(num: number | bigint, den: number | bigint) {
    const n = BigInt(num);
    const d = BigInt(den);
    const g = iGcd(n, d);
    this.numerator = n / g;
    this.denominator = d / g;
  }

  /** `rational.c` `nurat_cmp` (`Rational#<=>`), which compares
   * `a.num * b.den` against `b.num * a.den` — exact, where a `toF` comparison
   * would not be. `nurat_cmp`'s T_FLOAT arm, `f_cmp(f_to_f(self), other)`,
   * takes both sides to Float instead, and it is the only arm a non-integral
   * operand has.
   *
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  cmp(other: number | bigint | Rational): number {
    if (typeof other === "number" && !Number.isInteger(other)) {
      const f = this.toF();
      return f === other ? 0 : f < other ? -1 : 1;
    }
    const b = other instanceof Rational ? other : new Rational(other, 1);
    const a = this.numerator * b.denominator;
    const c = b.numerator * this.denominator;
    if (a === c) return 0;
    return a < c ? -1 : 1;
  }

  /** `rational.c` `nurat_add` (`Rational#+`), for the Integer and Rational
   * addends this port needs. */
  add(other: number | bigint | Rational): Rational {
    if (other instanceof Rational) {
      return new Rational(
        this.numerator * other.denominator + other.numerator * this.denominator,
        this.denominator * other.denominator,
      );
    }
    return new Rational(this.numerator + BigInt(other) * this.denominator, this.denominator);
  }

  /** `rational.c` `nurat_mul` (`Rational#*`), for the Integer multiplier this
   * port needs. `f_muldiv` cancels the multiplier against the denominator
   * BEFORE it multiplies (`rational.c` `f_muldiv`). */
  mul(other: number | bigint): Rational {
    const o = BigInt(other);
    const g = iGcd(o, this.denominator);
    return new Rational(this.numerator * (o / g), this.denominator / g);
  }

  /** `rational.c` `nurat_div` (`Rational#/`), for the Integer divisor this port
   * needs, cancelled the same way {@link mul} is. */
  quo(other: number | bigint): Rational {
    const o = BigInt(other);
    const g = iGcd(this.numerator, o);
    return new Rational(this.numerator / g, this.denominator * (o / g));
  }

  /** `numeric.c` `num_zero_p` (`Rational#zero?`, inherited from Numeric), what
   * `date_core.c`'s `f_zero_p` dispatches to for a Rational. */
  isZero(): boolean {
    return this.numerator === 0n;
  }

  /** `numeric.c` `num_div` (`Rational#div`, inherited from Numeric), the
   * floored quotient — the method `date_core.c`'s `f_idiv` macro sends
   * (`date_core.c:43`) — for the Integer divisor this port needs. */
  div(other: number | bigint): number {
    const den = this.denominator * BigInt(other);
    const q = this.numerator / den;
    return Number(this.numerator % den !== 0n && this.numerator < 0n !== den < 0n ? q - 1n : q);
  }

  /** `numeric.c` `num_modulo` (`Rational#%`, inherited from Numeric), which is
   * `self - other * (self.div other)` there too — what `date_core.c`'s `f_mod`
   * dispatches to for a Rational — for the Integer divisor this port needs. */
  mod(other: number | bigint): Rational {
    return this.add(-BigInt(other) * BigInt(this.div(other)));
  }

  /** `rational.c` `nurat_to_i` (`Rational#to_i`), which truncates toward zero. */
  toI(): number {
    return Number(this.numerator / this.denominator);
  }

  /** `rational.c` `nurat_round` (`Rational#round`), which rounds half away from zero. */
  round(): number {
    const q = this.numerator / this.denominator;
    const r = this.numerator % this.denominator;
    const half =
      (r < 0n ? -r : r) * 2n >= (this.denominator < 0n ? -this.denominator : this.denominator);
    return Number(half ? q + (r < 0n !== this.denominator < 0n ? -1n : 1n) : q);
  }

  /** @internal The `Float` a Rational becomes at a `number` seam — `rational.c`
   * `nurat_to_f`, which is what every reader that hands the value to a
   * floating-point API needs. */
  toF(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  /** `rational.c` `nurat_to_s` (`Rational#to_s`). */
  toString(): string {
    return `${this.numerator}/${this.denominator}`;
  }

  /** `rational.c` `nurat_inspect` (`Rational#inspect`), which parenthesizes where
   * {@link toString} does not.
   * @noRailsEquivalent PERMANENT — Ruby core, part of the Rational above. */
  inspect(): string {
    return `(${this.toString()})`;
  }
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
 * A fractional-hour offset of more than two decimal places is a `Rational`
 * (`date_parse.c:523-528`), and only an integer once its denominator reduces to
 * one — `+9.5555` is `(171999/5)` where `+9.555` is `34398`.
 */
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
 * Ruby edits the one String they all share (`f_aset2`) and answers whether it
 * matched; a JS string is immutable, so the edited string is answered instead,
 * and `null` stands for C's `0`.
 *
 * `SUBS(s, p, c)` (`date_parse.c:340-343`) is `subx(s, asp_string(), p, hash,
 * c)`, so every sub-parser below is that one line over its pattern and its
 * `_cb`.
 */
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

/**
 * @internal `date_parse.c` `parse_day_cb` (`date_parse.c:583-592`): the day name
 * a date string carries is a field of its own, even though `Date.parse` never
 * reads it back.
 */
function parseDayCb(m: RegExpExecArray, hash: DateParts): number {
  hash.wday = dayNum(m[1]);
  return 1;
}

/**
 * @internal `date_parse.c` `parse_day` (`date_parse.c:594-604`): a day name is
 * not a date field the rest of the sub-parsers should see, so it comes out of
 * the string — but it is one Ruby records, as `:wday`.
 */
function parseDay(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_DAYS})[^-/\\d\\s]*`, "i");
  return subx(str, " ", pat, hash, parseDayCb);
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
  if (f !== undefined) hash.secFraction = new Rational(BigInt(f), 10n ** BigInt(f.length));

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
    "[A-Za-z.\\s]+(?:standard|daylight)\\stime\\b" +
    "|" +
    "[A-Za-z]+(?:\\sdst)?\\b" +
    ")" +
    ")?";
  return subx(str, " ", new RegExp(patSource, "i"), hash, parseTimeCb);
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

/** @internal `date_parse.c` `parse_iso_cb` (`date_parse.c:997-1013`). */
function parseIsoCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d, false);
  return 1;
}

/** @internal `date_parse.c` `parse_iso` (`date_parse.c:1015-1033`): `2008-07-02`, and the unpadded `2008-7-2`. */
function parseIso(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?[-+]?${NUMBER}+)-(\\d+)-('?-?\\d+)`);
  return subx(str, " ", pat, hash, parseIsoCb);
}

/**
 * @internal `date_parse.c` `parse_iso21_cb` (`date_parse.c:1035-1051`): the
 * commercial week date's year, week and day.
 */
function parseIso21Cb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const w = m[2];
  const d = m[3];

  if (y !== undefined) hash.cwyear = Number(y);
  hash.cweek = Number(w);
  if (d !== undefined) hash.cwday = Number(d);

  return 1;
}

/**
 * @internal `date_parse.c` `parse_iso21` (`date_parse.c:1053-1071`): the
 * commercial week date, `"2001-W05-6"` and the yearless `"-W061"`.
 */
function parseIso21(str: string, hash: DateParts): string | null {
  const pat = /\b(\d{2}|\d{4})?-?w(\d{2})(?:-?(\d))?\b/i;
  return subx(str, " ", pat, hash, parseIso21Cb);
}

/** @internal `date_parse.c` `parse_iso22_cb` (`date_parse.c:1073-1081`). */
function parseIso22Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.cwday = Number(d);
  return 1;
}

/** @internal `date_parse.c` `parse_iso22` (`date_parse.c:1083-1101`): `"-W-6"`, a commercial day alone. */
function parseIso22(str: string, hash: DateParts): string | null {
  const pat = /-w-(\d)\b/i;
  return subx(str, " ", pat, hash, parseIso22Cb);
}

/** @internal `date_parse.c` `parse_iso23_cb` (`date_parse.c:1103-1116`). */
function parseIso23Cb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  const d = m[2];

  if (mon !== undefined) hash.mon = Number(mon);
  hash.mday = Number(d);

  return 1;
}

/** @internal `date_parse.c` `parse_iso23` (`date_parse.c:1118-1136`): `"--02-03"`, and `"---03"`. */
function parseIso23(str: string, hash: DateParts): string | null {
  const pat = /--(\d{2})?-(\d{2})\b/;
  return subx(str, " ", pat, hash, parseIso23Cb);
}

/** @internal `date_parse.c` `parse_iso24_cb` (`date_parse.c:1138-1151`). */
function parseIso24Cb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  const d = m[2];

  hash.mon = Number(mon);
  if (d !== undefined) hash.mday = Number(d);

  return 1;
}

/** @internal `date_parse.c` `parse_iso24` (`date_parse.c:1153-1171`): the unseparated `"--0203"`. */
function parseIso24(str: string, hash: DateParts): string | null {
  const pat = /--(\d{2})(\d{2})?\b/;
  return subx(str, " ", pat, hash, parseIso24Cb);
}

/** @internal `date_parse.c` `parse_iso25_cb` (`date_parse.c:1173-1185`). */
function parseIso25Cb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const d = m[2];

  hash.year = Number(y);
  hash.yday = Number(d);

  return 1;
}

/**
 * @internal `date_parse.c` `parse_iso25` (`date_parse.c:1187-1221`): the ordinal
 * date `"2001-034"`. `pat0` declines the run that is a second fraction
 * (`"1.2001-034"`), which `parse_ddd` reads instead.
 */
function parseIso25(str: string, hash: DateParts): string | null {
  const pat0 = /[,.](\d{2}|\d{4})-\d{3}\b/;
  const pat = /\b(\d{2}|\d{4})-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  return subx(str, " ", pat, hash, parseIso25Cb);
}

/** @internal `date_parse.c` `parse_iso26_cb` (`date_parse.c:1223-1231`). */
function parseIso26Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.yday = Number(d);

  return 1;
}

/** @internal `date_parse.c` `parse_iso26` (`date_parse.c:1233-1267`): the yearless ordinal date `"-034"`. */
function parseIso26(str: string, hash: DateParts): string | null {
  const pat0 = /\d-\d{3}\b/;
  const pat = /\b-(\d{3})\b/;

  if (pat0.exec(str) !== null) return null;
  return subx(str, " ", pat, hash, parseIso26Cb);
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

/** @internal `date_parse.c` `parse_jis_cb` (`date_parse.c:1309-1327`). */
function parseJisCb(m: RegExpExecArray, hash: DateParts): number {
  const e = m[1];
  const y = m[2];
  const mon = m[3];
  const d = m[4];

  const ep = gengo(e[0]);

  hash.year = Number(y) + ep;
  hash.mon = Number(mon);
  hash.mday = Number(d);

  return 1;
}

/**
 * @internal `date_parse.c` `parse_jis` (`date_parse.c:1329-1347`): the JIS X
 * 0301 date, `"H13.02.03"` — Heisei 13, which is 2001.
 */
function parseJis(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b([${JISX0301_ERA_INITIALS}])(\\d+)\\.(\\d+)\\.(\\d+)`, "i");
  return subx(str, " ", pat, hash, parseJisCb);
}

/** @internal `date_parse.c` `parse_vms11_cb` (`date_parse.c:1349-1367`). */
function parseVms11Cb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  let mon: string | number = m[2];
  const y = m[3];

  mon = monNum(mon);

  s3e(hash, y, String(mon), d, false);
  return 1;
}

/** @internal `date_parse.c` `parse_vms11` (`date_parse.c:1369-1389`): `"3-FEB-2001"`. */
function parseVms11(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)-(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)`, "i");
  return subx(str, " ", pat, hash, parseVms11Cb);
}

/** @internal `date_parse.c` `parse_vms12_cb` (`date_parse.c:1391-1409`). */
function parseVms12Cb(m: RegExpExecArray, hash: DateParts): number {
  let mon: string | number = m[1];
  const d = m[2];
  const y = m[3];

  mon = monNum(mon);

  s3e(hash, y ?? null, String(mon), d, false);
  return 1;
}

/** @internal `date_parse.c` `parse_vms12` (`date_parse.c:1411-1431`): `"FEB-3-2001"`, and `"FEB-3"`. */
function parseVms12(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_MONTHS})[^-/.]*-('?-?\\d+)(?:-('?-?\\d+))?`, "i");
  return subx(str, " ", pat, hash, parseVms12Cb);
}

/** @internal `date_parse.c` `parse_vms` (`date_parse.c:1433-1444`): the VMS date, either way round. */
function parseVms(str: string, hash: DateParts): string | null {
  return parseVms11(str, hash) ?? parseVms12(str, hash);
}

/** @internal `date_parse.c` `parse_sla_cb` (`date_parse.c:1446-1462`). */
function parseSlaCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d ?? null, false);
  return 1;
}

/** @internal `date_parse.c` `parse_sla` (`date_parse.c:1464-1483`): `2012/12/13`, `01/01/2012`, `2008/07`. */
function parseSla(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)/\\s*('?\\d+)(?:\\D\\s*('?-?\\d+))?`);
  return subx(str, " ", pat, hash, parseSlaCb);
}

/** @internal `date_parse.c` `parse_dot_cb` (`date_parse.c:1554-1570`). */
function parseDotCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  const mon = m[2];
  const d = m[3];

  s3e(hash, y, mon, d, false);
  return 1;
}

/** @internal `date_parse.c` `parse_dot` (`date_parse.c:1572-1591`): `2012.12.13`, `01.01.2012`. */
function parseDot(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`('?-?${NUMBER}+)\\.\\s*('?\\d+)\\.\\s*('?-?\\d+)`);
  return subx(str, " ", pat, hash, parseDotCb);
}

/** @internal `date_parse.c` `parse_year_cb` (`date_parse.c:1662-1670`). */
function parseYearCb(m: RegExpExecArray, hash: DateParts): number {
  const y = m[1];
  hash.year = Number(y);
  return 1;
}

/** @internal `date_parse.c` `parse_year` (`date_parse.c:1672-1690`): the year alone, `"'01"`. */
function parseYear(str: string, hash: DateParts): string | null {
  const pat = /'(\d+)\b/;
  return subx(str, " ", pat, hash, parseYearCb);
}

/** @internal `date_parse.c` `parse_mon_cb` (`date_parse.c:1692-1700`). */
function parseMonCb(m: RegExpExecArray, hash: DateParts): number {
  const mon = m[1];
  hash.mon = monNum(mon);
  return 1;
}

/** @internal `date_parse.c` `parse_mon` (`date_parse.c:1702-1720`): the month alone, `"Feb"`. */
function parseMon(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`\\b(${ABBR_MONTHS})\\S*`, "i");
  return subx(str, " ", pat, hash, parseMonCb);
}

/** @internal `date_parse.c` `parse_mday_cb` (`date_parse.c:1722-1730`). */
function parseMdayCb(m: RegExpExecArray, hash: DateParts): number {
  const d = m[1];
  hash.mday = Number(d);
  return 1;
}

/**
 * @internal `date_parse.c` `parse_mday` (`date_parse.c:1732-1750`): the day of
 * the month alone, `"3rd"`. It sits directly above `parse_ddd`, so an ordinal
 * suffix is what tells the two apart.
 */
function parseMday(str: string, hash: DateParts): string | null {
  const pat = new RegExp(`(${NUMBER}+)(st|nd|rd|th)\\b`, "i");
  return subx(str, " ", pat, hash, parseMdayCb);
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

/**
 * @internal `date_parse.c` `parse_ddd` (`date_parse.c:1968-2002`): the digit run
 * itself, plus the time and zone that can follow it.
 */
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

/** @internal `date_parse.c` `parse_bc_cb` (`date_parse.c:2003-2008`). */
function parseBcCb(m: RegExpExecArray, hash: DateParts): number {
  hash._bc = true;
  return 1;
}

/**
 * @internal `date_parse.c` `parse_bc` (`date_parse.c:2010-2019`): the era
 * suffix. It runs after whichever date sub-parser matched and only records
 * `:_bc`; the tail of `date__parse` is what negates the year. It is a `SUBS`
 * like every sub-parser above, and `parse_frag` runs on what it leaves — so
 * `"3rd 5 bc"` is the 3rd at 5 o'clock, the era gone from the string before
 * the anchored pattern reads the `5`.
 */
function parseBc(str: string, hash: DateParts): string | null {
  const pat = /\b(bc\b|bce\b|b\.c\.|b\.c\.e\.)/i;
  return subx(str, " ", pat, hash, parseBcCb);
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
  const pat = /^\s*(\d{1,2})\s*$/;
  return subx(str, " ", pat, hash, parseFragCb);
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
 * The week-numbered entries win on a string that names a `:year`, a `:wday`
 * and a time — four fields against the civil entry's two — so `"wed 10:00:00
 * '01"` is the Wednesday of `:wnum0` week `0` of 2001 rather than a 1 January
 * date. `:time` names no date, so it has no completion branch here — Ruby's
 * only fills a `:jd` for `DateTime` — and the string goes on to raise.
 */
/** `date_core.c`'s `JULIAN_EPOCH_DATE` (`date_core.c:251`). */
const JULIAN_EPOCH_DATE = "-4712-01-01";

/** `date_core.c`'s `JULIAN_EPOCH_DATETIME` (`date_core.c:252`). */
const JULIAN_EPOCH_DATETIME = `${JULIAN_EPOCH_DATE}T00:00:00+00:00`;

const ABBREVIATED_DAY_NAME_LENGTH = 3;
const ABBREVIATED_MONTH_NAME_LENGTH = 3;

/**
 * @internal `date_strptime.c` `num_pattern_p` (`date_strptime.c:48-62`), which
 * answers whether the format text FOLLOWING the current directive would itself
 * read digits — the lookahead that makes `%Y` in `"%Y%m%d"` take four digits
 * where a `%Y` at the end of the format takes as many as it can.
 */
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

/**
 * @internal `date_strptime.c` `read_digits` (`date_strptime.c:65-104`): up to
 * `width` digits off `str` at `si`. The C takes `&str[si]` and answers the
 * count through the return with the value through an out-parameter; the index
 * and the tuple stand in for the pointer arithmetic. `0` digits is the C's `0`,
 * which every caller turns into a `fail()`. The C's wide arm reads a run longer
 * than a `long` as a Bignum; the port's substrate is `number` throughout, so a
 * run past 2^53 loses precision the way every other numeric frag in this file
 * does.
 */
function readDigits(str: string, slen: number, si: number, width: number): [l: number, n: number] {
  if (!width) return [0, 0];

  let l = 0;
  while (si + l < slen && isdigit(str[si + l])) {
    if (++l === width) break;
  }

  if (l === 0) return [0, 0];

  return [l, Number(str.slice(si, si + l))];
}

/** @internal `date_strptime.c` `valid_range_p` (`date_strptime.c:127-136`). */
function validRangeP(v: number, a: number, b: number): boolean {
  return !(v < a || v > b);
}

/** @internal `date_strptime.c` `head_match_p` (`date_strptime.c:153-157`). */
function headMatchP(len: number, name: string, str: string, slen: number, si: number): boolean {
  return (
    slen - si >= len && str.slice(si, si + len).toLowerCase() === name.slice(0, len).toLowerCase()
  );
}

/**
 * @internal `date_strptime.c` `date__strptime_internal`
 * (`date_strptime.c:159-663`): the directive walk itself, answering how much of
 * `str` it consumed and reporting a mismatch through the `:_fail` key the way
 * the C's `fail()` macro does.
 *
 * The C drives its `%E`/`%O`/`%:z` re-dispatch with `goto again`, its literal
 * comparison with `goto ordinal` and every directive's exit with `goto
 * matched`. TypeScript has no `goto`, so `again` is the inner `for (;;)` — its
 * `continue` — `matched` is that loop's `break` followed by the `fi++`, and
 * `ordinal` is the `ordinal` flag falling through to the same literal
 * comparison the non-`%` arm makes.
 *
 * The closures stand in for the C's macros: `readDigitsAt` is `READ_DIGITS`
 * (`date_strptime.c:115-123`) with `null` for its `fail()`, `readDigitsMax` is
 * `READ_DIGITS_MAX` (`date_strptime.c:125`) — `Number.POSITIVE_INFINITY` for
 * its `LONG_MAX` width — `recur` is `recur` (`date_strptime.c:142-150`) and
 * `headMatch` is `HEAD_MATCH_P` (`date_strptime.c:172`).
 *
 * `%L`/`%N`, `%Q` and `%s` are the arms whose reader result is discarded: C's
 * `READ_DIGITS` assigns `n` the bignum `str2num` answers, and ours cannot — so
 * the call is made for its `si` advance and its `fail()`, and `n` is `str2num`
 * over the span `osi`/`si` bound, which is what `date_strptime.c:377-380`
 * passes.
 */
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

/**
 * @internal `date_strptime.c`'s `%Z`/`%z` pattern (`date_strptime.c:576-583`).
 * The C's `(?-i:...)` groups are dropped: both wrap character classes that
 * already span both cases, so the enclosing `IGNORECASE` has nothing to undo
 * there, and JavaScript has no inline modifier to express them with.
 */
const ZONE_PAT =
  /^((?:gmt|utc?)?[-+]\d+(?:[,.:]\d+(?::\d+)?)?|[a-zA-Z.\s]+(?:standard|daylight)\s+time\b|[a-zA-Z]+(?:\s+dst)?\b)/i;

/**
 * @internal `date_strptime.c` `date__strptime` (`date_strptime.c:665-703`): the
 * walk, then the `:leftover` the format did not consume, then `:_cent` folded
 * into the year and `:_merid` into the hour. `null` is its `Qnil`.
 */
function dateStrptime(str: string, fmt: string, hash: DateParts): DateParts | null {
  const si = dateStrptimeInternal(str, fmt, hash);

  if (str.length > si) {
    hash.leftover = str.slice(si);
  }

  if (hash._fail === true) return null;

  const cent = hash._cent;
  delete hash._cent;
  if (cent !== undefined) {
    if (hash.cwyear !== undefined) hash.cwyear = hash.cwyear + cent * 100;
    if (hash.year !== undefined) hash.year = hash.year + cent * 100;
  }

  const merid = hash._merid;
  delete hash._merid;
  if (merid !== undefined) {
    if (hash.hour !== undefined) hash.hour = (hash.hour % 12) + merid;
  }

  return hash;
}

/**
 * @internal `date_core.c`'s `f_idiv` macro (`date_core.c:43`), `x.div(y)`, which
 * is `Integer#div` on a plain `:seconds` and `Rational#div` once an `:offset`
 * has made it a `Rational`. Either way the quotient is an Integer.
 */
/**
 * @internal `date_core.c`'s `f_add` macro (`date_core.c:38`), `x + y`, for the
 * two numeric representations this port carries — a `Rational` on either side
 * makes the sum one, which is how an exact `:seconds` survives folding an
 * `:offset` in (`date_core.c:3850`).
 */
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

/**
 * @internal `date_core.c`'s `f_mod` macro (`date_core.c:44`), `x % y`, the
 * remainder of {@link fIdiv} — a `Rational` whenever `x` is one, which is how
 * an exact `:offset` reaches `:sec_fraction`.
 */
function fMod(x: number | bigint | Rational, y: number): number | bigint | Rational {
  if (x instanceof Rational) return x.mod(y);
  if (typeof x === "bigint") {
    const d = BigInt(y);
    const r = x % d;
    return r !== 0n && r < 0n !== d < 0n ? r + d : r;
  }
  return mod(x, y);
}

/**
 * @internal `date_core.c` `rt_rewrite_frags` (`date_core.c:3839-3872`), which
 * runs ahead of {@link completeFrags} and expands a `:seconds` frag — seconds
 * since the Unix epoch — into the `:jd` and the time of day it names, folding
 * an `:offset` in first. The division is floored, so a negative `:seconds`
 * still lands on the day before the epoch with a positive time of day.
 */
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

/**
 * @internal `date_core.c` `rt_complete_frags` (`date_core.c:3877-4116`). `klass`
 * is read only by the `time` block below — `f_le_p(klass, cDateTime)`
 * (`:4098`), which is what makes a time-only frag set answer TODAY's date
 * through `DateTime.strptime` and stay a `Date::Error` through `Date.strptime`.
 */
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

/**
 * @internal `date_core.c`'s `UNIX_EPOCH_IN_CJD` (`date_core.c:192`), the
 * chronological Julian day number of 1970-01-01, which is the anchor
 * `date__parse` itself converts a `Time` to a `:jd` on (`date_core.c:3864`).
 */
const UNIX_EPOCH_IN_CJD = 2440588;

/**
 * @internal `date_core.c`'s `ITALY` (`date_core.c:186`), the Julian day of
 * 1582-10-15 — the day Gregory's reform took effect in Italy, and the day from
 * which `c_civil_to_jd` and `c_jd_to_civil` read a date as Gregorian rather
 * than Julian.
 */
const ITALY = 2299161;

/**
 * @internal `date_core.c`'s `ENGLAND` (`date_core.c:187`), the Julian day of
 * 1752-09-14 — the day the reform took effect in England and its colonies.
 */
const ENGLAND = 2361222;

/**
 * @internal `date_core.c`'s `JULIAN` (`date_core.c:188`), `positive_inf`. Every
 * `sg` comparison is `jd < sg`, so an infinite start makes every day fall on
 * the one side of the reform: under this one the date is read as Julian
 * whatever it names.
 */
const JULIAN = Infinity;

/** @internal `date_core.c`'s `GREGORIAN` (`date_core.c:189`), `negative_inf`. */
const GREGORIAN = -Infinity;

/**
 * @internal `date_core.c`'s `DEFAULT_SG` (`date_core.c:190`), the reform start
 * every constructor takes when none is passed. `SimpleDateData` carries `sg` so
 * that one process can hold dates under several reforms at once, which is what
 * the trailing `start` argument selects. The conversions below are the C's,
 * over the C's own Julian-day state, so every civil date `Date::ITALY` names —
 * including the Julian-only ones such as 1500-02-29 — is buildable and answers
 * MRI's `wday`, `yday` and epoch.
 */
const DEFAULT_SG = ITALY;

/**
 * @internal `date_core.c`'s `REFORM_BEGIN_YEAR` / `REFORM_END_YEAR`
 * (`date_core.c:207-208`), the years {@link guessStyle} brackets: a year before
 * the first is proleptic Julian whatever `sg` says, and one after the last
 * proleptic Gregorian.
 */
const REFORM_BEGIN_YEAR = 1582;
const REFORM_END_YEAR = 1930;

/**
 * @internal `date_core.c`'s calendar periods (`date_core.c:200-205`): the
 * Julian and Gregorian cycles, their least common multiple with the week, and
 * the largest multiple of it a `Fixnum` day can hold. `CM_PERIOD` days are
 * `CM_PERIOD_JCY` Julian years and `CM_PERIOD_GCY` Gregorian ones exactly, and
 * a whole number of weeks besides, which is what lets {@link decodeYear} and
 * {@link decodeJd} split a value into a multiple of the period plus a residue
 * without moving the weekday.
 */
const JC_PERIOD0 = 1461; /* 365.25 * 4 */
const GC_PERIOD0 = 146097; /* 365.2425 * 400 */
const CM_PERIOD0 = 71149239; /* (lcm 7 1461 146097) */
const CM_PERIOD = Math.trunc(0xfffffff / CM_PERIOD0) * CM_PERIOD0;
const CM_PERIOD_JCY = (CM_PERIOD / JC_PERIOD0) * 4;
const CM_PERIOD_GCY = (CM_PERIOD / GC_PERIOD0) * 400;

/**
 * @internal `date_core.c`'s `REFORM_BEGIN_JD` / `REFORM_END_JD`
 * (`date_core.c:209-210`), the window a finite `start` has to fall in — ns
 * 1582-01-01 through os 1930-12-31, the span over which the reform was actually
 * adopted somewhere.
 */
const REFORM_BEGIN_JD = 2298874;
const REFORM_END_JD = 2426355;

/**
 * @internal `date_core.c` `c_valid_start_p` (`date_core.c:888-898`): an
 * infinite start is `Date::JULIAN` or `Date::GREGORIAN` and always valid, a
 * `NaN` never is, and a finite one has to name a day inside the reform window.
 */
function cValidStartP(sg: number): boolean {
  if (Number.isNaN(sg)) return false;
  if (!Number.isFinite(sg)) return true;
  if (sg < REFORM_BEGIN_JD || sg > REFORM_END_JD) return false;
  return true;
}

/**
 * @internal `date_core.c`'s `val2sg` macro (`date_core.c:3320-3327`), the macro
 * every user-facing `start` argument is read through — the `start` counterpart
 * of {@link val2off}: whatever {@link cValidStartP} rejects becomes
 * {@link DEFAULT_SG}. The C's `rb_warning("invalid start is ignored")` is a
 * `$VERBOSE`-only warning with no analogue here, as `val2off`'s is.
 */
function val2sg(vsg: number): number {
  if (!cValidStartP(vsg)) return DEFAULT_SG;
  return vsg;
}

/** @internal `date_core.c`'s seconds constants (`date_core.c:194-196`). */
const MINUTE_IN_SECONDS = 60;
const HOUR_IN_SECONDS = 3600;
const DAY_IN_SECONDS = 86400;
const SECOND_IN_NANOSECONDS = 1_000_000_000;

/**
 * @internal `date_core.c` `sec_to_ns` (`date_core.c:1054-1059`): a count of
 * seconds as nanoseconds. The C keeps the product exact — it is a Rational
 * whenever its argument is — so the result here can carry a fraction of a
 * nanosecond, as `DateTime.parse("...00.9999999999").sec_fraction` does.
 */
function secToNs(s: number | bigint | Rational): number | bigint | Rational {
  if (s instanceof Rational) return s.mul(SECOND_IN_NANOSECONDS);
  if (typeof s === "bigint") return s * BigInt(SECOND_IN_NANOSECONDS);
  return s * SECOND_IN_NANOSECONDS;
}

/**
 * @internal `date_core.c` `ns_to_sec` (`date_core.c:993-998`), the inverse:
 * `rb_rational_new2(n, INT2FIX(SECOND_IN_NANOSECONDS))`, which answers a
 * Rational unconditionally, whatever it is handed.
 */
function nsToSec(n: Rational): Rational {
  return n.quo(SECOND_IN_NANOSECONDS);
}

/**
 * @internal `date_core.c` `day_in_nanoseconds` (`date_core.c:9498-9506`), the
 * `Init_date_core` constant `ns_to_day` divides by. It is exact as a JS number
 * — 8.64e13, well inside `Number.MAX_SAFE_INTEGER`.
 */
const DAY_IN_NANOSECONDS = DAY_IN_SECONDS * SECOND_IN_NANOSECONDS;

/** @internal `date_core.c` `HALF_DAYS_IN_SECONDS` (`date_core.c:1592`). */
const HALF_DAYS_IN_SECONDS = DAY_IN_SECONDS / 2;

/**
 * @internal `date_core.c` `isec_to_day` (`date_core.c:967-971`) over
 * `sec_to_day` (`date_core.c:959-965`), a count of seconds as a fraction of a
 * day. The C's `FIXNUM_P` arm and its `f_quo` arm build the same Rational.
 */
function isecToDay(s: number): Rational {
  return new Rational(s, DAY_IN_SECONDS);
}

/**
 * @internal `date_core.c` `ns_to_day` (`date_core.c:973-979`), a count of
 * nanoseconds as a fraction of a day.
 */
function nsToDay(n: Rational): Rational {
  return n.quo(DAY_IN_NANOSECONDS);
}

/**
 * @internal `date_core.c` `df_local_to_utc` (`date_core.c:900-909`), which takes
 * a `ComplexDateData`'s day-fraction from local to UTC and folds it back into
 * `0...DAY_IN_SECONDS`. The day the fold crosses is carried by
 * {@link jdLocalToUtc}, which reads the *unfolded* value for that reason.
 */
export function dfLocalToUtc(df: number, of: number): number {
  df -= of;
  if (df < 0) df += DAY_IN_SECONDS;
  else if (df >= DAY_IN_SECONDS) df -= DAY_IN_SECONDS;
  return df;
}

/** @internal `date_core.c` `df_utc_to_local` (`date_core.c:911-920`). */
function dfUtcToLocal(df: number, of: number): number {
  df += of;
  if (df < 0) df += DAY_IN_SECONDS;
  else if (df >= DAY_IN_SECONDS) df -= DAY_IN_SECONDS;
  return df;
}

/**
 * @internal `date_core.c` `jd_local_to_utc` (`date_core.c:922-932`), the day
 * half of the same move, on the Julian day the C itself carries.
 */
export function jdLocalToUtc(jd: number, df: number, of: number): number {
  df -= of;
  if (df < 0) return jd - 1;
  if (df >= DAY_IN_SECONDS) return jd + 1;
  return jd;
}

/** @internal `date_core.c` `jd_utc_to_local` (`date_core.c:933-943`). */
function jdUtcToLocal(jd: number, df: number, of: number): number {
  df += of;
  if (df < 0) return jd - 1;
  if (df >= DAY_IN_SECONDS) return jd + 1;
  return jd;
}

/** @internal `date_core.c` `time_to_df` (`date_core.c:944-948`). */
export function timeToDf(h: number, min: number, s: number): number {
  return h * HOUR_IN_SECONDS + min * MINUTE_IN_SECONDS + s;
}

/**
 * @internal `date_core.c`'s `add_frac` macro (`date_core.c:3313-3317`), which
 * every `DateTime` builder ends with: `d_lite_plus(ret, fr2)` when `fr2` is
 * nonzero. `fr2` is carried in seconds here (see {@link num2intWithFrac}), so
 * this is `d_lite_plus`'s `T_FLOAT` arm (`date_core.c:6064-6135`) inlined — the
 * whole seconds go to `df`, carrying a day where they overflow one, and the
 * remainder to `sf` in nanoseconds. The `T_RATIONAL` arm
 * (`date_core.c:6174-6201`) is the `Rational` branch: its
 * `sf = f_mul(t, INT2FIX(SECOND_IN_NANOSECONDS))` has no round in it, which is
 * what keeps a fraction exact at any denominator. `fr2` is under a day by
 * construction, so the C's `jd` term is `0` and its sign branch is never taken.
 */
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

/**
 * @internal `date_core.c` `df_to_time` (`date_core.c:950-957`); the `h`/`min`/`s`
 * out-parameters come back as the tuple.
 */
function dfToTime(df: number): [h: number, min: number, s: number] {
  const h = Math.trunc(df / HOUR_IN_SECONDS);
  df %= HOUR_IN_SECONDS;
  return [h, Math.trunc(df / MINUTE_IN_SECONDS), df % MINUTE_IN_SECONDS];
}

/**
 * @internal `date_core.c` `c_civil_to_jd` (`date_core.c:502-524`), the Julian
 * day of the civil date `y`-`m`-`d` read under the calendar-reform start `sg`.
 * The `jd -= b` correction is what makes a day before `sg` a Julian one: `b` is
 * the Gregorian century correction, so dropping it walks the answer back onto
 * the Julian calendar. The C's `ns` out-parameter reports which side of the
 * reform the answer landed on; nothing here reads it, so it is not returned.
 */
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

/**
 * @internal `date_core.c` `c_jd_to_civil` (`date_core.c:526-554`), the inverse
 * of {@link cCivilToJd}; the `ry`/`rm`/`rdom` out-parameters come back as the
 * tuple. The `jd < sg` arm skips the century correction for a day before the
 * calendar reform, so such a day reads as the Julian date MRI names.
 */
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

/**
 * @internal `date_core.c` `canonicalize_jd` (`date_core.c:1144-1154`), the
 * macro that folds a Julian day back into `0...CM_PERIOD` and carries the whole
 * periods it crossed onto `nth`. The macro mutates both arguments in place; TS
 * has no out-parameters, so the pair comes back as the tuple. This is the
 * free-standing reading `d_lite_plus` needs over a local `nth`/`jd` pair, where
 * {@link Date#mCanonicalizeJd} is `m_canonicalize_jd`, the C's other caller.
 */
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

/**
 * @internal `date_core.c` `c_nth_kday_to_jd` (`date_core.c:635-650`), the
 * Julian day of the `n`th weekday `k` of month `m` of year `y`, counting back
 * from the month's end when `n` is negative. The C's `ns` out-parameter reports
 * which side of the reform the answer landed on and has no bearer here.
 */
function cNthKdayToJd(y: number, m: number, n: number, k: number, sg = DEFAULT_SG): number {
  let rjd2: number;
  if (n > 0) {
    rjd2 = cFindFdom(y, m, sg)! - 1;
  } else {
    rjd2 = cFindLdom(y, m, sg)! + 7;
  }
  return rjd2 - mod(rjd2 - k + 1, 7) + 7 * n;
}

/**
 * @internal `date_core.c` `c_jd_to_wday` (`date_core.c:636-640`), Sunday as
 * `0`. Reading the day of the week off the Julian day rather than off
 * `Temporal.PlainDate`'s proleptic `dayOfWeek` is what makes it agree with MRI
 * at and before the calendar reform, where the two calendars run days apart.
 */
function cJdToWday(jd: number): number {
  return mod(jd + 1, 7);
}

/**
 * @internal `date_core.c` `m_julian_p` (`date_core.c:1683-1703`), which reads
 * the STORED Julian day — `x->s.jd` on the simple arm and `x->c.jd`, the UTC
 * one, on the complex arm — rather than `m_local_jd`. So a `DateTime` whose
 * offset carries it across the reform answers off the UTC day:
 * `DateTime.new(1582, 10, 15, 0, 30, 0, "+02:00").julian?` is true while
 * `DateTime.new(1582, 10, 15, 23, 30, 0, "-02:00")` is false, though both
 * answer 2299161 to `jd`. That is why this takes the day rather than reading a
 * receiver: the two arms hold different days, and each class passes its own.
 *
 * The `isinf` arm is what makes `Date::JULIAN` julian everywhere and
 * `Date::GREGORIAN` julian nowhere. The `sg` its callers read is
 * {@link virtualSg}, which answers an infinity once `nth` is nonzero.
 */
function mJulianP(jd: number, sg: number): boolean {
  if (!Number.isFinite(sg)) return sg === JULIAN;
  return jd < sg;
}

/**
 * @internal `date_core.c` `s_virtual_sg` (`date_core.c:1110-1120`) and
 * `c_virtual_sg` (`date_core.c:1122-1131`), which differ only in the union arm
 * they read and so are one function here, taking the fields — which makes it
 * `m_virtual_sg` (`date_core.c:1135-1142`), their dispatcher, at every call
 * site. A date whose day outran a `Fixnum` — `nth` nonzero — is read
 * proleptically whatever its stored `sg` says: a positive `nth` is far enough past the reform to be Gregorian
 * everywhere and a negative one far enough before it to be Julian everywhere.
 */
function virtualSg(nth: bigint, sg: number): number {
  if (!Number.isFinite(sg)) return sg;
  if (nth === 0n) return sg;
  else if (nth < 0n) return JULIAN;
  return GREGORIAN;
}

/** @internal `date_core.c`'s `DIV` macro (`date_core.c:168-170`), floored division. */
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

/** @internal `date_core.c`'s `MOD` macro (`date_core.c:169-171`), floored modulo. */
function mod(n: number, d: number): number;
function mod(n: bigint, d: number): bigint;
function mod(n: number | bigint, d: number): number | bigint;
function mod(n: number | bigint, d: number): number | bigint {
  if (typeof n === "bigint") return n - BigInt(d) * div(n, d);
  return n - d * div(n, d);
}

/**
 * @internal `date_core.c`'s `monthtab` (`date_core.c:697-700`), the last day of
 * each month indexed by leap year then by month, with a `0` in the unused
 * zeroth column so the month is its own index.
 */
const MONTHTAB: readonly (readonly number[])[] = [
  [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
];

/** @internal `date_core.c` `c_julian_leap_p` (`date_core.c:702-707`). */
function cJulianLeapP(y: number): boolean {
  return mod(y, 4) === 0;
}

/** @internal `date_core.c` `c_gregorian_leap_p` (`date_core.c:709-713`). */
function cGregorianLeapP(y: number): boolean {
  return (mod(y, 4) === 0 && y % 100 !== 0) || mod(y, 400) === 0;
}

/** @internal `date_core.c` `c_julian_last_day_of_month` (`date_core.c:714-720`). */
function cJulianLastDayOfMonth(y: number, m: number): number {
  return MONTHTAB[cJulianLeapP(y) ? 1 : 0][m];
}

/** @internal `date_core.c` `c_gregorian_last_day_of_month` (`date_core.c:723-728`). */
function cGregorianLastDayOfMonth(y: number, m: number): number {
  return MONTHTAB[cGregorianLeapP(y) ? 1 : 0][m];
}

/**
 * @internal `date_core.c` `c_valid_julian_p` (`date_core.c:729-745`), the
 * PROLEPTIC Julian twin of {@link cValidGregorianP} — the arm
 * {@link validCivilP} takes for a year far enough before the reform that no
 * `sg` can put it after one.
 */
function cValidJulianP(y: number, m: number, d: number): [rm: number, rd: number] | null {
  if (m < 0) m += 13;
  if (m < 1 || m > 12) return null;
  const last = cJulianLastDayOfMonth(y, m);
  if (d < 0) d = last + d + 1;
  if (d < 1 || d > last) return null;
  return [m, d];
}

/**
 * @internal `date_core.c` `c_valid_gregorian_p` (`date_core.c:747-765`), the
 * PROLEPTIC Gregorian validity check — it reads no `sg` and does no Julian-day
 * round trip, so it accepts exactly the days the Gregorian calendar has,
 * extended in both directions. A negative `m` counts back from a thirteenth
 * month and a negative `d` from the month's last day, as in
 * {@link cValidCivilP}. The C's `rm`/`rd` out-parameters come back as the
 * tuple, `null` for its `0`.
 */
function cValidGregorianP(y: number, m: number, d: number): [rm: number, rd: number] | null {
  if (m < 0) m += 13;
  if (m < 1 || m > 12) return null;
  const last = cGregorianLastDayOfMonth(y, m);
  if (d < 0) d = last + d + 1;
  if (d < 1 || d > last) return null;
  return [m, d];
}

/**
 * @internal `date_core.c` `valid_gregorian_p` (`date_core.c:2229-2236`), which
 * is {@link decodeYear} under a negative style followed by
 * {@link cValidGregorianP}. The C's `nth`/`ry`/`rm`/`rd` out-parameters come
 * back as the tuple.
 */
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

/**
 * @internal `date_core.c`'s `FIXNUM_P` (ruby.h), the test `guess_style` and
 * `decode_year` branch on: an Integer small enough for Ruby to hold unboxed.
 * A JS number stops being one where it stops being a safe integer — a
 * fraction is not an Integer at all and takes the same arm — and a `bigint`
 * outside that range is the `Bignum` the C's `big:` label is for.
 */
function fixnumP(y: number | bigint): boolean {
  if (typeof y === "bigint") return -MAX_SAFE_INTEGER_BIG <= y && y <= MAX_SAFE_INTEGER_BIG;
  return Number.isSafeInteger(y);
}

const MAX_SAFE_INTEGER_BIG = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * @internal Ruby's `rb_big_norm` (`bignum.c`), which every Integer arithmetic
 * result passes through: a Bignum small enough for a Fixnum comes back AS a
 * Fixnum, so `Date.new(600000, 1, 1).jd` is one Integer whatever `nth` the
 * split gave it. TS has no such unified Integer, so the same normalization is
 * what keeps a `bigint` out of the answers a JS number holds exactly.
 */
function bigNorm(n: bigint): number | bigint {
  if (-MAX_SAFE_INTEGER_BIG <= n && n <= MAX_SAFE_INTEGER_BIG) return Number(n);
  return n;
}

/**
 * @internal `date_core.c` `decode_year` (`date_core.c:1342-1371`), which splits
 * a year of any magnitude into a count of whole calendar periods — `nth` — and
 * a residue year that always fits an `int`, so every conversion below can keep
 * taking `int`s. The value divided is the year SHIFTED by 4712, so the
 * truncation the C's `FIX2INT` performs on its `big:` arm rounds toward -4712
 * rather than toward zero: `Date.new(-2000.5, 1, 1)` is -2001-01-01 and
 * `Date.new(2000.5, 1, 1)` is 2000-01-01 in MRI.
 *
 * The C's `FIXNUM_P` arm and its `big:` label are both here: the first is exact
 * in a JS number, and the second is exact only for a `bigint` argument — a
 * `double` that large has already lost the low bits before this is reached.
 */
export function decodeYear(y: number | bigint, style: number): [nth: bigint, ry: number] {
  const period = style < 0 ? CM_PERIOD_GCY : CM_PERIOD_JCY;
  if (typeof y === "number" && fixnumP(y) && y < Number.MAX_SAFE_INTEGER - 4712) {
    let it = y + 4712; /* shift */
    const inth = div(it, period);
    if (inth) it = mod(it, period);
    return [BigInt(inth), it - 4712 /* unshift */];
  }
  if (typeof y === "number") {
    let t = y + 4712; /* shift */
    const nth = div(t, period);
    if (nth) t = mod(t, period);
    return [BigInt(nth), Math.trunc(t) - 4712 /* unshift */];
  }
  let t = y + 4712n; /* shift */
  const nth = div(t, period);
  if (nth) t = mod(t, period);
  return [nth, Number(t) - 4712 /* unshift */];
}

/**
 * @internal `date_core.c` `encode_year` (`date_core.c:1373-1390`), the way back
 * from a `nth` and a residue year to the year the date names — a `bigint` once
 * `nth` is nonzero, as MRI's is a Bignum.
 */
function encodeYear(nth: bigint, y: number, style: number): number | bigint {
  const period = style < 0 ? CM_PERIOD_GCY : CM_PERIOD_JCY;
  if (nth === 0n) return y;
  return bigNorm(BigInt(period) * nth + BigInt(y));
}

/**
 * @internal The `NUM2LONG` MRI performs on `m_real_year` (`date_core.c:1746-1762`)
 * when `date_to_time` (`date_core.c:8949-8971`) and `datetime_to_time`
 * (`date_core.c:9032-9062`) hand the year to `Time.local` / `Time.new`.
 * `m_real_year` answers a Bignum once {@link Date#nth} is nonzero, and a Bignum
 * past a machine word raises there rather than converting — so the year is
 * carried as the `bigint` it is up to this point and narrowed only here, where
 * MRI narrows it. Ruby's `RangeError` is JS's, and the message is MRI's own
 * (`bignum too big to convert into 'long'`, `numeric.c`).
 */
function realYearToLong(year: number | bigint): number {
  if (typeof year === "number") return year;
  if (year < BigInt(Number.MIN_SAFE_INTEGER) || year > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("bignum too big to convert into `long'");
  }
  return Number(year);
}

/**
 * @internal `date_core.c` `decode_jd` (`date_core.c:1393-1402`), the Julian-day
 * counterpart of {@link decodeYear} over {@link CM_PERIOD}. The same `nth`
 * carries both, which is what keeps the split consistent: `CM_PERIOD` days are
 * `CM_PERIOD_GCY` Gregorian years.
 */
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

/** @internal `date_core.c` `encode_jd` (`date_core.c:1404-1412`). */
function encodeJd(nth: bigint, jd: number): number | bigint {
  if (nth === 0n) return jd;
  return bigNorm(BigInt(CM_PERIOD) * nth + BigInt(jd));
}

/**
 * @internal `date_core.c` `guess_style` (`date_core.c:1414-1433`), which
 * answers `-inf`, `+inf` or `0` for the calendar the year and start select: a
 * negative style is proleptic Gregorian, a positive one proleptic Julian, and
 * `0` means the reform round trip under `sg` decides.
 *
 * The C's middle arm — `!FIXNUM_P(y)`, a year Ruby holds as something other
 * than a Fixnum ({@link fixnumP}) — reads such a year proleptically without
 * ever comparing it to the reform years, because {@link decodeYear} is about to
 * fold it into a `nth` and a residue that no longer names the same century.
 */
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

/**
 * @internal `date_core.c` `c_valid_civil_p` (`date_core.c:766-790`), which
 * answers the date `y`-`m`-`d` names or `nil`. A negative `m` counts back from a
 * thirteenth month — `-1` is December — and a negative `d` back from the last
 * day of that month.
 *
 * Ruby rejects by round-tripping the civil triple through the Julian day, which
 * is how a day the calendar reform deleted — 1582-10-10 — comes back as a
 * different date and fails.
 *
 * The C's `rm`/`rd` out-parameters are the folded month and day, which every
 * caller re-derives from the `rjd` it keeps, so `rjd` alone comes back — `null`
 * for the C's `0`.
 *
 * `y` is an ALREADY-DECODED integer year, as the C's `int y` is: the truncation
 * and the `nth` split are {@link validCivilP}'s, which is what every constructor
 * reaches this through.
 */
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

/**
 * @internal `date_core.c` `valid_civil_p` (`date_core.c:2246-2277`), the year-
 * decoding wrapper every constructor's non-proleptic arm goes through: it
 * re-reads {@link guessStyle} and either validates the residue year under the
 * reform ({@link cValidCivilP}, whose `int y` this is what supplies) or, where
 * the style is proleptic, under the plain calendar and converts by hand.
 *
 * The C's `ry`/`rm`/`rd` out-parameters are the folded triple every caller
 * re-derives from `rjd`, so the `nth` and the `rjd` alone come back.
 */
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

/**
 * @internal The `Temporal.PlainDate` a Julian day names — the *return* seat,
 * not the state. `Date` itself carries the Julian day (`SimpleDateData`'s
 * `HAVE_JD` arm, `date_core.c:203-213`), so every civil date `Date::ITALY`
 * names is buildable; this is only reached where RFC 0088's mapping table says
 * a static answers `Temporal`, i.e. at {@link Date#toDate} and the statics over
 * it.
 *
 * `Temporal.PlainDate` is proleptic Gregorian and can hold only the spellings
 * that calendar has, so a Julian-only day such as the one 1500-02-29 names has
 * no `Temporal` value and this raises. `new Date(1500, 2, 29)` itself does not:
 * the gem-shaped object answers `to_s`, `jd`, `wday` and `yday` as MRI does,
 * and only the conversion to the `Temporal` seat has nowhere to put it.
 *
 * Not exported: it is the seam between the C's Julian day and the substrate.
 */
function plainDateFromJd(rjd: number, sg = DEFAULT_SG): Temporal.PlainDate {
  const [y, m, d] = cJdToCivil(rjd, sg);
  try {
    return Temporal.PlainDate.from({ year: y, month: m, day: d }, { overflow: "reject" });
  } catch {
    throw new DateError("invalid date");
  }
}

/**
 * @internal The brand that selects `d_simple_new_internal`
 * (`date_core.c:3036-3050`) / `d_complex_new_internal` (`date_core.c:3055-3071`)
 * — the C's static "seat an already-resolved Julian day, validate nothing"
 * constructors — over the public `Date.new` / `DateTime.new`.
 *
 * Both C functions are file-static, so `d_new_by_frags` and friends reach them
 * while no Ruby caller can. TS has no member visibility between "the class
 * body" and "exported", and both arms now take a leading `number`, so there is
 * no type left to overload on: a JS `Symbol` as the first parameter is the
 * brand that keeps the seam out of the public signature. It spells no Ruby
 * Symbol — nothing reads it as a value.
 */
export const SEAT: unique symbol = Symbol("d_simple_new_internal");

/**
 * @internal `date_core.c` `c_valid_time_p` (`date_core.c:870-886`), which folds
 * a negative field up from the end of its range the way `Date.new`'s negative
 * `mday` counts back from the end of the month, and accepts the `24:00:00` that
 * ends a day. The `rh`/`rmin`/`rs` C answers through out-parameters come back
 * as the tuple; `null` is its `0`.
 */
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

/**
 * @internal `date_core.c`'s `num2int_with_frac` macro (`date_core.c:3296-3304`)
 * over the `d_trunc` / `h_trunc` / `min_trunc` / `s_trunc` family
 * (`date_core.c:3216-3283`): the whole part is `f_idiv(v, 1)` — floor, not
 * truncate — and the fraction `f_mod(v, 1)`, which each `*_trunc` then divides
 * by its own unit's share of a day. A fraction is legal only in the LAST
 * argument supplied: the macro raises `"invalid fraction"` when `argc > n`,
 * which is `argcGtN` here — Ruby's `argc` has no TS analogue, so
 * the constructor's optional parameters are what carries the "was a later
 * argument passed" that the C reads off its `switch (argc)` fall-through.
 *
 * `fr` comes back in **seconds** rather than as `*_trunc`'s day fraction:
 * `add_frac` hands the day fraction to `d_lite_plus`, whose `T_FLOAT` arm
 * multiplies it straight back by `DAY_IN_SECONDS` (`date_core.c:6094-6097`), so
 * the two cancel and `unitInSeconds` is that product — `1` for a second,
 * `3600` for an hour. The T_RATIONAL arm a Rational argument takes does the
 * same `t = f_mul(t, INT2FIX(DAY_IN_SECONDS))` (`date_core.c:6197`), so the
 * cancellation — and this seconds scale — holds for both arms. Every consumer
 * of `fr2` stays in it: the constructor's `df += fr2.div(1)`, and `canon24oc`
 * adding `DAY_IN_SECONDS` where the C adds a day-unit `1`.
 *
 * `s_trunc`'s `wholenum_p` arm is what a `Rational` argument takes when it
 * reduces to an Integer, which our {@link Rational} does in its constructor —
 * so `new Rational(2, 1)` arrives here with a `1` denominator and comes back
 * with a `0` fraction, exactly as `DateTime.new(2008, 3, 1, 6, 0, Rational(2))`
 * does.
 */
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

/**
 * @internal `date_core.c`'s `num2num_with_frac` macro (`date_core.c:3286-3294`),
 * which differs from {@link num2intWithFrac} (`:3296-3305`) only in NOT running
 * the truncated whole through `NUM2INT`: `datetime_s_jd` (`date_core.c:7685`)
 * takes its Julian day this way so a day past a `Fixnum` reaches `decode_jd`
 * whole. A JS number is not narrowed either way, so that arm is the `int` one;
 * a `bigint` is the `Bignum` the macro keeps, and carries no fraction.
 */
function num2numWithFrac(
  v: number | bigint | Rational,
  unitInSeconds: number,
  argcGtN: boolean,
): [whole: number | bigint, fr: number | Rational] {
  if (typeof v === "bigint") return [v, 0];
  return num2intWithFrac(v, unitInSeconds, argcGtN);
}

/**
 * @internal `date_core.c` `c_valid_ordinal_p` (`date_core.c:674-695`) over
 * `c_ordinal_to_jd` (`date_core.c:556-564`), the `d`th day of year `y`. A
 * negative `d` counts back from the last day of the year — `-1` is 31 December
 * — and is rejected when the walk leaves `y`.
 *
 * Ruby rejects by round-tripping back through {@link cJdToOrdinal}, which is
 * how a walk that left `y` comes back naming a different year.
 */
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

/**
 * @internal `date_core.c` `c_find_fdoy` (`date_core.c:455-465`), the Julian day
 * of the first day of year `y`. Ruby scans January forwards, taking the first
 * day `c_valid_civil_p` accepts, because the calendar reform can delete 1
 * January itself. The C's success flag is the return and the day an
 * out-parameter; here the day IS the return and the C's `0` is `null`. Its `ns`
 * out-parameter has no reader.
 */
function cFindFdoy(y: number, sg = DEFAULT_SG): number | null {
  for (let d = 1; d < 31; d++) {
    const rjd = cValidCivilP(y, 1, d, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/**
 * @internal `date_core.c` `c_find_ldoy` (`date_core.c:467-476`), the Julian day
 * of the last day of year `y`, scanned backwards from 31 December for the same
 * reason as {@link cFindFdoy}.
 */
function cFindLdoy(y: number, sg = DEFAULT_SG): number | null {
  for (let i = 0; i < 30; i++) {
    const rjd = cValidCivilP(y, 12, 31 - i, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/**
 * @internal `date_core.c` `c_find_fdom` (`date_core.c:478-489`), the Julian day
 * of the first day of month `m` of year `y`, scanned forward from the 1st for
 * the same reason as {@link cFindFdoy}: October 1582 has no 5th under ITALY.
 */
function cFindFdom(y: number, m: number, sg = DEFAULT_SG): number | null {
  for (let d = 1; d < 31; d++) {
    const rjd = cValidCivilP(y, m, d, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/**
 * @internal `date_core.c` `c_find_ldom` (`date_core.c:490-499`), the Julian day
 * of the last day of month `m` of year `y`. The scan is what makes the length
 * of the month the CALENDAR's rather than the substrate's: February 1500 has 29
 * days under `Date::ITALY` and 28 read proleptically, so `Date.new(1500, 2, -1)`
 * counts back from the 29th as MRI does.
 */
function cFindLdom(y: number, m: number, sg = DEFAULT_SG): number | null {
  for (let i = 0; i < 30; i++) {
    const rjd = cValidCivilP(y, m, 31 - i, sg);
    if (rjd !== null) return rjd;
  }
  return null;
}

/**
 * @internal `date_core.c` `c_ordinal_to_jd` (`date_core.c:556-564`), the Julian
 * day of the `d`th day of year `y`. The C's `ns` out-parameter reports which
 * side of the calendar reform the answer landed on and has no bearer here, as
 * on {@link cCivilToJd}.
 */
function cOrdinalToJd(y: number, d: number, sg = DEFAULT_SG): number {
  // The C reads `*rjd` back without checking `c_find_fdoy`'s flag here and in
  // the four below: every year has a valid 1 January under any `sg`, so the
  // scan cannot come up empty.
  return cFindFdoy(y, sg)! + d - 1;
}

/**
 * @internal `date_core.c` `c_jd_to_ordinal` (`date_core.c:566-575`), the
 * inverse of {@link cOrdinalToJd}; the `ry`/`rd` out-parameters come back as
 * the tuple.
 */
function cJdToOrdinal(jd: number, sg = DEFAULT_SG): [ry: number, rd: number] {
  const [ry] = cJdToCivil(jd, sg);
  const rjd = cFindFdoy(ry, sg)!;
  return [ry, jd - rjd + 1];
}

/**
 * @internal `date_core.c` `c_commercial_to_jd` (`date_core.c:576-589`), the
 * `d`th day of the `w`th ISO week of commercial year `y`, `d` running `1`..`7`
 * from Monday: the year's first day floored back to the Monday on or before it,
 * then `w` weeks and `d` days on.
 */
function cCommercialToJd(y: number, w: number, d: number, sg = DEFAULT_SG): number {
  const rjd2 = cFindFdoy(y, sg)! + 3;
  return rjd2 - mod(rjd2, 7) + 7 * (w - 1) + (d - 1);
}

/** @internal `date_core.c` `c_jd_to_commercial` (`date_core.c:590-609`), the inverse of {@link cCommercialToJd}. */
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

/**
 * @internal `date_core.c` `c_valid_commercial_p` (`date_core.c:791-813`), which
 * counts a negative day back from Sunday and a negative week back from the end
 * of the commercial year before rebuilding the date and rejecting it if the
 * round-trip does not name the same `y`/`w`/`d` back.
 */
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

/**
 * @internal `date_core.c` `c_weeknum_to_jd` (`date_core.c:610-620`), the
 * Julian day of the `d`th day of the `w`th week of year `y`, where a week
 * starts on day `f` — `0` for the Sunday-based `:wnum0`, `1` for the
 * Monday-based `:wnum1` — `d` runs `0`..`6` from that day, and week `0` is the
 * partial week before the year's first one. Week `0` is therefore empty in a
 * year whose 1 January is itself an `f`-day: there, 1 January opens week `1`.
 */
function cWeeknumToJd(y: number, w: number, d: number, f: number, sg = DEFAULT_SG): number {
  const rjd2 = cFindFdoy(y, sg)! + 6;
  return rjd2 - mod(rjd2 - f + 1, 7) - 7 + 7 * w + d;
}

/** @internal `date_core.c` `c_jd_to_weeknum` (`date_core.c:621-634`), the inverse of {@link cWeeknumToJd}. */
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

/**
 * @internal `date_core.c` `c_valid_weeknum_p` (`date_core.c:815-838`), the
 * `:wnum0`/`:wnum1` counterpart of {@link cValidCommercialP}: same two
 * normalizations and the same round-trip rejection, but over a `0`..`6` week
 * rather than a `1`..`7` one, so a negative day takes `7` where the commercial
 * one takes `8`.
 */
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

/**
 * @internal `date_core.c` `rt__valid_jd_p` (`date_core.c:4119-4123`), which
 * answers the Julian day back: every integer names a day, so there is nothing
 * to reject.
 */
function rtValidJdP(jd: number | bigint): number | bigint {
  return jd;
}

/**
 * @internal `date_core.c` `rt__valid_ordinal_p` (`date_core.c:4126-4139`) over
 * `c_valid_ordinal_p` (`date_core.c:747-768`), which answers `nil` rather than
 * raising so its caller can fall through to the next kind of date.
 */
function rtValidOrdinalP(y: number, d: number, sg = DEFAULT_SG): number | null {
  return cValidOrdinalP(y, d, sg);
}

/**
 * @internal `date_core.c` `rt__valid_civil_p` (`date_core.c:4141-4155`) over
 * {@link validCivilP} (`date_core.c:2246-2277`), which answers `nil` rather
 * than raising so its caller can fall through to the next kind of date. The
 * `nth` the split leaves goes straight back in through {@link encodeJd}
 * (`date_core.c:4152`): the answer is one whole Julian day, which
 * `d_new_by_frags` / `dt_new_by_frags` decode again on the way into the object.
 */
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

/**
 * @internal `date_core.c` `rt__valid_date_frags_p` (`date_core.c:4186-4278`),
 * which tries each kind of date the completed fields could name in turn and
 * answers the first that makes one: the Julian day, the ordinal date — a
 * `:year` and a `:yday`, which is what `"2008070"` names — the civil one, the
 * commercial one — a `:cwyear`, a `:cweek` and a `:cwday`, which is what
 * `"2001-W05-6"` names — and then the two week-numbered ones. An arm whose
 * fields are present but do not make a date does not answer: it falls through
 * to the next, which is why an invalid civil date can still resolve as a week
 * number rather than raising outright.
 *
 * The commercial arm reads `:cwday` and falls back to a `:wday` whose `0` it
 * maps to `7`, which is how `"2001-W05 sun"` names the Sunday of that ISO week;
 * the `:wnum0` arm mirrors it the other way, mapping a `:cwday` of `7` to `0`.
 *
 * When no arm answers Ruby answers `nil` — `"Feb 3rd"` parsed with no
 * completion has no `:year` at all — and `d_new_by_frags`
 * (`date_core.c:4283-4300`) is what turns that `nil` into
 * `Date::Error, "invalid date"`.
 *
 * `sg` is the calendar-reform start every arm reads its date under, as Ruby
 * threads it.
 */
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
      const d = cValidCommercialP(parts.cwyear, parts.cweek, wday, sg);
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
      const d = cValidWeeknumP(parts.year, parts.wnum0, wday, 0, sg);
      if (d !== null) return d;
    }
  }

  {
    let wday = parts.wday;
    if (wday === undefined) wday = parts.cwday;
    if (wday !== undefined) wday = mod(wday - 1, 7);

    if (wday !== undefined && parts.wnum1 !== undefined && parts.year !== undefined) {
      const d = cValidWeeknumP(parts.year, parts.wnum1, wday, 1, sg);
      if (d !== null) return d;
    }
  }
  return null;
}

/**
 * @internal `date_core.c` `d_new_by_frags` (`date_core.c:4282-4304`), which
 * turns the frags `Date._parse` found into a date and raises
 * `Date::Error, "invalid date"` when none of them names one. A frag set that
 * already names a civil date — no `:jd` and no `:yday`, but a `:year`, a
 * `:mon` and a `:mday` — goes straight to {@link rtValidCivilP}, skipping both
 * {@link rtRewriteFrags} and {@link completeFrags}.
 */
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

/**
 * @internal `date_core.c` `of2str` (`date_core.c:1973-1980`) over its
 * `decode_offset` macro (`date_core.c:1964-1971`): the `±HH:MM` spelling of an
 * offset in seconds, which is what `DateTime#zone` answers. Seconds below the
 * minute are dropped, as the `"%c%02d:%02d"` format has nowhere to put them.
 */
export function of2str(of: number): string {
  const s = of < 0 ? "-" : "+";
  const a = of < 0 ? -of : of;
  const h = Math.floor(a / HOUR_IN_SECONDS);
  const m = Math.floor((a % HOUR_IN_SECONDS) / MINUTE_IN_SECONDS);
  return `${s}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * @internal `date_core.c` `dt_new_by_frags` (`date_core.c:8239-8322`), the
 * `DateTime` counterpart of {@link dNewByFrags}: the same civil fast path and
 * the same `rt_rewrite_frags`/`rt_complete_frags` fallback, but it also reads
 * the time of day — defaulting each field to `0` and folding a leap second's
 * `60` back to `59` — and the `:offset` `date_zone_to_diff` left in the frags.
 *
 * Ruby then moves the day and day-fraction to UTC (`jd_local_to_utc` /
 * `df_local_to_utc`, `date_core.c:8311-8313`) and converts back on every read,
 * and hands the converted pair to `d_complex_new_internal` — so the conversion
 * happens here, at the C's own call site, and the constructor's UTC overload
 * takes the result as it is.
 *
 * `:offset` is read with `NUM2INT` into a C `int` (`date_core.c:8301`), so a
 * `Rational` fragment — what `date_zone_to_diff` answers for a fractional-hour
 * zone past two decimal places (`date_parse.c:523-528`) — is truncated toward
 * zero, and it is the truncated value the bound below is applied to.
 *
 * The `:offset` bound (`date_core.c:8297-8306`) is ported as written — strictly
 * outside `±DAY_IN_SECONDS` is ignored rather than raised on. It is unreachable
 * from `Date._parse`, since `date_zone_to_diff` already answers `nil` for a
 * zone that far out and the `NIL_P` arm above takes it — on ruby 3.3.11
 * `Date._parse("2008-03-01T06:00:00+99:00")[:offset]` is `nil` and
 * `DateTime.parse` of it answers `"+00:00"` — but the C tests it, so this does.
 *
 * The one thing the UTC round-trip does observably is
 * normalize the `86400` a `24:00:00` time of day makes — `jd_local_to_utc`'s
 * `df >= DAY_IN_SECONDS` arm rolls the day and the reader answers hour `0`, so
 * `DateTime.parse("2008-03-01T24:00:00")` is 2008-03-02T00:00:00. That now
 * falls out of the representation rather than being normalized here.
 */
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
  // `ns_to_sec`, `m_sf`'s only reader, answers `rb_rational_new2` for an
  // Integer `sf` (`date_core.c:993-998`), so the store carries the Rational.
  const sf = ns instanceof Rational ? ns : new Rational(ns, 1);

  const to = hash.offset;
  // `NUM2INT` (`date_core.c:8301`) reads the fragment into a C `int`, so a
  // `Rational` offset truncates toward zero before the bound below — not
  // `round()`: 34399.8 becomes 34399.
  let of = to == null ? 0 : to instanceof Rational ? to.toI() : Math.trunc(to);
  if (of < -DAY_IN_SECONDS || of > DAY_IN_SECONDS) of = 0;

  const [nth, rjd] = decodeJd(jd);
  return new DateTime(SEAT, nth, jdLocalToUtc(rjd, df, of), dfLocalToUtc(df, of), sf, of, sg);
}

/**
 * @internal C's `round()` from `math.h`, which rounds half **away from zero**.
 * JS `Math.round` rounds half **up**, so it sends `-0.5` to `-0` where C sends
 * it to `-1`.
 */
function round(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** @internal `date_core.c` `day_to_sec` (`date_core.c:1029-1035`). */
function dayToSec(d: Rational): Rational {
  return d.mul(DAY_IN_SECONDS);
}

/**
 * @internal `date_core.c` `offset_to_sec` (`date_core.c:2369-2452`): reads a
 * user-supplied offset — a **day fraction**, not seconds — into seconds east of
 * UTC. C answers `0`/`1` for failure/success and writes through `rof`; `null`
 * is the failure and the number is `rof`.
 *
 * The C switches on the Ruby type. JS has one numeric type, so the Fixnum arm
 * (`:2376-2385`, which accepts only `-1`, `0` and `1` and multiplies by
 * `DAY_IN_SECONDS`) is taken for an integral number and the Float arm
 * (`:2386-2397`, which multiplies by `DAY_IN_SECONDS` and bounds at
 * `±DAY_IN_SECONDS`) for a fractional one. The split is exact rather than a
 * choice: the Float arm's bound admits exactly `|n| <= 1`, whose integral
 * members are the Fixnum arm's `-1`, `0`, `1` and give the same second — so no
 * integral value is read differently by the two arms. The remaining arms keep
 * the C's own case order: `default`, which `f_to_r`s a numeric and falls
 * through into `T_RATIONAL` (`:2398-2434`), then `T_STRING` (`:2435-2449`).
 *
 * The Rational arm bounds only the branch that rounds. A `day_to_sec` whose
 * denominator reduces to `1` is taken as-is (`:2421-2422`) and never bounds-
 * checked, which is why on ruby 3.3.11
 * `DateTime.new(2000,1,1,0,0,0,Rational(2,1)).zone` is `"+48:00"` — two whole
 * days east — rather than the rejection `±DAY_IN_SECONDS` would suggest.
 *
 * C's `rb_warning("fraction of offset is ignored")` has no port analogue: it
 * writes to stderr under `$VERBOSE` only and is not part of the value.
 */
function offsetToSec(vof: number | bigint | Rational | string): number | null {
  // `default:` (`:2398-2405`) — `expect_numeric` then `f_to_r`, so a Bignum
  // arrives at the `T_RATIONAL` arm and a non-Numeric raises; a Numeric whose
  // `to_r` is not a Rational reaches `Check_Type` and raises there.
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
    return round(n);
  }
  if (vof instanceof Rational) {
    const vs = dayToSec(vof);
    let n: number;
    if (vs.denominator === 1n) {
      n = Number(vs.numerator);
    } else {
      n = vs.round();
      if (n < -DAY_IN_SECONDS || n > DAY_IN_SECONDS) return null;
    }
    return n;
  }
  const vs = dateZoneToDiff(vof);
  // `!FIXNUM_P(vs)` (`:2444`) — `nil` for a zone it does not know, and a
  // `Rational` for a fractional-hour offset that did not reduce to an integer.
  if (vs === null || vs instanceof Rational) return null;
  if (vs < -DAY_IN_SECONDS || vs > DAY_IN_SECONDS) return null;
  return vs;
}

/**
 * @internal `date_core.c`'s `add_frac()` macro (`date_core.c:3313-3317`), the
 * tail every `Date` class method shares: a nonzero day-fraction makes the
 * answer `d_lite_plus(ret, fr2)` — a `Date` backed by `ComplexDateData` — and a
 * zero one leaves `ret` alone. The C spells it as a macro over a fixed `ret` /
 * `fr2` pair, which is why it takes no arguments there and two here.
 */
function addFracTo(ret: Date, fr2: number | Rational): Date {
  if (fr2 instanceof Rational ? fr2.isZero() : fr2 === 0) return ret;
  return ret.plus(fr2);
}

/**
 * @internal `date_core.c` `val2off` (`date_core.c:5071-5077`), the macro every
 * user-facing `offset` argument is read through: whatever `offset_to_sec`
 * rejects warns `"invalid offset is ignored"` and becomes `0`.
 */
function val2off(vof: number | bigint | Rational | string): number {
  return offsetToSec(vof) ?? 0;
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
 * Ruby `Date::Infinity` (ruby/date, `lib/date.rb:17-68`), the `:nodoc:`
 * `Numeric` subclass a `Range` of dates uses as an unbounded endpoint. It is
 * reached as `Date.Infinity`, the name Ruby nests it under; this binding is
 * spelled `DateInfinity` for the same reason {@link DateError} is spelled that
 * way — `Infinity` is a global, so declaring one shadows it for the whole
 * module (`no-shadow-restricted-names`) and {@link JULIAN} / {@link GREGORIAN}
 * are that global. A class EXPRESSION assigned straight to `Date.Infinity`
 * would keep the name, but declaration emit rejects it over the `protected`
 * {@link DateInfinity#d} (TS4094).
 *
 * `Numeric` has no trails port, so the class stands alone — every member the
 * gem defines is here, and of Ruby's inherited surface only `Comparable`'s is:
 * `Numeric` includes it (Ruby core `numeric.c` `Init_Numeric`,
 * `rb_include_module(rb_cNumeric, rb_mComparable)`), and those six operators
 * are what a `Range` calls on an endpoint — which is this class's whole job
 * (`test_date.rb:9` `test_range_infinite_float`, `:166`
 * `test_infinity_comparison`). They are NOT reimplemented per operator: each is
 * `cmpint` over {@link DateInfinity#compareTo} exactly as `Comparable` derives
 * them, so `<=>` (`lib/date.rb:35-48`) stays the single definition. Porting
 * `Numeric` itself to carry them is the alternative, and it is not taken here:
 * the gem's own inheritance is a Ruby-core class trails has no other caller for,
 * and `Comparable` is a module with no members of its own to port — the derived
 * bodies below ARE the module.
 *
 * The rest of `Numeric` (`step`, `div`, `fdiv`, `integer?`, …) remains absent;
 * `Date::Infinity` overrides everything of it the gem itself reaches for.
 */
export class DateInfinity {
  /**
   * Ruby `@d` (ruby/date, `lib/date.rb:19`), the sign of the constructor's
   * argument — or `nil`, for the NaN whose `<=> 0` has no answer.
   */
  readonly #d: number | null;

  /**
   * Ruby `Date::Infinity#initialize(d=1)` (ruby/date, `lib/date.rb:19`), which
   * stores `d <=> 0`.
   *
   * `Float::NAN <=> 0` is `nil`, so Ruby BUILDS the object and stores `nil`.
   * Each reader below then raises `NoMethodError` off that stored `nil` at its
   * own call site, or — where the operator involved is `<=>` itself — answers
   * `nil` without raising. JS raises on none of Ruby's `nil`-receiver sites
   * (`-null` is `-0`, `null > 0` is `false`), so the raise is spelled
   * explicitly in each body Ruby raises from, at the same operator and with
   * the same message.
   */
  constructor(d: number = 1) {
    this.#d = spaceship(d, 0);
  }

  /** Ruby `Date::Infinity#d` (ruby/date, `lib/date.rb:21-23`), marked `protected`. */
  protected d(): number | null {
    return this.#d;
  }

  /** Ruby `Date::Infinity#zero?` (ruby/date, `lib/date.rb:25`). */
  isZero(): false {
    return false;
  }

  /** Ruby `Date::Infinity#finite?` (ruby/date, `lib/date.rb:26`). */
  isFinite(): false {
    return false;
  }

  /**
   * Ruby `Date::Infinity#infinite?` (ruby/date, `lib/date.rb:27`), which
   * answers `d.nonzero?` — the sign itself, or `nil` when it is zero — not a
   * boolean.
   */
  isInfinite(): number | null {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method 'nonzero?' for nil");
    return d !== 0 ? d : null;
  }

  /** Ruby `Date::Infinity#nan?` (ruby/date, `lib/date.rb:28`), `d.zero?`. */
  isNan(): boolean {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method 'zero?' for nil");
    return d === 0;
  }

  /** Ruby `Date::Infinity#abs` (ruby/date, `lib/date.rb:30`). */
  abs(): DateInfinity {
    return new (this.constructor as new (d?: number) => DateInfinity)();
  }

  /** Ruby `Date::Infinity#-@` (ruby/date, `lib/date.rb:32`). */
  negate(): DateInfinity {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method '-@' for nil");
    return new (this.constructor as new (d?: number) => DateInfinity)(-d);
  }

  /** Ruby `Date::Infinity#+@` (ruby/date, `lib/date.rb:33`). */
  identity(): DateInfinity {
    const d = this.d();
    if (d === null) throw new NoMethodError("undefined method '+@' for nil");
    return new (this.constructor as new (d?: number) => DateInfinity)(+d);
  }

  /**
   * Ruby `Date::Infinity#<=>` (ruby/date, `lib/date.rb:35-48`). The `Numeric`
   * arm answers `d` itself — the sign — rather than a spaceship of the two
   * values, and the `coerce` fallback answers `nil` for an `other` that has no
   * `coerce`. Ruby spells that fallback `rescue NoMethodError`; the equivalent
   * here is the presence check rather than a `catch`, because JS reports a
   * missing method as the same `TypeError` a real `coerce` would raise from
   * inside itself, and Ruby lets that one through. The pair it answers goes
   * back through `l <=> r` (`lib/date.rb:43`) — the same nil-producing
   * {@link spaceship} the arms above use, so an incomparable or NaN-ish pair
   * answers `nil` rather than a `NaN` a raw `Math.sign` would let out.
   */
  compareTo(other: unknown): number | null {
    if (other instanceof DateInfinity) return spaceship(this.d(), other.d());
    if (other === Number.POSITIVE_INFINITY) return spaceship(this.d(), 1);
    if (other === Number.NEGATIVE_INFINITY) return spaceship(this.d(), -1);
    if (typeof other === "number" || other instanceof Rational) return this.d();
    const coerce = (other as { coerce?: (x: unknown) => [number, number] } | null)?.coerce;
    if (typeof coerce === "function") {
      const [l, r] = coerce.call(other, this);
      return spaceship(l, r);
    }
    return null;
  }

  /**
   * Ruby `Comparable#cmp_int` over `rb_cmperr` (Ruby core `compar.c`), the one
   * body every operator below is derived from: a `nil` `<=>` is an
   * `ArgumentError`, not a `false`. `rb_cmperr` names the operand by `inspect`
   * when it is a special constant or a Float, and by `rb_obj_class` otherwise.
   */
  #cmpint(other: unknown): number {
    const c = this.compareTo(other);
    if (c === null) {
      const rhs =
        other == null || typeof other === "boolean" || kNumericP(other)
          ? String(other)
          : ((other as object)?.constructor?.name ?? typeof other);
      throw new ArgumentError(`comparison of Date::Infinity with ${rhs} failed`);
    }
    return c;
  }

  /** Ruby `Comparable#<` (Ruby core `compar.c` `cmp_lt`), `cmpint < 0`. */
  lessThan(other: unknown): boolean {
    return this.#cmpint(other) < 0;
  }

  /** Ruby `Comparable#<=` (Ruby core `compar.c` `cmp_le`), `cmpint <= 0`. */
  lessThanOrEqual(other: unknown): boolean {
    return this.#cmpint(other) <= 0;
  }

  /** Ruby `Comparable#>` (Ruby core `compar.c` `cmp_gt`), `cmpint > 0`. */
  greaterThan(other: unknown): boolean {
    return this.#cmpint(other) > 0;
  }

  /** Ruby `Comparable#>=` (Ruby core `compar.c` `cmp_ge`), `cmpint >= 0`. */
  greaterThanOrEqual(other: unknown): boolean {
    return this.#cmpint(other) >= 0;
  }

  /**
   * Ruby `Comparable#==` (Ruby core `compar.c` `cmp_equal`), the one derived
   * operator that does NOT raise: an incomparable operand — a `nil` `<=>` — is
   * `false` here. This is the same shape {@link Date#equals} takes.
   */
  equals(other: unknown): boolean {
    return this.compareTo(other) === 0;
  }

  /**
   * Ruby `Comparable#between?` (Ruby core `compar.c` `cmp_between`), which is
   * `cmpint` on both ends and so raises for an operand `<=>` cannot place.
   */
  isBetween(min: unknown, max: unknown): boolean {
    return this.#cmpint(min) >= 0 && this.#cmpint(max) <= 0;
  }

  /**
   * Ruby `Date::Infinity#coerce` (ruby/date, `lib/date.rb:51-57`). The `else`
   * arm is `super` — `Numeric#coerce` ({@link numCoerce}), which takes both
   * sides through `Float()`; `Float(self)` succeeds, because `rb_Float`
   * converts through `to_f` and {@link DateInfinity#toF} is defined.
   */
  coerce(other: unknown): [number, number] {
    if (typeof other === "number" || other instanceof Rational) {
      const d = this.d();
      if (d === null) throw new NoMethodError("undefined method '-@' for nil");
      return [-d, d];
    } else {
      return numCoerce(this, other);
    }
  }

  /** Ruby `Date::Infinity#to_f` (ruby/date, `lib/date.rb:59-66`). */
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

/**
 * @noRailsEquivalent PERMANENT — the `ruby/date` gem's `::Date`. Rails never
 * defines the class, only reopens it. The gem does have a counterpart now that
 * it is vendored, but it is C — `vendor/date/ext/date/date_core.c` — and
 * `extract-ruby-api.rb` parses Ruby, so `api:compare` cannot credit it
 * (RFC 0088 `date-c-source-extractor-decision`: `lib/date.rb` credits 12
 * methods, none of them these). The gem's `test/date/` suite is the fidelity
 * measure instead; see `vendor/sources.ts`'s `date` entry.
 */
/**
 * @internal `date_core.c` `simple_dat_p` (`date_core.c:1140`), true for
 * `SimpleDateData` and false for `ComplexDateData`. It is the data's shape, not
 * the class: a `DateTime` is always complex, and a `Date` is too once
 * `d_lite_plus` has given it a day fraction.
 */
function simpleDatP(dat: Date): boolean {
  return !dat.complexDatP();
}

/**
 * @internal `date_core.c` `k_numeric_p` (`date_core.c:1073`), true for the
 * Numeric operands `cmp_gen` and `equal_gen` admit. Ruby's Numeric covers
 * Integer, Float and Rational; JS's covers `number` and `bigint`, and the
 * gem's own {@link Rational} joins them.
 */
function kNumericP(other: unknown): other is number | bigint | Rational {
  return typeof other === "number" || typeof other === "bigint" || other instanceof Rational;
}

/**
 * @internal `date_core.c` `expect_numeric` (`:2014-2019`), the `k_numeric_p`
 * guard the `default:` arm of every arithmetic operator ends at. The parameter
 * types already spell the numeric union, but they do not hold at a JS call
 * site, and the gem's own `test__plus__ex` / `test__minus__ex` assert the
 * `TypeError` for a String, a `Time` and a `Numeric` whose `to_r` answers
 * itself (`vendor/date/test/date/test_date_arith.rb:33,:73`).
 */
function expectNumeric(x: unknown): void {
  if (!kNumericP(x)) throw new TypeError("expected numeric");
}

/**
 * @internal `Float#to_r` (`rational.c` `float_to_r`), the exact binary value of
 * a JS number. `d_lite_rshift`'s `f_add3` answers a Float for a Float `other`
 * and its `f_idiv` / `f_mod` then work in Float; the value is the same either
 * way, and carrying it as an exact {@link Rational} lets the one `else` arm
 * serve both Numerics. A non-finite Float has no exact ratio and Ruby's own
 * `rb_num2int` refuses it, so it raises {@link FloatDomainError} here — the
 * error `f_idiv` reaches first in the C.
 */
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

/**
 * @internal `f_mul(n, INT2FIX(12))` as `d_lite_next_year` / `d_lite_prev_year`
 * (`date_core.c:6554-6563`, `:6571-6580`) apply it — the one place the month
 * wrappers scale their argument before handing it to `Date#>>` / `Date#<<`,
 * and the reason those two take every Numeric `d_lite_rshift` does.
 */
function fMul12(n: number | bigint | Rational): number | bigint | Rational {
  if (n instanceof Rational) return n.mul(12);
  return typeof n === "bigint" ? n * 12n : n * 12;
}

/**
 * @internal `date_core.c` `f_cmp` (`:74-86`), the `<=>` dispatch the C's
 * arithmetic reaches for a non-Fixnum operand. The `FIXNUM_P(x) && FIXNUM_P(y)`
 * arm is the subtraction below; it is widened to every JS `number` because
 * Ruby's non-Fixnum Float reaches `Float#<=>`, which answers the same sign.
 * Everything else goes through `rb_cmpint`, which raises `ArgumentError` for
 * the `nil` a `<=>` that declines to answer gives back — including the `nil`
 * Ruby's own `Object#<=>` answers for an unrelated operand, which is why an
 * object carrying no `cmp` at all takes that arm rather than failing on the
 * call. `test_step__compare`
 * (`vendor/date/test/date/test_date_arith.rb:290-303`) asserts both arms of
 * that through `Date#step`'s step argument.
 */
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

/**
 * @internal The loop of `date_core.c` `d_lite_upto` (`:6665-6671`) as a
 * generator, driving both arms of {@link Date#upto} the way
 * {@link dLiteStepEnum} drives {@link Date#step}. The C writes this loop out
 * rather than calling `d_lite_step`, so it is its own body here too.
 */
function* dLiteUptoEnum(self: Date, max: Date): Generator<Date> {
  let date = self;
  while (date.cmp(max)! <= 0) {
    yield date;
    date = date.plus(1);
  }
}

/**
 * @internal The loop of `date_core.c` `d_lite_downto` (`:6686-6692`), the
 * counterpart to {@link dLiteUptoEnum} and, like it, written out in the C
 * rather than delegated to `d_lite_step`.
 */
function* dLiteDowntoEnum(self: Date, min: Date): Generator<Date> {
  let date = self;
  while (date.cmp(min)! >= 0) {
    yield date;
    date = date.plus(-1);
  }
}

/**
 * @internal The loop of `date_core.c` `d_lite_step` (`:6631-6652`) — the three
 * arms of the sign of `f_cmp(step, 0)` — as a generator, so the block arm and
 * the `RETURN_ENUMERATOR` arm of {@link Date#step} both drive it, exactly as
 * the C reaches the one body twice.
 */
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

/**
 * @internal `date_core.c` `minus_dd` (`:6272-6321`), the difference between two
 * dates in days, as a Rational: the whole {@link CM_PERIOD}s, days,
 * day-fraction and sub-second, each carried into the term below, then summed.
 */
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

/**
 * @internal `date_core.c` `check_numeric` (`date_core.c:67-72`), the guard
 * every constructor runs over each field it was passed: a non-Numeric is a
 * `TypeError`, where the `valid_*?` predicates answer `false` for the same
 * argument (`RETURN_FALSE_UNLESS_NUMERIC`, `date_core.c:2513` and friends).
 * TypeScript's parameter types say the same thing for a typed caller; this is
 * the runtime half, which is what `test_invalid_types` exercises.
 */
function checkNumeric(obj: unknown, field: string): void {
  if (!kNumericP(obj)) throw new TypeError(`invalid ${field} (not numeric)`);
}

/**
 * @internal `date_core.c` `cmp_gen` (`date_core.c:6694-6705`), the
 * `!k_date_p(other)` arm of `d_lite_cmp`: an astronomical-Julian-day
 * comparison, where the `k_date_p` arm compares the stored day. Its
 * `rb_num_coerce_cmp` tail answers `nil` for an object that does not coerce.
 */
function cmpGen(self: Date, other: unknown): number | null {
  if (kNumericP(other)) return self.ajd.cmp(other);
  else if (other instanceof Date) return self.ajd.cmp(other.ajd);
  return null;
}

/**
 * @internal `date_core.c` `cmp_dd` (`date_core.c:6707-6761`), the full
 * `nth`/`jd`/`df`/`sf` comparison — the arm every `Date`-to-`DateTime`
 * comparison takes.
 */
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

/**
 * @internal `date_core.c` `equal_gen` (`date_core.c:6845-6855`), the day
 * comparison `d_lite_equal` falls back to. `m_real_local_jd` is
 * {@link Date#jd}, and `f_jd(other)` is the same reader on the other side, so
 * the Numeric and `Date` arms are one comparison over two operand spellings.
 */
function equalGen(self: Date, other: unknown): boolean | null {
  if (kNumericP(other)) return new Rational(self.jd, 1).cmp(other) === 0;
  else if (other instanceof Date) return self.jd == other.jd;
  return null;
}

/**
 * ruby/date `deconstruct_keys` (`date_core.c:7416-7464`), the one body both
 * `d_lite_deconstruct_keys` (`:7500-7504`) and `dt_lite_deconstruct_keys`
 * carry an `is_datetime` flag into: `keys` of `null` answers every pair, an
 * Array answers only the names it lists, and an unlisted name is simply
 * absent. Anything else raises `TypeError` (`date_core.c:7440-7445`) before
 * the loop.
 */
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
  /**
   * Ruby `Date::Error` (ruby/date, `date_core.c` `Init_date_core`), raised by
   * `Date.parse` and a subclass of `ArgumentError`.
   */
  static Error = DateError;

  /**
   * Ruby `Date::ITALY` (ruby/date, `date_core.c:186`), the Julian day of
   * 1582-10-15 and the default `start`.
   */
  static ITALY = ITALY;

  /**
   * Ruby `Date::ENGLAND` (ruby/date, `date_core.c:187`), the Julian day of
   * 1752-09-14.
   */
  static ENGLAND = ENGLAND;

  /**
   * Ruby `Date::JULIAN` (ruby/date, `date_core.c:188`), `Float::INFINITY` — a
   * `start` under which every date is read as Julian.
   */
  static JULIAN = JULIAN;

  /**
   * Ruby `Date::GREGORIAN` (ruby/date, `date_core.c:189`), `-Float::INFINITY` —
   * a `start` under which every date is read as (proleptic) Gregorian.
   */
  static GREGORIAN = GREGORIAN;

  /**
   * Ruby `Date::MONTHNAMES` (ruby/date, `date_core.c:9598` over `monthnames`,
   * `date_core.c:9420-9426`), whose element `0` is `nil` so the array is
   * indexed by month number. Frozen, as `mk_ary_of_str`
   * (`date_core.c:9445-9457`) leaves it.
   */
  static MONTHNAMES: readonly (string | null)[] = Object.freeze([null, ...MONTH_NAMES]);

  /**
   * Ruby `Date::ABBR_MONTHNAMES` (ruby/date, `date_core.c:9603` over
   * `abbr_monthnames`, `date_core.c:9428-9433`).
   */
  static ABBR_MONTHNAMES: readonly (string | null)[] = Object.freeze([null, ...ABBR_MONTH_NAMES]);

  /**
   * Ruby `Date::DAYNAMES` (ruby/date, `date_core.c:9609` over `daynames`,
   * `date_core.c:9435-9438`), indexed by `wday`.
   */
  static DAYNAMES: readonly string[] = Object.freeze([...DAY_NAMES]);

  /**
   * Ruby `Date::ABBR_DAYNAMES` (ruby/date, `date_core.c:9614` over
   * `abbr_daynames`, `date_core.c:9440-9443`).
   */
  static ABBR_DAYNAMES: readonly string[] = Object.freeze([...ABBR_DAY_NAMES]);

  /**
   * @internal The whole of the state, where ruby/date's `SimpleDateData`
   * (`date_core.c:203-213`) carries a Julian day, a civil triple, the
   * calendar-reform start `sg` both are read under, and a `flags` word saying
   * which of the two has been computed (`HAVE_JD` / `HAVE_CIVIL`,
   * `date_core.c:173-183`).
   *
   * The pair exists in C because the two representations disagree across the
   * reform: under `Date::ITALY` the days 1582-10-05..14 do not exist, and a
   * Julian date such as 1500-02-29 is a real day with no proleptic Gregorian
   * spelling.
   *
   * The stored half is the Julian day — the C's `HAVE_JD` arm — and the civil
   * triple is decoded from it on read through {@link cJdToCivil} under
   * {@link DEFAULT_SG}, exactly as `get_s_civil` (`date_core.c:1189-1204`)
   * does. Keeping the calendar-neutral half is what
   * makes both cases above representable: `wday`, `yday` and `%s` are the
   * reform's readings rather than proleptic ones, and `Date.new(1500, 2, 29)`
   * builds, as MRI's does.
   *
   * The `start` ARGUMENT is {@link #sg} below: every conversion is read under
   * it, and {@link Date#start}, {@link Date#isJulian} and
   * {@link Date#newStart} answer off it.
   *
   * It is optional because `date_initialize`'s proleptic-Gregorian arm
   * (`date_core.c:3532-3542`) stores `HAVE_CIVIL` alone with no Julian day at
   * all; {@link Date.#getSJd} is `get_s_jd` (`date_core.c:1168-1187`), which
   * fills it in on first read.
   */
  #jd?: number;

  /**
   * @internal `ComplexDateData`'s `df`, `sf` and `of` (`date_core.c:215-231`) —
   * the day fraction in seconds, the sub-second in nanoseconds, and the UTC
   * offset in seconds. They are `undefined` exactly when the data is
   * `SimpleDateData`, the `flags` bit {@link Date#complexDatP} reads.
   *
   * A `::Date` really can carry them: `d_lite_plus`'s fractional arms build
   * `d_complex_new_internal(rb_obj_class(self), ...)` (`date_core.c:6145`,
   * `date_core.c:6250`), so `Date.new(2001, 1, 1) + Rational(1, 2)` is a `Date`
   * whose `day_fraction` is `(1/2)`. The time-of-day READERS stay on
   * {@link DateTime} (`d_lite_hour` and friends are defined on `cDateTime`
   * alone, `date_core.c:9928-9934`), so such a `Date` answers
   * `respond_to?(:hour)` false, as MRI's does.
   */
  #df?: number;
  #sf?: Rational;
  #of?: number;

  /**
   * @internal `SimpleDateData`'s `nth` (`date_core.c:203-213`), the count of
   * whole {@link CM_PERIOD}s the Julian day — and, over
   * {@link CM_PERIOD_GCY}/{@link CM_PERIOD_JCY}, the year — sits above zero. It
   * is what keeps `Date.new(2**70, 1, 1)` exact: the residue in {@link #jd} and
   * the civil triple stays an `int`, as the C's does, and every conversion
   * below keeps taking `int`s while {@link encodeJd} / {@link encodeYear} put
   * the magnitude back on the way out.
   *
   * Not `#`-private: {@link DateTime} reads it, and `ComplexDateData` carries
   * the same field (`date_core.c:215-231`).
   */
  nth: bigint;

  /**
   * @internal `SimpleDateData`'s `sg` (`date_core.c:203-213`), the
   * calendar-reform start the date is read under — the `start` argument every
   * constructor takes, {@link DEFAULT_SG} when none is passed.
   */
  readonly #sg: number;

  /**
   * @internal `SimpleDateData`'s civil fields (`date_core.c:203-213`), which
   * the civil decode below fills in on first read and the `HAVE_CIVIL` flag
   * then marks present.
   */
  #civil?: [ry: number, rm: number, rdom: number];

  /**
   * Ruby `Date.new(year = -4712, month = 1, mday = 1)` (ruby/date,
   * `date_core.c` `date_s_civil`), which raises `Date::Error` on a civil date
   * `c_valid_civil_p` rejects.
   *
   * `mday` is the only argument `date_initialize` reads a fraction off —
   * `num2int_with_frac(d, positive_inf)` (`date_core.c:3524`), whose
   * `positive_inf` is why it never raises `"invalid fraction"`. That fraction
   * comes back in DAYS here (a `unitInSeconds` of `1`) because its consumer is
   * `d_lite_plus`, which takes days; the {@link DateTime} constructor scales to
   * seconds instead because its consumer is {@link addFrac}.
   *
   * `add_frac()` (`date_core.c:3557`, the macro at `:3313-3317`) then answers
   * `d_lite_plus(self, fr2)` — a DIFFERENT object from the one being
   * initialized, carrying `ComplexDateData` for the day-fraction. Ruby returns
   * it because `date_s_civil` returns `date_initialize`'s `ret` rather than the
   * allocated receiver, and a JS constructor may override its own result the
   * same way. So `Date.new(2001, 1, 1) + Rational(1, 2)` and
   * `Date.new(2001, 1, Rational(3, 2))` are both a `Date` with a
   * `day_fraction`, and neither is a `DateTime`.
   */
  constructor(year?: number | bigint, month?: number, day?: number | Rational, start?: number);
  /**
   * @internal `date_core.c` `d_simple_new_internal` (`date_core.c:3036-3050`),
   * which writes an already-resolved day straight into a fresh
   * `SimpleDateData` under `HAVE_JD` and validates nothing — every caller
   * (`d_new_by_frags`, `date_s_jd`, `date_s_ordinal`, `date_s_commercial`)
   * has already established the date is buildable. {@link SEAT} is the brand
   * that selects it.
   */
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
    year: number | bigint | typeof SEAT = -4712,
    month: number | bigint = 1,
    day: number | Rational = 1,
    start = DEFAULT_SG,
    df?: number,
    sf?: Rational,
    of?: number,
  ) {
    if (typeof year === "symbol") {
      this.nth = month as bigint;
      this.#jd = day as number;
      this.#sg = start;
      this.#df = df;
      this.#sf = sf;
      this.#of = of;
      return;
    }
    checkNumeric(day, "day");
    checkNumeric(month, "month");
    checkNumeric(year, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(day, 1, false);
    if (guessStyle(year, sg) < 0) {
      const r = validGregorianP(year, month as number, d);
      if (r === null) throw new DateError("invalid date");
      const [nth, ry, rm, rd] = r;
      this.nth = nth;
      this.#sg = sg;
      this.#civil = [ry, rm, rd];
    } else {
      const r = validCivilP(year, month as number, d, sg);
      if (r === null) throw new DateError("invalid date");
      const [nth, rjd] = r;
      this.nth = nth;
      this.#jd = rjd;
      this.#sg = sg;
    }

    return addFracTo(this, fr2);
  }

  /**
   * @internal `date_core.c` `get_s_jd` (`date_core.c:1168-1187`), the lazy half
   * of `SimpleDateData`: when the proleptic-Gregorian arm of `date_initialize`
   * stored the civil triple alone, the Julian day is `c_civil_to_jd` of it
   * under `s_virtual_sg` — the stored `sg` — computed on first read and kept.
   */
  #getSJd(): number {
    if (this.#jd === undefined) {
      const [year, mon, mday] = this.#civil as [number, number, number];
      this.#jd = cCivilToJd(year, mon, mday, virtualSg(this.nth, this.#sg));
    }
    return this.#jd;
  }

  /**
   * @internal `date_core.c` `m_local_jd` (`date_core.c:1486-1497`), the STORED
   * day read back in local terms — the residue day every conversion below is
   * taken over, where {@link Date#jd} answers `m_real_local_jd`
   * (`date_core.c:1499-1510`), the same day with {@link nth} encoded back in.
   * The C branches on `simple_dat_p`; TS branches on the receiver, so
   * {@link DateTime} overrides this and the simple arm is here.
   */
  mLocalJd(): number {
    if (simpleDatP(this)) return this.#getSJd();
    return jdUtcToLocal(this.#getSJd(), this.#df!, this.#of!);
  }

  /**
   * @internal `date_core.c` `complex_dat_p` (`date_core.c:1141`), the `flags`
   * bit that says which arm of the `union DateData` is live. A `DateTime` is
   * always complex; a `Date` is complex exactly when `d_lite_plus` gave it a
   * day fraction.
   */
  complexDatP(): boolean {
    return this.#df !== undefined;
  }

  /**
   * @internal `date_core.c` `m_local_df` (`date_core.c:1531-1540`), the stored
   * day fraction read back in local terms; the C's simple arm is `0`.
   */
  mLocalDf(): number {
    if (simpleDatP(this)) return 0;
    return dfUtcToLocal(this.#df!, this.#of!);
  }

  /**
   * @internal `date_core.c` `m_fr` (`date_core.c:1573-1590`), the local day
   * fraction plus the sub-second, both as fractions of a day; simple arm `0`.
   */
  mFr(): number | Rational {
    if (simpleDatP(this)) return 0;
    let fr = isecToDay(this.mLocalDf());
    const sf = this.mSf();
    if (!sf.isZero()) fr = fr.add(nsToDay(sf));
    return fr;
  }

  /**
   * @internal The C's civil decode, which fills the civil fields in on first
   * read and sets `HAVE_CIVIL`. Ruby splits it in two by data shape, under an
   * assertion each: `get_s_civil` (`date_core.c:1189-1204`) reads `x->s.jd`
   * straight, and `get_c_civil` (`date_core.c:1297-1324`) reads
   * `m_local_jd` — the stored UTC day taken back through `jd_utc_to_local`
   * (`date_core.c:1326-1333`). One method stands in for both here because
   * `m_local_jd` already IS that split: {@link Date#mLocalJd} is the stored day
   * on `Date` and the offset-corrected one on `DateTime`, so the branch the C
   * makes on `simple_dat_p`/`complex_dat_p` is the one TS makes on the
   * receiver.
   */
  #getCCivil(): [ry: number, rm: number, rdom: number] {
    return (this.#civil ??= cJdToCivil(this.mLocalJd(), virtualSg(this.nth, this.#sg)));
  }

  /**
   * Ruby `Date.valid_jd?(jd, start = Date::ITALY)` (ruby/date, `date_core.c`
   * `date_s_valid_jd_p`, `date_core.c:2506-2524`), which is "implemented for
   * compatibility": `valid_jd_sub` (`:2465-2470`) validates the `start` and
   * hands the Julian day straight back, so the only `false` is a non-Numeric.
   */
  static isValidJd(jd: unknown, start: number = DEFAULT_SG): boolean {
    if (!kNumericP(jd)) return false;
    val2sg(start);
    return true;
  }

  /**
   * Ruby `Date.valid_civil?(year, month, mday, start = Date::ITALY)`
   * (ruby/date, `date_core.c` `date_s_valid_civil_p`, `date_core.c:2600-2622`).
   * `valid_civil_sub` (`:2526-2560`) is `date_initialize`'s own branch on
   * `guess_style` without the `need_jd` half.
   */
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

  /**
   * Ruby `Date.valid_ordinal?(year, yday, start = Date::ITALY)` (ruby/date,
   * `date_core.c` `date_s_valid_ordinal_p`, `date_core.c:2688-2708`, over
   * `valid_ordinal_sub`, `:2624-2650`).
   */
  static isValidOrdinal(year: unknown, yday: unknown, start: number = DEFAULT_SG): boolean {
    if (!kNumericP(year)) return false;
    if (!kNumericP(yday)) return false;
    return cValidOrdinalP(year as number, yday as number, val2sg(start)) !== null;
  }

  /**
   * Ruby `Date.valid_commercial?(cwyear, cweek, cwday, start = Date::ITALY)`
   * (ruby/date, `date_core.c` `date_s_valid_commercial_p`, `date_core.c:2778-2800`,
   * over `valid_commercial_sub`, `:2710-2736`).
   */
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

  /**
   * Ruby `Date.julian_leap?(year)` (ruby/date, `date_core.c`
   * `date_s_julian_leap_p`, `date_core.c:2972-2981`), which — unlike the
   * `valid_*?` predicates — raises `TypeError` on a non-Numeric year.
   */
  static isJulianLeap(year: unknown): boolean {
    checkNumeric(year, "year");
    const [, ry] = decodeYear(year as number, +1);
    return cJulianLeapP(ry);
  }

  /**
   * Ruby `Date.gregorian_leap?(year)` (ruby/date, `date_core.c`
   * `date_s_gregorian_leap_p`, `date_core.c:2995-3004`).
   */
  static isGregorianLeap(year: unknown): boolean {
    checkNumeric(year, "year");
    const [, ry] = decodeYear(year as number, -1);
    return cGregorianLeapP(ry);
  }

  /**
   * Ruby `Date.jd(jd = 0)` (ruby/date, `date_core.c` `date_s_jd`,
   * `date_core.c:3377-3387`), the date the given Julian day names. Ruby writes
   * the day straight into a fresh `SimpleDateData` under `HAVE_JD` alone and
   * leaves the civil date to `get_s_civil`; there is one representation here,
   * so the conversion happens at the call.
   */
  static jd(jd: number | bigint | Rational = 0, start = DEFAULT_SG): Temporal.PlainDate {
    checkNumeric(jd, "jd");
    const [j, fr2] = num2numWithFrac(jd, 1, false);
    const [nth, rjd] = decodeJd(j);
    const ret = new Date(SEAT, nth, rjd, val2sg(start));
    return addFracTo(ret, fr2).toDate();
  }

  /**
   * Ruby `Date.ordinal(year = -4712, yday = 1)` (ruby/date, `date_core.c`
   * `date_s_ordinal`, `date_core.c:3394`), which raises `Date::Error` on a date
   * `c_valid_ordinal_p` rejects. A negative `yday` counts back from the last day
   * of the year, so `Date.ordinal(2001, -1)` is 2001-12-31.
   */
  static ordinal(
    year = -4712,
    yday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    checkNumeric(yday, "yday");
    checkNumeric(year, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(yday, 1, false);
    const r = cValidOrdinalP(year, d, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, 0n, r, sg), fr2).toDate();
  }

  /**
   * Ruby `Date.civil(year = -4712, month = 1, mday = 1)` (ruby/date,
   * `date_core.c` `date_s_civil` → `date_initialize`, `date_core.c:3478`), which
   * raises `Date::Error` on a date `c_valid_civil_p` rejects. A negative `month`
   * counts back from December and a negative `mday` from the month's end, so
   * `Date.civil(2001, -1, -1)` is 2001-12-31.
   */
  /**
   * Ruby `Date.today(start = Date::ITALY)` (ruby/date, `date_core.c`
   * `date_s_today`, `date_core.c:3789-3826`): the current date in the LOCAL
   * zone, built from `localtime_r`'s `tm_year`/`tm_mon`/`tm_mday` and stored
   * `HAVE_CIVIL` under `GREGORIAN` before `set_sg` writes the requested reform
   * in. `Temporal.Now.plainDateISO()` is the same reading — the local wall date
   * — where `Temporal.Now.instant()` would be the UTC one.
   */
  static today(start = DEFAULT_SG): Temporal.PlainDate {
    const now = Temporal.Now.plainDateISO();
    return new Date(now.year, now.month, now.day, val2sg(start)).toDate();
  }

  static civil(
    year = -4712,
    month = 1,
    mday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    return new Date(year, month, mday, start).toDate();
  }

  /**
   * Ruby `Date.commercial(cwyear = -4712, cweek = 1, cwday = 1)` (ruby/date,
   * `date_core.c` `date_s_commercial`), which builds a date from a week date
   * and raises `Date::Error` on one `c_valid_commercial_p` rejects. A negative
   * `cwday` counts back from Sunday and a negative `cweek` back from the end of
   * the commercial year, so `Date.commercial(2001, -1, -1)` is 2001-12-30.
   */
  static commercial(
    cwyear = -4712,
    cweek = 1,
    cwday: number | Rational = 1,
    start = DEFAULT_SG,
  ): Temporal.PlainDate {
    checkNumeric(cwday, "cwday");
    checkNumeric(cweek, "cweek");
    checkNumeric(cwyear, "year");
    const sg = val2sg(start);
    const [d, fr2] = num2intWithFrac(cwday, 1, false);
    const r = cValidCommercialP(cwyear, cweek, d, sg);
    if (r === null) throw new DateError("invalid date");
    return addFracTo(new Date(SEAT, 0n, r, sg), fr2).toDate();
  }

  /**
   * Ruby `Date._strptime(string, format = '%F')` (`date_core.c`
   * `date_s__strptime` over `date_s__strptime_internal`,
   * `date_core.c:4328-4396`), which answers the frag Hash `date__strptime`
   * filled — or `nil` when a directive did not match. The encoding copies the
   * C makes onto `:zone` and `:leftover` have no analogue on a JS string.
   *
   * This is the only producer of the `:seconds` frag {@link rtRewriteFrags}
   * expands: `%s` names seconds since the Unix epoch and `%Q` milliseconds.
   * `date__parse` never sets one.
   */
  static _strptime(str: string, fmt = "%F"): DateParts | null {
    const hash: DateParts = {};
    return dateStrptime(str, fmt, hash);
  }

  /**
   * Ruby `Date.strptime(string = '-4712-01-01', format = '%F', start =
   * Date::ITALY)` (`date_core.c` `date_s_strptime`, `date_core.c:4424-4447`),
   * which is `Date._strptime` followed by `d_new_by_frags`.
   */
  static strptime(str = JULIAN_EPOCH_DATE, fmt = "%F", start = DEFAULT_SG): Temporal.PlainDate {
    return dNewByFrags(Date._strptime(str, fmt), val2sg(start)).toDate();
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
   * edited string rather than editing it in place. Each call is gated on the
   * character classes its own pattern needs (`HAVE_ELEM_P`, `date_parse.c:2133`,
   * over `check_class`, `date_parse.c:2111-2130`), tested against the live
   * string rather than the argument, since every sub-parser before it has been
   * editing it (`date_parse.c:2186-2229`). `:_comp` starts out as `comp`
   * (`date_parse.c:2172`) and only ever turns false, so an absent one is `comp`,
   * and the year is completed only within `0..99` (`date_parse.c:2267-2287`).
   */
  static _parse(str: string, comp = true): DateParts {
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
   * A string that named only a time of day answers no arm of
   * {@link rtValidDateFragsP} and raises.
   */
  static parse(str: string, comp = true, start = DEFAULT_SG): Temporal.PlainDate {
    return dNewByFrags(Date._parse(str, comp), val2sg(start)).toDate();
  }

  /**
   * Ruby `Date#year` (ruby/date, `date_core.c` `d_lite_year`,
   * `date_core.c:5302-5306`) over `m_real_year` (`date_core.c:1746-1762`): the
   * residue year `m_year` holds with {@link nth} encoded back in, which is a
   * `bigint` — MRI's Bignum — once the year outruns a `Fixnum`.
   */
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

  /**
   * Ruby `Date#mday` (ruby/date, `date_core.c` `d_lite_mday`,
   * `date_core.c:5348-5354`, over `m_mday`, `date_core.c:1785-1790`), the day
   * of the month — the same C function `Date#day` is defined over
   * (`date_core.c:9730-9731`).
   */
  get mday(): number {
    return this.#getCCivil()[2];
  }

  /**
   * Ruby `Date#day_fraction` (ruby/date, `date_core.c` `d_lite_day_fraction`,
   * `date_core.c:5358-5372`), the fractional part of the day in `0...1`. The C
   * short-circuits `simple_dat_p` to `INT2FIX(0)` before it ever reaches
   * `m_fr`, so a `Date` answers the Integer `0` where a `DateTime` answers a
   * Rational; {@link DateTime#dayFraction} is the `m_fr` arm.
   */
  get dayFraction(): number | Rational {
    if (simpleDatP(this)) return 0;
    return this.mFr();
  }

  /**
   * Ruby `Date#cwyear` (ruby/date, `date_core.c` `d_lite_cwyear`,
   * `date_core.c:5378-5390`, over `m_real_cwyear`, `date_core.c:1861-1875`):
   * the commercial-date year — `Date.new(2000, 1, 1).cwyear` is 1999.
   */
  get cwyear(): number | bigint {
    const nth = this.nth;
    const [ry] = cJdToCommercial(this.mLocalJd(), virtualSg(this.nth, this.start));

    if (nth === 0n) return ry;
    return encodeYear(nth, ry, this.isGregorian ? -1 : +1);
  }

  /**
   * Ruby `Date#cweek` (ruby/date, `date_core.c` `d_lite_cweek`,
   * `date_core.c:5395-5407`, over `m_cweek`, `date_core.c:1877-1885`).
   */
  get cweek(): number {
    const [, rw] = cJdToCommercial(this.mLocalJd(), virtualSg(this.nth, this.start));
    return rw;
  }

  /**
   * Ruby `Date#cwday` (ruby/date, `date_core.c` `d_lite_cwday`,
   * `date_core.c:5412-5425`, over `m_cwday`, `date_core.c:1887-1895`) — Monday
   * as `1`, Sunday as `7`, where {@link Date#wday} has Sunday as `0`.
   */
  get cwday(): number {
    let w = this.wday;
    if (w === 0) w = 7;
    return w;
  }

  /**
   * Ruby `Date#jd` (ruby/date, `date_core.c` `d_lite_jd`,
   * `date_core.c:5248-5253`, over `m_real_local_jd` → `m_local_jd`,
   * `date_core.c:1486-1497`), the astronomical Julian day the date names. This
   * is the LOCAL day — `m_jd` (`date_core.c:1459-1469`) is the UTC one
   * `m_real_jd` and `tmx_m_secs` read, and the two part company on a
   * `DateTime` with an offset. It is the whole of `Date`'s state and the
   * calendar-neutral reading every field above is decoded from, which is why
   * they agree with MRI at and before the calendar reform where
   * `Temporal.PlainDate`'s own proleptic Gregorian readers do not.
   */
  get jd(): number | bigint {
    return encodeJd(this.nth, this.mLocalJd());
  }

  /**
   * Ruby `Date#mjd` (ruby/date, `date_core.c` `d_lite_mjd`,
   * `date_core.c:5265-5270`), the modified Julian day: the local Julian day
   * less 2400001, a whole number adjusted by the offset where `ajd` is not.
   */
  get mjd(): number | bigint {
    const r = this.jd;
    if (typeof r === "bigint") return r - 2400001n;
    return r - 2400001;
  }

  /**
   * Ruby `Date#ld` (ruby/date, `date_core.c` `d_lite_ld`,
   * `date_core.c:5284-5289`), the Lilian day — days since the Gregorian
   * calendar began on 1582-10-15, which is Julian day 2299161.
   */
  get ld(): number | bigint {
    const r = this.jd;
    if (typeof r === "bigint") return r - 2299160n;
    return r - 2299160;
  }

  /**
   * Ruby `Date#wday` (ruby/date, `date_core.c` `d_lite_wday` over `m_wday`,
   * `date_core.c:1858-1866`), Sunday as `0`. `m_wday` is `c_jd_to_wday` over
   * the local Julian day, NOT a reading of the civil date: 0001-01-01 is a
   * Saturday under `Date::ITALY` and a Monday read proleptically.
   */
  get wday(): number {
    return cJdToWday(this.mLocalJd());
  }

  /** Ruby `Date#sunday?` (ruby/date, `date_core.c` `d_lite_sunday_p`, `date_core.c:5461-5472`). */
  get isSunday(): boolean {
    return this.wday === 0;
  }

  /** Ruby `Date#monday?` (ruby/date, `date_core.c` `d_lite_monday_p`, `date_core.c:5474-5485`). */
  get isMonday(): boolean {
    return this.wday === 1;
  }

  /** Ruby `Date#tuesday?` (ruby/date, `date_core.c` `d_lite_tuesday_p`, `date_core.c:5487-5498`). */
  get isTuesday(): boolean {
    return this.wday === 2;
  }

  /** Ruby `Date#wednesday?` (ruby/date, `date_core.c` `d_lite_wednesday_p`, `date_core.c:5500-5511`). */
  get isWednesday(): boolean {
    return this.wday === 3;
  }

  /** Ruby `Date#thursday?` (ruby/date, `date_core.c` `d_lite_thursday_p`, `date_core.c:5513-5524`). */
  get isThursday(): boolean {
    return this.wday === 4;
  }

  /** Ruby `Date#friday?` (ruby/date, `date_core.c` `d_lite_friday_p`, `date_core.c:5526-5537`). */
  get isFriday(): boolean {
    return this.wday === 5;
  }

  /** Ruby `Date#saturday?` (ruby/date, `date_core.c` `d_lite_saturday_p`, `date_core.c:5539-5550`). */
  get isSaturday(): boolean {
    return this.wday === 6;
  }

  /**
   * Ruby `Date#nth_kday?(n, k)` (ruby/date, `date_core.c`
   * `d_lite_nth_kday_p`, `date_core.c:5552-5568`), true when the date is the
   * `n`th weekday `k` of its own month — `Date.new(2001, 1, 14).nth_kday?(2, 0)`
   * is the 2nd Sunday of January 2001. A negative `n` counts back from the end.
   */
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

  /**
   * Ruby `Date#yday` (ruby/date, `date_core.c` `d_lite_yday` over `m_yday`,
   * `date_core.c:1824-1839`). `m_yday`'s Gregorian and Julian day-number tables
   * are the fast paths its `c_jd_to_ordinal` arm short-circuits; that arm is
   * the whole of it here, and it is what makes 1500-03-01 the 61st day of the
   * year, as the Julian leap day before it makes it in MRI.
   */
  get yday(): number {
    const [, rd] = cJdToOrdinal(this.mLocalJd(), virtualSg(this.nth, this.#sg));
    return rd;
  }

  /**
   * Ruby `Date#julian?` (ruby/date, `date_core.c` `d_lite_julian_p`,
   * `date_core.c:5679-5684`, over `m_julian_p`, `date_core.c:1683-1703`), true
   * when the date falls before its own calendar reform:
   * `(Date.new(1582, 10, 15) - 1).julian?` is true and
   * `Date.new(1582, 10, 15).julian?` is false.
   *
   * {@link mJulianP} reads the STORED day, which is `this.#jd` here and the UTC
   * one on `DateTime` — hence the override there.
   */
  get isJulian(): boolean {
    return mJulianP(this.#getSJd(), virtualSg(this.nth, this.#sg));
  }

  /**
   * Ruby `Date#gregorian?` (ruby/date, `date_core.c` `d_lite_gregorian_p`,
   * `date_core.c:5697-5702`, over `m_gregorian_p`, `date_core.c:1705-1708`).
   */
  get isGregorian(): boolean {
    return !this.isJulian;
  }

  /**
   * Ruby `Date#leap?` (ruby/date, `date_core.c` `d_lite_leap_p`,
   * `date_core.c:5705-5726`), true when the date's YEAR is a leap year under
   * the date's own calendar. The Julian arm does not test the residue at all:
   * it asks the calendar for the day before 1 March and reads its day of the
   * month, 29 in a Julian leap year — which makes 1500 leap under
   * `Date::ITALY` and not under `Date::GREGORIAN`.
   */
  get isLeap(): boolean {
    if (this.isGregorian) return cGregorianLeapP(this.#getCCivil()[0]);

    const sg = virtualSg(this.nth, this.start);
    const rjd = cCivilToJd(this.#getCCivil()[0], 3, 1, sg);
    const [, , rd] = cJdToCivil(rjd - 1, sg);
    return rd === 29;
  }

  /**
   * Ruby `Date#start` (ruby/date, `date_core.c` `d_lite_start`,
   * `date_core.c:5751-5756`), the calendar-reform Julian day the date is read
   * under: `Date.new(2001, 2, 3, Date::ENGLAND).start` is `2361222.0` and
   * `Date.new(2001, 2, 3, Date::GREGORIAN).start` is `-Infinity`. The C answers
   * a Double, which is a JS number.
   */
  get start(): number {
    return this.#sg;
  }

  /**
   * Ruby `Date#new_start(start = Date::ITALY)` (ruby/date, `date_core.c`
   * `d_lite_new_start`, `date_core.c:5826-5839`), a copy of the receiver read
   * under a different reform — the Julian day is kept and the civil triple
   * decoded again, which is what makes `Date.new(2000, 2, 3).new_start(Date::JULIAN)`
   * 2000-01-21.
   *
   * The C reaches its file-static `dup_obj_with_new_start`
   * (`date_core.c:5801-5810`) from here and from `italy`/`england`/`julian`/
   * `gregorian` alike. TS has no `dup_obj` — a copy has to name the class it is
   * making — so this method IS that seam: `DateTime` overrides it to keep its
   * time of day, and the four below call it rather than a private helper none
   * of them could override. The `this` return type is `dup_obj`'s own
   * `rb_obj_class(obj)`, which is why the four answer a `DateTime` on a
   * `DateTime`.
   */
  newStart(start = DEFAULT_SG): this {
    return new Date(
      SEAT,
      this.nth,
      this.#getSJd(),
      val2sg(start),
      this.#df,
      this.#sf,
      this.#of,
    ) as this;
  }

  /**
   * Ruby `Date#italy` (ruby/date, `date_core.c` `d_lite_italy`,
   * `date_core.c:5848-5852`), `new_start` with `Date::ITALY`.
   */
  italy(): this {
    return this.newStart(ITALY);
  }

  /**
   * Ruby `Date#england` (ruby/date, `date_core.c` `d_lite_england`,
   * `date_core.c:5860-5864`), `new_start` with `Date::ENGLAND`.
   */
  england(): this {
    return this.newStart(ENGLAND);
  }

  /**
   * Ruby `Date#julian` (ruby/date, `date_core.c` `d_lite_julian`,
   * `date_core.c:5872-5876`), `new_start` with `Date::JULIAN`.
   */
  julian(): this {
    return this.newStart(JULIAN);
  }

  /**
   * Ruby `Date#gregorian` (ruby/date, `date_core.c` `d_lite_gregorian`,
   * `date_core.c:5884-5888`), `new_start` with `Date::GREGORIAN`.
   */
  gregorian(): this {
    return this.newStart(GREGORIAN);
  }

  /**
   * Ruby `Date#+(other)` (ruby/date, `date_core.c` `d_lite_plus`,
   * `date_core.c:5952-6272`), the date `other` days after the receiver, where a
   * fractional `other` is taken to nanosecond precision.
   *
   * The C switches on the VALUE's type and writes one arm per case. `T_FIXNUM`
   * and `T_BIGNUM` differ only in how the day count is split off `nth`;
   * `T_FLOAT` and `T_RATIONAL` additionally carry a day-fraction and a
   * sub-second. JS has no Fixnum/Bignum/Float split — a `number` is any of the
   * three — so the arms are selected by `Number.isInteger` and by `bigint`,
   * which is the same partition the C's `TYPE()` makes. The C's `default:` arm,
   * which sends `to_r` to anything else and re-dispatches, is reduced to its
   * `expect_numeric` head ({@link expectNumeric}): the parameter type spells the
   * numeric union, but it does not hold at a JS call site and the gem asserts
   * the raise. The Rational arm keeps the
   * C's `wholenum_p` re-dispatch, since a Rational whose denominator reduced to
   * one is an Integer to Ruby. `modf` splits off a Float's fractional part and
   * leaves the whole one in its out-parameter; JS has no `modf`, so the two
   * halves are taken separately.
   *
   * Both fractional arms end at `d_simple_new_internal` rather than
   * `d_complex_new_internal` only when `!df && f_zero_p(sf) && !m_of(dat)`;
   * {@link Date#dNewInternal} is that branch here. A `Date` on the other side
   * of it is backed by `ComplexDateData`, exactly as MRI's is:
   * `Date.new(2001, 1, 1) + Rational(1, 2)` is a `Date` — not a `DateTime` —
   * whose `day_fraction` is `(1/2)`.
   */
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
      if (other.denominator === 1n) return this.plus(Number(other.numerator));

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

  /**
   * @internal `date_core.c` `m_jd` (`date_core.c:1459-1469`), the STORED day —
   * UTC on a `DateTime`, where {@link Date#mLocalJd} is the offset-corrected
   * one. The C branches on `simple_dat_p`; TS branches on the receiver, so
   * {@link DateTime} overrides this and the simple arm is here.
   */
  mJd(): number {
    return this.#getSJd();
  }

  /**
   * @internal The write half of {@link Date#mJd} — the C's own
   * `x->s.jd = ` / `x->c.jd = ` (`canonicalize_s_jd`, `date_core.c:1156-1166`;
   * `canonicalize_c_jd`, `:1251-1261`). It is a method rather than a field
   * write because {@link DateTime} keeps its UTC day in a private field of its
   * own, which {@link Date#mCanonicalizeJd} — the one caller, and the C's one
   * caller too — cannot reach from the base class.
   */
  mSetJd(jd: number): void {
    this.#jd = jd;
  }

  /**
   * @internal `date_core.c` `m_canonicalize_jd` (`date_core.c:1435-1446`) over
   * `canonicalize_jd` (`date_core.c:1144-1154`), which folds a stored day that
   * has run off either end of a {@link CM_PERIOD} back into range and carries
   * the period into {@link nth}. Every comparison below runs it on both
   * operands first, because `nth` and the day are only comparable pairwise once
   * both are canonical.
   *
   * The C's `flags &= ~HAVE_CIVIL` when the day moves is the `#civil` reset:
   * the cached civil triple was decoded from the old residue.
   */
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

  /**
   * Ruby `Date#ajd` (ruby/date, `date_core.c` `d_lite_ajd`, over `m_ajd`,
   * `date_core.c:1594-1623`), the astronomical Julian day: the chronological
   * one taken back half a day, so that `Date.new(2002,3,19).ajd` is
   * `Rational(4904923, 2)` — noon-based days counted from a midnight-based
   * epoch.
   *
   * The C's simple arm is `(2 * jd - 1) / 2` under two spellings — a `long`
   * fast path and an `f_sub`/`f_mul` one — that build the same Rational, so
   * there is one arm here. The complex arm adds the day fraction and the
   * sub-second part in, both as fractions of a day.
   */
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

  /**
   * @internal `date_core.c` `m_real_jd` (`date_core.c:1471-1475`), the stored
   * day with {@link nth} encoded back into it — the UTC day, where
   * {@link Date#jd} is `m_real_local_jd` (`date_core.c:1499-1510`).
   */
  mRealJd(): number | bigint {
    return encodeJd(this.nth, this.mJd());
  }

  /**
   * @internal `date_core.c` `m_df` (`date_core.c:1512-1522`), the day fraction
   * in seconds. `SimpleDateData` has none, and the C's simple arm answers `0`.
   */
  mDf(): number {
    return this.#df ?? 0;
  }

  /**
   * @internal `date_core.c` `m_sf` (`date_core.c:1552-1562`), the sub-second
   * part. The C's simple arm answers `INT2FIX(0)`; storage here is uniformly a
   * `Rational` ({@link DateTime}'s `#sf`), so this is that zero.
   */
  mSf(): Rational {
    return this.#sf ?? new Rational(0, 1);
  }

  /**
   * @internal `date_core.c` `m_of` (`date_core.c:1655-1663`), the stored UTC
   * offset in seconds. `SimpleDateData` has none, and the C's simple arm
   * answers `0`.
   */
  mOf(): number {
    return this.#of ?? 0;
  }

  /**
   * @internal `date_core.c` `d_simple_new_internal` (`date_core.c:3036-3050`),
   * as reached from a method that has already resolved a new day for the
   * RECEIVER's own class: the C picks it or `d_complex_new_internal`
   * (`date_core.c:3055-3071`) on `simple_dat_p`, under `rb_obj_class(self)`.
   * TS has no `rb_obj_class`, so — as at {@link Date#newStart} — this method IS
   * that branch, and {@link DateTime} overrides it with the complex arm.
   */
  dNewInternal(nth: bigint, rjd: number, df: number, sf: Rational, of: number): this {
    if (!df && sf.isZero() && !of) return new Date(SEAT, nth, rjd, this.start) as this;
    return new Date(SEAT, nth, rjd, this.start, df, sf, of) as this;
  }

  /**
   * Ruby `Date#-` (ruby/date, `date_core.c` `d_lite_minus`, `:6343-6360`): the
   * difference in days as a Rational against another date ({@link minusDd}),
   * and a date `other` days before the receiver against a Numeric. The C's
   * `T_FIXNUM` arm negates the `long` and the rest reach `f_negate`, which is
   * one negation here.
   */
  minus(other: Date | number | bigint | Rational): this | Rational {
    if (other instanceof Date) return minusDd(this, other);
    expectNumeric(other);
    if (other instanceof Rational) return this.plus(other.mul(-1));
    return this.plus(-other);
  }

  /** Ruby `Date#next_day(n = 1)` (ruby/date, `date_core.c` `d_lite_next_day`,
   *  `:6369-6377`), which is `Date#+` of `n`. */
  nextDay(n: number | bigint | Rational = 1): this {
    return this.plus(n);
  }

  /** Ruby `Date#prev_day(n = 1)` (ruby/date, `date_core.c` `d_lite_prev_day`,
   *  `:6386-6395`), which is `Date#-` of `n`. */
  prevDay(n: number | bigint | Rational = 1): this {
    return this.minus(n) as this;
  }

  /** Ruby `Date#next` (ruby/date, `date_core.c` `d_lite_next`, `:6408-6412`),
   *  which is `Date#next_day` of no argument. Ruby registers `succ` as a second
   *  name for the same C function (`date_core.c:9779-9780`), so
   *  {@link Date#succ} is that alias. */
  next(): this {
    return this.nextDay();
  }

  /** Ruby `Date#succ` — the second name `date_core.c:9780` registers for
   *  `d_lite_next`. */
  succ(): this {
    return this.next();
  }

  /**
   * Ruby `Date#>>` (ruby/date, `date_core.c` `d_lite_rshift`, `:6441-6478`), a
   * date `other` months after the receiver. When the new month has no such day
   * the last day of it is used — the `while` walking `d` down, which is why
   * `Date.new(2000,1,31) >> 1` is 2000-02-29.
   *
   * `other` is any Numeric, so `t` is carried as a {@link Rational}: Ruby
   * canonicalizes a denominator of 1 back to an Integer, which is what puts
   * `Date.new(2000,1,31).next_year(Rational(1,2))` — `f_mul(n, 12)` is `(6/1)`,
   * so `t` is an Integer — on the C's `FIXNUM_P(t)` arm and answers 2000-07-31.
   * The `else` arm is the C's `f_idiv` / `f_mod` pair. Its `FIX2INT` is the
   * non-Fixnum `rb_num2int`, which TRUNCATES: `f_mod` is a floor-mod, so the
   * remainder is non-negative and the truncation is the bigint division below.
   * That is what keeps `Date.new(2000,1,31) >> Rational(1,2)` on 2000-01-31 and
   * puts `>> Rational(3,2)` on 2000-02-29 rather than walking into February by
   * the fraction. A non-integral Float takes the same arm through
   * {@link fToR}, since `Float#to_r` is exact and `f_idiv` / `f_mod` read the
   * same integers off it that the C's Float arithmetic does.
   */
  rshift(other: number | bigint | Rational): this {
    const t = new Rational(BigInt(this.year) * 12n + BigInt(this.mon - 1), 1).add(
      typeof other === "number" && !Number.isInteger(other) ? fToR(other) : other,
    );
    let y: number | bigint;
    let m: number;
    if (t.denominator === 1n) {
      const it = t.numerator;
      y = bigNorm(div(it, 12));
      m = Number(mod(it, 12)) + 1;
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

  /** Ruby `Date#<<` (ruby/date, `date_core.c` `d_lite_lshift`, `:6507-6512`),
   *  which is `Date#>>` of the negated argument. */
  lshift(other: number | bigint | Rational): this {
    return this.rshift(other instanceof Rational ? other.mul(-1) : -other);
  }

  /** Ruby `Date#next_month(n = 1)` (ruby/date, `date_core.c`
   *  `d_lite_next_month`, `:6520-6529`), which is `Date#>>` of `n`. */
  nextMonth(n: number | bigint | Rational = 1): this {
    return this.rshift(n);
  }

  /** Ruby `Date#prev_month(n = 1)` (ruby/date, `date_core.c`
   *  `d_lite_prev_month`, `:6537-6546`), which is `Date#<<` of `n`. */
  prevMonth(n: number | bigint | Rational = 1): this {
    return this.lshift(n);
  }

  /** Ruby `Date#next_year(n = 1)` (ruby/date, `date_core.c` `d_lite_next_year`,
   *  `:6554-6563`), which is `Date#>>` of `n * 12`. */
  nextYear(n: number | bigint | Rational = 1): this {
    return this.rshift(fMul12(n));
  }

  /** Ruby `Date#prev_year(n = 1)` (ruby/date, `date_core.c` `d_lite_prev_year`,
   *  `:6571-6580`), which is `Date#<<` of `n * 12`. */
  prevYear(n: number | bigint | Rational = 1): this {
    return this.lshift(fMul12(n));
  }

  /**
   * Ruby `Date#step(limit, step = 1)` (ruby/date, `date_core.c` `d_lite_step`,
   * `:6614-6653`): the block is called with `self`, then each `date + step`,
   * for as long as the date stays on `limit`'s side of the comparison. The
   * three arms are the sign of `f_cmp(step, 0)` — a negative step walks down
   * while `date <=> limit >= 0`, a positive one walks up while `<= 0`, and a
   * zero step yields forever (the `step can't be 0` raise is `#if 0`'d out in
   * the C).
   *
   * `RETURN_ENUMERATOR` is the no-block arm: TS has no `rb_block_given_p`, so
   * an omitted `block` answers the generator that drives the same loop, which
   * is what the gem's `test_step__noblock` exercises through `to_a`.
   */
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

  /**
   * Ruby `Date#upto(max)` (ruby/date, `date_core.c` `d_lite_upto`,
   * `:6659-6672`). Documented as equivalent to {@link Date#step} with `max` and
   * `1`, but the C is its own loop over `d_lite_cmp` and `d_lite_plus` and does
   * not dispatch through `d_lite_step`, so this does not either.
   */
  upto(max: Date): Generator<this>;
  upto(max: Date, block: (date: this) => void): this;
  upto(max: Date, block?: (date: this) => void): this | Generator<this> {
    if (block === undefined) return dLiteUptoEnum(this, max) as Generator<this>;
    for (const date of dLiteUptoEnum(this, max)) block(date as this);
    return this;
  }

  /**
   * Ruby `Date#downto(min)` (ruby/date, `date_core.c` `d_lite_downto`,
   * `:6680-6693`). Documented as equivalent to {@link Date#step} with `min` and
   * `-1`, but the C is its own loop over `d_lite_cmp` and `d_lite_plus` and
   * does not dispatch through `d_lite_step`, so this does not either.
   */
  downto(min: Date): Generator<this>;
  downto(min: Date, block: (date: this) => void): this;
  downto(min: Date, block?: (date: this) => void): this | Generator<this> {
    if (block === undefined) return dLiteDowntoEnum(this, min) as Generator<this>;
    for (const date of dLiteDowntoEnum(this, min)) block(date as this);
    return this;
  }

  /**
   * Ruby `Date#<=>` (ruby/date, `date_core.c` `d_lite_cmp`,
   * `date_core.c:6804-6843`).
   *
   * The fast path is the one both operands being `SimpleDateData` under the
   * same calendar reading buys: `nth` then the stored day, and nothing else,
   * because a `Date` has no time of day. Anything else — a `DateTime` on either
   * side, or a `Date` and a `DateTime` disagreeing on `m_gregorian_p` — goes to
   * `cmp_dd` (`date_core.c:6707-6761`), which compares the full
   * `nth`/`jd`/`df`/`sf` quadruple and is what makes
   * `Date.new(2002,3,19) == DateTime.new(2002,3,19, 0,0,0)` true while
   * `DateTime.new(2002,3,19, 0,0,1)` is not.
   *
   * `cmp_gen` (`date_core.c:6694-6705`) is the `!k_date_p(other)` arm, an
   * {@link Date#ajd} comparison that answers `null` — Ruby's `nil` — for an
   * object that does not coerce.
   */
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

  /**
   * Ruby `Date#==`, which `Date` gets from `Comparable`
   * (`date_core.c` `Init_date_core`, `rb_include_module(cDate, rb_mComparable)`)
   * over {@link Date#cmp}. It is the equality `assert_equal` reads, and it is
   * NOT {@link Date#caseEquals}: `==` compares the instant, `===` the day.
   *
   * `Comparable#==` is `cmpint` over `<=>`, so an operand {@link Date#cmp}
   * finds incomparable — a `nil` `<=>` — is `false` here rather than a raise.
   */
  equals(other: unknown): boolean {
    return this.cmp(other) === 0;
  }

  /**
   * Ruby `Date#===` (ruby/date, `date_core.c` `d_lite_equal`,
   * `date_core.c:6896-6923`), true when the two name the same DAY — the LOCAL
   * day, `m_local_jd`, not the stored one — which is why
   * `Date.new(2002,3,19) === DateTime.new(2002,3,19, 12,0,0)` is true where
   * `==` is false.
   *
   * `equal_gen` (`date_core.c:6845-6855`) is the arm taken when the two
   * disagree on `m_gregorian_p`, and against a `Date` it is
   * `m_real_local_jd == other.jd` — {@link Date#jd} on both sides. Its
   * `k_numeric_p` arm is the same comparison against a Numeric, and its
   * `rb_num_coerce_cmp` fallback answers `nil` for an object that does not
   * coerce.
   */
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

  /**
   * Ruby `Date#eql?` (ruby/date, `date_core.c` `d_lite_eql_p`,
   * `date_core.c:6924-6932`), registered on `cDate` next to `<=>` and `===`
   * (`date_core.c:9794-9797`). It is NOT {@link Date#equals}: `==` admits a
   * Numeric through `cmp_gen`, `eql?` answers `false` for it — `!k_date_p` is
   * the first arm and there is no coercion tail, so a non-`Date` operand is
   * `false` rather than `nil`.
   */
  isEql(other: unknown): boolean {
    if (!(other instanceof Date)) return false;
    return this.cmp(other) === 0;
  }

  /**
   * Ruby `Date#hash` (ruby/date, `date_core.c` `d_lite_hash`,
   * `date_core.c:6934-6948`), over the `nth`/`jd`/`df`/`sf` quadruple —
   * the same four `cmp_dd` (`date_core.c:6707-6761`) compares, which is what
   * makes {@link Date#isEql}-equal dates hash alike. The C reads the STORED
   * `m_jd`, not `m_local_jd`, and does not canonicalize first; both are kept.
   *
   * The mixing function is not: `rb_memhash` is MRI's seeded siphash over the
   * four machine words, an interpreter-private digest with no JS counterpart
   * (and one whose `h[0]` is a raw `VALUE` — a pointer for a Bignum `nth`, so
   * not even reproducible across two MRI runs). The quadruple is folded here
   * instead, which is the property the C function exists for.
   */
  hash(): number {
    const h: [bigint, number, number, Rational] = [this.nth, this.mJd(), this.mDf(), this.mSf()];
    let v = 0;
    for (const part of [h[0], h[1], h[2], h[3].numerator, h[3].denominator]) {
      v = Math.imul(v ^ Number(BigInt.asIntN(32, BigInt(part))), 0x01000193) | 0;
    }
    return v;
  }

  /**
   * Ruby `Date#to_time` (ruby/date, `date_core.c` `date_to_time`,
   * `date_core.c:8949-8971`): midnight of the receiver's day in the LOCAL zone,
   * `f_local3(rb_cTime, m_real_year, m_mon, m_mday)`. A Julian receiver is
   * taken through `d_lite_gregorian` first, which is why
   * `Date.new(2001, 2, 3, Date::JULIAN).to_time` is the 16th — the civil
   * reading moves, the day does not. `m_real_year` answers a Bignum once
   * {@link Date#nth} is nonzero, and {@link realYearToLong} raises on one too
   * big for a `long` exactly where MRI's `NUM2LONG` does, rather than
   * truncating it through a `number`.
   *
   * trails' `::Time` value is `Temporal.ZonedDateTime` (RFC 0088's mapping
   * table): `Time.local` is a zoned wall-clock time, so the local zone is named
   * rather than an offset frozen in, and the class is not `./time.ts`'s `Time`
   * because that module imports this one. The C's `if (m_julian_p(adat))
   * { self = g; }` reassignment is a conditional binding here — the repo's
   * `@typescript-eslint/no-this-alias` forbids `let self = this`.
   */
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
   * direction — they are the *sole* gem-shaped seat, both ending at
   * `d_simple_new_internal` (`date_core.c:3036`) exactly as `date_s_jd`
   * (`:3377-3387`) does. `Date`'s constructor takes only
   * `(year?, month?, day?, start?)` and the `SEAT` form; handing it a
   * `Temporal.PlainDate` raises `TypeError: invalid year (not numeric)` from
   * `check_numeric` (`date_core.c:67-72`).
   */
  toDate(): Temporal.PlainDate {
    return plainDateFromJd(this.mLocalJd(), this.#sg);
  }

  /**
   * Ruby `Date#to_datetime` (ruby/date, `date_core.c` `date_to_datetime`,
   * `date_core.c:8992-9027`), the same day at midnight: the C copies the
   * receiver's data into a fresh `DateTime` and, on the complex arm, zeroes
   * `df`, `sf`, `hour`, `min` and `sec` — so a `Date` never carries a time of
   * day across. `Date` is always the simple arm, whose copy is a straight
   * `bdat->s = adat->s`; the seat below is that copy.
   */
  toDatetime(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return new DateTime(
      SEAT,
      this.nth,
      this.mJd(),
      0,
      new Rational(0, 1),
      0,
      this.#sg,
    ).toDatetime();
  }

  /**
   * Ruby `Date#inspect` (ruby/date, `date_core.c` `d_lite_inspect`,
   * `date_core.c:7043-7058`, over `mk_inspect`, `date_core.c:7032-7041`) —
   * `"#<Date: 2001-02-03 ((2451944j,0s,0n),+0s,2299161j)>"`: the class, the
   * `to_s`, then the raw state as the stored Julian day, day-fraction,
   * sub-second, offset and reform start.
   *
   * `%+"PRIsVALUE` renders its `VALUE` through `inspect`, not `to_s` — no
   * difference to `m_real_jd`, an Integer either way, but an `sf` exact past one
   * denominator is a Rational and prints parenthesized, as MRI's
   * `((2451911j,0s,(1000000000/3)n),+0s,2299161j)` for `DateTime.new(2001,1,1) +
   * Rational(1, 86400*3)` shows. Storage here is uniformly a {@link Rational}
   * where MRI's `sf` is an Integer until it isn't, so `denominator === 1n` is
   * that Integer arm — `0n`, not `(0/1)n`.
   */
  inspect(): string {
    const of = this.mOf();
    const sf = this.mSf();
    return (
      `#<${this.constructor.name}: ${this.toS()} ` +
      `((${this.mRealJd()}j,${this.mDf()}s,${sf.denominator === 1n ? sf.numerator : sf.inspect()}n),` +
      `${of < 0 ? "" : "+"}${of}s,${this.start.toFixed(0)}j)>`
    );
  }

  /** Ruby `Date#to_s` (ruby/date, `date_core.c` `d_lite_to_s`). */
  toS(): string {
    return this.strftime("%Y-%m-%d");
  }

  /**
   * Ruby `Date#deconstruct_keys(array_of_names_or_nil)` (ruby/date,
   * `date_core.c` `d_lite_deconstruct_keys`, `date_core.c:7500-7504`), the
   * pattern-matching reader. The key names are Ruby Symbols and stay in the
   * Ruby spelling — `sec_fraction`, not `secFraction` — because they are the
   * hash's *data*, not a TS member.
   */
  deconstructKeys(keys: string[] | null): Record<string, unknown> {
    return deconstructKeys(this, keys, false);
  }

  /**
   * Ruby `Date::Infinity` (ruby/date, `lib/date.rb:17-68`) at the name Ruby
   * nests it under. The class itself is {@link DateInfinity} above — see its
   * own comment for why the binding is spelled that way.
   */
  static Infinity = DateInfinity;

  /** Ruby `Date#infinite?` (ruby/date, `lib/date.rb:13-15`), which returns `false`. */
  isInfinite(): false {
    return false;
  }

  /**
   * `Date#strftime('%Z')` answers the UTC offset. Ruby's `::Date` has no `zone`
   * reader of its own — only `::DateTime` and `::Time` do — so the value is
   * passed to the formatter rather than exposed as a member.
   */
  strftime(format = "%Y-%m-%d"): string {
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
        nsec: new Rational(0, 1),
        zone: "+00:00",
        utcOffset: 0,
      },
      format,
    );
  }
}

/**
 * @internal Ruby's `DateTime < Date` makes `datetime_s_parse` /
 * `datetime_s_strptime` covariant overrides of the `::Date` ones
 * (`date_core.c`), because `::DateTime` is a `::Date`. TypeScript has no such
 * covariance available: `Temporal.PlainDateTime` is not a subtype of
 * `Temporal.PlainDate` (it answers no
 * `toPlainDateTime`/`toPlainYearMonth`/`toPlainMonthDay`), so
 * `class DateTime extends Date` is rejected as TS2417 — "Class static side
 * 'typeof DateTime' incorrectly extends base class static side 'typeof Date'"
 * — the moment the two sides disagree on the return type. Neither a
 * `this`-parameter, a `this`-keyed generic return, nor assigning the statics as
 * module-level functions (the trails mixin idiom) sidesteps the check: TS
 * compares the two static sides whatever shape the member takes.
 *
 * So `DateTime` extends `Date` under an alias whose STATIC side omits the
 * members it re-declares — `parse` and `strptime`, and the four builders
 * `Init_date_core` gives `DateTime` singleton methods of its own
 * (`date_core.c:9971-9975`) — which is the only shape that removes the comparison
 * without weakening either declaration. This is a type-level alias only — the
 * value is `Date` itself, so the runtime prototype chain, `instanceof`, and
 * every inherited static are unchanged, and the instance side is `Date` intact.
 * Both `Date.parse`/`Date.strptime` and `DateTime.parse`/`DateTime.strptime`
 * therefore declare exactly what they answer.
 */
const DateWithoutParseStatics: (new (
  year?: number | bigint,
  month?: number,
  day?: number,
  start?: number,
) => Date) &
  (new (seat: typeof SEAT, nth: bigint, rjd: number, sg: number) => Date) &
  Omit<typeof Date, "parse" | "strptime" | "jd" | "ordinal" | "civil" | "commercial"> = Date;

/**
 * @noRailsEquivalent PERMANENT — the `ruby/date` gem's `::DateTime`, a `::Date`
 * that also answers `hour`, `min` and `sec`. Defined in C
 * (`vendor/date/ext/date/date_core.c`), so it is outside `api:compare`'s
 * population for the same reason as `Date` above. Those readers are what route
 * a `localize` lookup to
 * `time.formats` (i18n/lib/i18n/backend/base.rb:105-115), while `%Z` keeps
 * `::Date`'s offset spelling rather than `::Time`'s `"UTC"`.
 */
export class DateTime extends DateWithoutParseStatics {
  /**
   * @internal `ComplexDateData`'s fields (`date_core.c:215-231`): the day and
   * the day-fraction, both **in UTC**, and `of`, the offset in seconds east of
   * UTC — the same representation `Time#utcOffset` keeps, and the one
   * `Date._parse` answers as `:offset`. A `Temporal` offset time zone is
   * minute-precision and could not hold `date_zone_to_diff`'s seconds.
   *
   * Every reader converts back on the way out through {@link mLocalJd} /
   * {@link #mLocalDf}, and the constructor converts in through
   * `jd_local_to_utc` / `df_local_to_utc`, as `dt_new_by_frags` does
   * (`date_core.c:8311-8313`).
   *
   * Both are optional because `datetime_initialize`'s proleptic-Gregorian arm
   * (`date_core.c:7851-7870`) stores `HAVE_CIVIL | HAVE_TIME` with an `rjd` of
   * `0` — no Julian day and no day-fraction at all. {@link DateTime.#getCJd}
   * (`get_c_jd`, `date_core.c:1264-1301`) and {@link DateTime.#getCDf}
   * (`get_c_df`, `:1208-1225`) fill them in on first read.
   */
  #jd?: number;
  #df?: number;

  /**
   * @internal `ComplexDateData`'s time-of-day fields (`date_core.c:215-231`),
   * which `set_to_complex` writes under `HAVE_TIME` and {@link #getCDf} /
   * {@link #getCJd} read through `time_to_df`. Undefined on the
   * `d_complex_new_internal` seat, which stores `HAVE_JD | HAVE_DF` and leaves
   * `get_c_time` (`date_core.c:1227-1244`) to decode the time from `df`.
   */
  readonly #time?: [rh: number, rmin: number, rs: number];

  /**
   * @internal `ComplexDateData`'s civil fields (`date_core.c:215-231`), which
   * `set_to_complex` writes under `HAVE_CIVIL` and {@link #getCJd} reads
   * through `c_civil_to_jd`. They are the complex struct's own — the union's
   * other arm keeps {@link Date}'s, which a `DateTime` never reads because it
   * overrides {@link mLocalJd}.
   */
  readonly #civil?: [ry: number, rm: number, rdom: number];
  /**
   * @internal `ComplexDateData`'s `sf`, the sub-second part in **nanoseconds**
   * (`date_core.c:215-231`). `jd_local_to_utc` / `df_local_to_utc` do not touch
   * it, so unlike {@link #jd} and {@link #df} it is the same value read
   * locally or in UTC.
   *
   * The C's `d_lite_plus` T_FLOAT arm answers an Integer here
   * (`date_core.c:6094-6097`) and its T_RATIONAL arm a Rational
   * (`:6174-6201`), but `m_sf`'s only reader is `ns_to_sec`, which answers a
   * Rational either way (`:993-998`) — so the storage is uniformly a Rational,
   * exact at any denominator, and the two arms differ only in their rounding.
   */
  readonly #sf: Rational;
  readonly #of: number;

  /**
   * Ruby `DateTime.new(y = -4712, m = 1, d = 1, h = 0, min = 0, s = 0, offset = 0)`
   * (ruby/date, `date_core.c` `datetime_s_new`).
   *
   * `datetime_initialize` seeds `y = INT2FIX(-4712); m = 1; d = 1;`
   * (`date_core.c:7816-7818`) before its `switch (argc)` falls through past
   * them, so `DateTime.new` with no arguments is the Julian epoch, as
   * `Date.new` is; each of the three takes its default at its own read below.
   *
   * `offset` goes through {@link val2off} (`date_core.c:5071-5077`) over
   * {@link offsetToSec} (`date_core.c:2369-2452`), which reads it as a **day
   * fraction**, not as seconds, and accepts a `Rational` of a day or a
   * `"+09:00"` String too. On ruby 3.3.11
   * `DateTime.new(2000,1,1,0,0,0,1).zone` is `"+24:00"`, while `9`, `24` and
   * `-5` are all rejected and collapse to `"+00:00"`. What it stores is the
   * `of` field `of2str` spells back out, in seconds — which is the
   * `d_complex_new_internal` overload below, not this one. `dtNewByFrags`
   * reaches that overload directly, exactly as `dt_new_by_frags` does
   * (`date_core.c:8297-8306`, which sets `of` itself under its own seconds
   * bound rather than going through `val2off`).
   *
   * `datetime_initialize` (`date_core.c:7850-7893`) branches on
   * {@link guessStyle}: its negative arm validates the civil date with
   * `c_valid_gregorian_p` — proleptic Gregorian, no reform round trip — and
   * stores `HAVE_CIVIL | HAVE_TIME` with no Julian day, while its positive/zero
   * arm goes through `c_valid_civil_p` under `sg` and stores `jd_local_to_utc`
   * of it too. Both then validate the time of day with `c_valid_time_p`.
   *
   * The negative arm's `set_to_complex` takes an `rjd` of `0` — no day — so the
   * base is seeded through the civil constructor rather than the day seat,
   * leaving ITS day to `get_s_jd` (`date_core.c:1168-1187`) as well. It is
   * handed the ORIGINAL `year`, not the `ry` {@link validGregorianP} decoded:
   * the base re-runs that same decode, so it derives the same {@link Date#nth},
   * where the residue year would have collapsed it to zero.
   *
   * `datetime_initialize`'s `switch (argc)` fall-through
   * (`date_core.c:7826-7849`) splits the second, then the minute, then the
   * hour, then the day through {@link num2intWithFrac}, under the `n` bounds
   * `positive_inf`, `5`, `4` and `3`. Only the LAST argument supplied may carry
   * a fraction, so at most one of the four is ever nonzero — the rest raise
   * `"invalid fraction"`, as `DateTime.new(2008, 3, 1, 6, 0.5, 0)` does — and
   * `fr2` takes it in the C's own order.
   *
   * `canon24oc()` (`date_core.c:3306-3312`) runs between `c_valid_time_p` and
   * `set_to_complex` (`date_core.c:7882`): `c_valid_time_p` admits the
   * `24:00:00` that ends a day, and this is what turns it into midnight of the
   * NEXT day, by folding `rh` to `0` and adding a whole day to `fr2` for
   * `add_frac` to apply. `fr2` is carried in seconds here, so the C's `fr2 + 1`
   * day is `fr2 + DAY_IN_SECONDS`.
   *
   * `add_frac()` (`date_core.c:3313-3317`) then hands `fr2` to `d_lite_plus`,
   * which answers a NEW object rather than writing back into `self` — which is
   * why the arm above can finish without ever needing the day. The result is
   * built the same way here, from {@link DateTime.#getCJd} /
   * {@link DateTime.#getCDf}, so a zero `fr2` leaves the half-built receiver's
   * day unread.
   *
   * `d_lite_plus`'s `T_FLOAT` arm (`date_core.c:6064-6135`) is what makes
   * `DateTime.new(2008, 3, 1, 6, 0.5)` `06:00:30`: the fraction's whole seconds
   * go to `df`, carrying a day where they overflow one, and the rounded
   * remainder to `sf`. `fr2` is under a day by construction, so the C's `jd`
   * term is `0` and its sign branch is never taken — `f_mod` leaves every
   * fraction positive.
   *
   * A fractional `second` is split off by `num2int_with_frac` over `s_trunc`
   * (`date_core.c:3269-3303`): `f_idiv(s, 1)` — floor, not truncate — is the
   * whole second, and `f_mod(s, 1)` the remainder, which `s_trunc` divides by
   * `DAY_IN_SECONDS` to make a day fraction. `add_frac` hands that to
   * `d_lite_plus` (`date_core.c:3314-3318`), whose `T_FLOAT` arm multiplies it
   * straight back by `DAY_IN_SECONDS` — the two cancel, so `fr` is kept in
   * seconds here — and then rounds the nanoseconds: `sf = (int)round(o)` over
   * `o *= SECOND_IN_NANOSECONDS` (`date_core.c:6094-6097`). That round is why
   * `DateTime.new(2008, 3, 1, 6, 0, 0.3).strftime("%N")` is `"300000000"`
   * where `Time#nsec`, which truncates the double, answers `299999999`.
   *
   * A `Rational` `day`, `hour`, `minute` or `second` — each of which
   * `datetime_initialize` admits through `check_numeric` and
   * `num2int_with_frac` (`date_core.c:7825-7841`), while `month` and `year` are
   * `NUM2INT` — takes `d_lite_plus`'s T_RATIONAL arm instead
   * (`date_core.c:6174-6201`), whose `sf = f_mul(t, INT2FIX(SECOND_IN_NANOSECONDS))`
   * has no round in it: the fraction stays exact at any denominator, which is
   * what keeps `DateTime.new(2008, 3, 1, 6, 0, Rational(1, 3)).strftime("%30N")`
   * emitting `3`s.
   */
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
  /**
   * @internal `date_core.c` `d_complex_new_internal` (`date_core.c:3055-3071`),
   * the seam `dt_new_by_frags` (`date_core.c:8239-8322`) ends at, under
   * `HAVE_JD | HAVE_DF`: the day and day-fraction it has already converted to
   * UTC (`date_core.c:8311-8313`) and the offset are written straight into a
   * fresh `ComplexDateData`, with neither a civil triple nor a time of day to
   * validate. The arguments are `d_complex_new_internal`'s own `rjd`, `df`,
   * `sf` and `of`, in that order, behind the {@link SEAT} brand.
   */
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
    year?: number | bigint | typeof SEAT,
    month?: number | bigint,
    day?: number | Rational,
    hour?: number | Rational,
    minute?: number | Rational,
    second?: number | Rational,
    offset?: number | Rational | string,
    start?: number,
  ) {
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

  /**
   * @internal `date_core.c` `get_c_jd` (`date_core.c:1264-1301`), the lazy half
   * of `ComplexDateData`: when `datetime_initialize`'s proleptic-Gregorian arm
   * stored the civil triple and the time of day alone, the day is
   * `c_civil_to_jd` of the triple under `c_virtual_sg` — the stored `sg` —
   * taken through `jd_local_to_utc` with `time_to_df` of the time, computed on
   * first read and kept.
   */
  #getCJd(): number {
    if (this.#jd === undefined) {
      const [year, mon, mday] = this.#civil as [number, number, number];
      const jd = cCivilToJd(year, mon, mday, virtualSg(this.nth, this.start));
      const [rh, rmin, rs] = this.#time as [number, number, number];
      this.#jd = jdLocalToUtc(jd, timeToDf(rh, rmin, rs), this.#of);
    }
    return this.#jd;
  }

  /**
   * @internal `date_core.c` `get_c_df` (`date_core.c:1208-1225`), the
   * day-fraction's half of the same split: `df_local_to_utc` of `time_to_df`
   * over the stored time of day.
   */
  #getCDf(): number {
    if (this.#df === undefined) {
      const [rh, rmin, rs] = this.#time as [number, number, number];
      this.#df = dfLocalToUtc(timeToDf(rh, rmin, rs), this.#of);
    }
    return this.#df;
  }

  /**
   * Ruby `DateTime.jd(jd = 0, hour = 0, minute = 0, second = 0, offset = 0,
   * start = Date::ITALY)` (ruby/date, `date_core.c` `datetime_s_jd`,
   * `date_core.c:7654-7711`), a singleton method of its own rather than
   * `Date.jd` inherited (`date_core.c:9971`): it takes a time of day and an
   * offset, and answers a `DateTime`.
   *
   * The C's `switch (argc)` fall-through splits `jd` through
   * `num2num_with_frac(jd, 1)` (`date_core.c:7685-7686`) and the second, minute
   * and hour through `num2int_with_frac` under the `n` bounds `positive_inf`,
   * `3` and `2` ({@link num2intWithFrac}) — the day keeps its own macro
   * ({@link num2numWithFrac}) so {@link decodeJd} can split one past a
   * `Fixnum`, as `d_complex_new_internal` is handed the `nth`
   * (`date_core.c:7697-7702`). Such a day is outside `Temporal.PlainDateTime`'s
   * range and so raises at the seat this static answers, exactly as the
   * Julian-only spellings RFC 0088's mapping table already names do; the
   * gem-shaped {@link dtNewByFrags} carries it.
   *
   * A fraction is legal only in the LAST
   * argument SUPPLIED — the macro raises `"invalid fraction"` when `argc > n` —
   * so `DateTime.jd(2451944.5)` is noon while `DateTime.jd(2451944, 1.5, 0)`
   * raises, and an explicitly passed later `0` is a supplied argument. That is
   * why every field below is optional rather than defaulted: `undefined` is the
   * C's "not in `argc`".
   *
   * The fields are read in the C's own order — highest `argc` case first — so
   * an earlier one's fraction overwrites a later one's in `fr2`, and
   * `canon24oc` (`date_core.c:3306-3312`) folds the day-ending `24:00:00`
   * `c_valid_time_p` admits into midnight of the next day.
   */
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
    // `num2num_with_frac`, not `num2int_with_frac` (`date_core.c:7685`): the
    // day stays whole so `decode_jd` below can split one past a `Fixnum`.
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

  /**
   * Ruby `DateTime.ordinal(year = -4712, yday = 1, hour = 0, minute = 0,
   * second = 0, offset = 0, start = Date::ITALY)` (ruby/date, `date_core.c`
   * `datetime_s_ordinal`, `date_core.c:7726-7791`, `:9972`), which raises
   * `Date::Error` on a date `c_valid_ordinal_p` rejects.
   *
   * `yday` itself takes a fraction — `num2int_with_frac(d, 2)`
   * (`date_core.c:7758-7759`), so `DateTime.ordinal(2001, 34.5)` is noon — and
   * the `n` bounds are one higher than {@link DateTime.jd}'s, since `year`
   * precedes them. `year` is the one field with no fraction: the C hands `vy`
   * straight to `valid_ordinal_p`.
   */
  static ordinal(
    year = -4712,
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

    const rjd = cValidOrdinalP(year, d, sg);
    if (rjd === null) throw new DateError("invalid date");
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

  /**
   * Ruby `DateTime.civil(year = -4712, month = 1, mday = 1, hour = 0,
   * minute = 0, second = 0, offset = 0, start = Date::ITALY)` (ruby/date,
   * `date_core.c` `datetime_s_civil`, `date_core.c:7796-7800`, `:9973`), which
   * is `datetime_initialize` itself — the same C function `DateTime.new` is
   * defined over (`:9974`) — so it is the constructor here too, answering the
   * `Temporal` seat as `Date.civil` does.
   */
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

  /**
   * Ruby `DateTime.commercial(cwyear = -4712, cweek = 1, cwday = 1, hour = 0,
   * minute = 0, second = 0, offset = 0, start = Date::ITALY)` (ruby/date,
   * `date_core.c` `datetime_s_commercial`, `date_core.c:7912-7980`, `:9975`),
   * the week-date counterpart, which raises `Date::Error` on a date
   * `c_valid_commercial_p` rejects. `cwday` carries the fraction
   * (`num2int_with_frac(d, 3)`, `date_core.c:7945-7946`); `cweek` is `NUM2INT`
   * and `cwyear` is handed straight to `valid_commercial_p`, so neither does.
   */
  static commercial(
    cwyear = -4712,
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

    const rjd = cValidCommercialP(cwyear, cweek, d, sg);
    if (rjd === null) throw new DateError("invalid date");
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

  /**
   * Ruby `DateTime.parse(str, comp = true)` (ruby/date, `date_core.c`
   * `datetime_s_parse` → `dt_new_by_frags`), which is `Date.parse`'s
   * `Date._parse` followed by the DateTime-shaped build.
   */
  static parse(
    str: string,
    comp = true,
    start = DEFAULT_SG,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._parse(str, comp), val2sg(start)).toDatetime();
  }

  /**
   * Ruby `DateTime._strptime(string, format = '%FT%T%z')` (ruby/date,
   * `date_core.c` `datetime_s__strptime`, `date_core.c:8336-8339`), which is
   * `Date._strptime` under a different default format — the DateTime one, so a
   * caller that omits it parses a time of day rather than a date alone.
   */
  static override _strptime(str: string, fmt = "%FT%T%z"): DateParts | null {
    return Date._strptime(str, fmt);
  }

  /**
   * Ruby `DateTime.strptime(string = '-4712-01-01T00:00:00+00:00', format =
   * '%FT%T%z', start = Date::ITALY)` (ruby/date, `date_core.c`
   * `datetime_s_strptime`, `date_core.c:8368-8392`), which is `Date._strptime`
   * followed by `dt_new_by_frags` — the DateTime-shaped build, so unlike
   * `Date.strptime` it keeps the time of day the frags carry.
   */
  static strptime(
    str = JULIAN_EPOCH_DATETIME,
    fmt = "%FT%T%z",
    start = DEFAULT_SG,
  ): Temporal.PlainDateTime | Temporal.ZonedDateTime {
    return dtNewByFrags(Date._strptime(str, fmt), val2sg(start)).toDatetime();
  }

  /**
   * @internal `date_core.c` `m_local_jd` (`date_core.c:1486-1497`) over
   * `local_jd` (`date_core.c:1326-1333`), the complex arm: the stored day read
   * back in local terms. It is the day `wday`, `yday` and the inherited civil
   * decode are `c_jd_to_wday` / `c_jd_to_ordinal` / `c_jd_to_civil` over — which
   * is what makes that decode `get_c_civil` (`date_core.c:1297-1324`) on a
   * `DateTime` where it is `get_s_civil` (`:1189-1204`) on a `Date` — and what
   * `Date#jd`, inherited, encodes {@link Date#nth} back into.
   */
  override mLocalJd(): number {
    return jdUtcToLocal(this.#getCJd(), this.#getCDf(), this.#of);
  }

  /**
   * @internal `date_core.c` `m_jd`'s complex arm (`date_core.c:1459-1469`),
   * the stored UTC day.
   */
  override mJd(): number {
    return this.#getCJd();
  }

  /** @internal `canonicalize_c_jd`'s `x->c.jd = ` (`date_core.c:1251-1261`). */
  override mSetJd(jd: number): void {
    this.#jd = jd;
  }

  /** @internal `date_core.c` `m_df`'s complex arm (`date_core.c:1512-1522`). */
  override mDf(): number {
    return this.#getCDf();
  }

  /** @internal `date_core.c` `m_sf`'s complex arm (`date_core.c:1552-1562`). */
  override mSf(): Rational {
    return this.#sf;
  }

  /** @internal The complex arm of `m_of` (`date_core.c:1655-1663`); see {@link Date#mOf}. */
  override mOf(): number {
    return this.#of;
  }

  /**
   * @internal `d_complex_new_internal` (`date_core.c:3055-3071`), the other
   * side of the `simple_dat_p` branch {@link Date#dNewInternal} documents.
   */
  override dNewInternal(nth: bigint, rjd: number, df: number, sf: Rational, of: number): this {
    return new DateTime(SEAT, nth, rjd, df, sf, of, this.start) as this;
  }

  /**
   * @internal `date_core.c` `m_local_df` (`date_core.c:1533-1541`) over
   * `local_df` (`date_core.c:1335-1341`).
   */
  override complexDatP(): boolean {
    return true;
  }

  override mLocalDf(): number {
    return dfUtcToLocal(this.#getCDf(), this.#of);
  }

  /**
   * Ruby has no `DateTime#new_start`: `d_lite_new_start` is inherited, and its
   * `dup_obj` (`date_core.c:5801-5810`) copies the receiver's own class and
   * `ComplexDateData` — day-fraction, sub-second and offset included — before
   * `set_sg` writes the new reform in. TS has no `dup_obj`, so the copy is made
   * here, where the fields are in scope; see {@link Date#newStart}.
   */
  /**
   * Ruby `DateTime#julian?` is `d_lite_julian_p` inherited, but `m_julian_p`
   * (`date_core.c:1683-1703`) reads `x->c.jd` on the complex arm — the STORED
   * UTC day, not the `m_local_jd` {@link DateTime#jd} answers. The stored day
   * is private to each class, so the reading is made here; see
   * {@link mJulianP}.
   */
  override get isJulian(): boolean {
    return mJulianP(this.#getCJd(), virtualSg(this.nth, this.start));
  }

  /**
   * Ruby `DateTime#new_offset(offset = 0)` (ruby/date, `date_core.c`
   * `d_lite_new_offset`, `:5920-5934`) over `dup_obj_with_new_offset`
   * (`:5901-5909`): the day and day-fraction are stored in UTC, so only `of`
   * changes — but `set_of` (`:5890-5897`) fills the day and day-fraction in
   * with `get_c_jd` / `get_c_df` before it writes the new `of`, because the
   * proleptic-Gregorian arm may have stored neither.
   * `Init_date_core` gives it to `::DateTime` alone (`:10018`). TS has
   * no `dup_obj`, so the copy is made here; see {@link DateTime#newStart}.
   * `m_jd` / `m_df` are the `get_c_jd` / `get_c_df` readers, not the raw
   * fields: on the proleptic-Gregorian arm those are still unset, which is
   * where a raw read hands the seat an `undefined` day.
   */
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
    return new DateTime(
      SEAT,
      this.nth,
      this.#getCJd(),
      this.#getCDf(),
      this.#sf,
      this.#of,
      val2sg(start),
    ) as this;
  }

  /**
   * Ruby `DateTime#to_time` (ruby/date, `date_core.c` `datetime_to_time`,
   * `date_core.c:9032-9062`), `Time.new(y, m, d, h, min, sec + m_sf_in_sec, of)`
   * — the receiver's own offset carried across, where {@link Date#toTime}'s
   * `f_local3` has none to carry. A Julian receiver goes through
   * `d_lite_gregorian` first, as it does there, and the Bignum year
   * `m_real_year` can answer goes through {@link realYearToLong} there too.
   * The C's `if (m_julian_p(dat))
   * { self = g; }` reassignment is a conditional binding here — the repo's
   * `@typescript-eslint/no-this-alias` forbids `let self = this`.
   */
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

  /**
   * Ruby `DateTime#to_date` (ruby/date, `date_core.c` `datetime_to_date`,
   * `date_core.c:9069-9095`), the calendar day alone: the C builds a fresh
   * `Date` on `m_local_jd` — the LOCAL day, which is where a `24:00:00` time of
   * day has already rolled the date on — and this is that `Date`'s seat.
   */
  override toDate(): Temporal.PlainDate {
    return new Date(SEAT, this.nth, this.mLocalJd(), this.start).toDate();
  }

  /**
   * Ruby `DateTime#to_datetime` (ruby/date, `date_core.c` `datetime_to_datetime`, `date_core.c:9101-9105`),
   * which answers the receiver's `::DateTime` value — `self` in MRI. trails'
   * `::DateTime` value is `Temporal.PlainDateTime` (RFC 0088's mapping table),
   * read in LOCAL terms, as every reader above is.
   *
   * RFC 0088's mapping table says "+ offset where carried", so an `of` the
   * string named comes out as a `Temporal.ZonedDateTime` in the offset time
   * zone {@link of2str} spells, and an `of` of `0` — which is also what a
   * string that named no zone leaves behind — as a bare `PlainDateTime`, the
   * value `::DateTime` has when `m_of` is zero.
   *
   * **A sub-minute offset truncates to the minute in the seat.**
   * `date_zone_to_diff` (`date_parse.c:523-528`) answers SECONDS — it multiplies
   * the parsed `hh`, `mm` and `ss` out and keeps all three — while a `Temporal`
   * offset time zone is minute-precision and has nowhere to put the seconds.
   * The truncation is `of2str`'s own (`date_core.c:1973-1980`): its
   * `"%c%02d:%02d"` drops the same seconds, so `DateTime#zone` already answers
   * `"+00:44"` for the `-00:44:30`-style offsets that motivate the case, and
   * spelling the zone with `of2str` makes the seat agree with `#zone` rather
   * than inventing a third reading. The exact seconds stay reachable on the
   * gem-shaped object ({@link DateTime#offset}, {@link DateTime#zone}); the
   * `PlainDateTime` fallback was the alternative and is strictly lossier — it
   * drops the whole offset rather than its last few seconds.
   *
   * `#sf` is a `Rational` of nanoseconds exact at any denominator, and
   * `PlainDateTime` holds nanoseconds; the sub-nanosecond tail truncates, as
   * `Time#nsec` does.
   */
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

  /** Ruby `DateTime#hour` (ruby/date, `date_core.c` `d_lite_hour` over `m_hour`, `date_core.c:1919-1932`). */
  get hour(): number {
    return dfToTime(this.mLocalDf())[0];
  }

  /** Ruby `DateTime#min` (ruby/date, `date_core.c` `d_lite_min` over `m_min`, `date_core.c:1934-1947`). */
  get min(): number {
    return dfToTime(this.mLocalDf())[1];
  }

  /** Ruby `DateTime#sec` (ruby/date, `date_core.c` `d_lite_sec` over `m_sec`, `date_core.c:1949-1962`). */
  get sec(): number {
    return dfToTime(this.mLocalDf())[2];
  }

  /**
   * Ruby `DateTime#sec_fraction` (ruby/date, `date_core.c`
   * `d_lite_sec_fraction` over `m_sf_in_sec`, `date_core.c:1568-1572`): the
   * fractional part of the second, in `0...1`. MRI answers a Rational —
   * `DateTime.new(2001, 2, 3, 4, 5, 6.5).sec_fraction` is `(1/2)`. A
   * whole-nanosecond `sf` divides out to a JS number here, as `Time#subsec`
   * already documents; a `Rational` `second` keeps the exact Rational MRI
   * answers. The whole second stays on {@link sec}, exactly as `::Time` splits
   * them.
   */
  get secFraction(): Rational {
    return nsToSec(this.#sf);
  }

  /**
   * Ruby `DateTime#zone` (ruby/date, `date_core.c` `d_lite_zone` over
   * `m_zone`, `date_core.c:1982-1988`): the UTC offset spelled by `of2str`,
   * where `Time#zone` is the zone's name. A `Date` — `simple_dat_p` — has no
   * offset to spell and answers the `"+00:00"` literal, which is also what a
   * `DateTime` parsed from a string that named no zone answers, its `of`
   * being `0`.
   */
  get zone(): string {
    return of2str(this.#of);
  }

  /**
   * Ruby `DateTime#offset` (ruby/date, `date_core.c` `d_lite_offset` over
   * `m_of` and `INT2FIX(of), INT2FIX(DAY_IN_SECONDS)`): the offset as a
   * Rational of a day, where the `of` it is built from is the seconds.
   */
  get offset(): Rational {
    return new Rational(this.#of, DAY_IN_SECONDS);
  }

  /**
   * Ruby `DateTime#to_s` (ruby/date, `date_core.c` `dt_lite_to_s`,
   * `date_core.c:8701-8706`), a distinct C function from `d_lite_to_s` — which
   * is why `::Date#to_s` keeps the date-only form.
   */
  override toS(): string {
    return this.strftime("%Y-%m-%dT%H:%M:%S%:z");
  }

  /**
   * Ruby `DateTime#deconstruct_keys(array_of_names_or_nil)` (ruby/date,
   * `date_core.c` `dt_lite_deconstruct_keys`), which is the same body under
   * `is_datetime` — so it answers the time-of-day and zone pairs too.
   */
  override deconstructKeys(keys: string[] | null): Record<string, unknown> {
    return deconstructKeys(this, keys, true);
  }

  /**
   * `DateTime#strftime` hands the formatter the real `sf`, sub-nanosecond tail
   * and all: `date_strftime.c`'s `%N` takes the LEADING digits of the fraction
   * rather than rounding it, which is what keeps
   * `DateTime.parse("...00.9999999999").strftime("%N")` at `"999999999"` when
   * the stored `sf` sits a fraction of a nanosecond above it — and what lets
   * `%12N` answer `"999999999900"`, reaching past the nanosecond for the tail.
   *
   * `dt_lite_strftime` (`date_core.c:8721-8726`) is a distinct C function from
   * `d_lite_strftime` (`:7245-7249`) only for its default format, which is why
   * `DateTime.new(2001,2,3).strftime` carries the time of day where
   * `Date#strftime` stops at the day.
   */
  override strftime(format = "%Y-%m-%dT%H:%M:%S%:z"): string {
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
        nsec: this.#sf,
        zone: this.zone,
        utcOffset: this.#of,
      },
      format,
    );
  }
}
