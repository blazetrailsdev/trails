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

/**
 * Mirrors: ActiveModel::Validations::HelperMethods (absence.rb:33-35) — Ruby reopens the
 * one `HelperMethods` module here, so the TS half of it lives here too and
 * `validations.ts` reassembles them.
 */
export const HelperMethods = {
  validatesAbsenceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
  },
};
