import { Date as RubyDate, DateTime, Temporal, Time } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { fetch } from "@blazetrails/ruby-compat";
import { isBlank } from "../object/blank.js";
import { preserveTimezone } from "../time/compatibility.js";

const USED_KEYS = ["year", "mon", "mday", "hour", "min", "sec", "secFraction", "offset"] as const;

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

  if (form === "utc") return time.getutc().toTime();
  const local = time.toTime();
  return preserveTimezone(time) ? local : local.withTimeZone(Temporal.Now.timeZoneId());
}

export function toDate(str: string): Temporal.PlainDate | undefined {
  if (!isBlank(str)) return RubyDate.parse(str, false);
  return undefined;
}

export function toDatetime(
  str: string,
): Temporal.PlainDateTime | Temporal.ZonedDateTime | undefined {
  if (!isBlank(str)) return DateTime.parse(str, false);
  return undefined;
}

const TO_I_REGEX = /^\s*[+-]?\d(?:_?\d)*/;

/** @noRailsEquivalent PERMANENT */
export function toI(str: string): number {
  const match = TO_I_REGEX.exec(str);
  return match === null ? 0 : parseInt(match[0].replace(/_/g, ""), 10);
}

const TO_F_REGEX =
  /^\s*[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?/;

/** @noRailsEquivalent PERMANENT */
export function toF(str: string): number {
  const match = TO_F_REGEX.exec(str);
  return match === null ? 0 : Number(match[0].replace(/_/g, "").trim());
}
