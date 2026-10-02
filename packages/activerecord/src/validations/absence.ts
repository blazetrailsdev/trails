import { AbsenceValidator as BaseAbsenceValidator } from "@blazetrails/activemodel";
import { wrap } from "@blazetrails/activesupport";

export class AbsenceValidator extends BaseAbsenceValidator {
  validateEach(record: any, attribute: string, associationOrValue: unknown): void {
    if (record.constructor._reflectOnAssociation?.(attribute)) {
      associationOrValue = wrap(associationOrValue).filter(
        (v: any) => !(typeof v?.markedForDestruction === "function" && v.markedForDestruction()),
      );
    }
    super.validateEach(record, attribute, associationOrValue);
  }
}

interface HelperMethodHost {
  validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
}

export function validatesAbsenceOf(this: HelperMethodHost, ...attrNames: unknown[]): void {
  this.validatesWith(AbsenceValidator, this._mergeAttributes(attrNames));
}

export const ClassMethods = { validatesAbsenceOf };
