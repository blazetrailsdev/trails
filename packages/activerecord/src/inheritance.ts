/**
 * Inheritance — STI, abstract classes, and subclass tracking.
 *
 * Mirrors: ActiveRecord::Inheritance
 */

import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import { camelize, isPresent, underscore } from "@blazetrails/activesupport";
import { ArgumentError, runAfterCallbacksOnProto } from "@blazetrails/activemodel";

/**
 * Helper: cast inheritance column value through its attribute type.
 * Rails: type_for_attribute(inheritCol).cast(value)
 */
function castInheritanceColumnValue(
  modelClass: typeof Base,
  inheritCol: string,
  value: unknown,
): unknown {
  // Rails: type_for_attribute(inheritCol).cast(value) — handles non-string
  // inputs (numbers/booleans) by coercing through the column's type.
  // Falls back to Base._castAttributeValue (string-only) for compatibility.
  const attrType = modelClass.typeForAttribute(inheritCol) as {
    cast(value: unknown): unknown;
  } | null;
  const casted = attrType
    ? attrType.cast(value)
    : modelClass._castAttributeValue(inheritCol, value);
  if (casted == null) return casted;
  // Normalize to a primitive string (handles String wrapper objects) so
  // findStiClass downstream can match against modelRegistry keys.
  return typeof casted === "string" ? casted : String(casted);
}

/**
 * Resolve a type name string to a model class.
 * Used by STI to look up subclasses by their type column value.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#compute_type
 *
 * @internal
 */
