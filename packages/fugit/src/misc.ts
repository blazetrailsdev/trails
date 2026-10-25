import { Time } from "@blazetrails/date";
import { EoTime } from "@blazetrails/et-orbi";
import { StringIO, format } from "@blazetrails/ruby-compat";
import { Fugit } from "./namespaces.js";

export const DAY_S = Object.freeze(24 * 3600);
export const YEAR_S = Object.freeze(365 * DAY_S);

export function isostamp(
  showDate: unknown,
  showTime: unknown,
  showUsec: unknown,
  time: Time | EoTime | null,
): string {
  const t = time ?? Time.now();
  const s = new StringIO();

  if (showDate != null && showDate !== false) s.append(t.strftime("%Y-%m-%d"));
  if (showTime != null && showTime !== false) s.append(t.strftime("T%H:%M:%S"));
  if (showTime != null && showTime !== false && showUsec != null && showUsec !== false) {
    s.append(format(".%06d", t instanceof Time ? t.usec : t.usec()));
  }
  if (showTime != null && showTime !== false && time!.isUtc()) s.append("Z");

  return s.string();
}

export function timeToS(t: Time | EoTime): string {
  return isostamp(true, true, false, t);
}

export function timeToPlainS(t: Time | EoTime = Time.now(), z = true): string {
  return t.strftime("%Y-%m-%d %H:%M:%S") + (z && t.isUtc() ? " Z" : "");
}

export function timeToZoneS(t: Time | EoTime = Time.now()): string {
  return t.strftime("%Y-%m-%d %H:%M:%S %Z %z");
}

Fugit.DAY_S = DAY_S;
Fugit.YEAR_S = YEAR_S;
Fugit.isostamp = isostamp;
Fugit.timeToS = timeToS;
Fugit.timeToPlainS = timeToPlainS;
Fugit.timeToZoneS = timeToZoneS;
