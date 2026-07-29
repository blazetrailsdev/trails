import { Temporal } from "@blazetrails/activesupport/temporal";
import { ArgumentError } from "../../attribute-assignment.js";
import { Type } from "../value.js";

/**
 * AcceptsMultiparameterTime — wraps a time-based type to handle
 * multiparameter assignment from HTML forms.
 *
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime
 *
 * In Rails, date/time form fields are submitted as multiple parameters
 * (year, month, day, hour, minute, second). This class reassembles them
 * into a single Temporal.PlainDateTime and delegates to the wrapped type,
 * which extracts what it needs (PlainDate, PlainTime, or PlainDateTime).
 */
/**
 * Ruby `value.is_a?(Hash)` analogue — a plain object (including null-prototype
 * objects, which the multiparameter extractor produces).
 * @internal
 */
export function isHash(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Ruby Time's month-name coercion table (time.c months[]).
export const MONTH_ABBREVIATIONS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * Split non-negative seconds into whole seconds + truncated nanoseconds using
 * the double's exact binary value (mantissa * 2^exponent), mirroring Ruby
 * Time's Float → Rational conversion. Negative or non-finite input falls back
 * to a plain trunc — the caller's domain check raises for it anyway.
 */
function exactSecondsToNanoseconds(second: number): { whole: number; ns: number } {
  if (!(second >= 0) || !Number.isFinite(second)) {
    return { whole: Math.trunc(second), ns: 0 };
  }
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, second);
  const bits = dv.getBigUint64(0);
  const expBits = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xf_ffff_ffff_ffffn;
  if (expBits !== 0) mantissa |= 1n << 52n;
  const exponent = expBits === 0 ? -1074 : expBits - 1075;
  let totalNs = mantissa * 1_000_000_000n;
  totalNs = exponent >= 0 ? totalNs << BigInt(exponent) : totalNs >> BigInt(-exponent);
  return { whole: Number(totalNs / 1_000_000_000n), ns: Number(totalNs % 1_000_000_000n) };
}

export class AcceptsMultiparameterTime {
  readonly type: Type;
  /** @internal */
  readonly defaults: Record<string, number>;

  constructor(type: Type, defaults: Record<string, number> = {}) {
    this.type = type;
    this.defaults = defaults;
  }

  serialize(value: unknown): unknown {
    return this.type.serialize(value);
  }

  serializeCastValue(value: unknown): unknown {
    if (
      typeof (this.type as unknown as { serializeCastValue?(v: unknown): unknown })
        .serializeCastValue === "function"
    ) {
      return (
        this.type as unknown as { serializeCastValue(v: unknown): unknown }
      ).serializeCastValue(value);
    }
    return this.type.serialize(value);
  }

  cast(value: unknown): unknown {
    if (this.isMultiparameterHash(value)) {
      return this.castFromMultiparameter(value as Record<string, unknown>);
    }
    return this.type.cast(value);
  }

  assertValidValue(value: unknown): void {
    this.type.cast(value);
  }

  isValueConstructedByMassAssignment(value: unknown): boolean {
    return this.isMultiparameterHash(value);
  }

  private isMultiparameterHash(value: unknown): boolean {
    return isHash(value);
  }

