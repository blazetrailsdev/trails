/**
 * Inheritance — STI, abstract classes, and subclass tracking.
 *
 * Mirrors: ActiveRecord::Inheritance
 */

import type { Base } from "./base.js";
import { modelRegistry } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import { Nodes } from "@blazetrails/arel";
import { camelize, isPresent, underscore } from "@blazetrails/activesupport";

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
 * Get the inheritance column for a model, if STI is enabled.
 */
export function getInheritanceColumn(modelClass: typeof Base): string | null {
  return (modelClass as any)._inheritanceColumn ?? null;
}

/**
 * Check if a model class is an STI subclass (not the base STI class).
 */
export function isStiSubclass(modelClass: typeof Base): boolean {
  // Walk up the prototype chain to find if any parent has _inheritanceColumn
  let current = Object.getPrototypeOf(modelClass);
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Get the STI base class for a model.
 */
export function getStiBase(modelClass: typeof Base): typeof Base {
  let current = modelClass;
  let base = modelClass;
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
  record._newRecord = false;
  (record as any)._dirty.snapshot(record._attributes);
  record.changesApplied();
  if ((klass as any)._strictLoadingByDefault) {
    (record as any)._strictLoading = true;
  }
  // Rails' init_with_attributes fires after_find then after_initialize
  (klass as any)._callbackChain?.runAfter?.("find", record, { strict: "sync" });
  (klass as any)._callbackChain?.runAfter?.("initialize", record, { strict: "sync" });
  return record;
}

/**
 * Instantiate the correct STI subclass from a database row.
 */
export function instantiateSti(baseClass: typeof Base, row: Record<string, unknown>): Base {
  const column = getInheritanceColumn(baseClass);
  if (!column) return directInstantiate(baseClass, row);

  const typeName = row[column] as string | null | undefined;
  if (!typeName || !typeName.trim()) return directInstantiate(baseClass, row);

  const subclass = findStiClass(baseClass, typeName);
  return directInstantiate(subclass, row);
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

/**
 * Declare this class as the top-level application record base class and mark
 * it abstract.  Only one class per application may be designated as the
 * primary abstract class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#primary_abstract_class
 */
export function primaryAbstractClass(modelClass: typeof Base): void {
  if (_applicationRecordClass && _applicationRecordClass !== modelClass) {
    throw new Error(
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
        `This error is raised because the column '${getInheritanceColumn(modelClass) ?? "type"}' is reserved for storing the class in case of inheritance.`,
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
 * this is wired into the initialization callback chain via `super`. The
 * trails port currently exposes it as a parity helper; integrating it into
 * Base's init flow is a follow-up.
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
  if (!inheritCol) return;
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
    if (inheritCol) {
      // Rails: subclass = base_class.type_for_attribute(inheritCol).cast(record[inheritCol])
      const castValue = castInheritanceColumnValue(modelClass, inheritCol, record[inheritCol]);
      return findStiClass(modelClass, castValue as string);
    }
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
  const inheritCol = getInheritanceColumn(modelClass);
  if (!inheritCol) return false;
  // Rails: record[inheritance_column].present? && has_attribute?(inheritance_column)
  if (!isPresent(record[inheritCol])) return false;
  // Check that the inheritance column is a declared attribute on this model
  return (modelClass as any)._attributeDefinitions?.has(inheritCol) ?? false;
}

/**
 * Build a WHERE condition that scopes queries to this class and its descendants' type values.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#type_condition
 * @internal Private method, used internally for STI type filtering in queries.
 */
export function typeCondition(modelClass: typeof Base, arelTable?: any): any {
  const inheritCol = getInheritanceColumn(modelClass);
  if (!inheritCol) {
    // If no inheritance column, return a truthy predicate that matches everything
    return new Nodes.True();
  }

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
  if (!inheritCol) return null;

  // Try the column as-given, plus snake_case and camelCase variants so attrs
  // from form params or JS-style camelCase callers both resolve. Use ?? to
  // preserve falsy-but-present values like 0 (Rails: 0.present? is true).
  const camelCol = camelize(inheritCol, false);
  const snakeCol = underscore(inheritCol);
  const subclassValue =
    attrsHash[inheritCol] ?? attrsHash[snakeCol] ?? attrsHash[camelCol] ?? undefined;

  if (isPresent(subclassValue)) {
    // Rails: cast the value through the inheritance column's type
    const castValue = castInheritanceColumnValue(modelClass, inheritCol, subclassValue);
    return findStiClass(modelClass, castValue as string);
  }

  return null;
}