export function computeType(baseClass: typeof Base, typeName: string): typeof Base {
  const klass = modelRegistry.get(typeName);
  if (!klass) {
    throw new NameError(`uninitialized constant ${typeName}`);
  }
  if (klass !== baseClass && !(klass.prototype instanceof baseClass)) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${typeName} is not a subclass of ${baseClass.name}`,
    );
  }
  return klass;
}

/**
 * Return direct subclasses of a model class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#subclasses
 */
export function subclasses(modelClass: typeof Base): (typeof Base)[] {
  return Object.prototype.hasOwnProperty.call(modelClass, "_subclasses")
    ? (modelClass as any)._subclasses
    : [];
}

/**
 * Return all descendant classes (recursive).
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#descendants
 */
export function descendants(modelClass: typeof Base): (typeof Base)[] {
  const result: (typeof Base)[] = [];
  for (const sub of subclasses(modelClass)) {
    result.push(sub);
    result.push(...descendants(sub));
  }
  return result;
}

/**
 * Check if a model descends directly from ActiveRecord::Base
 * (i.e. is not an STI subclass).
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#descends_from_active_record?
 */
export function isDescendsFromActiveRecord(modelClass: typeof Base): boolean {
  return !isStiSubclass(modelClass);
}

/**
 * Check if this class is its own STI base class (i.e. `base_class == self`).
 * Uses the cached `_computedBaseClass` from `setBaseClass`, computing it on
 * demand if not already set.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#base_class?
 */
export function isBaseClass(modelClass: typeof Base): boolean {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_computedBaseClass"))
    setBaseClass(modelClass);
  return (modelClass as any)._computedBaseClass === modelClass;
}

/**
 * Compute and cache the base class for this model using the Rails hierarchy
 * logic: a class is its own base if its immediate superclass is Base or is
 * abstract; otherwise it inherits the superclass's base class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#set_base_class
 * @internal
 */
export function setBaseClass(modelClass: typeof Base): void {
  // Rails: if self == Base → base_class = self.
  // Detected via the _isActiveRecordBase own-property sentinel on Base.
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) {
    (modelClass as any)._computedBaseClass = modelClass;
    return;
  }
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  if (!parent || parent === Function.prototype || typeof parent.name !== "string") {
    (modelClass as any)._computedBaseClass = modelClass;
    return;
  }
  // Rails: if superclass == Base || superclass.abstract_class? → self is root.
  // Use _isActiveRecordBase (existing sentinel) to identify the AR root class.
  const parentIsARBase = Object.prototype.hasOwnProperty.call(parent, "_isActiveRecordBase");
  const parentIsAbstract = getAbstractClass.call(parent);
  if (parentIsARBase || parentIsAbstract) {
    (modelClass as any)._computedBaseClass = modelClass;
  } else {
    // Ensure parent has its own computed entry before inheriting it.
    if (!Object.prototype.hasOwnProperty.call(parent, "_computedBaseClass")) setBaseClass(parent);
    (modelClass as any)._computedBaseClass = (parent as any)._computedBaseClass;
  }
}

/**
 * Return the STI name for this class (used as the type column value).
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#sti_name
 */
export function stiName(modelClass: typeof Base): string {
  return modelClass.name;
}

/**
 * Return the polymorphic name for this class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#polymorphic_name
 */
export function polymorphicName(modelClass: typeof Base): string {
  return modelClass.name;
}

/**
 * Register a class as a subclass of its parent.
 * Call this in a static initializer block on subclasses to enable
 * subclasses/descendants tracking.
 *
 * Mirrors the implicit subclass registration Rails does via Ruby's
 * inherited hook.
 */
export function registerSubclass(klass: typeof Base): void {
  const parent = Object.getPrototypeOf(klass) as typeof Base;
  if (!parent || parent === Function.prototype) return;
  if (!Object.prototype.hasOwnProperty.call(parent, "_subclasses")) {
    (parent as any)._subclasses = [];
  }
  (parent as any)._subclasses.push(klass);
}

/**
 * Single Table Inheritance support.
 *
 * When a model has an inheritance column (default: "type"), subclasses
 * share the parent's table and auto-set the type column.
 *
 * Mirrors: ActiveRecord::Inheritance
 */

/**
 * Configure STI on a base model class.
 * Call this on the parent class to enable STI.
 */
export function enableSti(modelClass: typeof Base, options: { column?: string } = {}): void {
  const column = options.column ?? "type";
  (modelClass as any)._inheritanceColumn = column;
}

/**
 * Get the inheritance column for a model.
 *
 * Mirrors Rails, where `inheritance_column` defaults to `"type"` for every
 * model (`class_attribute :inheritance_column, default: "type"`) regardless of
 * whether the model actually participates in STI. The column merely names where
 * STI *would* read/write the type; whether dispatch happens is gated separately
 * on `_has_attribute?(inheritance_column)` — see {@link classHasAttribute}.
 */
export function getInheritanceColumn(modelClass: typeof Base): string {
  return (modelClass as any)._inheritanceColumn ?? "type";
}

/**
 * Class-level column-aware `_has_attribute?`.
 *
 * Rails' `_has_attribute?(name)` is `attribute_types.key?(name)`, true for any
 * reflected DB column as well as any explicitly declared `attribute()`. trails
 * splits these — declared attributes live in `_attributeDefinitions`, real
 * columns in the lazily reflected schema — so this checks both. This is the
 * gate Rails uses to decide whether STI dispatch applies, so that defaulting
 * `inheritance_column` to `"type"` (above) does not make every model with a
 * stray `type` key behave as STI: only models that actually have the column
 * dispatch.
 *
 * @internal
 */
export function classHasAttribute(modelClass: typeof Base, name: string): boolean {
  if ((modelClass as any)._attributeDefinitions?.has(name)) return true;
  if (modelClass.abstractClass) return false;
  try {
    return (modelClass.columnNames() as string[]).includes(name);
  } catch {
    return false;
  }
}

/**
 * True when STI was explicitly enabled on this class or an ancestor (the
 * inherited `_inheritanceColumn` sentinel). Distinct from {@link getInheritanceColumn},
 * which now always resolves to a name (default "type"): the column merely names
 * where STI *would* read the type; this reports whether the model actually
 * participates in STI.
 *
 * Used to gate the database-row dispatch paths (instantiate, association build),
 * which resolve through the ambiguous global registry and so must stay scoped to
 * explicitly-modeled hierarchies. The `new`-from-attributes path resolves within
 * the class's own subtree and instead gates on the column-aware
 * {@link classHasAttribute} (Rails' `_has_attribute?`).
 *
 * @internal
 */
export function stiEnabled(modelClass: object): boolean {
  return (modelClass as any)._inheritanceColumn != null;
}

/**
 * Check if a model class is an STI subclass (not the base STI class).
 */
export function isStiSubclass(modelClass: object): boolean {
  // Walk up the prototype chain to find if any parent has _inheritanceColumn
  let current = Object.getPrototypeOf(modelClass);
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#base_class
 * @internal
 */
export function baseClass(this: typeof Base): typeof Base {
  if (!Object.prototype.hasOwnProperty.call(this, "_computedBaseClass")) setBaseClass(this);
  return (this as any)._computedBaseClass as typeof Base;
}

/**
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class
 * @internal
 */
export function getAbstractClass(this: typeof Base): boolean {
  return Object.prototype.hasOwnProperty.call(this, "_abstractClass")
    ? (this as any)._abstractClass
    : false;
}

/**
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class=
 * @internal
 */
export function setAbstractClass(this: typeof Base, value: boolean): void {
  (this as any)._abstractClass = value;
}

/**
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class,
 * abstract_class=, abstract_class?
 */
export function abstractClass(this: typeof Base, value?: boolean): boolean {
  if (value !== undefined) {
    setAbstractClass.call(this, value);
    return value;
  }
  return getAbstractClass.call(this);
}

/**
 * Get the STI base class for a model.
 */
export function getStiBase(modelClass: object): typeof Base {
  let current = modelClass as typeof Base;
  let base = current;
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) {
      base = current;
    }
    current = Object.getPrototypeOf(current) as typeof Base;
  }
  return base;
}

/**
 * Resolve a type name to a subclass of the given base class.
 * Throws SubclassNotFound if the type is invalid or not a subclass.
 *
 * Mirrors: ActiveRecord::Inheritance.find_sti_class
 *
 * @internal
 */
export function findStiClass(baseClass: typeof Base, typeName: string): typeof Base {
  const klass = modelRegistry.get(typeName);
  if (!klass) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${typeName} is not a subclass of ${baseClass.name}`,
    );
  }
  // Verify it's actually a subclass (or the base itself)
  if (klass !== baseClass && !(klass.prototype instanceof baseClass)) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${typeName} is not a subclass of ${baseClass.name}`,
    );
  }
  return klass;
}

/**
 * Narrow a freshly-hydrated record's attribute set to the columns actually
 * returned by the query, so `hasAttribute()` reflects a projected SELECT.
 *
 * Mirrors Rails' `attributes_builder`, which builds from
 * `_default_attributes.except(column_names - [primary_key])` (model_schema.rb):
 * only the primary key and virtual (non-column) attributes keep their
 * defaults — every other unselected column is left uninitialized. Applied in
 * both the direct and STI instantiation paths so projected loads narrow
 * regardless of STI, matching the net result of Rails'
 * `instantiate_instance_of`. (Rails narrows in `build_from_database` before
 * `discriminate_class_for_record`; trails resolves the STI subclass first in
 * `instantiateSti` and narrows here per concrete class — same end state.)
 *
 * `column_names` is the right narrowing set here: in trails every declared
 * attribute is a real DB column (an `attribute()` with no backing column fails
 * on INSERT), and the confirmation/acceptance validators don't register
 * attribute definitions — so unlike Rails there are no in-set virtual
 * attributes to wrongly uninitialize. On a full `SELECT *` every declared
 * column is in the row, so `narrowable` is empty and the hot path returns
 * early.
 *
 * @internal Rails-private helper.
 */
export function narrowToProjectedColumns(
  klass: typeof Base,
  record: Base,
  row: Record<string, unknown>,
): void {
  const pk = (klass as any).primaryKey as string | string[] | undefined;
  const pkSet = new Set(Array.isArray(pk) ? pk : pk != null ? [pk] : []);
  const rowKeys = new Set(Object.keys(row));
  const narrowable = (klass.columnNames() as string[]).filter(
    (c) => !pkSet.has(c) && !rowKeys.has(c),
  );
  // Hot path: a full SELECT projects every column, so there is nothing to
  // narrow — skip the attribute-set scan entirely.
  if (narrowable.length === 0) return;
  const attrs = (record as any)._attributes as {
    keys(): Iterable<string>;
    narrowTo(names: Iterable<string>): void;
  };
  const keep = new Set(rowKeys);
  const drop = new Set(narrowable);
  for (const name of attrs.keys()) {
    if (!drop.has(name)) keep.add(name);
  }
  attrs.narrowTo(keep);
}

/**
 * Directly instantiate a record without STI delegation (avoids recursion).
 */
function directInstantiate(klass: typeof Base, row: Record<string, unknown>): Base {
  (klass as any)._skipEncryption = true;
  const hadOwnSuppress = Object.prototype.hasOwnProperty.call(klass, "_suppressInitializeCallback");
  const prevSuppress = klass._suppressInitializeCallback;
  klass._suppressInitializeCallback = true;
  let record: Base;
  try {
    record = new klass(row);
  } finally {
    if (hadOwnSuppress) {
      klass._suppressInitializeCallback = prevSuppress;
    } else {
      delete (klass as any)._suppressInitializeCallback;
    }
    (klass as any)._skipEncryption = false;
  }
  narrowToProjectedColumns(klass, record, row);
  record._newRecord = false;
  (record as any)._dirty.snapshot(record._attributes);
  record.changesApplied();
  if ((klass as any)._strictLoadingByDefault) {
    (record as any)._strictLoading = true;
  }
  // Rails' init_with_attributes fires after_find then after_initialize
  runAfterCallbacksOnProto((klass as any).prototype, "find", record, { strict: "sync" });
  runAfterCallbacksOnProto((klass as any).prototype, "initialize", record, { strict: "sync" });
  return record;
}

/**
 * Instantiate the correct STI subclass from a database row.
 *
 * Mirrors Rails' single STI dispatch path: `instantiate` →
 * `discriminate_class_for_record` → `find_sti_class`. The class decision lives
 * entirely in {@link discriminateClassForRecord}; this wrapper only constructs
 * the resolved class.
 */
export function instantiateSti(baseClass: typeof Base, row: Record<string, unknown>): Base {
  return directInstantiate(discriminateClassForRecord(baseClass, row), row);
}

// ---------------------------------------------------------------------------
// Methods missing from api:compare — added for 100% parity
// ---------------------------------------------------------------------------

/**
 * Returns true if a WHERE clause is needed to scope queries by type when STI
 * is active.  Lazily memoized on the class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#finder_needs_type_condition?
 */
export function isFinderNeedsTypeCondition(modelClass: typeof Base): boolean {
  if (Object.prototype.hasOwnProperty.call(modelClass, "_finderNeedsTypeCondition")) {
    return (modelClass as any)._finderNeedsTypeCondition === true;
  }
  const result = !isDescendsFromActiveRecord(modelClass);
  (modelClass as any)._finderNeedsTypeCondition = result;
  return result;
}

let _applicationRecordClass: typeof Base | null = null;

/** Test-only: reset the primary abstract class singleton. */
export function __resetPrimaryAbstractClass(): void {
  _applicationRecordClass = null;
}

/** @internal */
export function getApplicationRecordClass(): typeof Base | null {
  return _applicationRecordClass;
}

/**
 * Returns true if this class is the designated application-record base class.
 * When a primary abstract class has been explicitly set via `primaryAbstractClass`,
 * this compares against that class. Otherwise it falls back to checking whether
 * the class is registered on `globalThis` as `"ApplicationRecord"`.
 *
 * @internal
 * Mirrors: ActiveRecord::Core::ClassMethods#application_record_class?
 */
export function applicationRecordClassQ(modelClass: typeof Base): boolean {
  if (_applicationRecordClass) {
    return modelClass === _applicationRecordClass;
  }
  return modelClass === (globalThis as Record<string, unknown>)["ApplicationRecord"];
}

/**
 * Declare this class as the top-level application record base class and mark
 * it abstract.  Only one class per application may be designated as the
 * primary abstract class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#primary_abstract_class
 */
export function primaryAbstractClass(modelClass: typeof Base): void {
  if (_applicationRecordClass && _applicationRecordClass !== modelClass) {
    throw new ArgumentError(
      `The \`primary_abstract_class\` is already set to ${_applicationRecordClass.name}. ` +
        "There can only be one `primary_abstract_class` in an application.",
    );
  }
  (modelClass as any).abstractClass = true;
  _applicationRecordClass = modelClass;
}

