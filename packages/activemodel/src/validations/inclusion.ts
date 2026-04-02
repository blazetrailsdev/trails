import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface InclusionOptions extends ConditionalOptions {
  in: unknown[] | (() => unknown[]);
  allowNil?: boolean;
  allowBlank?: boolean;
  message?: string;
}

export class InclusionValidator implements Validator {
  constructor(private options: InclusionOptions) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const list = typeof this.options.in === "function" ? this.options.in() : this.options.in;
    if (!list.includes(value)) {
      errs.add(attribute, "inclusion", { message: this.options.message });
    }
  }
}
