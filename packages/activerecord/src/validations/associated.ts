/**
 * Mirrors: ActiveRecord::Validations::AssociatedValidator
 *
 * Validates that all associated objects are valid. Works with
 * any kind of association (has_many, has_one, belongs_to).
 *
 *   class Book extends Base {
 *     static { this.hasMany("pages"); this.validatesAssociated("pages"); }
 *   }
 */
import { EachValidator } from "@blazetrails/activemodel";
import { isMarkedForDestruction } from "../autosave-association.js";
import { resolveAssociation } from "./association-helpers.js";

export class AssociatedValidator extends EachValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    const associationValue = resolveAssociation(record, attribute, value);

    const values = Array.isArray(associationValue)
      ? associationValue
      : associationValue
        ? [associationValue]
        : [];
    for (const assoc of values) {
      if (isMarkedForDestruction(assoc)) continue;
      if (typeof assoc?.isValid === "function" && !assoc.isValid()) {
        record.errors.add(attribute, "invalid", { value: associationValue });
        return;
      }
    }
  }
}
