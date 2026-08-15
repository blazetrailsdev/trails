/**
 * The `Date` arm of ActiveSupport's conversions reopenings
 * (`core_ext/date/conversions.rb`), keyed on `Temporal.PlainDate` the way
 * `core-ext/date/calculations.ts` is.
 *
 * Mirrors: `class Date` (`core_ext/date/conversions.rb`)
 */

import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";
import { ArgumentError } from "../../time-zone-config.js";

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
