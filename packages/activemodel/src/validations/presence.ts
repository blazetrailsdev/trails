import type { Errors } from "../errors.js";
import type { AnyRecord, ConditionalOptions, Validator } from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@rails-ts/activesupport";

export interface PresenceOptions extends ConditionalOptions {
  message?: string | ((record: AnyRecord) => string);
}

export class PresenceValidator implements Validator {
  constructor(private options: PresenceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (isBlank(value)) {
      errors.add(attribute, "blank", { message: this.options.message });
    }
  }
}
