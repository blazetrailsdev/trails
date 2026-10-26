import type { Timezone } from "@blazetrails/tzinfo";
import { Date, Time, dtNewByFrags } from "@blazetrails/date";
import {
  ArgumentError,
  fetch,
  block,
  isRegisteredConstant,
  Rational,
  rbEqual,
  rbInspect,
  rbObjRespondTo,
  registeredConstant,
  toF,
} from "@blazetrails/ruby-compat";
import { EoTime } from "./time.js";
import { getAsTzone, getLocalTzone, getTzone } from "./zone.js";
import { determineLocalTzone, extractZone } from "./zones.js";

interface ChronicModule {
  parse(text: string, options: Record<string, unknown>): Time | null;
  Parser: { DEFAULT_OPTIONS: Record<string, unknown> };
}

let _chronicEnabled = true;

export function isChronicEnabled(): boolean {
  return _chronicEnabled;
}

export function setChronicEnabled(b: boolean): boolean {
  return (_chronicEnabled = b);
}

export function now(zone: unknown = null): EoTime {
  return new EoTime(toF(Time.now()), zone);
}

export function parse(str: string, opts: Record<string, unknown> = {}): EoTime {
  let strZone: string | null;
  [str, strZone] = extractZone(str);

  const t = chronicParse(str, opts);
  if (t != null && t !== false) {
    str = [t.strftime("%F %T"), strZone].filter((x) => x != null).join(" ");
  }

  let dt;
  try {
    dt = dtNewByFrags(Date._parse(str), Date.ITALY);
  } catch {
    throw new ArgumentError(`No time information in ${rbInspect(str)}`);
  }

  const zone = ((opts.zone ?? null) || getTzone(strZone) || determineLocalTzone()) as Timezone;

  const secs = toF(zone.localToUtc(dt).toTime());

  return new EoTime(secs, zone);
}

export function makeTime(...a: unknown[]): EoTime {
  const zone = a.length > 1 ? getTzone(a.at(-1) ?? null) : null;
  if (zone != null) a.pop();

  const o = a.length > 1 ? a : a[0];

  if (o instanceof Time) return makeFromTime(o, zone);
  else if (o instanceof Date) return makeFromDate(o, zone);
  else if (Array.isArray(o)) return makeFromArray(o, zone);
  else if (typeof o === "string") return makeFromString(o, zone);
  else if (typeof o === "number" || typeof o === "bigint" || o instanceof Rational)
    return makeFromNumeric(o, zone);
  else if (o instanceof EoTime) return makeFromEotime(o, zone);
  else throw new ArgumentError(`Cannot turn ${rbInspect(o)} to a ::EtOrbi::EoTime instance`);
}

export function make(...a: unknown[]): EoTime {
  return makeTime(...a);
}

/** @internal */
export function chronicParse(str: string, opts: Record<string, unknown>): Time | null | false {
  if (!isRegisteredConstant("Chronic")) return false;
  if (
    !fetch(
      opts,
      "enableChronic",
      block(() => isChronicEnabled()),
    )
  )
    return false;

  const os = Object.fromEntries(
    Object.entries(opts).filter(([k]) =>
      Object.keys((registeredConstant("Chronic") as ChronicModule).Parser.DEFAULT_OPTIONS).includes(
        k,
      ),
    ),
  );

  return (registeredConstant("Chronic") as ChronicModule).parse(str, os);
}

/** @internal */
export function makeFromTime(t: Time, zone: Timezone | null): EoTime {
  let z: unknown = zone || getAsTzone(t) || getLocalTzone(t) || getTzone(t.zone);

  z ||= t.zone;

  return new EoTime(t, z);
}

/** @internal */
export function makeFromDate(d: Date, zone: Timezone | null): EoTime {
  return makeFromTime(
    rbObjRespondTo(d, "toTime") ? d.toTime() : Time.parse(d.strftime("%Y-%m-%d %H:%M:%S")),
    zone,
  );
}

/** @internal */
export function makeFromArray(a: unknown[], zone: Timezone | null): EoTime {
  return parse(Time.utc(...(a as Parameters<typeof Time.utc>)).strftime("%Y-%m-%d %H:%M:%S.%6N"), {
    zone: zone,
    enableChronic: false,
  });
}

/** @internal */
export function makeFromString(s: string, zone: Timezone | null): EoTime {
  return parse(s, { zone: zone });
}

/** @internal */
export function makeFromNumeric(f: number | bigint | Rational, zone: Timezone | null): EoTime {
  return new EoTime(toF(Time.now()) + toF(f), zone);
}

/** @internal */
export function makeFromEotime(eot: EoTime, zone: Timezone | null): EoTime {
  if (zone == null || rbEqual(zone, eot.zone)) return eot;
  return new EoTime(eot.toF(), zone);
}
