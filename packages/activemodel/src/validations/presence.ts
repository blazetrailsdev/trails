import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";
import type { AttrNameArg, HelperMethodsHost } from "../validations.js";

export class PresenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (isBlank(value)) {
      record.errors.add(attribute, ":blank", this.options);
    }
  }
}

/**
 * Mirrors: ActiveModel::Validations::HelperMethods (presence.rb:34-36) — Ruby reopens the
 * one `HelperMethods` module here, so the TS half of it lives here too and
 * `validations.ts` reassembles them.
 */
export const HelperMethods = {
  validatesPresenceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(PresenceValidator, this._mergeAttributes(attrNames));
  },
};
