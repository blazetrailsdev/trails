import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { humanize } from "@blazetrails/activesupport";

export class ConfirmationValidator extends EachValidator {
  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    const confirmationAttr = `${attribute}Confirmation`;
    const confirmation = record.readAttribute?.(confirmationAttr) ?? record[confirmationAttr];
    if (confirmation == null) return;
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
      record.errors.add(confirmationAttr, "confirmation", {
        message: this.options.message,
        attribute: humanAttr,
      });
    }
  }
}
