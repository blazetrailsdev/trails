import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { include, mergeBang } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";
import {
  checkValidityBang,
  type Clusivity,
  delimiter,
  inclusionMethod,
  isInclude,
  resolveValue,
} from "./clusivity.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Clusivity` (inclusion.rb:8); the class/interface merge is how `include()` surfaces on the type side, and it adds no members of its own. */
export interface InclusionValidator extends Clusivity {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InclusionValidator extends EachValidator {
  /** @missingRailsArgs merge! — PERMANENT */
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!this.isInclude(record, value)) {
      record.errors.add(
        attribute,
        ":inclusion",
        mergeBang(except(this.options, "in", "within"), { value }),
      );
    }
  }
}

include(InclusionValidator, {
  checkValidityBang,
  resolveValue,
  delimiter,
  inclusionMethod,
  isInclude,
});

export const HelperMethods = {
  validatesInclusionOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(InclusionValidator, this._mergeAttributes(attrNames));
  },
};
