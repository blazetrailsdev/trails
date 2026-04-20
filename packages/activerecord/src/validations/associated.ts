/**
 * Mirrors: ActiveRecord::Validations::AssociatedValidator
 *
 * Validates that all associated objects are valid. Works with
 * any kind of association (has_many, has_one, belongs_to).
 *
 *   class Book extends Base {
 *     static { this.hasMany("pages"); this.validatesAssociated("pages"); }
 *   }
 */
import { EachValidator } from "@blazetrails/activemodel";

/**
 * Registers AssociatedValidator(s) for the named associations.
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates_associated
 */
export function validatesAssociated(
  this: { validatesWith(vc: unknown, opts: Record<string, unknown>): void },
  ...args: (string | Record<string, unknown>)[]
): void {
  const last = args[args.length - 1];
  const opts =
    typeof last === "object" && last !== null ? (args.pop() as Record<string, unknown>) : {};
  for (const name of args as string[]) {
    this.validatesWith(AssociatedValidator, { ...opts, attributes: [name] });
  }
}

export class AssociatedValidator extends EachValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    const context = this._recordValidationContextForAssociation(record);
    const values = Array.isArray(value) ? value : value != null ? [value] : [];

    if (values.some((assoc: any) => !this._validObject(assoc, context))) {
      const { attributes: _, ...errorOpts } = this.options as Record<string, unknown>;
      record.errors.add(attribute, "invalid", { ...errorOpts, value });
    }
  }

  private _validObject(record: any, context: string | undefined): boolean {
    if (typeof record?.markedForDestruction === "function" && record.markedForDestruction()) {
      return true;
    }
    if (typeof record?.isValid !== "function") return true;
    return context != null ? record.isValid(context) : record.isValid();
  }

  private _recordValidationContextForAssociation(record: any): string | undefined {
    if (typeof record.customValidationContext === "function" && record.customValidationContext()) {
      return record._validationContext;
    }
    return undefined;
  }
}
