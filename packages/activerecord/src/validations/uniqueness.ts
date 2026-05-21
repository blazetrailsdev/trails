/**
 * Mirrors: ActiveRecord::Validations::UniquenessValidator
 *
 * Validates that the specified attribute value is unique in the database.
 * Builds a query against the model's table to check for existing records
 * with the same value, optionally scoped to other columns.
 */
import { EachValidator, ArgumentError } from "@blazetrails/activemodel";

/**
 * Shared scope option validation — called eagerly from validatesUniqueness (declaration time)
 * and from UniquenessValidator#constructor (instantiation time). Mirrors Rails'
 * ArgumentError raised in UniquenessValidator#initialize for non-symbol :scope values.
 * @internal
 */
function validateScopeOption(scope: unknown): void {
  if (scope == null) return;
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (!scopes.every((s) => typeof s === "string")) {
    let scopeRepr: string;
    try {
      scopeRepr = JSON.stringify(scope) ?? String(scope);
    } catch {
      scopeRepr = String(scope);
    }
    throw new ArgumentError(
      `${scopeRepr} is not a supported format for :scope option. ` +
        "Pass a string or an array of strings instead.",
    );
  }
}

/**
 * Register a deferred uniqueness validation to run on save (since uniqueness
 * requires a DB round-trip, it's kept off the synchronous validator chain).
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates_uniqueness_of
 */
export function validatesUniqueness(
  this: unknown,
  attribute: string,
  options: {
    scope?: string | string[];
    message?: string;
    conditions?: (this: any) => any;
    caseSensitive?: boolean;
  } = {},
): void {
  // Validate options eagerly to match Rails' ArgumentError at declaration time.
  validateScopeOption(options.scope);
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
    validateScopeOption(options.scope);
    if (
      Object.prototype.hasOwnProperty.call(options, "caseSensitive") &&
      typeof options.caseSensitive !== "boolean"
    ) {
      throw new Error(
        `${options.caseSensitive} is not a supported value for :caseSensitive option. ` +
          "Pass a boolean instead: `caseSensitive: false`",
      );
    }
    super(options);
    this._klass = options.class ?? null;
  }

  validateEach(record: any, attribute: string, value: unknown): void {
    if (value == null) return;

    const finderClass = findFinderClassFor(record, this._klass);
    const modelClass = (finderClass ?? record.constructor) as any;
    if (!modelClass.where) return;

    const mapped = mapEnumAttribute(modelClass, attribute, value);

    if (
      record.isPersisted?.() &&
      !isValidationNeeded(modelClass, record, attribute, this.options as Record<string, unknown>)
    ) {
      return;
    }

    const opts = this.options as any;

    let asyncValidations = (record as any)._asyncValidationPromises as
      | Promise<unknown>[]
      | undefined;
    if (!Array.isArray(asyncValidations)) {
      asyncValidations = [];
      (record as any)._asyncValidationPromises = asyncValidations;
    }

    const errorOpts: Record<string, unknown> = { value };
    if (opts?.message != null) errorOpts.message = opts.message;

    const validationPromise = (async () => {
      let [relation] = await buildRelation(
        modelClass,
        attribute,
        mapped,
        this.options as Record<string, unknown>,
      );

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

      relation = scopeRelation(record, relation, this.options as Record<string, unknown>);

      if (opts?.conditions && typeof opts.conditions === "function") {
        const conditioned =
          opts.conditions.length === 0
            ? opts.conditions.call(relation)
            : opts.conditions.call(relation, record);
        if (conditioned != null) relation = conditioned;
      }

      const exists = await relation.exists();
      if (exists) {
        record.errors.add(attribute, "taken", errorOpts);
      }
    })();
    asyncValidations.push(validationPromise);
  }
}

/**
 * Walks up the inheritance chain from `record.class` to the validator's
 * configured `:class` option, returning the first non-abstract class —
 * mirrors Rails' rule that the existence check must run from a concrete
 * (non-abstract) class.
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#find_finder_class_for
 *
 * @internal
 */
