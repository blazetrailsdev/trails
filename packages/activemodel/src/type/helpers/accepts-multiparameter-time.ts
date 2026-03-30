import { Type } from "../value.js";

/**
 * AcceptsMultiparameterTime — wraps a time-based type to handle
 * multiparameter assignment from HTML forms.
 *
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime
 *
 * In Rails, date/time form fields are submitted as multiple parameters
 * (year, month, day, hour, minute, second). This class reassembles them
 * into a single value before delegating to the wrapped type.
 */
export class AcceptsMultiparameterTime {
  readonly type: Type;

  constructor(type: Type) {
    this.type = type;
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
    const parts = Object.keys(hash)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => {
        const v = hash[k];
        if (v === undefined || v === null || v === "") return 0;
        return typeof v === "number" ? v : Number(v);
      });

    if (parts.some((p) => Number.isNaN(p))) return null;

    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = parts;
    if (year === 0 && month <= 1 && day <= 1) return null;

    const date = new Date(year, month - 1, day, hour, minute, second);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) {
      return null;
    }

    return this.type.cast(date);
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
