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
  validate(record: any, attribute: string, value: unknown, errors: any): void {
    if (isAssociation(record, attribute)) {
      const resolved = resolveAssociation(record, attribute, value);
      const filtered = filterDestroyed(resolved);
      super.validate(record, attribute, filtered, errors);
      return;
    }
    super.validate(record, attribute, value, errors);
  }
}
