import type { Errors } from "../errors.js";
import type { AnyRecord, ConditionalOptions, Validator } from "../validator.js";
import { shouldValidate } from "../validator.js";

export interface AcceptanceOptions extends ConditionalOptions {
  accept?: unknown[];
  message?: string;
}

export class AcceptanceValidator implements Validator {
  constructor(private options: AcceptanceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    // Rails skips acceptance validation when value is nil
    if (value === null || value === undefined) return;
    const accepted = this.options.accept ?? [true, "true", "1", 1, "yes"];
    if (!accepted.includes(value)) {
      errors.add(attribute, "accepted", { message: this.options.message });
    }
  }
}