/**
 * Returns the class corresponding to the STI type name stored in the
 * inheritance column.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#sti_class_for
 */
export function stiClassFor(modelClass: typeof Base, typeName: string): typeof Base {
  try {
    return findStiClass(modelClass, typeName);
  } catch (cause) {
    throw new SubclassNotFound(
      `The single-table inheritance mechanism failed to locate the subclass: '${typeName}'. ` +
        `This error is raised because the column '${getInheritanceColumn(modelClass)}' is reserved for storing the class in case of inheritance.`,
      { cause },
    );
  }
}

/**
 * Returns the class corresponding to a polymorphic type column value.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#polymorphic_class_for
 */
export function polymorphicClassFor(_modelClass: typeof Base, name: string): typeof Base {
  // Mirrors Rails' polymorphic_class_for — resolves any registered class,
  // not limited to STI subclasses (polymorphic targets are unrelated models).
  const klass = modelRegistry.get(name);
  if (!klass) throw new NameError(`uninitialized constant ${name}`);
  return klass;
}

/**
 * Sets the inheritance column to the proper STI class name if needed.
 *
 * Mirrors: ActiveRecord::Inheritance#initialize_internals_callback. In Rails
 * this is wired into the initialization callback chain via `super`. In the
 * trails port it is called directly from Base's constructor in both branches,
 * after `init_internals` and before `after_initialize`.
 *
 * @internal Private method.
 */
