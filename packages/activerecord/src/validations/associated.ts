import { EachValidator } from "@blazetrails/activemodel";
import { any, kernelArray } from "@blazetrails/activesupport";
import { aryReject as reject, merge } from "@blazetrails/ruby-compat";

export function validatesAssociated(
  this: {
    validatesWith(vc: unknown, opts: Record<string, unknown>): void;
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(AssociatedValidator, this._mergeAttributes(attrNames));
}

export class AssociatedValidator extends EachValidator {
  async validateEach(record: any, attribute: string, value: unknown): Promise<void> {
    const context = recordValidationContextForAssociation(record);

    if (
      any(await reject(kernelArray(value), (association) => isValidObject(association, context)))
    ) {
      record.errors.add(attribute, ":invalid", merge(this.options, { value }));
    }
  }
}

/** @internal */
async function isValidObject(record: any, context: string | undefined): Promise<boolean> {
  if (typeof record?.markedForDestruction === "function" && record.markedForDestruction()) {
    return true;
  }
  if (typeof record?.isValid !== "function") return true;
  return context != null ? record.isValid(context) : record.isValid();
}

/** @internal */
function recordValidationContextForAssociation(record: any): string | undefined {
  if (typeof record.customValidationContext === "function" && record.customValidationContext()) {
    return record._validationContext;
  }
  return undefined;
}

export const ClassMethods = { validatesAssociated };
