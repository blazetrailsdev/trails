import { AbsenceValidator as BaseAbsenceValidator } from "@blazetrails/activemodel";
import { wrap } from "@blazetrails/activesupport";

export class AbsenceValidator extends BaseAbsenceValidator {
  async validateEach(record: any, attribute: string, associationOrValue: unknown): Promise<void> {
    if (record.constructor._reflectOnAssociation?.(attribute)) {
      associationOrValue = wrap(associationOrValue).filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    await super.validateEach(record, attribute, associationOrValue);
  }
}

export function validatesAbsenceOf(
  this: {
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
}

export const ClassMethods = { validatesAbsenceOf };
