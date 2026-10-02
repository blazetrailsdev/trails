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

export function validatesLengthOf(
  this: {
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
}

export function validatesSizeOf(
  this: {
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
}

export const ClassMethods = { validatesLengthOf, validatesSizeOf };
