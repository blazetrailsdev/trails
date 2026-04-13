import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export class PresenceValidator extends EachValidator {
  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (isBlank(value)) {
      record.errors.add(attribute, "blank", { message: this.options.message });
    }
  }
}
