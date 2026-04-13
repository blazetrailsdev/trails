/**
 * Mirrors: ActiveRecord::Validations::AbsenceValidator
 *
 * Extends ActiveModel's AbsenceValidator with association awareness —
 * if the attribute is an association, objects marked for destruction
 * are excluded from the absence check.
 */
import { AbsenceValidator as BaseAbsenceValidator } from "@blazetrails/activemodel";
import { isAssociation, resolveAssociation, filterDestroyed } from "./association-helpers.js";

export class AbsenceValidator extends BaseAbsenceValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    if (isAssociation(record, attribute)) {
      const resolved = resolveAssociation(record, attribute, value);
      const filtered = filterDestroyed(resolved);
      super.validateEach(record, attribute, filtered);
      return;
    }
    super.validateEach(record, attribute, value);
  }
}