export function initializeInternalsCallback(this: Base): void {
  ensureProperType.call(this);
}

/**
 * Sets the attribute used for single table inheritance to this class name
 * if this is not the Base descendant.
 *
 * Mirrors: ActiveRecord::Inheritance#ensure_proper_type
 * @internal Private method, ensures STI type column is set correctly.
 */
export function ensureProperType(this: Base): void {
  const klass = this.constructor as typeof Base;
  if (!isFinderNeedsTypeCondition(klass)) return;
  const inheritCol = getInheritanceColumn(klass);
  // Only write when the column is a declared attribute — otherwise the value
  // wouldn't persist or serialize correctly. Mirrors usingSingleTableInheritance.
  if (!(klass as any)._attributeDefinitions?.has(inheritCol)) return;
  (this as any)._writeAttribute(inheritCol, stiName(klass));
}

/**
 * Called by instantiate to decide which class to use for a new record instance.
 * For single-table inheritance, we check the record for a type column
 * and return the corresponding class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#discriminate_class_for_record
 * @internal Private method, used by persistence to route instantiate() through STI subclasses.
 */
export function discriminateClassForRecord(
  modelClass: typeof Base,
  record: Record<string, unknown>,
): typeof Base {
  if (usingSingleTableInheritance(modelClass, record)) {
    const inheritCol = getInheritanceColumn(modelClass);
    // Rails: subclass = base_class.type_for_attribute(inheritCol).cast(record[inheritCol])
    const castValue = castInheritanceColumnValue(modelClass, inheritCol, record[inheritCol]);
    // A present-but-unmapped enum value casts to null; Rails keeps such values
    // (EnumType#cast's `value.presence` fallback) so find_sti_class still
    // raises SubclassNotFound rather than masking it as the base class.
    const typeName = (castValue as string | null) ?? String(record[inheritCol]);
    return findStiClass(modelClass, typeName);
  }
  return modelClass;
}

