import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@rails-ts/activesupport";

type NumericValue = number | ((record: AnyRecord) => number) | string;

export interface NumericalityOptions extends ConditionalOptions {
  onlyInteger?: boolean;
  greaterThan?: NumericValue;
  greaterThanOrEqualTo?: NumericValue;
  lessThan?: NumericValue;
  lessThanOrEqualTo?: NumericValue;
  equalTo?: NumericValue;
  otherThan?: NumericValue;
  in?: [number, number];
  odd?: boolean;
  even?: boolean;
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class NumericalityValidator implements Validator {
  constructor(private options: NumericalityOptions = {}) {}

  private resolveNumeric(val: NumericValue | undefined, record: AnyRecord): number | undefined {
    if (val === undefined) return undefined;
    if (typeof val === "function") return val(record);
    if (typeof val === "string") {
      const method = (record as AnyRecord)[val];
      if (typeof method === "function") return method.call(record);
      return Number(method);
    }
    return val;
  }

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (value === null || value === undefined) {
      if (this.options.allowNil) return;
      // Default: skip nil (Rails default for numericality)
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;

    const num = Number(value);
    if (isNaN(num)) {
      errors.add(attribute, "not_a_number", { message: this.options.message });
      return;
    }

    if (this.options.onlyInteger && !Number.isInteger(num)) {
      errors.add(attribute, "not_an_integer", { message: this.options.message });
      return;
    }

    const gt = this.resolveNumeric(this.options.greaterThan, record);
    if (gt !== undefined && !(num > gt)) {
      errors.add(attribute, "greater_than", { count: gt });
    }
    const gte = this.resolveNumeric(this.options.greaterThanOrEqualTo, record);
    if (gte !== undefined && !(num >= gte)) {
      errors.add(attribute, "greater_than_or_equal_to", { count: gte });
    }
    const lt = this.resolveNumeric(this.options.lessThan, record);
    if (lt !== undefined && !(num < lt)) {
      errors.add(attribute, "less_than", { count: lt });
    }
    const lte = this.resolveNumeric(this.options.lessThanOrEqualTo, record);
    if (lte !== undefined && !(num <= lte)) {
      errors.add(attribute, "less_than_or_equal_to", { count: lte });
    }
    const eq = this.resolveNumeric(this.options.equalTo, record);
    if (eq !== undefined && num !== eq) {
      errors.add(attribute, "equal_to", { count: eq });
    }
    const ot = this.resolveNumeric(this.options.otherThan, record);
    if (ot !== undefined && num === ot) {
      errors.add(attribute, "other_than", { count: ot });
    }
    if (this.options.in !== undefined) {
      const [min, max] = this.options.in;
      if (num < min || num > max) {
        errors.add(attribute, "not_in_range", {
          message: this.options.message,
          count: `${min}..${max}`,
        });
      }
    }
    if (this.options.odd && num % 2 === 0) {
      errors.add(attribute, "odd");
    }
    if (this.options.even && num % 2 !== 0) {
      errors.add(attribute, "even");
    }
  }
}