function findFinderClassFor(record: any, klassOption: any): any {
  // Rails walks from record.class up to @klass, tracking the most-recent
  // non-abstract class; STI uses this so the existence query targets the
  // class where the validation was declared (and its scope/table). When
  // @klass is unset in Trails, bound the walk at the AR/AM boundary
  // (parent class without `.where`) so we don't leak into ActiveModel.
  let current = record.constructor;
  let lastConcrete: any = null;
  while (current) {
    if (!current.abstractClass && typeof current.where === "function") {
      lastConcrete = current;
    }
    if (current === klassOption) break;
    const parent = Object.getPrototypeOf(current);
    if (!parent || parent === Function.prototype || parent === Object) break;
    if (typeof (parent as any).where !== "function") break;
    current = parent;
  }
  return lastConcrete ?? record.constructor;
}

/**
 * Returns true if uniqueness must consult the database. Rails additionally
 * short-circuits to `false` when the value/scope columns haven't changed
 * AND a unique index already covers them; in Trails that branch is
 * effectively disabled because `isCoveredByUniqueIndex` always returns
 * false (the schema-cache index lookup is async and can't safely run from
 * this synchronous path — see the helper's comment). The other gates
 * (conditions/caseSensitive option, dirty/null checks) match Rails.
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#validation_needed?
 *
 * @internal
 */
function isValidationNeeded(
  klass: any,
  record: any,
  attribute: string,
  options: Record<string, unknown>,
): boolean {
  if (options.conditions || Object.prototype.hasOwnProperty.call(options, "caseSensitive")) {
    return true;
  }
  const scope = Array.isArray(options.scope)
    ? (options.scope as string[])
    : options.scope
      ? [options.scope as string]
      : [];
  const attrs = resolveAttributes(record, [...scope, attribute]);
  const dirty = (record as any)._dirty;
  const anyChangedOrNull = attrs.some(
    (a) => dirty?.attributeChanged?.(a) || record.readAttribute?.(a) == null,
  );
  if (anyChangedOrNull) return true;
  return !isCoveredByUniqueIndex(klass, record, attribute, scope, options);
}

/**
 * Returns true when the configured attribute (plus scope columns) is
 * covered by a unique, non-partial index on the table — used to skip a
 * redundant SELECT before save when the DB already enforces uniqueness.
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#covered_by_unique_index?
 *
 * @internal
 */
function isCoveredByUniqueIndex(
  _klass: any,
  _record: any,
  _attribute: string,
  _scope: string[],
  _options: Record<string, unknown>,
): boolean {
  // Rails reads `klass.schema_cache.indexes(klass.table_name)` synchronously,
  // but Trails' SchemaCache#indexes is async (requires a pool + I/O). Calling
  // it from this synchronous validator path isn't safe. Conservatively return
  // false so uniqueness always performs the existence check — correct, just
  // skips the Rails optimization that drops a redundant SELECT when the DB
  // already enforces uniqueness via a unique index.
  return false;
}

/**
 * Expands association names to their underlying foreign-key (and
 * foreign-type for polymorphic) columns; non-association attributes pass
 * through. Mirrors Rails' resolve_attributes which lets uniqueness scope
 * by association (e.g. `scope: :user`).
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#resolve_attributes
 *
 * @internal
 */
function resolveAttributes(record: any, attributes: string[]): string[] {
  const out: string[] = [];
  for (const attr of attributes) {
    const ctor = record.constructor;
    const refl = ctor._reflectOnAssociation?.(String(attr));
    if (!refl) {
      out.push(String(attr));
      continue;
    }
    const fk = refl.foreignKey;
    if (Array.isArray(fk)) out.push(...fk);
    else if (fk != null) out.push(fk);
    const isPoly =
      typeof refl.isPolymorphic === "function" ? refl.isPolymorphic() : refl.polymorphic;
    if (isPoly && refl.foreignType) out.push(refl.foreignType);
  }
  return out.filter((x) => x != null);
}

/**
 * Builds the base existence-check relation: `klass.unscoped.where(attr = value)`,
 * with case-sensitivity honoring the `:case_sensitive` option (and the
 * adapter's default collation when unspecified).
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#build_relation
 *
 * @internal
 */