  private castFromMultiparameter(hash: Record<string, unknown>): unknown {
    // Apply per-type defaults before the year/month/day guard — mirrors
    // AcceptsMultiparameterTime#initialize's defaults.each { |k,v| values_hash[k] ||= v }.
    const filled: Record<string, unknown> = { ...hash };
    for (const [k, v] of Object.entries(this.defaults)) {
      if (filled[k] === undefined || filled[k] === null || filled[k] === "") {
        filled[k] = v;
      }
    }

    // Rails guard: return unless values_hash[1] && values_hash[2] && values_hash[3]
    // Ruby 0 is truthy, so only nil/"" absence counts — use explicit nil/empty check.
    const absent = (k: string) => filled[k] === undefined || filled[k] === null || filled[k] === "";
    if (absent("1") || absent("2") || absent("3")) return null;

    // Extract each slot by key with ::Time.utc/local's argument coercion
    // (verified on Ruby 3.3): nil → the slot default; Numeric truncates except
    // the seconds slot (Time.utc(...,5.5) keeps the fraction); String goes
    // through strict Integer() — "2004abc", "5.5", and "" all raise
    // ArgumentError — except the month slot, which also accepts 3-letter
    // month-name abbreviations case-insensitively ("JAN" works, "june" raises).
    const num = (key: string, fallback: number): number => {
      const v = filled[key];
      if (v === undefined || v === null) return fallback;
      if (typeof v === "number") return key === "6" ? v : Math.trunc(v);
      const s = String(v).trim();
      if (key === "2") {
        const monthIndex = MONTH_ABBREVIATIONS.indexOf(s.toLowerCase());
        if (monthIndex !== -1) return monthIndex + 1;
      }
      if (!/^[+-]?\d+$/.test(s)) {
        throw new ArgumentError(`invalid value for Integer(): ${JSON.stringify(v)}`);
      }
      return parseInt(s, 10);
    };

    const year = num("1", 0);
    const month = num("2", 1);
    const day = num("3", 1);
    const hour = num("4", 0);
    const minute = num("5", 0);
    const second = num("6", 0);

    // Ruby converts the seconds Float to an exact Rational and truncates:
    // Time.utc(...,0.9999999999).nsec == 999_999_999 (never carried into the
    // next second), and Time.utc(...,0.7).nsec == 699_999_999 because 0.7's
    // exact binary value is 0.69999999999999995…. Decompose the double's bits
    // so the truncation operates on that exact value, not an FP product.
    const { whole: wholeSecond, ns: totalNanoseconds } = exactSecondsToNanoseconds(second);
    const millisecond = Math.trunc(totalNanoseconds / 1_000_000);
    const microsecond = Math.trunc((totalNanoseconds % 1_000_000) / 1_000);
    const nanosecond = totalNanoseconds % 1_000;
    const timeParts = { hour, minute, second: wholeSecond, millisecond, microsecond, nanosecond };
    try {
      const pdt = Temporal.PlainDateTime.from(
        { year, month, day, ...timeParts },
        { overflow: "reject" },
      );
      return this.type.cast(pdt);
    } catch {
      // Rails assembles via ::Time.public_send(default_timezone, *values).
      // Time.utc/local rolls *within-range* overflow (Nov 31 → Dec 1, Feb 29
      // in a common year → Mar 1, hour 24 with 0 min/sec → next midnight,
      // sec 60 → next minute) but raises ArgumentError outside its accepted
      // domain (month 13, mday 32, hour 25 — verified on Ruby 3.3), which AR
      // surfaces as MultiparameterAssignmentErrors. Roll over only inside that
      // accepted domain; otherwise raise to match Time's strictness.
      // Ruby requires min and whole sec to be 0 at hour 24 but accepts a
      // fractional second: Time.utc(2004,1,1,24,0,0.1) → 2004-01-02 00:00:00.1.
      const midnight24 = hour === 24 && minute === 0 && wholeSecond === 0;
      if (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        ((hour >= 0 && hour <= 23) || midnight24) &&
        minute >= 0 &&
        minute <= 59 &&
        wholeSecond >= 0 &&
        wholeSecond <= 60
      ) {
        // Duration add carries all out-of-range components (day-in-month,
        // hour 24, leap-second 60) the way Time normalizes them.
        const rolled = Temporal.PlainDate.from({ year, month: 1, day: 1 })
          .toPlainDateTime()
          .add({
            months: month - 1,
            days: day - 1,
            hours: hour,
            minutes: minute,
            seconds: wholeSecond,
            nanoseconds: totalNanoseconds,
          });
        return this.type.cast(rolled);
      }
      throw new ArgumentError("argument out of range");
    }
  }
}

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods
 */
export interface InstanceMethods {
  serialize(value: unknown): unknown;
  serializeCastValue(value: unknown): unknown;
  cast(value: unknown): unknown;
  assertValidValue(value: unknown): void;
  isValueConstructedByMassAssignment(value: unknown): boolean;
}
