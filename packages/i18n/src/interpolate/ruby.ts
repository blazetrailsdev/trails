/**
 * Mirrors: i18n/lib/i18n/interpolate/ruby.rb
 *
 * The Ruby patterns are anchored on Ruby's `%{}` / `%<>` sprintf syntax and
 * carry no flags; the JS equivalents keep the same source, with the capture
 * groups in the same positions.
 */

import { ArgumentError, ReservedInterpolationKey, inspect } from "../exceptions.js";
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
const ALTERNATE_PREFIX: Record<string, string> = { b: "0b", B: "0B", o: "0", x: "0x", X: "0X" };

/**
 * Ruby hands `%<name>fmt` to `sprintf`; JS has no equivalent, so the
 * conversions the interpolation pattern admits (`bBdiouxXeEfgGcps`, `p`
 * included) are
 * reimplemented here, along with the `-+ #0` flags, width and precision that
 * `sprintf` applies to them.
 */
function sprintf(spec: string, value: unknown): string {
  const parsed = FORMAT_SPEC.exec(spec);
  if (!parsed) return String(value);
  const [, flags = "", width = "", precision, conversion = "s"] = parsed;
  const digits = precision === undefined ? 6 : Number(precision);
  const numeric = !"csp".includes(conversion);
  const alternate = flags.includes("#");
  const magnitude = Math.abs(Number(value));

  let body: string;
  if (conversion in RADIX) {
    body = Math.trunc(magnitude).toString(RADIX[conversion]);
    // Ruby omits the alternate-form prefix for zero.
    if (alternate && Number(value) !== 0) body = ALTERNATE_PREFIX[conversion] + body;
  } else if ("diu".includes(conversion)) {
    body = String(Math.trunc(magnitude));
  } else if (conversion === "e" || conversion === "E") {
    body = exponential(magnitude, digits);
    if (alternate && digits === 0) body = body.replace("e", ".e");
  } else if (conversion === "f") {
    body = magnitude.toFixed(digits);
    if (alternate && digits === 0) body += ".";
  } else if (conversion === "g" || conversion === "G") {
    body = generalFormat(magnitude, digits === 0 ? 1 : digits, alternate);
  } else if (conversion === "c") {
    body = typeof value === "number" ? String.fromCodePoint(value) : String(value).charAt(0);
  } else {
    body = conversion === "p" ? inspect(value) : String(value);
    if (precision !== undefined) body = body.slice(0, digits);
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

/** Ruby pads the exponent to at least two digits; `toExponential` does not. */
function exponential(magnitude: number, digits: number): string {
  return magnitude.toExponential(digits).replace(/e([+-])(\d)$/, "e$10$2");
}

/**
 * `%g`: fixed notation when the exponent sits in `[-4, precision)`, otherwise
 * exponential; trailing zeros are dropped unless the `#` flag is set.
 * `Number#toPrecision` picks a different cutover, so the choice is made here.
 */
function generalFormat(magnitude: number, digits: number, alternate: boolean): string {
  const exponent = magnitude === 0 ? 0 : Math.floor(Math.log10(magnitude));
  const body =
    exponent < -4 || exponent >= digits
      ? exponential(magnitude, digits - 1)
      : magnitude.toFixed(Math.max(digits - 1 - exponent, 0));
  if (alternate || !body.includes(".")) return body;
  const [mantissa = "", suffix = ""] = body.split("e");
  return mantissa.replace(/\.?0+$/, "") + (suffix ? `e${suffix}` : "");
}
