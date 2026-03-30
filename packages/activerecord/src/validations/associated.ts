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

export class AssociatedValidator extends EachValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const assoc of values) {
      if (typeof assoc?.isValid === "function" && !assoc.isValid()) {
        record.errors.add(attribute, "invalid", { value });
        return;
      }
    }
  }
}
