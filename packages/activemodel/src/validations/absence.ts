import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class AbsenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!isBlank(value)) {
      record.errors.add(attribute, ":present", this.options);
    }
  }
}

export const HelperMethods = {
  validatesAbsenceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
  },
};
