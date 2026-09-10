import { sprintf } from "@blazetrails/ruby-compat";
import { ArgumentError, ReservedInterpolationKey } from "../exceptions.js";
import { config, reservedKeysPattern, toSym } from "../i18n.js";

export const DEFAULT_INTERPOLATION_PATTERNS: readonly RegExp[] = Object.freeze([
  /%%/,
  /%\{([\w|]+)\}/,
  /%<(\w+)>([^\d]*?\d*\.?\d*[bBdiouxXeEfgGcps])/,
]);

const INTERPOLATION_PATTERNS_CACHE = new Map<string, RegExp>();

function unionPattern(patterns: readonly RegExp[]): RegExp {
  const source = patterns.map((pattern) => `(?:${pattern.source})`).join("|");
  let union = INTERPOLATION_PATTERNS_CACHE.get(source);
  if (!union) {
    union = new RegExp(source, "g");
    INTERPOLATION_PATTERNS_CACHE.set(source, union);
  }
  return union;
}

export function interpolate(string: string, values: unknown): string {
  const reserved = reservedKeysPattern().exec(string);
  if (reserved) throw new ReservedInterpolationKey(toSym(reserved[1]), string);
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new ArgumentError("Interpolation values must be a Hash.");
  }
  return interpolateHash(string, values as Record<string, unknown>);
}

/** @missingRailsCall call — PERMANENT */
export function interpolateHash(string: string, values: Record<string, unknown>): string {
  const pattern = unionPattern(config().interpolationPatterns);
  let interpolated = false;

  const interpolatedString = string.replace(
    pattern,
    (match, braced?: string, angled?: string, format?: string) => {
      interpolated = true;
      if (match === "%%") return "%";

      const key = toSym(braced ?? angled ?? match.replace(/[%{}]/g, ""));
      let value =
        key.slice(1) in values
          ? values[key.slice(1)]
          : config().missingInterpolationArgumentHandler(key, values, string);
      if (typeof value === "function") value = (value as (v: unknown) => unknown)(values);
      return format ? sprintf(`%${format}`, value) : String(value);
    },
  );

  return interpolated ? interpolatedString : string;
}
