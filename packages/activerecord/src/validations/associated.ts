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
import { kernelArray } from "@blazetrails/activesupport";

/**
 * Registers an AssociatedValidator for the named associations, delegating
 * through `_mergeAttributes` so multiple / nested-array attr lists (Rails'
 * `*attr_names` arity) and the trailing options hash are normalized the same
 * way as the other `validates_*_of` helpers.
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates_associated
 * (activerecord/lib/active_record/validations/associated.rb:60-62).
 */
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
    const values = kernelArray(value);

    // Rails `Array(value).reject { |r| valid_object?(r, context) }.any?`
    // (associated.rb:9) runs sequentially: `valid?` clears errors and swaps
    // the validation context around each run, so concurrent validation would
    // race on a repeated/shared associated record and reorder callbacks.
    // `valid_object?` is async in trails (RFC 0063), and neither `reject` nor
    // `any?` has an async-predicate spelling in JS, so the `reject`/`any?`
    // pair is an ordered loop over the same predicate.
    let anyInvalid = false;
    for (const association of values) {
      if (!(await isValidObject(association, context))) anyInvalid = true;
    }
    if (anyInvalid) {
      // `options.merge(value: value)` (associated.rb:10) — a non-mutating Hash
      // merge is an object spread in TS.
      record.errors.add(attribute, ":invalid", { ...this.options, value });
    }
  }
}

/**
 * Returns true if the associated `record` is valid (or has been marked for
 * destruction). Mirrors Rails' marked_for_destruction? + valid? short-circuit.
 *
 * Mirrors: ActiveRecord::Validations::AssociatedValidator#valid_object?
 *
 * @internal
 */
async function isValidObject(record: any, context: string | undefined): Promise<boolean> {
  if (typeof record?.markedForDestruction === "function" && record.markedForDestruction()) {
    return true;
  }
  if (typeof record?.isValid !== "function") return true;
  return context != null ? record.isValid(context) : record.isValid();
}

/**
 * Returns the record's validation context if it is a custom (non
 * create/update) one, else undefined — Rails forwards a custom context to
 * cascading association validations only.
 *
 * Mirrors: ActiveRecord::Validations::AssociatedValidator#record_validation_context_for_association
 *
 * @internal
 */
function recordValidationContextForAssociation(record: any): string | undefined {
  if (typeof record.customValidationContext === "function" && record.customValidationContext()) {
    return record._validationContext;
  }
  return undefined;
}
