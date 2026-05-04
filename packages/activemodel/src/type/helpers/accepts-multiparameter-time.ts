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
    const parts = Object.keys(filled)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => {
        const v = filled[k];
        if (v === undefined || v === null || v === "") return 0;
        return typeof v === "number" ? v : Number(v);
      });

    if (parts.some((p) => Number.isNaN(p))) return null;

    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = parts;
    if (year === 0 && month <= 1 && day <= 1) return null;

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
