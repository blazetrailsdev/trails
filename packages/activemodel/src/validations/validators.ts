import type { Errors } from "../errors.js";
import type { Validator, ConditionalOptions } from "./validator.js";
import { shouldValidate } from "./validator.js";

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export interface PresenceOptions extends ConditionalOptions {
  message?: string | ((record: any) => string);
}

export class PresenceValidator implements Validator {
  constructor(private options: PresenceOptions = {}) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (isBlank(value)) {
      errors.add(attribute, "blank", { message: this.options.message });
    }
  }
}

export interface AbsenceOptions extends ConditionalOptions {
  message?: string;
}

export class AbsenceValidator implements Validator {
  constructor(private options: AbsenceOptions = {}) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (!isBlank(value)) {
      errors.add(attribute, "present", { message: this.options.message });
    }
  }
}

export interface LengthOptions extends ConditionalOptions {
  minimum?: number | (() => number);
  maximum?: number | (() => number);
  is?: number | (() => number);
  in?: [number, number];
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
  tooShort?: string;
  tooLong?: string;
  wrongLength?: string;
}

export class LengthValidator implements Validator {
  constructor(private options: LengthOptions = {}) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (value === null || value === undefined) {
      if (this.options.allowNil !== false) return;
      // If allowNil is explicitly false, we still skip (length can't be computed on nil)
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;
    const length =
      typeof value === "string" ? value.length : Array.isArray(value) ? value.length : 0;

    const resolveNum = (v: number | (() => number) | undefined): number | undefined => {
      if (v === undefined) return undefined;
      return typeof v === "function" ? v() : v;
    };
    const min = this.options.in ? this.options.in[0] : resolveNum(this.options.minimum);
    const max = this.options.in ? this.options.in[1] : resolveNum(this.options.maximum);

    if (min !== undefined && length < min) {
      errors.add(attribute, "too_short", {
        message: this.options.tooShort ?? this.options.message,
        count: min,
      });
    }
    if (max !== undefined && length > max) {
      errors.add(attribute, "too_long", {
        message: this.options.tooLong ?? this.options.message,
        count: max,
      });
    }
    if (this.options.is !== undefined && length !== this.options.is) {
      errors.add(attribute, "wrong_length", {
        message: this.options.wrongLength ?? this.options.message,
        count: this.options.is,
      });
    }
  }
}

type NumericValue = number | ((record: any) => number) | string;

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

  private resolveNumeric(val: NumericValue | undefined, record: any): number | undefined {
    if (val === undefined) return undefined;
    if (typeof val === "function") return val(record);
    if (typeof val === "string") {
      const method = (record as any)[val];
      if (typeof method === "function") return method.call(record);
      return Number(method);
    }
    return val;
  }

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
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

export interface InclusionOptions extends ConditionalOptions {
  in: unknown[] | (() => unknown[]);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class InclusionValidator implements Validator {
  constructor(private options: InclusionOptions) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    // Rails skips when value is nil by default (allow_nil: true)
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const list = typeof this.options.in === "function" ? this.options.in() : this.options.in;
    if (!list.includes(value)) {
      errors.add(attribute, "inclusion", { message: this.options.message });
    }
  }
}

export interface ExclusionOptions extends ConditionalOptions {
  in?: unknown[] | (() => unknown[]);
  within?: unknown[] | (() => unknown[]);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class ExclusionValidator implements Validator {
  constructor(private options: ExclusionOptions) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const inOpt = this.options.in ?? this.options.within;
    if (!inOpt) return;
    const list = typeof inOpt === "function" ? inOpt() : inOpt;
    if (list.includes(value)) {
      errors.add(attribute, "exclusion", { message: this.options.message });
    }
  }
}

export interface FormatOptions extends ConditionalOptions {
  with?: RegExp | ((record: any) => RegExp);
  without?: RegExp | ((record: any) => RegExp);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class FormatValidator implements Validator {
  constructor(private options: FormatOptions) {
    const withOpt = options.with;
    if (withOpt && withOpt instanceof RegExp && withOpt.multiline) {
      throw new Error(
        "The provided regular expression is using multiline anchors (^ or $), which may present a security risk. Did you mean to use \\A and \\z, or pass the `multiline: true` option?",
      );
    }
    if (!options.with && !options.without) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
    if (options.with && options.without) {
      throw new Error("Either :with or :without must be supplied (but not both)");
    }
  }

  private resolveRegexp(opt: RegExp | ((record: any) => RegExp), record: any): RegExp {
    return typeof opt === "function" ? opt(record) : opt;
  }

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (value === null || value === undefined) {
      if (this.options.allowNil) return;
      return;
    }
    if (this.options.allowBlank && isBlank(value)) return;
    const str = String(value);
    if (this.options.with) {
      const re = this.resolveRegexp(this.options.with, record);
      if (!re.test(str)) {
        errors.add(attribute, "invalid", { message: this.options.message });
      }
    }
    if (this.options.without) {
      const re = this.resolveRegexp(this.options.without, record);
      if (re.test(str)) {
        errors.add(attribute, "invalid", { message: this.options.message });
      }
    }
  }
}

export interface AcceptanceOptions extends ConditionalOptions {
  accept?: unknown[];
  message?: string;
}

export class AcceptanceValidator implements Validator {
  constructor(private options: AcceptanceOptions = {}) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    // Rails skips acceptance validation when value is nil
    if (value === null || value === undefined) return;
    const accepted = this.options.accept ?? [true, "true", "1", 1, "yes"];
    if (!accepted.includes(value)) {
      errors.add(attribute, "accepted", { message: this.options.message });
    }
  }
}

export interface ConfirmationOptions extends ConditionalOptions {
  message?: string;
  caseSensitive?: boolean;
}

export class ConfirmationValidator implements Validator {
  constructor(private options: ConfirmationOptions = {}) {}

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    const confirmationAttr = `${attribute}Confirmation`;
    const confirmation = record._attributes?.get(confirmationAttr) ?? record[confirmationAttr];
    if (confirmation === undefined) return;
    const caseSensitive = this.options.caseSensitive ?? true;
    let matches: boolean;
    if (!caseSensitive && typeof value === "string" && typeof confirmation === "string") {
      matches = value.toLowerCase() === confirmation.toLowerCase();
    } else {
      matches = value === confirmation;
    }
    if (!matches) {
      errors.add(attribute, "confirmation", { message: this.options.message });
    }
  }
}

export interface ComparisonOptions extends ConditionalOptions {
  greaterThan?: unknown | ((record: any) => unknown);
  greaterThanOrEqualTo?: unknown | ((record: any) => unknown);
  lessThan?: unknown | ((record: any) => unknown);
  lessThanOrEqualTo?: unknown | ((record: any) => unknown);
  equalTo?: unknown | ((record: any) => unknown);
  otherThan?: unknown | ((record: any) => unknown);
  message?: string;
}

export class ComparisonValidator implements Validator {
  constructor(private options: ComparisonOptions = {}) {}

  private resolve(opt: unknown | ((record: any) => unknown), record: any): unknown {
    return typeof opt === "function" ? (opt as (record: any) => unknown)(record) : opt;
  }

  private compare(a: unknown, b: unknown): number {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    return Number(a) - Number(b);
  }

  validate(record: any, attribute: string, value: unknown, errors: Errors): void {
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
