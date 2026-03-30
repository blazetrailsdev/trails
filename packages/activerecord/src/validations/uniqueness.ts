/**
 * Mirrors: ActiveRecord::Validations::UniquenessValidator
 *
 * Validates that the specified attribute value is unique in the database.
 * Builds a query against the model's table to check for existing records
 * with the same value, optionally scoped to other columns.
 *
 * Note: this class exists for API parity. The primary uniqueness
 * validation path is Base.validatesUniqueness() which registers async
 * validators at the class level. Using this validator directly via
 * validatesWith may not integrate with the async validation lifecycle.
 *
 * Options:
 *   scope      - Additional columns to scope the uniqueness check
 *   conditions - A callable that adds additional conditions to the query
 *   message    - Custom error message
 */
import { EachValidator } from "@blazetrails/activemodel";

export class UniquenessValidator extends EachValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    if (value == null) return;

    const modelClass = record.constructor as any;
    if (!modelClass.where) return;

    let relation = modelClass.where({ [attribute]: value });

    if (record.isPersisted?.()) {
      const pk = modelClass.primaryKey ?? "id";
      if (!Array.isArray(pk)) {
        relation = relation.whereNot({ [pk]: record.readAttribute(pk) });
      }
    }

    const opts = this.options as any;
    if (opts?.scope) {
      const scopes = Array.isArray(opts.scope) ? opts.scope : [opts.scope];
      for (const scopeAttr of scopes) {
        relation = relation.where({ [scopeAttr]: record.readAttribute(scopeAttr) });
      }
    }

    if (opts?.conditions && typeof opts.conditions === "function") {
      const conditioned = opts.conditions.call(relation, relation);
      if (conditioned) relation = conditioned;
    }

    let asyncValidations = (record as any)._asyncValidations as Promise<unknown>[] | undefined;
    if (!Array.isArray(asyncValidations)) {
      asyncValidations = [];
      (record as any)._asyncValidations = asyncValidations;
    }

    const errorOpts: Record<string, unknown> = { value };
    if (opts?.message != null) errorOpts.message = opts.message;

    const validationPromise = relation.exists().then((exists: boolean) => {
      if (exists) {
        record.errors.add(attribute, "taken", errorOpts);
      }
    });
    asyncValidations.push(validationPromise);
  }
}
