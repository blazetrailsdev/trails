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
