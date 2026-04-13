import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export class ComparisonValidator extends EachValidator {
  private resolve(opt: unknown | ((record: AnyRecord) => unknown), record: AnyRecord): unknown {
    return typeof opt === "function" ? (opt as (record: AnyRecord) => unknown)(record) : opt;
  }

  private compare(a: unknown, b: unknown): number {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    return Number(a) - Number(b);
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

    if (this.options.greaterThan !== undefined) {
      const target = this.resolve(this.options.greaterThan, record);
      if (this.compare(value, target) <= 0) {
        record.errors.add(attribute, "greater_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.greaterThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.greaterThanOrEqualTo, record);
      if (this.compare(value, target) < 0) {
        record.errors.add(attribute, "greater_than_or_equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.lessThan !== undefined) {
      const target = this.resolve(this.options.lessThan, record);
      if (this.compare(value, target) >= 0) {
        record.errors.add(attribute, "less_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.lessThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.lessThanOrEqualTo, record);
      if (this.compare(value, target) > 0) {
        record.errors.add(attribute, "less_than_or_equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.equalTo !== undefined) {
      const target = this.resolve(this.options.equalTo, record);
      if (this.compare(value, target) !== 0) {
        record.errors.add(attribute, "equal_to", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
    if (this.options.otherThan !== undefined) {
      const target = this.resolve(this.options.otherThan, record);
      if (this.compare(value, target) === 0) {
        record.errors.add(attribute, "other_than", {
          count: target,
          value,
          message: this.options.message,
        });
      }
    }
  }
}
