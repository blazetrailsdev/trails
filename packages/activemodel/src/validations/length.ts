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
