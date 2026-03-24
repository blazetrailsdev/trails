import type { Errors } from "../errors.js";
import type { AnyRecord, ConditionalOptions, Validator } from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@rails-ts/activesupport";

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
    // Rails skips when value is nil by default (allow_nil: true)
    if (this.options.allowNil !== false && (value === null || value === undefined)) return;
    if (this.options.allowBlank && isBlank(value)) return;
    const list = typeof this.options.in === "function" ? this.options.in() : this.options.in;
    if (!list.includes(value)) {
      errors.add(attribute, "inclusion", { message: this.options.message });
    }
  }
}
