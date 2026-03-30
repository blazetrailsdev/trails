/**
 * Mirrors: ActiveRecord::Validations
 *
 * AR-specific validation module. Extends ActiveModel validations with
 * database-aware validators (uniqueness, association validity, etc.)
 * and adds save! / create! / update! that raise RecordInvalid.
 */
export { RecordInvalid } from "./errors.js";
export { AbsenceValidator } from "./validations/absence.js";
export { AssociatedValidator } from "./validations/associated.js";
export { LengthValidator } from "./validations/length.js";
export { NumericalityValidator } from "./validations/numericality.js";
export { PresenceValidator } from "./validations/presence.js";
export { UniquenessValidator } from "./validations/uniqueness.js";

/**
 * Mirrors: ActiveRecord::Validations (module)
 *
 * Mixed into Base to provide validates_presence_of, validates_uniqueness_of, etc.
 */
export interface Validations {
  validate(): this;
  isValid(): boolean;
}