/**
 * Check if a record has a non-empty inheritance column value and STI is enabled.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#using_single_table_inheritance?
 *
 * @internal
 */
function usingSingleTableInheritance(
  modelClass: typeof Base,
  record: Record<string, unknown>,
): boolean {
  // `inheritance_column` defaults to "type" for every model now, so the column's
  // presence no longer signals STI. The database-row dispatch path resolves
  // through the ambiguous global registry, so restrict it to explicitly-modeled
  // STI hierarchies — a plain model with a reflected `type` column stays itself.
  if (!stiEnabled(modelClass)) return false;
  const inheritCol = getInheritanceColumn(modelClass);
  // Rails: record[inheritance_column].present? && _has_attribute?(inheritance_column)
  if (!isPresent(record[inheritCol])) return false;
  return stiColumnIsAttribute(modelClass, inheritCol, record);
}

/**
 * Rails' class-level `_has_attribute?(name)` is `attribute_types.key?(name)`,
 * true for any real DB column as well as any explicitly declared `attribute()`.
 * trails splits these — declared attributes live in `_attributeDefinitions`,
 * real columns in the (lazily reflected) schema — and reflection is not always
 * warm by the time `instantiate` dispatches. A custom STI column like
 * `Parrot#parrot_sti_class` is a real column but not a declared `attribute()`,
 * and when the schema cache is cold `columnNames()` falls back to the declared
 * set and omits it — which silently hydrated those rows as the base class.
 *
 * Accept any of three signals that prove the column is a real model attribute:
 *   1. a declared `attribute()` definition;
 *   2. the column appearing as a key on the record being instantiated — every
 *      key in an `instantiate` row is a real DB column by construction, and that
 *      DB-row path is the only one that reaches STI dispatch;
 *   3. a reflected schema column, when the cache happens to be warm.
 *
 * @internal
 */
