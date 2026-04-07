import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

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

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  checkValidityBang(): void {
    if (
      this.options.minimum === undefined &&
      this.options.maximum === undefined &&
      this.options.is === undefined &&
      this.options.in === undefined
    ) {
      throw new Error(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (!shouldValidate(record, this.options)) return;
    if (value === null || value === undefined) {
      // Rails: nil is always skipped for maximum-only validations
      const maximumOnly =
        this.options.maximum !== undefined &&
        this.options.minimum === undefined &&
        this.options.is === undefined &&
        this.options.in === undefined;
      if (this.options.allowNil !== false || maximumOnly) return;
      // allowNil is explicitly false and not maximum-only — fall through to validate
    }
    if (this.options.allowBlank && isBlank(value)) return;

    // Rails: handle any object with a length property
    let length: number;
    if (typeof value === "string" || Array.isArray(value)) {
      length = value.length;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "length" in value &&
      typeof (value as { length: unknown }).length === "number"
    ) {
      length = (value as { length: number }).length;
    } else {
      length = 0;
    }

    const resolveNum = (v: number | (() => number) | undefined): number | undefined => {
      if (v === undefined) return undefined;
      return typeof v === "function" ? v() : v;
    };
    let min = this.options.in ? this.options.in[0] : resolveNum(this.options.minimum);
    const max = this.options.in ? this.options.in[1] : resolveNum(this.options.maximum);

    // Rails: implicit minimum: 1 when allow_blank is false and no explicit constraints
    if (
      min === undefined &&
      max === undefined &&
      this.options.allowBlank === false &&
      this.options.is === undefined &&
      this.options.in === undefined
    ) {
      min = 1;
    }

    if (min !== undefined && length < min) {
      errs.add(attribute, "too_short", {
        message: this.options.tooShort ?? this.options.message,
        count: min,
        value,
      });
    }
    if (max !== undefined && length > max) {
      errs.add(attribute, "too_long", {
        message: this.options.tooLong ?? this.options.message,
        count: max,
        value,
      });
    }
    if (this.options.is !== undefined && length !== this.options.is) {
      errs.add(attribute, "wrong_length", {
        message: this.options.wrongLength ?? this.options.message,
        count: this.options.is,
        value,
      });
    }
  }
}
