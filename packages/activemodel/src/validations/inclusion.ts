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

/**
 * Mirrors: ActiveModel::Validations::InclusionValidator (inclusion.rb)
 *
 *   class InclusionValidator < EachValidator
 *     include Clusivity
 *     def validate_each(record, attribute, value)
 *       unless include?(record, value)
 *         record.errors.add(attribute, :inclusion,
 *           **options.except(:in, :within).merge!(value: value))
 *       end
 *     end
 *   end
 *
 * `nil`/`undefined` are NOT pre-skipped here — Rails relies on
 * EachValidator's allow_nil dispatch (validator.ts:100) so the option
 * keeps its Rails-faithful "only skip when allow_nil: true" semantics.
 */
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Clusivity` (inclusion.rb:8); the class/interface merge is how `include()` surfaces on the type side, and it adds no members of its own. */
export interface InclusionValidator extends Clusivity {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InclusionValidator extends EachValidator {
  /**
   * @missingRailsArgs merge! — PERMANENT: `Hash#merge!` is a receiver method
   * on the hash `except` returns; trails ports Ruby's Hash core methods as
   * free functions taking the hash first (`hash-utils.ts:140`), which JS
   * requires short of monkey-patching `Object.prototype`, so the receiver
   * arrives as the first argument.
   */
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

// Mirrors: `include Clusivity` (inclusion.rb:8). The module lands on the
// prototype rather than on class fields because `EachValidator`'s constructor
// calls `this.checkValidityBang()`, and class fields do not initialize until
// after `super()` returns.
include(InclusionValidator, {
  checkValidityBang,
  resolveValue,
  delimiter,
  inclusionMethod,
  isInclude,
});

/**
 * Mirrors: ActiveModel::Validations::HelperMethods (inclusion.rb:44-46) — Ruby reopens the
 * one `HelperMethods` module here, so the TS half of it lives here too and
 * `validations.ts` reassembles them.
 */
export const HelperMethods = {
  validatesInclusionOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(InclusionValidator, this._mergeAttributes(attrNames));
  },
};
