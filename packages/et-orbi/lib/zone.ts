import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Time } from "@blazetrails/date";
import { format, rbEqual, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ZONES_OLSON, customTzs, determineLocalTzone, tweakZoneName } from "./zones.js";

export function getTzone(o: unknown): Timezone | null {
  if (o instanceof TZInfo.Timezone) return o;
  if (o == null) return null;
  if (o === ":local") return determineLocalTzone();
  if (o === "Z") return TZInfo.Timezone.get("Zulu");
  if (rbObjRespondTo(o, "tzinfo")) return (o as { tzinfo: Timezone }).tzinfo;

  if (typeof o === "number") o = toOffset(o);

  if (typeof o !== "string") return null;

  const s = tweakZoneName(o);

  return getOffsetTzone(s) || getXOffsetTzone(s) || getTzinfoTzone(s);
}

/** @internal */
export function getOffsetTzone(str: string): Timezone | null {
  const m = str.match(/^([+-][0-1]?[0-9]):?([0-5][0-9])?$/);
  if (m == null) return null;

  const tz = customTzs()[str];
  if (tz != null) return tz;

  let hr: number | null = parseInt(m[1], 10);
  let mn = parseInt(m[2] ?? "0", 10);

  if (Math.abs(hr) > 11) hr = null;
  if (mn > 59) hr = null;
  if (hr != null && hr < 0) mn = -mn;

  return hr != null ? (customTzs()[str] = createOffsetTzone(hr * 3600 + mn * 60, str)) : null;
}

/** @internal */
export function createOffsetTzone(utcOff: number, id: string): Timezone {
  const off = new TZInfo.TimezoneOffset(utcOff, 0, id);
  const tzi = new TZInfo.DataSources.ConstantOffsetDataTimezoneInfo(id, off);
  return tzi.createTimezone();
}

/** @internal */
export function getXOffsetTzone(str: string): Timezone | null {
  const m = str.match(/^_..-?[0-1]?\d:?(?:[0-5]\d)?(.+)$/);

  return m ? TZInfo.Timezone.get(m[1]) : null;
}

/** @internal */
export function toOffset(n: number): string {
  let i = Math.trunc(n);
  const sn = i < 0 ? "-" : "+";
  i = Math.abs(i);
  const hr = Math.floor(i / 3600);
  const mn = i % 3600;
  const sc = i % 60;

  return sc > 0 ? format("%s%02d:%02d:%02d", sn, hr, mn, sc) : format("%s%02d:%02d", sn, hr, mn);
}

/** @internal */
export function getTzinfoTzone(name: string): Timezone | null {
  while (true) {
    if (ZONES_OLSON.includes(name)) return TZInfo.Timezone.get(name);
    name = name.slice(0, -1);
    if (name.length === 0) return null;
  }
}

/**
 * @internal
 * @missingRailsArgs join — PERMANENT
 */
export function windowsZoneCodeX(zoneName: string): string {
  const a = ["_"];
  a.push(
    ...zoneName
      .split("/")
      .slice(0, 2)
      .map((s) => s.slice(0, 1).toUpperCase()),
  );
  if (a.length < 3) a.push("_");

  return a.join("");
}

/** @internal */
export function getLocalTzone(t: Time): Timezone | null {
  const l = Time.local(t.year, t.month, t.day, t.hour, t.min, t.sec, t.usec);

  return rbEqual(t.zone, l.zone) ? determineLocalTzone() : null;
}

/** @internal */
export function getAsTzone(t: Time): Timezone | null {
  return rbObjRespondTo(t, "timeZone") ? (t as unknown as { timeZone: Timezone }).timeZone : null;
}
