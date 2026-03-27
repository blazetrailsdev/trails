import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface AbsenceOptions extends ConditionalOptions {
  message?: string;
}

export class AbsenceValidator implements Validator {
  constructor(private options: AbsenceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (!isBlank(value)) {
      errors.add(attribute, "present", { message: this.options.message });
    }
  }
}
