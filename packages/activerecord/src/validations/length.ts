import { LengthValidator as BaseLengthValidator } from "@blazetrails/activemodel";

export class LengthValidator extends BaseLengthValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    let associationOrValue = value;
    const isAssoc = record.constructor._reflectOnAssociation?.(attribute);
    if (isAssoc && Array.isArray(value)) {
      associationOrValue = value.filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}
