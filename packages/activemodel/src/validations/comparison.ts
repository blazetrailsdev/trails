import type { Errors } from "../errors.js";
import type { AnyRecord, ConditionalOptions, Validator } from "../validator.js";
import { shouldValidate } from "../validator.js";

export interface ComparisonOptions extends ConditionalOptions {
  greaterThan?: unknown | ((record: AnyRecord) => unknown);
  greaterThanOrEqualTo?: unknown | ((record: AnyRecord) => unknown);
  lessThan?: unknown | ((record: AnyRecord) => unknown);
  lessThanOrEqualTo?: unknown | ((record: AnyRecord) => unknown);
  equalTo?: unknown | ((record: AnyRecord) => unknown);
  otherThan?: unknown | ((record: AnyRecord) => unknown);
  message?: string;
}

export class ComparisonValidator implements Validator {
  constructor(private options: ComparisonOptions = {}) {}

  private resolve(opt: unknown | ((record: AnyRecord) => unknown), record: AnyRecord): unknown {
    return typeof opt === "function" ? (opt as (record: AnyRecord) => unknown)(record) : opt;
  }

  private compare(a: unknown, b: unknown): number {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    return Number(a) - Number(b);
  }

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (value === null || value === undefined) return;

    if (this.options.greaterThan !== undefined) {
      const target = this.resolve(this.options.greaterThan, record);
      if (this.compare(value, target) <= 0) {
        errors.add(attribute, "greater_than", { count: target, message: this.options.message });
      }
    }
    if (this.options.greaterThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.greaterThanOrEqualTo, record);
      if (this.compare(value, target) < 0) {
        errors.add(attribute, "greater_than_or_equal_to", {
          count: target,
          message: this.options.message,
        });
      }
    }
    if (this.options.lessThan !== undefined) {
      const target = this.resolve(this.options.lessThan, record);
      if (this.compare(value, target) >= 0) {
        errors.add(attribute, "less_than", { count: target, message: this.options.message });
      }
    }
    if (this.options.lessThanOrEqualTo !== undefined) {
      const target = this.resolve(this.options.lessThanOrEqualTo, record);
      if (this.compare(value, target) > 0) {
        errors.add(attribute, "less_than_or_equal_to", {
          count: target,
          message: this.options.message,
        });
      }
    }
    if (this.options.equalTo !== undefined) {
      const target = this.resolve(this.options.equalTo, record);
      if (this.compare(value, target) !== 0) {
        errors.add(attribute, "equal_to", { count: target, message: this.options.message });
      }
    }
    if (this.options.otherThan !== undefined) {
      const target = this.resolve(this.options.otherThan, record);
      if (this.compare(value, target) === 0) {
        errors.add(attribute, "other_than", { count: target, message: this.options.message });
      }
    }
  }
}