function stiColumnIsAttribute(
  modelClass: typeof Base,
  inheritCol: string,
  record: Record<string, unknown>,
): boolean {
  if (Object.prototype.hasOwnProperty.call(record, inheritCol)) return true;
  return classHasAttribute(modelClass, inheritCol);
}

/**
 * Build a WHERE condition that scopes queries to this class and its descendants' type values.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#type_condition
 * @internal Private method, used internally for STI type filtering in queries.
 */
export function typeCondition(modelClass: typeof Base, arelTable?: any): any {
  const inheritCol = getInheritanceColumn(modelClass);
  const table = arelTable || (modelClass as any).arelTable;
  if (!table) throw new ActiveRecordError("Cannot build type condition without arel table");

  const stiColumn = typeof table.get === "function" ? table.get(inheritCol) : table[inheritCol];
  const stiNames = ([modelClass] as (typeof Base)[])
    .concat(descendants(modelClass))
    .map((klass) => stiName(klass));

  // Use predicate builder to create an IN clause
  const predicateBuilder = (modelClass as any).predicateBuilder;
  if (predicateBuilder && predicateBuilder.build) {
    return predicateBuilder.build(stiColumn, stiNames);
  }

  // Fallback: manually build IN predicate
  return stiColumn.in(stiNames);
}

/**
 * Detect the subclass from the inheritance column of attrs.
 * If the inheritance column value is not self or a valid subclass,
 * raises ActiveRecord::SubclassNotFound.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#subclass_from_attributes
 * @internal Private method, used by Model.new() to dispatch to subclass constructors.
 */
export function subclassFromAttributes(
  modelClass: typeof Base,
  attrs: Record<string, unknown> | null | undefined,
): typeof Base | null {
  if (!attrs) return null;

  // Convert to plain object via toH (Ruby Hash) or toObject (TS hash-like)
  let attrsHash = attrs as Record<string, unknown>;
  if (typeof (attrs as any).toH === "function") {
    attrsHash = (attrs as any).toH();
  } else if (typeof (attrs as any).toObject === "function") {
    attrsHash = (attrs as any).toObject();
  }

  if (!attrsHash || typeof attrsHash !== "object") return null;

  const inheritCol = getInheritanceColumn(modelClass);
  // Rails gates STI dispatch on `_has_attribute?(inheritance_column)` — only
  // models that actually carry the column dispatch.
  if (!classHasAttribute(modelClass, inheritCol)) return null;

  const cast = castStiValueFromAttrs(modelClass, attrsHash, inheritCol);
  if (!cast.found) return null;
  return findStiClass(modelClass, cast.value as string);
}

/**
 * Read the inheritance-column value out of a plain attrs hash and cast it
 * through the column's type. Tries the column as-given plus its snake_case and
 * camelCase variants so attrs from form params or JS-style camelCase callers
 * both resolve, using `??` to preserve falsy-but-present values like 0 (Rails:
 * `0.present?` is true). Returns `{ found: false }` when the column is
 * absent/blank — the caller decides whether that means "no dispatch" — so a
 * present-but-uncastable value still surfaces (as `value: null`) to the
 * resolver rather than being silently swallowed. Shared by
 * {@link subclassFromAttributes} and {@link subclassFromAttributesForNew}.
 *
 * @internal
 */
