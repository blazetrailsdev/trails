/**
 * BigDecimal — arbitrary-precision decimal value.
 *
 * JS has no native arbitrary-precision decimal, so values are kept as
 * normalized digit strings (no float round-trip) to preserve precision.
 *
 * Mirrors: Ruby's `BigDecimal` together with the ActiveSupport core-ext that
 * defaults `#to_s` to the `"F"` (non-scientific, fixed) format. Both the
 * fixed (`"F"`) and engineering/scientific (`"E"`) forms are implemented.
 * (activesupport/lib/active_support/core_ext/big_decimal/conversions.rb)
 */

const MAX_EXPONENT_EXPANSION = 4000;

export class BigDecimal {
  /** "-" for negative values, "" otherwise. Zero is non-negative. */
  readonly sign: "" | "-";
  /** Integer-part digits, leading zeros stripped (at least "0"). */
  readonly intDigits: string;
  /** Fractional-part digits, trailing zeros stripped (possibly ""). */
  readonly fracDigits: string;

  constructor(value: string | number | bigint) {
    const parsed = parse(value);
    if (parsed === null) {
      throw new TypeError(`BigDecimal: cannot parse ${String(value)}`);
    }
    this.sign = parsed.sign;
    this.intDigits = parsed.intDigits;
    this.fracDigits = parsed.fracDigits;
  }

  /**
   * Render the value. The default `"F"` format produces fixed (non-scientific)
   * notation with a trailing `.0` for whole numbers, matching ActiveSupport's
   * defaulted `BigDecimal#to_s`.
   *
   * Format flags (subset of Ruby's): a leading `+` prints a sign on
   * non-negative values, a leading space prints a space instead; an integer
   * `n` inserts a space every `n` digits counting outward from the decimal
   * point; a trailing `F`/`f` selects fixed notation.
   *
   * The engineering/scientific `"E"`/`"e"` form normalizes the value to
   * `0.<digits>e<exp>` (mantissa in `[0.1, 1)`, exponent the power of ten),
   * matching Ruby's `BigDecimal#to_s`. The output exponent marker is always a
   * lowercase `e`; the grouping flag spaces the mantissa digits from the left.
   */
  toString(format = "F"): string {
    const { signFlag, group, scientific } = parseFormat(format);
    let prefix = "";
    if (this.sign === "-") prefix = "-";
    else if (signFlag === "+") prefix = "+";
    else if (signFlag === " ") prefix = " ";
    if (scientific) return `${prefix}${this.toScientific(group)}`;
    const frac = this.fracDigits === "" ? "0" : this.fracDigits;
    const intPart = group > 0 ? groupFromRight(this.intDigits, group) : this.intDigits;
    const fracPart = group > 0 ? groupFromLeft(frac, group) : frac;
    return `${prefix}${intPart}.${fracPart}`;
  }

  /**
   * Encode as a JSON string in fixed ("F") form, mirroring ActiveSupport's
   * `BigDecimal#as_json` (which returns the value, encoded as a string by the
   * JSON encoder to avoid the float precision loss a bare JSON number would
   * incur). Without this, `JSON.stringify` would emit the internal
   * `{sign, intDigits, fracDigits}` shape.
   */
  toJSON(): string {
    return this.toString("F");
  }

  /** Render as `0.<digits>e<exp>` (Ruby's `"E"` form, sans sign prefix). */
  private toScientific(group: number): string {
    const allDigits = this.intDigits + this.fracDigits;
    const mantissa = allDigits.replace(/^0+/, "").replace(/0+$/, "");
    if (mantissa === "") return "0.0";
    const leadingZeros = allDigits.length - allDigits.replace(/^0+/, "").length;
    const exp = this.intDigits.length - leadingZeros;
    const digits = group > 0 ? groupFromLeft(mantissa, group) : mantissa;
    return `0.${digits}e${exp}`;
  }
}

function parseFormat(format: string): {
  signFlag: "" | "+" | " ";
  group: number;
  scientific: boolean;
} {
  const m = format.match(/^([+ ]?)(\d*)([eEfF]?)$/);
  if (!m) return { signFlag: "", group: 0, scientific: false };
  const signFlag = (m[1] as "" | "+" | " ") || "";
  const group = m[2] ? Number(m[2]) : 0;
  const scientific = m[3] === "e" || m[3] === "E";
  return { signFlag, group, scientific };
}

/** Group digits with a space every `n`, counting from the right. */
function groupFromRight(s: string, n: number): string {
  let out = "";
  let count = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    out = s[i] + out;
    count += 1;
    if (count % n === 0 && i !== 0) out = ` ${out}`;
  }
  return out;
}

/** Group digits with a space every `n`, counting from the left. */
function groupFromLeft(s: string, n: number): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && i % n === 0) out += " ";
    out += s[i];
  }
  return out;
}

function parse(
  value: string | number | bigint,
): { sign: "" | "-"; intDigits: string; fracDigits: string } | null {
  if (typeof value === "bigint") {
    const negative = value < 0n;
    return {
      sign: negative ? "-" : "",
      intDigits: (negative ? -value : value).toString(),
      fracDigits: "",
    };
  }
  const raw = String(value).trim();
  if (raw === "") return null;
  let s = raw;
  let sign: "" | "-" = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = s.match(/^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!m) return null;
  if (m[1] === "" && (m[2] ?? "") === "") return null;
  let intPart = m[1] || "0";
  let fracPart = m[2] ?? "";
  const exp = m[3] ? Number(m[3]) : 0;
  // Ruby BigDecimal accepts arbitrarily large exponents; this cap is a
  // TS-specific guard so adversarial input (e.g. "1e10000000") can't drive
  // the digit-expansion below into multi-gigabyte string allocation.
  if (Math.abs(exp) > MAX_EXPONENT_EXPANSION) {
    throw new RangeError(
      `BigDecimal: exponent magnitude exceeds the ${MAX_EXPONENT_EXPANSION}-digit expansion limit (TS-specific guard against unbounded allocation)`,
    );
  }
  if (exp > 0) {
    if (fracPart.length >= exp) {
      intPart += fracPart.slice(0, exp);
      fracPart = fracPart.slice(exp);
    } else {
      intPart += fracPart.padEnd(exp, "0");
      fracPart = "";
    }
  } else if (exp < 0) {
    const shift = -exp;
    if (intPart.length > shift) {
      fracPart = intPart.slice(intPart.length - shift) + fracPart;
      intPart = intPart.slice(0, intPart.length - shift);
    } else {
      fracPart = intPart.padStart(shift, "0") + fracPart;
      intPart = "0";
    }
  }
  intPart = intPart.replace(/^0+(?=\d)/, "") || "0";
  fracPart = fracPart.replace(/0+$/, "");
  if (intPart === "0" && fracPart === "") sign = "";
  return { sign, intDigits: intPart, fracDigits: fracPart };
}
