/**
 * Mirrors: ActiveRecord::Validations::UniquenessValidator
 *
 * Validates that the specified attribute value is unique in the database.
 * Builds a query against the model's table to check for existing records
 * with the same value, optionally scoped to other columns.
 */
import { EachValidator, ArgumentError } from "@blazetrails/activemodel";
import { isBlank } from "@blazetrails/activesupport";
import { UnknownPrimaryKey } from "../errors.js";

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
    // Context-guard keys honored by Base#_runAsyncValidations (it re-applies
    // the on:/if:/unless: intersection that the sync callback chain installs).
    on?: string | string[];
    if?: unknown;
    unless?: unknown;
    strict?: boolean;
  } = {},
): void {
  // Validate options eagerly to match Rails' ArgumentError at declaration time.
  validateScopeOption(options.scope);
  const klass = this as { _asyncValidations?: Array<unknown> };
  if (!Object.prototype.hasOwnProperty.call(klass, "_asyncValidations")) {
    klass._asyncValidations = [...(klass._asyncValidations ?? [])];
  }
  // Capture the declaring class so the deferred runner can reproduce Rails'
  // `find_finder_class_for` (the existence query must target the class the
  // validation was declared on — e.g. an abstract STI base — not the leaf
  // subclass of the record being validated).
  (klass._asyncValidations as Array<unknown>).push({ attribute, options, declaringClass: this });
}

/**
 * Register deferred uniqueness validations for one or more attributes,
 * delegating through `_mergeAttributes` so multiple / nested-array attr lists
 * (Rails' `*attr_names` arity) and the trailing options hash are normalized the
 * same way as the other `validates_*_of` helpers.
 *
 * Mirrors: ActiveRecord::Validations::ClassMethods#validates_uniqueness_of
 * (activerecord/lib/active_record/validations/uniqueness.rb:291-292).
 *
 * TRACKED DEVIATION (structural, behavior-preserving) — Rails registers a single
 * `validates_with UniquenessValidator, _merge_attributes(attr_names)`: one
 * validator instance owns the flattened `attributes` list, and
 * `EachValidator#validate` loops `attributes.each { |a| validate_each(record, a, value) }`
 * (activemodel/lib/active_model/validations/with.rb:88-104 →
 * each_validator.rb#validate). trails keeps uniqueness OFF the synchronous
 * validator chain in the `_asyncValidations` registry (the ratified sync-only
 * deviation documented on `isValid` in validations.ts), and that registry is
 * keyed by a single `attribute` per entry — `Base#_runAsyncValidations`
 * constructs one `UniquenessValidator` per entry and calls `validateEach` once,
 * never iterating a multi-attribute `attributes` array. So fanning the merged
 * names into one deferred entry each is the faithful equivalent: it produces the
 * same per-attribute `validateEach` calls (same count, same options, same
 * errors) as Rails' single-validator/`attributes.each` loop. Carrying them in
 * one entry would require teaching the deferred runner to loop `attributes`,
 * duplicating Rails' EachValidator loop in a different layer — out of scope here.
 */
