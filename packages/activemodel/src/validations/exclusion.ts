import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { except, include, mergeBang } from "@blazetrails/activesupport";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";
import {
  checkValidityBang,
  type Clusivity,
  delimiter,
  inclusionMethod,
  isInclude,
  resolveValue,
} from "./clusivity.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Clusivity` (exclusion.rb:8); the class/interface merge is how `include()` surfaces on the type side, and it adds no members of its own. */
export interface ExclusionValidator extends Clusivity {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExclusionValidator extends EachValidator {
  /** @missingRailsArgs merge! — PERMANENT */
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (this.isInclude(record, value)) {
      record.errors.add(
        attribute,
        ":exclusion",
        mergeBang(except(this.options, "in", "within"), { value }),
      );
    }
  }
}

include(ExclusionValidator, {
  checkValidityBang,
  resolveValue,
  delimiter,
  inclusionMethod,
  isInclude,
});

export const HelperMethods = {
  validatesExclusionOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(ExclusionValidator, this._mergeAttributes(attrNames));
  },
};
