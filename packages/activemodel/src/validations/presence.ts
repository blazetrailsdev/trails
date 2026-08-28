import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class PresenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attrName: string, value: unknown): void {
    if (isBlank(value)) {
      record.errors.add(attrName, ":blank", this.options);
    }
  }
}

export const HelperMethods = {
  validatesPresenceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(PresenceValidator, this._mergeAttributes(attrNames));
  },
};
