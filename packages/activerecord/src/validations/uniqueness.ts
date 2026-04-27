/**
 * Mirrors: ActiveRecord::Validations::UniquenessValidator
 *
 * Validates that the specified attribute value is unique in the database.
 * Builds a query against the model's table to check for existing records
 * with the same value, optionally scoped to other columns.
 */
import { NotImplementedError } from "../errors.js";
import { EachValidator } from "@blazetrails/activemodel";

/**
 * Register a deferred uniqueness validation to run on save (since uniqueness
 * requires a DB round-trip, it's kept off the synchronous validator chain).
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates_uniqueness_of
 */
export function validatesUniqueness(
  this: unknown,
  attribute: string,
  options: { scope?: string | string[]; message?: string; conditions?: (this: any) => any } = {},
): void {
  const klass = this as { _asyncValidations?: Array<unknown> };
  if (!Object.prototype.hasOwnProperty.call(klass, "_asyncValidations")) {
    klass._asyncValidations = [...(klass._asyncValidations ?? [])];
  }
  (klass._asyncValidations as Array<unknown>).push({ attribute, options });
}

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
      if (Array.isArray(pk)) {
        const dbVals = pk.map((col: string) =>
          record._dirty?.attributeChanged(col)
            ? record._dirty.attributeWas(col)
            : record.readAttribute(col),
        );
        relation = relation.whereNot(pk, [dbVals]);
      } else {
        const dbVal = record._dirty?.attributeChanged(pk)
          ? record._dirty.attributeWas(pk)
          : record.readAttribute(pk);
        relation = relation.whereNot({ [pk]: [dbVal] });
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

function findFinderClassFor(record: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#find_finder_class_for is not implemented",
  );
}

function isValidationNeeded(klass: any, record: any, attribute: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#validation_needed? is not implemented",
  );
}

function isCoveredByUniqueIndex(klass: any, record: any, attribute: any, scope: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#covered_by_unique_index? is not implemented",
  );
}

function resolveAttributes(record: any, attributes: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#resolve_attributes is not implemented",
  );
}

function buildRelation(klass: any, attribute: any, value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#build_relation is not implemented",
  );
}

function scopeRelation(record: any, relation: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#scope_relation is not implemented",
  );
}

function mapEnumAttribute(klass: any, attribute: any, value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Validations::UniquenessValidator#map_enum_attribute is not implemented",
  );
}
