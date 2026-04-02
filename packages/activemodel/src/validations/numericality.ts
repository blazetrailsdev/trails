import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

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
    this.validateEach(record, attribute, value, errors);
  }

  checkValidityBang(): void {
    const compareKeys = [
      "greaterThan",
      "greaterThanOrEqualTo",
      "lessThan",
      "lessThanOrEqualTo",
      "equalTo",
      "otherThan",
    ] as const;
    for (const key of compareKeys) {
      const val = this.options[key];
      if (
        val !== undefined &&
        typeof val !== "number" &&
        typeof val !== "function" &&
        typeof val !== "string"
      ) {
        throw new Error(`:${key} must be a number, a symbol or a proc`);
      }
    }
    if (this.options.in !== undefined && !Array.isArray(this.options.in)) {
      throw new Error(":in must be a range");
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (value === null || value === undefined) {
      if (this.options.allowNil) return;
      // Default: skip nil (Rails default for numericality)
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;

    const num = Number(value);
    if (isNaN(num)) {
      errs.add(attribute, "not_a_number", { message: this.options.message });
      return;
    }

    if (this.options.onlyInteger && !Number.isInteger(num)) {
      errs.add(attribute, "not_an_integer", { message: this.options.message });
      return;
    }

    const gt = this.resolveNumeric(this.options.greaterThan, record);
    if (gt !== undefined && !(num > gt)) {
      errs.add(attribute, "greater_than", { count: gt });
    }
    const gte = this.resolveNumeric(this.options.greaterThanOrEqualTo, record);
    if (gte !== undefined && !(num >= gte)) {
      errs.add(attribute, "greater_than_or_equal_to", { count: gte });
    }
    const lt = this.resolveNumeric(this.options.lessThan, record);
    if (lt !== undefined && !(num < lt)) {
      errs.add(attribute, "less_than", { count: lt });
    }
    const lte = this.resolveNumeric(this.options.lessThanOrEqualTo, record);
    if (lte !== undefined && !(num <= lte)) {
      errs.add(attribute, "less_than_or_equal_to", { count: lte });
    }
    const eq = this.resolveNumeric(this.options.equalTo, record);
    if (eq !== undefined && num !== eq) {
      errs.add(attribute, "equal_to", { count: eq });
    }
    const ot = this.resolveNumeric(this.options.otherThan, record);
    if (ot !== undefined && num === ot) {
      errs.add(attribute, "other_than", { count: ot });
    }
    if (this.options.in !== undefined) {
      const [min, max] = this.options.in;
      if (num < min || num > max) {
        errs.add(attribute, "not_in_range", {
          message: this.options.message,
          count: `${min}..${max}`,
        });
      }
    }
    if (this.options.odd && num % 2 === 0) {
      errs.add(attribute, "odd");
    }
    if (this.options.even && num % 2 !== 0) {
      errs.add(attribute, "even");
    }
  }
}
