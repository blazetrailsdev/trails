/**
 * Mirrors: ActiveRecord::Validations::PresenceValidator
 *
 * Extends ActiveModel's PresenceValidator with association awareness —
 * if the attribute is an association, objects marked for destruction
 * are excluded from the presence check.
 */
import { PresenceValidator as BasePresenceValidator } from "@blazetrails/activemodel";
import { isAssociation, resolveAssociation, filterDestroyed } from "./association-helpers.js";

export class PresenceValidator extends BasePresenceValidator {
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
