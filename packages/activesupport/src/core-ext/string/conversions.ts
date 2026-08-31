/**
 * The `String` arm of ActiveSupport's conversions reopenings
 * (`core_ext/string/conversions.rb`). `time-ext.ts` holds the `Time` arm, whose
 * `to_time` / `to_date` are the same names on a different receiver, so the
 * String ones live here the way `core-ext/date/conversions.ts` holds the `Date`
 * arm.
 *
 * Mirrors: `class String` (`core_ext/string/conversions.rb`)
 */

import { Date as RubyDate, DateTime, Rational, Temporal, Time } from "@blazetrails/date";
import { fetch } from "@blazetrails/ruby-compat";
import { isBlank } from "../object/blank.js";
import { preserveTimezone } from "../time/compatibility.js";

/**
 * The keys `to_time` reads out of `Date._parse`, in Ruby's spelling
 * (`conversions.rb:24`). trails' `DateParts` camelCases `sec_fraction`.
 */
const USED_KEYS = ["year", "mon", "mday", "hour", "min", "sec", "secFraction", "offset"] as const;

/*
 * `fetch` below is Ruby's `Hash#fetch(key, default)`, which returns the STORED
 * value whenever the key exists — including a stored `nil` — where `??` would
 * substitute the default. `:offset` is exactly that case: `date__parse` sets it
 * from a `nil` return for a zone Ruby does not know
 * (`date_parse.c:2290-2294`).
 */

/**
 * Converts a string to a Time value.
 * The `form` can be either `:utc` or `:local` (default `:local`).
 *
 * Mirrors: `String#to_time` (`core_ext/string/conversions.rb:22-38`).
 */
export function toTime(str: string, form: string = "local"): Temporal.ZonedDateTime | undefined {
  const parts = RubyDate._parse(str, false) as Record<string, unknown>;
  const usedKeys = USED_KEYS;
  if (!usedKeys.some((key) => key in parts)) return undefined;

  const now = Time.now();
  const sec = fetch<number>(parts, "sec", 0);
  const secFraction = fetch<number | bigint | Rational>(parts, "secFraction", 0);
  const offset = fetch<number | Rational | null>(parts, "offset", form === "utc" ? 0 : null);
  const time = new Time(
    fetch<number>(parts, "year", now.year),
    fetch<number>(parts, "mon", now.month),
    fetch<number>(parts, "mday", now.day),
    fetch<number>(parts, "hour", 0),
    fetch<number>(parts, "min", 0),
    secFraction instanceof Rational
      ? secFraction.add(new Rational(sec, 1))
      : sec + Number(secFraction),
    offset instanceof Rational ? offset.toF() : offset,
  );

  // conversions.rb:38's `time.to_time` is ActiveSupport's own reopening
  // (`core_ext/time/compatibility.rb:13-15`), `preserve_timezone ? self :
  // getlocal` — not ruby/date's `Time#to_time`, which always answers `self`.
  // `getlocal` re-reads the same instant in the system zone.
  if (form === "utc") return time.getutc().toTime();
  const local = time.toTime();
  return preserveTimezone(time) ? local : local.withTimeZone(Temporal.Now.timeZoneId());
}

/**
 * Converts a string to a Date value.
 *
 * Mirrors: `String#to_date` (`core_ext/string/conversions.rb:46-48`).
 */
export function toDate(str: string): Temporal.PlainDate | undefined {
  if (!isBlank(str)) return RubyDate.parse(str, false);
  return undefined;
}

/**
 * Converts a string to a DateTime value.
 *
 * Mirrors: `String#to_datetime` (`core_ext/string/conversions.rb:56-58`).
 */
export function toDatetime(
  str: string,
): Temporal.PlainDateTime | Temporal.ZonedDateTime | undefined {
  if (!isBlank(str)) return DateTime.parse(str, false);
  return undefined;
}

/**
 * The leading integer `String#to_i` reads: optional whitespace, an optional
 * sign, then base-10 digits with single underscores between them
 * (`rb_str_to_inum` with `badcheck` false). Everything from the first invalid
 * character on is discarded, so `"1__0"` is `1` and `"0x1f"` is `0`.
 */
const TO_I_REGEX = /^\s*[+-]?\d(?:_?\d)*/;

/**
 * Ruby `String#to_i` — the leading integer, or `0` when the string has none
 * (`"".to_i == 0`, `"  42abc".to_i == 42`, verified on MRI 3.3).
 *
 * @noRailsEquivalent PERMANENT — Ruby core (`string.c`), which Rails calls
 * without defining (`xml_mini.rb:72`), so there is no `.rb` in the vendored
 * corpus for the port to mirror.
 */
export function toI(str: string): number {
  const match = TO_I_REGEX.exec(str);
  return match === null ? 0 : parseInt(match[0].replace(/_/g, ""), 10);
}

/**
 * The leading float `String#to_f` reads (`rb_str_to_dbl` with `badcheck`
 * false): the same sign-and-underscore rules as {@link TO_I_REGEX}, plus an
 * optional fractional part, an optional bare leading `.`, and an optional
 * exponent — each of which is only taken when a digit follows, so `"1e"` is
 * `1.0` and `"5."` is `5.0`.
 */
const TO_F_REGEX =
  /^\s*[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?/;

/**
 * Ruby `String#to_f` — the leading float, or `0.0` when the string has none.
 * The remainder is discarded rather than raising, so `"123,003".to_f` is
 * `123.0` and `"abc".to_f` is `0.0` (verified on MRI 3.3).
 *
 * @noRailsEquivalent PERMANENT — Ruby core (`string.c`), which Rails calls
 * without defining (`xml_mini.rb:73`), so there is no `.rb` in the vendored
 * corpus for the port to mirror.
 */
export function toF(str: string): number {
  const match = TO_F_REGEX.exec(str);
  return match === null ? 0 : Number(match[0].replace(/_/g, "").trim());
}
