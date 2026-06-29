import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

/**
 * HelperMethods — shorthand validators (validates_presence_of, etc.)
 *
 * Mirrors: ActiveModel::Validations::HelperMethods
 *
 * In Rails this module is reopened in each validator file. All methods
 * are implemented on Model as static methods.
 */
/**
 * A `validates_*_of` argument: an attribute name, a (possibly nested) array of
 * names, or the trailing options hash. Mirrors Rails' `_merge_attributes`,
 * which extracts the trailing options hash and then `attr_names.flatten!`s the
 * rest (activemodel/lib/active_model/validations/helper_methods.rb:7-10), so
 * `validates_presence_of %w(name email)` is valid alongside the splat form.
 */
export type AttrNameArg = string | readonly AttrNameArg[] | Record<string, unknown>;

export interface HelperMethods {
  validatesAbsenceOf(...attrNames: AttrNameArg[]): void;
  validatesAcceptanceOf(...attrNames: AttrNameArg[]): void;
  validatesConfirmationOf(...attrNames: AttrNameArg[]): void;
  validatesExclusionOf(...attrNames: AttrNameArg[]): void;
  validatesFormatOf(...attrNames: AttrNameArg[]): void;
  validatesInclusionOf(...attrNames: AttrNameArg[]): void;
  validatesLengthOf(...attrNames: AttrNameArg[]): void;
  validatesSizeOf(...attrNames: AttrNameArg[]): void;
  validatesNumericalityOf(...attrNames: AttrNameArg[]): void;
  validatesPresenceOf(...attrNames: AttrNameArg[]): void;
  validatesComparisonOf(...attrNames: AttrNameArg[]): void;
}

export class AbsenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!isBlank(value)) {
      record.errors.add(attribute, "present", this.filteredErrorOptions());
    }
  }
}
