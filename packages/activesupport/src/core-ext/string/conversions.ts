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
import { isBlank } from "../object/blank.js";
import { preserveTimezone } from "../time/compatibility.js";

/**
 * The keys `to_time` reads out of `Date._parse`, in Ruby's spelling
 * (`conversions.rb:24`). trails' `DateParts` camelCases `sec_fraction`.
 */
const USED_KEYS = ["year", "mon", "mday", "hour", "min", "sec", "secFraction", "offset"] as const;

/**
 * Ruby's `Hash#fetch(key, default)` returns the STORED value whenever the key
 * exists — including a stored `nil` — where `??` would substitute the default.
 * `:offset` is exactly that case: `date__parse` sets it from a `nil` return for
 * a zone Ruby does not know (`date_parse.c:2290-2294`).
 */
function fetch<T>(parts: Record<string, unknown>, key: string, defaultValue: T): T {
  return key in parts ? (parts[key] as T) : defaultValue;
}

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
