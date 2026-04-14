/**
 * Mirrors: ActiveRecord::Validations::PresenceValidator
 *
 * Extends ActiveModel's PresenceValidator with association awareness —
 * if the attribute is an association, objects marked for destruction
 * are excluded from the presence check.
 */
import { PresenceValidator as BasePresenceValidator } from "@blazetrails/activemodel";

export class PresenceValidator extends BasePresenceValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    let associationOrValue = value;
    if (record.constructor._reflectOnAssociation?.(attribute)) {
      const arr = Array.isArray(value) ? value : value != null ? [value] : [];
      associationOrValue = arr.filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}
