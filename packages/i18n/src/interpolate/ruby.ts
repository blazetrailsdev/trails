/**
 * Mirrors: i18n/lib/i18n/interpolate/ruby.rb
 *
 * The Ruby patterns are anchored on Ruby's `%{}` / `%<>` sprintf syntax and
 * carry no flags; the JS equivalents keep the same source, with the capture
 * groups in the same positions.
 */

import { ArgumentError, ReservedInterpolationKey, inspect } from "../exceptions.js";
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

/**
 * Mirrors: I18n.interpolate. Returns a String or raises
 * `MissingInterpolationArgument`; the missing-argument logic is handled by
 * `config().missingInterpolationArgumentHandler`.
 */
export function interpolate(string: string, values: unknown): string {
  const reserved = reservedKeysPattern().exec(string);
  if (reserved) throw new ReservedInterpolationKey(toSym(reserved[1]), string);
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new ArgumentError("Interpolation values must be a Hash.");
  }
  return interpolateHash(string, values as Record<string, unknown>);
}

/**
 * @missingRailsCall call — Ruby's `value.call(values)` on a `respond_to?(:call)`
 * value is plain invocation in JS; `Function#call` there takes a receiver, not
 * the argument list.
 */
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
 * `sprintf` applies to them. A spec outside that grammar raises `ArgumentError`
 * with `sprintf`'s message, as Ruby's does for `%<num>,d`.
 *
 * That whole grammar — every conversion crossed with the flags, a width and a
 * precision — is pinned against real `ruby -e 'sprintf(...)'` output in
 * `ruby.trails.test.ts`, including the forms that are easy to miss: an integer
 * precision as a minimum digit count, the `..` two's-complement form of a
 * negative `%b`/`%o`/`%x`, and `Integer()`/`Float()` raising on an argument
 * that does not convert, booleans and other objects among them. What is NOT
 * covered is anything the interpolation pattern cannot deliver here: argument
 * indexes (`%1$d`), `*` widths, and the conversions outside
 * `[bBdiouxXeEfgGcps]`.
 */
function sprintf(spec: string, value: unknown): string {
  const parsed = FORMAT_SPEC.exec(spec);
  if (!parsed) throw new ArgumentError(`malformed format string - %${spec.charAt(0)}`);
  const [, flags = "", width = "", precision, conversion = "s"] = parsed;
  const digits = precision === undefined ? 6 : Number(precision);
  const numeric = !"csp".includes(conversion);
  const alternate = flags.includes("#");
  const integer = conversion in RADIX || "diu".includes(conversion);
  const number = numeric ? numericArgument(value, integer) : 0;
  const magnitude = Math.abs(number);

  if (conversion in RADIX && number < 0 && !flags.includes("+") && !flags.includes(" ")) {
    return twosComplement(Math.trunc(number), conversion, flags, width, precision);
  }

  const prefix = alternate && number !== 0 ? (ALTERNATE_PREFIX[conversion] ?? "") : "";

  let body: string;
  if (conversion in RADIX) {
    body = Math.trunc(magnitude).toString(RADIX[conversion]);
    if (conversion === "o") body = prefix + body;
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
  if (integer && precision !== undefined) {
    body = digits === 0 && Math.trunc(magnitude) === 0 ? "" : body.padStart(digits, "0");
  }
  if (conversion in RADIX && conversion !== "o") body = prefix + body;
  if (conversion === conversion.toUpperCase() && numeric) body = body.toUpperCase();

  let sign = "";
  if (numeric && number < 0) sign = "-";
  else if (numeric && flags.includes("+")) sign = "+";
  else if (numeric && flags.includes(" ")) sign = " ";

  const target = Number(width || 0);
  if (flags.includes("-")) return (sign + body).padEnd(target);
  if (flags.includes("0") && numeric && !(integer && precision !== undefined)) {
    return sign + body.padStart(target - sign.length, "0");
  }
  return (sign + body).padStart(target);
}

/**
 * Ruby applies `Integer()` / `Float()` to a numeric conversion's argument, so a
 * value that does not convert raises rather than formatting as `NaN`. Only a
 * Numeric or a String converts: `nil`, `true`/`false` and any other object
 * raise `TypeError` naming what was given, and a String that does not parse
 * raises `ArgumentError`.
 *
 * The `TypeError` is JS's own rather than a ported class because Ruby's is
 * `Kernel`'s, and the gem raises none of its own here — `sprintf` is a builtin.
 * `ArgumentError` is ported because `interpolate` already raises it (ruby.rb:8).
 */
function numericArgument(value: unknown, integer: boolean): number {
  const kind = integer ? "Integer" : "Float";
  if (value == null) throw new TypeError(`can't convert nil into ${kind}`);
  if (typeof value === "boolean") throw new TypeError(`can't convert ${value} into ${kind}`);
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError(`can't convert ${rubyClassName(value)} into ${kind}`);
  }
  const number = Number(typeof value === "string" ? value.trim() : value);
  if (Number.isNaN(number) || (typeof value === "string" && value.trim() === "")) {
    throw new ArgumentError(`invalid value for ${kind}(): ${inspect(value)}`);
  }
  return number;
}

/** The Ruby class name `Integer()` / `Float()` name in their TypeError. */
function rubyClassName(value: unknown): string {
  if (Array.isArray(value)) return "Array";
  const name = (value as object).constructor?.name;
  return name === undefined || name === "Object" ? "Hash" : name;
}

/**
 * Ruby prints a negative `%b`/`%B`/`%o`/`%x`/`%X` with no sign flag as the
 * infinite two's-complement form — `..` followed by the digits whose leading
 * one, the base's largest, repeats leftward forever. The dots count toward both
 * the precision and a zero-padded width, so both reduce by two here.
 */
function twosComplement(
  value: number,
  conversion: string,
  flags: string,
  width: string,
  precision?: string,
): string {
  const radix = RADIX[conversion];
  const top = (radix - 1).toString(radix);
  const prefix = flags.includes("#") && conversion !== "o" ? ALTERNATE_PREFIX[conversion] : "";
  const target = Number(width || 0);
  const zeroPad = flags.includes("0") && !flags.includes("-");
  const minDigits = Math.max(
    precision === undefined ? 0 : Number(precision) - 2,
    zeroPad ? target - prefix.length - 2 : 0,
  );

  let digits: string;
  for (let places = 1; ; places++) {
    const modulus = radix ** places;
    if (value + modulus < 0) continue;
    digits = (value + modulus).toString(radix).padStart(places, "0");
    if (digits.charAt(0) === top) break;
  }
  digits = digits.padStart(minDigits, top);
  if (conversion === conversion.toUpperCase()) digits = digits.toUpperCase();

  const out = `${prefix}..${digits}`;
  return flags.includes("-") ? out.padEnd(target) : out.padStart(target);
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
