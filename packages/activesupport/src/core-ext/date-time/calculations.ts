/**
 * The `DateTime` arm of ActiveSupport's calculations reopenings
 * (`core_ext/date_time/calculations.rb`). Rails keeps `Time`, `Date` and
 * `DateTime` as three separate receivers, and the members whose bodies differ
 * only by the receiver's class live on `time-ext.ts` (the instant arm) or
 * `core-ext/date/calculations.ts` (the calendar-day arm). This file is for the
 * DateTime members a single TS function cannot stand in for, because their
 * return type is a DateTime rather than a Time — `DateTime.current` is the
 * first: `Time.current` (`time/calculations.rb:39-41`) is the same expression
 * without the `to_datetime` tail, and one function cannot answer both.
 *
 * Mirrors: `class DateTime` (`core_ext/date_time/calculations.rb`)
 */

import { Temporal, Time } from "@blazetrails/date";
import { instantFrom } from "../../temporal.js";
import { currentTime } from "../../time-travel.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { zone as timeZone } from "../../time-zone-config.js";

/**
 * Mirrors: `DateTime.current` (`date_time/calculations.rb:10-12`) —
 * `::Time.zone ? ::Time.zone.now.to_datetime : ::Time.now.to_datetime`.
 *
 * `::Time.now` is trails' `currentTime()`, the travel-aware clock read
 * `Time.current` takes; the ruby/date `Time` it is handed to is what carries
 * `Time#to_datetime` (`packages/date/src/time.ts`), whose constructor reads the
 * same local-zone components `::Time.now` answers.
 */
export function current(): Temporal.PlainDateTime | Temporal.ZonedDateTime {
  const zone = timeZone();
  if (zone) {
    return new TimeWithZone(instantFrom(currentTime()), zone).toDatetime();
  }
  const now = currentTime();
  return new Time(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds() + now.getMilliseconds() / 1000,
  ).toDatetime();
}
