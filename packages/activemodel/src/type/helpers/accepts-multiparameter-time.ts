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
/** @internal */
export function isNumericKeyHash(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
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
    return isNumericKeyHash(value);
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

    // Extract each slot by key. Rails uses to_i (non-numeric → 0); mirror that for NaN.
    const num = (key: string, fallback: number): number => {
      const v = filled[key];
      if (v === undefined || v === null || v === "") return fallback;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? 0 : n;
    };

    const year = num("1", 0);
    const month = num("2", 1);
    const day = num("3", 1);
    const hour = num("4", 0);
    const minute = num("5", 0);
    const second = num("6", 0);

    // Decompose fractional seconds into the three Temporal sub-second
    // components (each 0-999) using integer arithmetic to avoid floating-
    // point rounding errors. Carry 1e9 ns into wholeSecond explicitly.
    let wholeSecond = Math.trunc(second);
    let totalNanoseconds = Math.round((second - wholeSecond) * 1_000_000_000);
    if (totalNanoseconds === 1_000_000_000) {
      wholeSecond += 1;
      totalNanoseconds = 0;
    }
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
