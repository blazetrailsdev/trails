import { Temporal } from "@blazetrails/activesupport/temporal";
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
export class AcceptsMultiparameterTime {
  readonly type: Type;
  /** @internal */
  readonly defaults: Record<string, number>;

  constructor(type: Type, defaults: Record<string, number> = {}) {
    this.type = type;
    this.defaults = defaults;
  }

  cast(value: unknown): unknown {
    if (this.isMultiparameterHash(value)) {
      return this.castFromMultiparameter(value as Record<string, unknown>);
    }
    return this.type.cast(value);
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

  assertValidValue(value: unknown): void {
    this.type.cast(value);
  }

  valueConstructedByMassAssignment(value: unknown): boolean {
    return this.isMultiparameterHash(value);
  }

  private isMultiparameterHash(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
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

    try {
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
      const pdt = Temporal.PlainDateTime.from(
        {
          year,
          month,
          day,
          hour,
          minute,
          second: wholeSecond,
          millisecond,
          microsecond,
          nanosecond,
        },
        { overflow: "reject" },
      );
      return this.type.cast(pdt);
    } catch {
      return null;
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
  valueConstructedByMassAssignment(value: unknown): boolean;
}
