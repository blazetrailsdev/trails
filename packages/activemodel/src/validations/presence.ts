import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isPresent } from "@blazetrails/activesupport";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class PresenceValidator extends EachValidator {
  async validateEach(record: ValidatableRecord, attrName: string, value: unknown): Promise<void> {
    if (!(await isPresent(value))) {
      record.errors.add(attrName, ":blank", this.options);
    }
  }
}

export const HelperMethods = {
  validatesPresenceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(PresenceValidator, this._mergeAttributes(attrNames));
  },
};
