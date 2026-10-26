import { Time } from "@blazetrails/date";
import {
  Gem,
  RUBY_PLATFORM,
  RUBY_VERSION,
  env,
  numericModulo,
  registeredConstant,
  rbInspect,
  rbObjClass,
  toF,
} from "@blazetrails/ruby-compat";
import { VERSION } from "./et-orbi.js";
import { EoTime } from "./time.js";
import { determineLocalTzone, gatherTzs, type ZonedTimeClass } from "./zones.js";

export function platformInfo(): string {
  const etos = ([k, v]: [string, unknown]) => `${k}:${rbInspect(v)}`;

  const h: Record<string, unknown> = {
    etz: env["TZ"] ?? null,
    tnz: Time.now().zone,
    tziv: tzinfoVersion(),
    tzidv: tzinfoDataVersion(),
    rv: RUBY_VERSION,
    rp: RUBY_PLATFORM(),
    win: Gem.isWinPlatform(),
    rorv: (() => {
      try {
        return (registeredConstant("Trails") as { VERSION: { STRING: string } }).VERSION.STRING;
      } catch {
        return null;
      }
    })(),
    astz: (() => {
      try {
        return [
          rbObjClass((Time as unknown as ZonedTimeClass).zone()),
          (Time as unknown as ZonedTimeClass).zone().tzinfo.name,
        ];
      } catch {
        return null;
      }
    })(),
    eov: VERSION,
    eotnz: "???",
    eotnfz: "???",
    eotlzn: "???",
  };
  const ltz = EoTime.localTzone();
  if (ltz != null) {
    h["eotnz"] = EoTime.now().zone;
    h["eotnfz"] = EoTime.now().strftime("%z");
    h["eotnfZ"] = EoTime.now().strftime("%Z");
    h["eotlzn"] = ltz.name;
  }

  return `(${Object.entries(h).map(etos).join(",")},${Object.entries(gatherTzs()).map(etos).join(",")})`;
}

export function _makeInfo(): void {
  console.log(renderNozoneTime(toF(Time.now())));
  console.log(platformInfo());
}

export function renderNozoneTime(seconds: number): string {
  const t = Time.utc(1970).plus(seconds);
  const ts =
    t.strftime("%Y-%m-%d %H:%M:%S") + `.${String(numericModulo(seconds, 1)).split(".").at(-1)}`;
  const tz = determineLocalTzone();
  const z = tz != null ? String(tz.periodForLocal(t).abbreviation) : null;

  return `(secs:${seconds},utc~:${rbInspect(ts)},ltz~:${rbInspect(z)})`;
}

/** @internal */
export function tzinfoVersion(): string {
  try {
    return String(Gem.loadedSpecs["tzinfo"]!.version);
  } catch (err) {
    return rbInspect(err);
  }
}

/** @internal */
export function tzinfoDataVersion(): string | null {
  try {
    return String(Gem.loadedSpecs["tzinfo-data"]!.version);
  } catch {
    return null;
  }
}
