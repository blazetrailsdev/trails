/**
 * Mirrors: ActiveRecord::Validations::PresenceValidator
 *
 * Extends ActiveModel's PresenceValidator with association awareness —
 * if the attribute is an association, objects marked for destruction
 * are excluded from the presence check.
 */
import { PresenceValidator as BasePresenceValidator } from "@blazetrails/activemodel";
import { wrap } from "@blazetrails/activesupport";

export class PresenceValidator extends BasePresenceValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    let associationOrValue = value;
    if (record.constructor._reflectOnAssociation?.(attribute)) {
      associationOrValue = wrap(value).filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}
