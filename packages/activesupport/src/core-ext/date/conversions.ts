import { Date as RubyDate, Temporal, Time as RubyTime } from "@blazetrails/date";
import { ordinalize } from "../../inflector.js";
import { ArgumentError } from "../../time-zone-config.js";
import { inTimeZone } from "../date-and-time/zones.js";

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

export { toFs as toFormattedS };

export function readableInspect(date: Temporal.PlainDate): string {
  return new RubyDate(date).strftime("%a, %d %b %Y");
}

export { readableInspect as inspect };

export function defaultInspect(date: Temporal.PlainDate): string {
  return new RubyDate(date).inspect();
}

export function toTime(date: Temporal.PlainDate, form: string = "local"): RubyTime {
  if (!["local", "utc"].includes(form)) {
    throw new ArgumentError(`Expected :local or :utc, got :${form}.`);
  }
  return RubyTime[form as "local" | "utc"](date.year, date.month, date.day);
}

export function xmlschema(date: Temporal.PlainDate): string {
  return inTimeZone(date).xmlschema();
}
