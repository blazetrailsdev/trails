import { EachValidator } from "@blazetrails/activemodel";
import { any, kernelArray, merge } from "@blazetrails/activesupport";

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
  /** @missingRailsCall reject — CONVERGEABLE associated-validator-rejects-through-an-awaiting-reject */
  async validateEach(record: any, attribute: string, value: unknown): Promise<void> {
    const context = recordValidationContextForAssociation(record);
    const rejected: unknown[] = [];
    for (const association of kernelArray(value)) {
      if (!(await isValidObject(association, context))) rejected.push(association);
    }

    if (any(rejected)) {
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