function castStiValueFromAttrs(
  modelClass: typeof Base,
  attrsHash: Record<string, unknown>,
  inheritCol: string,
): { found: false } | { found: true; value: unknown } {
  const camelCol = camelize(inheritCol, false);
  const snakeCol = underscore(inheritCol);
  const subclassValue =
    attrsHash[inheritCol] ?? attrsHash[snakeCol] ?? attrsHash[camelCol] ?? undefined;
  if (!isPresent(subclassValue)) return { found: false };
  return { found: true, value: castInheritanceColumnValue(modelClass, inheritCol, subclassValue) };
}

/**
 * Registry-safe variant of {@link findStiClass} that resolves a type name only
 * within `baseClass`'s own subtree (the class itself plus its tracked
 * descendants), matching by `stiName`. Unlike `findStiClass` it never consults
 * the global `modelRegistry`, where a bare class name like `"Client"` is
 * ambiguous across test files that each define their own STI tree. Returns null
 * when no descendant matches rather than raising — the `new()` dispatch path
 * (the only caller) treats a non-match as "build the receiver as-is".
 *
 * @internal
 */
function findStiClassInHierarchy(baseClass: typeof Base, typeName: string): typeof Base | null {
  for (const klass of [baseClass, ...descendants(baseClass)]) {
    if (stiName(klass) === typeName) return klass;
  }
  return null;
}

/**
 * Resolve the subclass to construct for `new modelClass(attrs)`.
 *
 * Mirrors the dispatch in ActiveRecord::Inheritance::ClassMethods#new, which
 * tries three attribute sources in order — the explicit `attrs`, the
 * `current_scope`'s create attributes, then (for a base class) the table's
 * `column_defaults` — stopping at the first that names a subclass. We resolve
 * each through {@link findStiClassInHierarchy} (registry-safe) instead of
 * Rails' constant-lookup `find_sti_class`. `inheritance_column` now always
 * resolves to a name (default `"type"`), and the dispatch is gated on the
 * column-aware `_has_attribute?` ({@link classHasAttribute}). Returns null (no
 * dispatch) when no source names a subclass in this class's subtree.
 *
 * One intentional deviation from Rails: for a value present but naming no
 * in-hierarchy subclass, Rails' `find_sti_class` raises SubclassNotFound; the
 * registry-safe resolver returns null (build the receiver as-is) instead, since
 * the global lookup that would raise is exactly the ambiguous path we avoid.
 *
 * @internal Used by Base's constructor to dispatch `new` to a subclass.
 */
export function subclassFromAttributesForNew(
  modelClass: typeof Base,
  attrs: Record<string, unknown> | null | undefined,
): typeof Base | null {
  // Rails gates the whole `new` dispatch on `_has_attribute?(inheritance_column)`
  // so a stray `type` key on a non-STI model can never dispatch. `inheritance_column`
  // defaults to "type"; the column-aware `_has_attribute?` (declared attribute or
  // reflected DB column) is the primary guard. But trails' schema reflection is
  // not always warm at construction — a canonical STI base like `Company` declares
  // no `attribute("type")` and its `type` column only reflects once the schema
  // loads — so a tracked STI subtree stands in as the trails-reliable signal that
  // `findStiClassInHierarchy` could resolve. A plain model with neither can never
  // dispatch (it has no in-subtree match), so short-circuit the source probing —
  // including the non-memoized columnDefaults build — on the hot path.
  const col = getInheritanceColumn(modelClass);
  if (!classHasAttribute(modelClass, col) && descendants(modelClass).length === 0) return null;

  const resolve = (source: unknown): typeof Base | null => {
    if (!source || typeof source !== "object") return null;
    const cast = castStiValueFromAttrs(modelClass, source as Record<string, unknown>, col);
    if (!cast.found) return null;
    return findStiClassInHierarchy(modelClass, cast.value as string);
  };

  // Rails Inheritance::ClassMethods#new tries each source in turn, stopping at
  // the first that resolves a subclass.
  let subclass = resolve(attrs);
  if (!subclass) {
    const scopeAttrs = (
      modelClass.currentScope as { scopeForCreate?(): unknown } | null
    )?.scopeForCreate?.();
    subclass = resolve(scopeAttrs);
  }
  if (!subclass && isBaseClass(modelClass)) {
    subclass = resolve(modelClass.columnDefaults);
  }
  return subclass;
}
