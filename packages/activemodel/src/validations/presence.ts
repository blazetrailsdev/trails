import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export class PresenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (isBlank(value)) {
      record.errors.add(attribute, "blank", this.filteredErrorOptions());
    }
  }
}
