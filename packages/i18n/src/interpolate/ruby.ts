/**
 * Mirrors: i18n/lib/i18n/interpolate/ruby.rb
 *
 * The Ruby patterns are anchored on Ruby's `%{}` / `%<>` sprintf syntax and
 * carry no flags; the JS equivalents keep the same source, with the capture
 * groups in the same positions.
 */

import { ArgumentError, ReservedInterpolationKey } from "../exceptions.js";
import { config, reservedKeysPattern } from "../i18n.js";

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

/**
 * Mirrors: I18n.interpolate. Returns a String or raises
 * `MissingInterpolationArgument`; the missing-argument logic is handled by
 * `config().missingInterpolationArgumentHandler`.
 */
export function interpolate(string: string, values: unknown): string {
  const reserved = reservedKeysPattern().exec(string);
  if (reserved) throw new ReservedInterpolationKey(reserved[1], string);
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new ArgumentError("Interpolation values must be a Hash.");
  }
  return interpolateHash(string, values as Record<string, unknown>);
}

export function interpolateHash(string: string, values: Record<string, unknown>): string {
  const pattern = unionPattern(config().interpolationPatterns);
  let interpolated = false;

  const interpolatedString = string.replace(
    pattern,
    (match, braced?: string, angled?: string, format?: string) => {
      interpolated = true;
      if (match === "%%") return "%";

      const key = braced ?? angled ?? match.replace(/[%{}]/g, "");
      let value =
        key in values
          ? values[key]
          : config().missingInterpolationArgumentHandler(key, values, string);
      if (typeof value === "function") value = (value as (v: unknown) => unknown)(values);
      return format ? sprintf(format, value) : String(value);
    },
  );

  return interpolated ? interpolatedString : string;
}

const FORMAT_SPEC = /^([-+ #0]*)(\d*)(?:\.(\d+))?([a-zA-Z])$/;

const RADIX: Record<string, number> = { b: 2, B: 2, o: 8, x: 16, X: 16 };

/**
 * Mirrors Ruby's `sprintf("%#{spec}", value)` for the conversions the `%<>`
 * interpolation pattern admits (`bBdiouxXeEfgGcps`).
 */
function sprintf(spec: string, value: unknown): string {
  const parsed = FORMAT_SPEC.exec(spec);
  if (!parsed) return String(value);
  const [, flags = "", width = "", precision, conversion = "s"] = parsed;
  const digits = precision === undefined ? 6 : Number(precision);
  const numeric = conversion !== "c" && conversion !== "s";
  const magnitude = Math.abs(Number(value));

  let body: string;
  if (conversion in RADIX) body = Math.trunc(magnitude).toString(RADIX[conversion]);
  else if ("diu".includes(conversion)) body = String(Math.round(magnitude));
  else if (conversion === "e" || conversion === "E") body = magnitude.toExponential(digits);
  else if (conversion === "f") body = magnitude.toFixed(digits);
  else if (conversion === "g" || conversion === "G") body = String(magnitude);
  else if (conversion === "c") {
    body = typeof value === "number" ? String.fromCodePoint(value) : String(value).charAt(0);
  } else {
    body = precision === undefined ? String(value) : String(value).slice(0, digits);
  }
  if (conversion === conversion.toUpperCase() && numeric) body = body.toUpperCase();

  let sign = "";
  if (numeric && Number(value) < 0) sign = "-";
  else if (numeric && flags.includes("+")) sign = "+";
  else if (numeric && flags.includes(" ")) sign = " ";

  const target = Number(width || 0);
  if (flags.includes("-")) return (sign + body).padEnd(target);
  if (flags.includes("0") && numeric) return sign + body.padStart(target - sign.length, "0");
  return (sign + body).padStart(target);
}