export function validatesUniquenessOf(
  this: { _mergeAttributes(attrNames: unknown[]): Record<string, unknown> },
  ...attrNames: unknown[]
): void {
  const { attributes, ...options } = this._mergeAttributes(attrNames);
  for (const attribute of attributes as string[]) {
    validatesUniqueness.call(this, attribute, options);
  }
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
    // Mirror EachValidator#validate's allow_nil/allow_blank guard (the deferred
    // runner calls validateEach directly, bypassing EachValidator#validate).
    if (value === undefined) return;
    const o = this.options as { allowNil?: unknown; allowBlank?: unknown };
    if (value == null && o.allowNil === true) return;
    if (isBlank(value) && o.allowBlank === true) return;

    const finderClass = findFinderClassFor(record, this._klass);
    const modelClass = finderClass ?? record.constructor;
    if (!modelClass.where) return;

    const mapped = mapEnumAttribute(modelClass, attribute, value);

    if (
      record.isPersisted?.() &&
      !isValidationNeeded(modelClass, record, attribute, this.options)
    ) {
      return;
    }

    const opts = this.options as any;

    let asyncValidations = record._asyncValidationPromises as Promise<unknown>[] | undefined;
    if (!Array.isArray(asyncValidations)) {
      asyncValidations = [];
      record._asyncValidationPromises = asyncValidations;
    }

    const errorOpts: Record<string, unknown> = { value };
    if (opts?.message != null) errorOpts.message = opts.message;
    if (opts?.strict != null) errorOpts.strict = opts.strict;

    const validationPromise = (async () => {
      let [relation] = await buildRelation(modelClass, attribute, mapped, this.options);

      if (record.isPersisted?.()) {
        const pk = modelClass.primaryKey;
        // Rails raises UnknownPrimaryKey rather than excluding the record by id
        // when a persisted record's finder class has no primary key — there is
        // no way to exclude the row itself from the existence check.
        if (pk == null) {
          throw new UnknownPrimaryKey(
            modelClass,
            "Cannot validate uniqueness for persisted record without primary key.",
          );
        }
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

      relation = scopeRelation(record, relation, this.options);

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
    if (typeof parent.where !== "function") break;
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
  const dirty = record._dirty;
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

  // Resolve an attribute alias (`alias_attribute :new_content, :content`) to its
  // underlying column before building the comparison — Rails routes the bind
  // through the predicate builder, which resolves aliases.
  attribute = (klass._attributeAliases?.[attribute] as string) ?? attribute;

  // Resolve an association attribute (`validates :event`) to its foreign-key
  // column for the comparison. `value` already arrives as the FK scalar; if a
  // record is passed (Rails routes the association object through), read its
  // primary key. Mirrors build_relation's reflection branch.
  const refl = klass._reflectOnAssociation?.(attribute);
  if (refl) {
    const fk = Array.isArray(refl.foreignKey) ? refl.foreignKey[0] : refl.foreignKey;
    if (
      value != null &&
      typeof value === "object" &&
      typeof (value as any).readAttribute === "function"
    ) {
      const pk = refl.klass?.primaryKey ?? "id";
      value = (value as any).readAttribute(Array.isArray(pk) ? pk[0] : pk);
    }
    attribute = fk;
  }

  // A nil value must compare as `IS NULL`, not `= NULL` (which never matches).
  // `where({ col: null })` emits the IS NULL form; Rails routes nil through the
  // predicate builder for the same effect.
  if (value == null) {
    return [base.where({ [attribute]: null })];
  }

  const arel = klass.arelTable as { get?: (n: string) => any } | null;
  const pb = (base as { predicateBuilder?: { buildBindAttribute(c: string, v: unknown): unknown } })
    .predicateBuilder;
  const adapter = klass.connection ?? null;
  const hasCsKey = Object.prototype.hasOwnProperty.call(options, "caseSensitive");
  const typeObj =
    typeof klass.typeForAttribute === "function" ? klass.typeForAttribute(attribute) : null;

  // Serialized columns (`serialize :content`) store the coder-dumped form, so
  // the comparison must bind the serialized value — Rails produces it via the
  // attribute type during `bind_attribute` and still flows it through
  // `default_uniqueness_comparison`. The decorated (coder-wrapping) type lives
  // on `attributeTypes()` (the base.ts `typeForAttribute` override returns the
  // undecorated cast type), and on an STI subclass it is inherited via the
  // replayed pending decorators. We serialize the value here and fall through to
  // the comparison path below (rather than short-circuiting), so a serialized
  // column with `case_sensitive:` still picks the right SQL comparison.
  const decorated = klass.attributeTypes?.()?.[attribute] as
    | { coder?: unknown; serialize?: (v: unknown) => unknown }
    | undefined;
  if (decorated?.coder && typeof decorated.serialize === "function") {
    value = decorated.serialize(value);
  }

  // When the attribute supports unencrypted data alongside encrypted values, the
  // patched Relation#where (ExtendedDeterministicQueries) must receive a hash-style
  // arg so processArguments can expand the IN list to include the plain-text variant.
  // The Arel node path below bypasses processArguments entirely and would miss rows
  // stored without encryption.
  if (typeObj?.supportUnencryptedData) {
    return [base.where({ [attribute]: value })];
  }

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
      comparison = (await adapter?.caseSensitiveComparison?.(attr, bind)) ?? null;
    } else {
      // UUID columns are already canonical lowercase — skip LOWER() to match Rails,
      // which returns false from can_perform_case_insensitive_comparison_for? for uuid
      // (PG has no lower(uuid) function). Use plain equality instead.
      const colType =
        typeObj == null ? null : typeof typeObj.type === "function" ? typeObj.type() : typeObj.type;
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
  for (const rawItem of scopes) {
    const ctor = record.constructor;
    // Resolve an alias scope (`scope: :new_parent_id`) to the real column.
    const item = (ctor._attributeAliases?.[rawItem] as string) ?? rawItem;
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
