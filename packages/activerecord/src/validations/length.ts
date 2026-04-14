/**
 * Mirrors: ActiveRecord::Validations::LengthValidator
 *
 * Extends ActiveModel's LengthValidator with association awareness —
 * if the attribute is an association, records marked for destruction
 * are excluded from the length count.
 */
import { LengthValidator as BaseLengthValidator } from "@blazetrails/activemodel";

export class LengthValidator extends BaseLengthValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    let associationOrValue = value;
    // readAttributeForValidation resolves collection proxies to their
    // target arrays, so we check via association reflection whether
    // the attribute is an association and filter destroyed records.
    const isAssoc = record.constructor._reflectOnAssociation?.(attribute);
    if (isAssoc && Array.isArray(value)) {
      associationOrValue = value.filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}
