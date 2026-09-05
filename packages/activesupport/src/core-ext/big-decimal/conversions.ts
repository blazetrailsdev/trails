import { FloatDomainError } from "@blazetrails/ruby-compat";

const NON_FINITE_REGEX = /^\s*(?:(NaN)|([+-]?)Infinity)\s*$/;

type RationalLike = { numerator: bigint; denominator: bigint };

type Parsed = {
  sign: "" | "-";
  digits: string;
  exp: number;
  nonFinite: "NaN" | "Infinity" | null;
};

export class BigDecimal {
  readonly sign: "" | "-";
  private digits: string;
  private exp: number;
  private readonly nonFinite: "NaN" | "Infinity" | null;

  constructor(
    value: string | number | bigint | BigDecimal | { numerator: bigint; denominator: bigint },
    ndigits = 0,
  ) {
    const isRational = typeof value === "object" && !(value instanceof BigDecimal);
    const parsed = isRational
      ? parseRational(value, ndigits)
      : parse(value instanceof BigDecimal ? value.toString("F") : value);
    if (parsed === null) {
      throw new TypeError(`BigDecimal: cannot parse ${String(value)}`);
    }
    this.sign = parsed.sign;
    this.digits = parsed.digits;
    this.exp = parsed.exp;
    this.nonFinite = parsed.nonFinite;
    if (parsed.nonFinite === null && ndigits > 0 && (isRational || typeof value === "number")) {
      const rounded = this.round(ndigits - this.exponent());
      this.sign = rounded.sign;
      this.digits = rounded.digits;
      this.exp = rounded.exp;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  static readonly NAN = new BigDecimal("NaN");

  /** @noRailsEquivalent PERMANENT */
  static readonly INFINITY = new BigDecimal("Infinity");

  /** @noRailsEquivalent PERMANENT */
  isNan(): boolean {
    return this.nonFinite === "NaN";
  }

  /** @noRailsEquivalent PERMANENT */
  isInfinite(): number | null {
    if (this.nonFinite !== "Infinity") return null;
    return this.sign === "-" ? -1 : 1;
  }

  toString(format = "F"): string {
    const { signFlag, group, scientific } = parseFormat(format);
    let prefix = "";
    if (this.sign === "-") prefix = "-";
    else if (signFlag === "+") prefix = "+";
    else if (signFlag === " ") prefix = " ";
    if (this.nonFinite !== null) {
      return this.nonFinite === "NaN" ? "NaN" : `${prefix}Infinity`;
    }
    if (scientific) return `${prefix}${this.toScientific(group)}`;
    const intDigits =
      this.digits === "" || this.exp <= 0
        ? "0"
        : this.exp >= this.digits.length
          ? this.digits.padEnd(this.exp, "0")
          : this.digits.slice(0, this.exp);
    const fracDigits =
      this.digits === "" || this.exp >= this.digits.length
        ? ""
        : this.exp >= 0
          ? this.digits.slice(this.exp)
          : "0".repeat(-this.exp) + this.digits;
    const frac = fracDigits === "" ? "0" : fracDigits;
    const intPart = group > 0 ? groupFromRight(intDigits, group) : intDigits;
    const fracPart = group > 0 ? groupFromLeft(frac, group) : frac;
    return `${prefix}${intPart}.${fracPart}`;
  }

  toJSON(): string {
    return this.toString("F");
  }

  /** @noRailsEquivalent PERMANENT */
  toI(): number {
    if (this.isNan()) {
      throw new FloatDomainError("Computation results in 'NaN' (Not a Number)");
    }
    if (this.nonFinite !== null) {
      throw new FloatDomainError(`Computation results in '${this.sign}Infinity'`);
    }
    const magnitude =
      this.exp <= 0
        ? 0n
        : this.exp >= this.digits.length
          ? BigInt(this.digits) * 10n ** BigInt(this.exp - this.digits.length)
          : BigInt(this.digits.slice(0, this.exp));
    const signed = this.sign === "-" ? -magnitude : magnitude;
    const num = Number(signed);
    return Number.isSafeInteger(num) ? num : (signed as unknown as number);
  }

  /** @noRailsEquivalent PERMANENT */
  toF(): number {
    return Number(this.toString("F"));
  }

  /** @noRailsEquivalent PERMANENT */
  isZero(): boolean {
    if (this.nonFinite !== null) return false;
    return this.digits === "";
  }

  /** @noRailsEquivalent PERMANENT */
  isNegative(): boolean {
    return this.sign === "-" && !this.isZero();
  }

  /** @noRailsEquivalent PERMANENT */
  abs(): BigDecimal {
    if (this.isNan()) return this;
    if (this.nonFinite !== null) return BigDecimal.INFINITY;
    return this.sign === "-" ? BigDecimal.fromUnscaled(this.unscaled(-1), this.scale()) : this;
  }

  /** @noRailsEquivalent PERMANENT */
  mult(other: BigDecimal): BigDecimal {
    if (this.nonFinite !== null || other.nonFinite !== null) {
      if (this.isNan() || other.isNan() || this.isZero() || other.isZero()) return BigDecimal.NAN;
      return this.isNegative() !== other.isNegative()
        ? new BigDecimal("-Infinity")
        : BigDecimal.INFINITY;
    }
    return BigDecimal.fromUnscaled(
      this.unscaled() * other.unscaled(),
      this.scale() + other.scale(),
    );
  }

  /** @noRailsEquivalent PERMANENT */
  equals(other: unknown): boolean {
    if (!(other instanceof BigDecimal)) return false;
    return this.compare(other) === 0;
  }

  /** @noRailsEquivalent PERMANENT */
  compare(other: BigDecimal): number | null {
    if (this.isNan() || other.isNan()) return null;
    if (this.nonFinite !== null || other.nonFinite !== null) {
      const thisRank = this.isInfinite() ?? 0;
      const otherRank = other.isInfinite() ?? 0;
      return thisRank < otherRank ? -1 : thisRank > otherRank ? 1 : 0;
    }
    const thisSign = this.isZero() ? 0 : this.sign === "-" ? -1 : 1;
    const otherSign = other.isZero() ? 0 : other.sign === "-" ? -1 : 1;
    if (thisSign !== otherSign) return thisSign < otherSign ? -1 : 1;
    if (thisSign === 0) return 0;
    if (this.exp !== other.exp) return this.exp < other.exp ? -thisSign : thisSign;
    const width = Math.max(this.digits.length, other.digits.length);
    const left = this.digits.padEnd(width, "0");
    const right = other.digits.padEnd(width, "0");
    return left === right ? 0 : left < right ? -thisSign : thisSign;
  }

  /** @noRailsEquivalent PERMANENT */
  round(n = 0, mode = ":default"): BigDecimal {
    if (this.nonFinite !== null) return this;
    if (n >= this.scale()) return this;
    const keepCount = this.exp + n;
    const kept = keepCount > 0 ? this.digits.slice(0, keepCount) : "";
    const rest =
      keepCount > 0
        ? this.digits.slice(keepCount)
        : keepCount === 0
          ? this.digits
          : `0${this.digits}`;
    let value = BigInt(kept === "" ? "0" : kept);
    if (roundsAway(rest, kept, this.sign === "-", mode)) value += 1n;
    if (n < 0) value *= 10n ** BigInt(-n);
    return BigDecimal.fromUnscaled(this.sign === "-" ? -value : value, Math.max(n, 0));
  }

  /** @noRailsEquivalent PERMANENT */
  exponent(): number {
    return this.digits === "" ? 0 : this.exp;
  }

  private unscaled(signum = 1): bigint {
    const magnitude =
      this.digits === ""
        ? 0n
        : BigInt(this.digits) * 10n ** BigInt(Math.max(this.exp - this.digits.length, 0));
    return this.sign === "-" && signum > 0 ? -magnitude : magnitude;
  }

  private scale(): number {
    return Math.max(this.digits.length - this.exp, 0);
  }

  private static fromUnscaled(value: bigint, scale: number): BigDecimal {
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
    const intPart = digits.slice(0, digits.length - scale);
    const fracPart = scale > 0 ? digits.slice(digits.length - scale) : "0";
    return new BigDecimal(`${negative ? "-" : ""}${intPart}.${fracPart}`);
  }

  /** @noRailsEquivalent PERMANENT */
  static interpretLoosely(value: string): BigDecimal {
    if (NON_FINITE_REGEX.test(value)) return new BigDecimal(value);
    const match = INTERPRET_LOOSELY_REGEX.exec(value);
    return new BigDecimal(match === null ? "0" : match[0].replace(/_/g, "").trim());
  }

  private toScientific(group: number): string {
    if (this.digits === "") return "0.0";
    const digits = group > 0 ? groupFromLeft(this.digits, group) : this.digits;
    return `0.${digits}e${this.exponent()}`;
  }
}

function roundsAway(rest: string, kept: string, negative: boolean, mode: string): boolean {
  const nonZero = /[1-9]/.test(rest);
  if (!nonZero) return false;
  const first = Number(rest[0]);
  switch (mode.replace(/^:/, "")) {
    case "up":
      return true;
    case "down":
    case "truncate":
      return false;
    case "ceiling":
    case "ceil":
      return !negative;
    case "floor":
      return negative;
    case "half_down":
    case "halfDown":
      return first > 5 || (first === 5 && /[1-9]/.test(rest.slice(1)));
    case "half_even":
    case "halfEven":
    case "even":
    case "banker":
      if (first !== 5) return first > 5;
      if (/[1-9]/.test(rest.slice(1))) return true;
      return Number(kept.slice(-1) || 0) % 2 === 1;
    default:
      return first >= 5;
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

function groupFromLeft(s: string, n: number): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && i % n === 0) out += " ";
    out += s[i];
  }
  return out;
}

function parseRational(value: RationalLike, ndigits: number): Parsed | null {
  if (ndigits <= 0) {
    throw new TypeError("can't omit precision for a Rational.");
  }
  const negative = value.numerator < 0n !== value.denominator < 0n;
  const sign: "" | "-" = negative ? "-" : "";
  const n = value.numerator < 0n ? -value.numerator : value.numerator;
  const d = value.denominator < 0n ? -value.denominator : value.denominator;
  if (d === 0n) return null;
  if (n === 0n) return { sign: "", digits: "", exp: 0, nonFinite: null };

  let fracNeeded: number;
  const intPartDigits = n / d;
  if (intPartDigits > 0n) {
    fracNeeded = Math.max(ndigits - intPartDigits.toString().length, 0) + 2;
  } else {
    fracNeeded = leadingZeroCount(n, d) + ndigits + 2;
  }
  const scaled = ((n * 10n ** BigInt(fracNeeded)) / d).toString();
  const digits = scaled === "0" ? "" : scaled.replace(/0+$/, "");
  if (digits === "") return { sign: "", digits: "", exp: 0, nonFinite: null };
  return { sign, digits, exp: scaled.length - fracNeeded, nonFinite: null };
}

function leadingZeroCount(n: bigint, d: bigint): number {
  const sn = n.toString();
  const sd = d.toString();
  const zeros = sd.length - sn.length - 1;
  if (zeros < 0) return 0;
  const head = sd.slice(0, sn.length);
  const covers = sn > head || (sn === head && !/[1-9]/.test(sd.slice(sn.length)));
  return covers ? zeros : zeros + 1;
}

function parse(value: string | number | bigint): Parsed | null {
  if (typeof value === "bigint") {
    const negative = value < 0n;
    const magnitude = (negative ? -value : value).toString();
    const digits = magnitude === "0" ? "" : magnitude.replace(/0+$/, "");
    return {
      sign: digits === "" ? "" : negative ? "-" : "",
      digits,
      exp: digits === "" ? 0 : magnitude.length,
      nonFinite: null,
    };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value)
      ? { sign: "", digits: "", exp: 0, nonFinite: "NaN" }
      : { sign: value < 0 ? "-" : "", digits: "", exp: 0, nonFinite: "Infinity" };
  }
  const raw = String(value).trim();
  if (raw === "") return null;
  const special = NON_FINITE_REGEX.exec(raw);
  if (special !== null) {
    return special[1] !== undefined
      ? { sign: "", digits: "", exp: 0, nonFinite: "NaN" }
      : {
          sign: special[2] === "-" ? "-" : "",
          digits: "",
          exp: 0,
          nonFinite: "Infinity",
        };
  }
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
  const intPart = m[1] || "";
  const fracPart = m[2] ?? "";
  const all = intPart + fracPart;
  const stripped = all.replace(/^0+/, "");
  const digits = stripped.replace(/0+$/, "");
  if (digits === "") return { sign: "", digits: "", exp: 0, nonFinite: null };
  const exp = intPart.length - (all.length - stripped.length) + (m[3] ? Number(m[3]) : 0);
  return { sign, digits, exp, nonFinite: null };
}

const INTERPRET_LOOSELY_REGEX =
  /^\s*[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?/;

/** @noRailsEquivalent PERMANENT */
export function toD(str: string): BigDecimal {
  return BigDecimal.interpretLoosely(str);
}
