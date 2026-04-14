/**
 * Mirrors: ActiveRecord::Validations::UniquenessValidator
 *
 * Validates that the specified attribute value is unique in the database.
 * Builds a query against the model's table to check for existing records
 * with the same value, optionally scoped to other columns.
 */
import { EachValidator } from "@blazetrails/activemodel";

export class UniquenessValidator extends EachValidator {
  private _klass: any;

  /**
   * Mirrors: ActiveRecord::Validations::UniquenessValidator#initialize
   *
   * Validates options: :conditions must be callable, :scope must be
   * strings. Extracts :class option for finder resolution.
   */
  constructor(options: Record<string, unknown> = {}) {
    if (options.conditions != null && typeof options.conditions !== "function") {
      throw new Error(
        `${options.conditions} was passed as :conditions but is not callable. ` +
          "Pass a callable instead: `conditions: () => where({ approved: true })`",
      );
    }
    const scope = options.scope;
    if (scope != null) {
      const scopes = Array.isArray(scope) ? scope : [scope];
      if (!scopes.every((s) => typeof s === "string")) {
        throw new Error(
          `${scope} is not a supported format for :scope option. ` +
            "Pass a string or an array of strings instead: `scope: 'userId'`",
        );
      }
    }
    super(options);
    this._klass = options.class ?? null;
  }

  validateEach(record: any, attribute: string, value: unknown): void {
    if (value == null) return;

    const modelClass = (this._klass ?? record.constructor) as any;
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
      const conditioned =
        opts.conditions.length === 0
          ? opts.conditions.call(relation)
          : opts.conditions.call(relation, record);
      if (conditioned != null) relation = conditioned;
    }

    let asyncValidations = (record as any)._asyncValidationPromises as
      | Promise<unknown>[]
      | undefined;
    if (!Array.isArray(asyncValidations)) {
      asyncValidations = [];
      (record as any)._asyncValidationPromises = asyncValidations;
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
