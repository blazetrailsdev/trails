import { LengthValidator as BaseLengthValidator } from "@blazetrails/activemodel";

export class LengthValidator extends BaseLengthValidator {
  validateEach(record: any, attribute: string, associationOrValue: unknown): void {
    const isAssoc = record.constructor._reflectOnAssociation?.(attribute);
    if (isAssoc && Array.isArray(associationOrValue)) {
      associationOrValue = associationOrValue.filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}
