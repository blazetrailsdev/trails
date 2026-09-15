import { registerConstant } from "@blazetrails/activesupport";
import { EachValidator } from "../../validator.js";
import type { ValidatableRecord } from "../../validator.js";

export class EmailValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!/^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i.test(String(value ?? ""))) {
      record.errors.add(attribute, undefined, {
        message: (this.options.message as string | undefined) ?? "is not an email",
      });
    }
  }
}

registerConstant("EmailValidator", EmailValidator);
