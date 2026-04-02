import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface PresenceOptions extends ConditionalOptions {
  message?: string | ((record: AnyRecord) => string);
}

export class PresenceValidator implements Validator {
  constructor(private options: PresenceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    if (isBlank(value)) {
      errs.add(attribute, "blank", { message: this.options.message });
    }
  }
}
