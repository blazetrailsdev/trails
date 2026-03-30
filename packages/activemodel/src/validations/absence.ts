import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";

export interface AbsenceOptions extends ConditionalOptions {
  message?: string;
}

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

export class AbsenceValidator implements Validator {
  constructor(private options: AbsenceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    if (!isBlank(value)) {
      errors.add(attribute, "present", { message: this.options.message });
    }
  }
}
