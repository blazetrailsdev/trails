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
export interface HelperMethods {
  validatesAbsenceOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesAcceptanceOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesConfirmationOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesExclusionOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesFormatOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesInclusionOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesLengthOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesSizeOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesNumericalityOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesPresenceOf(...attrNames: (string | Record<string, unknown>)[]): void;
  validatesComparisonOf(...attrNames: (string | Record<string, unknown>)[]): void;
}

export class AbsenceValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!isBlank(value)) {
      record.errors.add(attribute, "present", this.filteredErrorOptions());
    }
  }
}
