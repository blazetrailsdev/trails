/**
 * The `Date` arm of ActiveSupport's conversions reopenings
 * (`core_ext/date/conversions.rb`), keyed on `Temporal.PlainDate` the way
 * `core-ext/date/calculations.ts` is.
 *
 * Mirrors: `class Date` (`core_ext/date/conversions.rb`)
 */

import { Date as RubyDate, Temporal } from "@blazetrails/date";
import { ordinalize } from "../../inflector.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { ArgumentError } from "../../time-zone-config.js";
import { inTimeZone } from "../date-and-time/zones.js";

/**
 * The named formats `Date#to_fs` resolves, either a `strftime` string or a
 * callable taking the receiver.
 *
 * Mirrors: `Date::DATE_FORMATS` (`core_ext/date/conversions.rb:8-21`). It is a
 * hash of its own, distinct from `Time::DATE_FORMATS` (`time-ext.ts`) — the
 * same keys carry date-only formats here, and `rfc822`/`rfc2822` are plain
 * `strftime` strings rather than lambdas.
 */
export const DATE_FORMATS: Record<string, string | ((date: Temporal.PlainDate) => string)> = {
  short: "%d %b",
  long: "%B %d, %Y",
  db: "%Y-%m-%d",
  inspect: "%Y-%m-%d",
  number: "%Y%m%d",
  long_ordinal: (date) => {
    const dayFormat = ordinalize(date.day);
    return new RubyDate(date).strftime(`%B ${dayFormat}, %Y`);
  },
  rfc822: "%d %b %Y",
  rfc2822: "%d %b %Y",
  iso8601: (date) => new RubyDate(date).iso8601(),
};

/**
 * Convert to a formatted string. See {@link DATE_FORMATS} for predefined
 * formats.
 *
 *     toFs(date, "db")            // => "2007-11-10"
 *     toFs(date, "short")         // => "10 Nov"
 *     toFs(date, "long_ordinal")  // => "November 10th, 2007"
 *
 * Mirrors: `Date#to_fs` (`core_ext/date/conversions.rb:49-59`) —
 * `formatter.respond_to?(:call) ? formatter.call(self).to_s : strftime(formatter)`,
 * else `to_s`, which is ruby/date's own `Date#to_s` (`date_core.c`
 * `d_lite_to_s`) — not `readable_inspect`, which reopens `inspect` alone.
 */
export function toFs(date: Temporal.PlainDate, format: string = "default"): string {
  const formatter = DATE_FORMATS[format];
  if (formatter != null) {
    if (typeof formatter === "function") {
      return String(formatter(date));
    } else {
      return new RubyDate(date).strftime(formatter);
    }
  }
  return new RubyDate(date).toS();
}

/** Mirrors: `alias_method :to_formatted_s, :to_fs` (`core_ext/date/conversions.rb:60`). */
export { toFs as toFormattedS };

/**
 * Overrides the default inspect method with a human readable one, e.g.,
 * "Mon, 21 Feb 2005".
 *
 * Mirrors: `Date#readable_inspect` (`core_ext/date/conversions.rb:63-65`) —
 * `strftime("%a, %d %b %Y")`. Rails then runs
 * `alias_method :inspect, :readable_inspect`, reopening `::Date` itself;
 * trails has no receiver to reopen, so callers reach this name directly.
 */
export function readableInspect(date: Temporal.PlainDate): string {
  return new RubyDate(date).strftime("%a, %d %b %Y");
}

/**
 * Mirrors: `alias_method :default_inspect, :inspect`
 * (`core_ext/date/conversions.rb:66`), which captures the ORIGINAL
 * `::Date#inspect` — ruby/date's `d_lite_inspect` — before the line below it
 * replaces `inspect` with {@link readableInspect}.
 */
export function defaultInspect(date: Temporal.PlainDate): string {
  return new RubyDate(date).inspect();
}

/**
 * Mirrors: `Date#to_time` (`core_ext/date/conversions.rb:83-86`) —
 * `::Time.public_send(form, year, month, day)`.
 *
 * **The bare-`Time` equivalence, narrowed to this call site.** Ruby answers a
 * bare `Time`: the day's midnight read in the system zone (`:local`) or in UTC.
 * Here the value is carried by a `TimeWithZone` on that same zone, because the
 * `Date#to_time` callers in this package consume a zone-carrying receiver —
 * `Date#in_time_zone`'s `else` arm (`date/calculations.rb:55-87`) delegates
 * straight through, so keeping Rails' single delegating expression means
 * answering it here. `TimeZone#local` builds exactly `Time.local`'s wall clock
 * in the zone it names, so this answers Ruby's instant with Ruby's components;
 * the receiver's class is the only difference. It is no longer a stand-in for a
 * missing constructor: `@blazetrails/date`'s `Time.local` (the `Time.mktime`
 * alias) is what `DateTime.civil_from_format` reads its offset off.
 */
export function toTime(date: Temporal.PlainDate, form: string = "local"): TimeWithZone {
  if (!["local", "utc"].includes(form)) {
    throw new ArgumentError(`Expected :local or :utc, got :${form}.`);
  }
  const zone = TimeZone.find(form === "utc" ? "UTC" : Temporal.Now.timeZoneId())!;
  return zone.local(date.year, date.month, date.day);
}

/**
 * Returns a string which represents the time in used time zone as DateTime
 * defined by XML Schema:
 *
 *     date = Date.new(2015, 5, 23)  // => Sat, 23 May 2015
 *     xmlschema(date)               // => "2015-05-23T00:00:00+04:00"
 *
 * Mirrors: `Date#xmlschema` (`core_ext/date/conversions.rb:95-97`) —
 * `in_time_zone.xmlschema`, so the offset is the one `Time.zone` (or the
 * system zone) puts the day's midnight at, not a bare `Z`.
 */
export function xmlschema(date: Temporal.PlainDate): string {
  return inTimeZone(date).xmlschema();
}
