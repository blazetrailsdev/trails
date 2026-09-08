import { ArgumentError } from "./argument-error.js";
import { rbBuiltinClassName, rbInspect } from "./object.js";

const SPEC = /%([-+ #0]*)(\d*)(?:\.(\d+))?([a-zA-Z%])/g;

const RADIX: Record<string, number> = { b: 2, B: 2, o: 8, x: 16, X: 16 };
const ALTERNATE_PREFIX: Record<string, string> = { b: "0b", B: "0B", o: "0", x: "0x", X: "0X" };

const CONVERSIONS = "bBdiouxXeEfgGcsp";

function numericArgument(value: unknown, integer: boolean): number {
  const kind = integer ? "Integer" : "Float";
  if (value == null) throw new TypeError(`can't convert nil into ${kind}`);
  if (typeof value === "boolean") throw new TypeError(`can't convert ${value} into ${kind}`);
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError(`can't convert ${rbBuiltinClassName(value)} into ${kind}`);
  }
  const number = Number(typeof value === "string" ? value.trim() : value);
  if (Number.isNaN(number) || (typeof value === "string" && value.trim() === "")) {
    throw new ArgumentError(`invalid value for ${kind}(): ${rbInspect(value)}`);
  }
  return number;
}

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

function exponential(magnitude: number, digits: number): string {
  return magnitude.toExponential(digits).replace(/e([+-])(\d)$/, "e$10$2");
}

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

function one(
  flags: string,
  width: string,
  precision: string | undefined,
  conversion: string,
  value: unknown,
): string {
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
    body = conversion === "p" ? rbInspect(value) : String(value);
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
 * `rb_str_format` (`vendor/ruby/sprintf.c:214`), the body `Kernel#sprintf` and
 * `Kernel#format` share through `rb_f_sprintf` (`vendor/ruby/sprintf.c:208`).
 *
 * Each `%[flags][width][.precision]conversion` consumes the next argument.
 * Flags are `-` (left justify), `+` and ` ` (forced sign), `0` (zero fill) and
 * `#` (the alternate radix prefix, and a retained point for `e`/`f`/`g`).
 * Precision is a minimum digit count for the integer conversions, a fraction
 * width for `f`/`e`/`E` and a significant-digit count for `g`/`G` — MRI's
 * `default_float_precision` is 6 — and truncates for `s`/`p`. A negative
 * argument to `b`/`o`/`x`/`X` without a sign flag prints MRI's infinite
 * two's-complement form, not a minus sign. `%%` emits a literal percent and
 * consumes nothing.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#sprintf`; Rails calls it
 * but does not define it.
 */
export function kernelSprintf(fmt: string, ...args: unknown[]): string {
  let index = 0;
  return fmt.replace(
    SPEC,
    (match, flags: string, width: string, precision: string | undefined, conversion: string) => {
      if (conversion === "%") return "%";
      if (!CONVERSIONS.includes(conversion)) {
        throw new ArgumentError(`malformed format string - ${match}`);
      }
      return one(flags, width, precision, conversion, args[index++]);
    },
  );
}

/**
 * `rb_f_sprintf` (`vendor/ruby/sprintf.c:208`) under its other name —
 * `Kernel#format` and `Kernel#sprintf` are the same C function.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#format`; Rails calls it but
 * does not define it.
 */
export function kernelFormat(fmt: string, ...args: unknown[]): string {
  return kernelSprintf(fmt, ...args);
}
