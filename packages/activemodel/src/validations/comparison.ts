import { Temporal } from "@blazetrails/activesupport/temporal";
import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export class ComparisonValidator extends EachValidator {
  private resolve(opt: unknown | ((record: AnyRecord) => unknown), record: AnyRecord): unknown {
    return typeof opt === "function" ? (opt as (record: AnyRecord) => unknown)(record) : opt;
  }

  private compare(a: unknown, b: unknown): number {
    if (a instanceof Temporal.Instant && b instanceof Temporal.Instant)
      return Temporal.Instant.compare(a, b);
    if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime)
      return Temporal.PlainDateTime.compare(a, b);
    if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate)
      return Temporal.PlainDate.compare(a, b);
    if (a instanceof Temporal.PlainTime && b instanceof Temporal.PlainTime)
      return Temporal.PlainTime.compare(a, b);
    if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime)
      return Temporal.ZonedDateTime.compare(a, b);
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    // Dual-typed window: Date values still in flight compare by epoch ms.
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    // Incomparable types (e.g. Temporal vs non-Temporal, mixed types).
    // Rails raises ArgumentError here; we throw so callers don't silently
    // skip validation due to NaN comparison semantics (NaN <= 0 is false).
    throw new TypeError(
      `Comparison of ${(a as object)?.constructor?.name ?? typeof a} with ${(b as object)?.constructor?.name ?? typeof b} failed`,
    );
  }

  override checkValidity(): void {
    const keys = [
      "greaterThan",
      "greaterThanOrEqualTo",
      "lessThan",
      "lessThanOrEqualTo",
      "equalTo",
      "otherThan",
    ];
    if (!keys.some((k) => (this.options as Record<string, unknown>)[k] !== undefined)) {
      throw new Error(
        "One of :greater_than, :greater_than_or_equal_to, :less_than, :less_than_or_equal_to, :equal_to, or :other_than must be supplied",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (value === null || value === undefined) return;
    if (typeof value === "string" && isBlank(value)) {
      record.errors.add(attribute, "blank", { value, message: this.options.message });
      return;
    }

    const safeCompare = (a: unknown, b: unknown): number | null => {
      try {
        return this.compare(a, b);
      } catch {
        record.errors.add(attribute, "invalid", { value, message: this.options.message });
        return null;
      }
    };

    if (this.options.greaterThan !== undefined) {
      const target = this.resolve(this.options.greaterThan, record);
      const cmp = safeCompare(value, target);
      if (cmp === null) return;
      if (cmp <= 0) {
        record.errors.add(attribute, "greater_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.greaterThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.greaterThanOrEqualTo, record);
      const cmpGte = safeCompare(value, target);
      if (cmpGte === null) return;
      if (cmpGte < 0) {
        record.errors.add(attribute, "greater_than_or_equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.lessThan !== undefined) {
      const target = this.resolve(this.options.lessThan, record);
      const cmpLt = safeCompare(value, target);
      if (cmpLt === null) return;
      if (cmpLt >= 0) {
        record.errors.add(attribute, "less_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.lessThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.lessThanOrEqualTo, record);
      const cmpLte = safeCompare(value, target);
      if (cmpLte === null) return;
      if (cmpLte > 0) {
        record.errors.add(attribute, "less_than_or_equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.equalTo !== undefined) {
      const target = this.resolve(this.options.equalTo, record);
      const cmpEq = safeCompare(value, target);
      if (cmpEq === null) return;
      if (cmpEq !== 0) {
        record.errors.add(attribute, "equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.otherThan !== undefined) {
      const target = this.resolve(this.options.otherThan, record);
      const cmpOther = safeCompare(value, target);
      if (cmpOther === null) return;
      if (cmpOther === 0) {
        record.errors.add(attribute, "other_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
  }
}
