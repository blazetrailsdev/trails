import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface ExclusionOptions extends ConditionalOptions {
  in?: unknown[] | (() => unknown[]);
  within?: unknown[] | (() => unknown[]);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class ExclusionValidator implements Validator {
  constructor(private options: ExclusionOptions) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const inOpt = this.options.in ?? this.options.within;
    if (!inOpt) return;
    const list = typeof inOpt === "function" ? inOpt() : inOpt;
    if (list.includes(value)) {
      errs.add(attribute, "exclusion", { message: this.options.message });
    }
  }
}