async function buildRelation(
  klass: any,
  attribute: string,
  value: unknown,
  options: Record<string, unknown>,
): Promise<[any]> {
  // Wrapped in a tuple because Relation is thenable — a bare `await` would
  // execute the query and resolve to the row array.
  const base = typeof klass.unscoped === "function" ? klass.unscoped() : klass.where({});
  const arel = klass.arelTable as { get?: (n: string) => any } | null;
  const pb = (base as { predicateBuilder?: { buildBindAttribute(c: string, v: unknown): unknown } })
    .predicateBuilder;
  const adapter = klass.adapter ?? klass.connection ?? null;
  const hasCsKey = Object.prototype.hasOwnProperty.call(options, "caseSensitive");

  // Rails routes the comparison through the adapter (defaultUniquenessComparison
  // / caseSensitiveComparison / caseInsensitiveComparison) so adapters with
  // CI collations / native ILIKE / case-insensitive types can pick the right
  // SQL form without wrapping the column in LOWER() and defeating indexes.
  if (arel && typeof arel.get === "function" && pb?.buildBindAttribute) {
    const attr = arel.get(attribute);
    const bind = pb.buildBindAttribute(attribute, value);
    let comparison: any = null;
    if (!hasCsKey || value == null) {
      comparison = adapter?.defaultUniquenessComparison?.(attr, bind) ?? null;
    } else if (options.caseSensitive) {
      comparison = adapter?.caseSensitiveComparison?.(attr, bind) ?? null;
    } else {
      // UUID columns are already canonical lowercase — skip LOWER() to match Rails,
      // which returns false from can_perform_case_insensitive_comparison_for? for uuid
      // (PG has no lower(uuid) function). Use plain equality instead.
      const typeObj =
        typeof klass.typeForAttribute === "function" ? klass.typeForAttribute(attribute) : null;
      const colType =
        typeObj == null
          ? null
          : typeof (typeObj as any).type === "function"
            ? (typeObj as any).type()
            : (typeObj as any).type;
      if (colType !== "uuid") {
        comparison = (await adapter?.caseInsensitiveComparison?.(attr, bind)) ?? null;
        if (comparison == null && typeof value === "string") {
          // No native CI form — fall back to LOWER() with a lowercased bind.
          // Keeps the bind parameterized so the prepared-statement cache
          // stays effective.
          const lowerBind = pb.buildBindAttribute(attribute, value.toLowerCase());
          comparison = attr.lower().eq(lowerBind);
        }
      }
    }
    if (comparison != null && typeof base.where === "function") {
      return [base.where(comparison)];
    }
  }
  return [base.where({ [attribute]: value })];
}

/**
 * Adds `WHERE scope = record.scope` clauses for each `:scope` option,
 * resolving association-name scopes to their underlying FK value.
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#scope_relation
 *
 * @internal
 */
function scopeRelation(record: any, relation: any, options: Record<string, unknown>): any {
  const scope = options.scope;
  if (scope == null) return relation;
  const scopes = Array.isArray(scope) ? (scope as string[]) : [scope as string];
  let r = relation;
  for (const item of scopes) {
    const ctor = record.constructor;
    const refl = ctor._reflectOnAssociation?.(item);
    if (refl) {
      // Read FK (and foreignType for polymorphic) directly off the record —
      // do NOT load the association (Rails routes through the proxy reader,
      // but in TS this can trigger lazy-load and strict-loading violations).
      const isPoly =
        typeof refl.isPolymorphic === "function" ? refl.isPolymorphic() : refl.polymorphic;
      const fks = Array.isArray(refl.foreignKey) ? refl.foreignKey : [refl.foreignKey];
      for (const fk of fks) {
        r = r.where({ [fk]: record.readAttribute?.(fk) });
      }
      if (isPoly && refl.foreignType) {
        r = r.where({ [refl.foreignType]: record.readAttribute?.(refl.foreignType) });
      }
    } else {
      r = r.where({ [item]: record.readAttribute?.(item) });
    }
  }
  return r;
}

/**
 * Translates a public enum value to its underlying column value before
 * comparison — Rails enums map symbol/string labels to integers (or
 * strings) in the DB, and uniqueness must compare on the stored value.
 *
 * Mirrors: ActiveRecord::Validations::UniquenessValidator#map_enum_attribute
 *
 * @internal
 */
function mapEnumAttribute(klass: any, attribute: string, value: unknown): unknown {
  const enums = klass?.definedEnums?.[String(attribute)];
  if (value != null && enums && Object.prototype.hasOwnProperty.call(enums, String(value))) {
    return (enums as Record<string, unknown>)[String(value)];
  }
  return value;
}
