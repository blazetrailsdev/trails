import type { Errors } from "../errors.js";
import type { AnyRecord, ConditionalOptions, Validator } from "../validator.js";
import { shouldValidate } from "../validator.js";
import { humanize } from "@rails-ts/activesupport";

export interface ConfirmationOptions extends ConditionalOptions {
  message?: string;
  caseSensitive?: boolean;
}

export class ConfirmationValidator implements Validator {
  constructor(private options: ConfirmationOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
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
      const modelClass = (record as AnyRecord).constructor;
      const humanAttr = modelClass?.humanAttributeName
        ? modelClass.humanAttributeName(attribute)
        : humanize(attribute);
      errors.add(attribute, "confirmation", {
        message: this.options.message,
        attribute: humanAttr,
      });
    }
  }
}
