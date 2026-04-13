import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
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
  validatesAbsenceOf(...attributes: string[]): void;
  validatesAcceptanceOf(...attributes: string[]): void;
  validatesConfirmationOf(...attributes: string[]): void;
  validatesExclusionOf(attribute: string, options: Record<string, unknown>): void;
  validatesFormatOf(attribute: string, options: Record<string, unknown>): void;
  validatesInclusionOf(attribute: string, options: Record<string, unknown>): void;
  validatesLengthOf(attribute: string, options: Record<string, unknown>): void;
  validatesNumericalityOf(attribute: string, options?: Record<string, unknown> | boolean): void;
  validatesPresenceOf(...attributes: string[]): void;
}

export class AbsenceValidator extends EachValidator {
  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (!isBlank(value)) {
      record.errors.add(attribute, "present", { message: this.options.message });
    }
  }
}
