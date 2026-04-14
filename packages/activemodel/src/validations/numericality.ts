import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

type NumericValue = number | ((record: AnyRecord) => number) | string;

export class NumericalityValidator extends EachValidator {
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

  override checkValidity(): void {
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

  // Rails: validate_each(record, attr_name, value, precision: Float::DIG, scale: nil)
  validateEach(
    record: AnyRecord,
    attribute: string,
    value: unknown,
    precision = 15,
    scale?: number,
  ): void {
    if (value === null || value === undefined) {
      if (this.options.allowNil !== false) return;
      record.errors.add(attribute, "not_a_number", { value, message: this.options.message });
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;

    if (typeof value === "string" && /^\s*[+-]?0x/i.test(value)) {
      record.errors.add(attribute, "not_a_number", { value, message: this.options.message });
      return;
    }

    const raw = Number(value);
    if (isNaN(raw)) {
      record.errors.add(attribute, "not_a_number", { value, message: this.options.message });
      return;
    }

    // Rails: parse_as_number → round(value, scale).to_d(precision)
    const num = parseAsNumber(raw, precision, scale);

    if (this.options.onlyInteger && !Number.isInteger(num)) {
      record.errors.add(attribute, "not_an_integer", { value, message: this.options.message });
      return;
    }

    const msg = this.options.message;
    const gt = this.resolveNumeric(this.options.greaterThan as NumericValue | undefined, record);
    if (gt !== undefined && !(num > gt)) {
      record.errors.add(attribute, "greater_than", { count: gt, value, message: msg });
    }
    const gte = this.resolveNumeric(
      this.options.greaterThanOrEqualTo as NumericValue | undefined,
      record,
    );
    if (gte !== undefined && !(num >= gte)) {
      record.errors.add(attribute, "greater_than_or_equal_to", { count: gte, value, message: msg });
    }
    const lt = this.resolveNumeric(this.options.lessThan as NumericValue | undefined, record);
    if (lt !== undefined && !(num < lt)) {
      record.errors.add(attribute, "less_than", { count: lt, value, message: msg });
    }
    const lte = this.resolveNumeric(
      this.options.lessThanOrEqualTo as NumericValue | undefined,
      record,
    );
    if (lte !== undefined && !(num <= lte)) {
      record.errors.add(attribute, "less_than_or_equal_to", { count: lte, value, message: msg });
    }
    const eq = this.resolveNumeric(this.options.equalTo as NumericValue | undefined, record);
    if (eq !== undefined && num !== eq) {
      record.errors.add(attribute, "equal_to", { count: eq, value, message: msg });
    }
    const ot = this.resolveNumeric(this.options.otherThan as NumericValue | undefined, record);
    if (ot !== undefined && num === ot) {
      record.errors.add(attribute, "other_than", { count: ot, value, message: msg });
    }
    if (this.options.in !== undefined) {
      const [min, max] = this.options.in as [number, number];
      if (num < min || num > max) {
        record.errors.add(attribute, "in", {
          message: msg,
          value,
          count: `${min}..${max}`,
        });
      }
    }
    if (this.options.odd && num % 2 === 0) {
      record.errors.add(attribute, "odd", { value, message: msg });
    }
    if (this.options.even && num % 2 !== 0) {
      record.errors.add(attribute, "even", { value, message: msg });
    }
  }
}

/**
 * Rails: parse_as_number → round(value, scale).to_d(precision)
 *
 * Rounds to scale decimal places, then truncates to precision significant
 * digits. This matches Ruby's BigDecimal(float.round(scale), precision).
 */
function parseAsNumber(num: number, precision: number, scale?: number): number {
  let result = num;
  if (scale != null) {
    const factor = Math.pow(10, scale);
    result = Math.round(result * factor) / factor;
  }
  return +result.toPrecision(precision);
}
