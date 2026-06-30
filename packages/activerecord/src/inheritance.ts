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
import { applicationRecordClass, setApplicationRecordClass } from "./ar-config.js";

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
  // Rails' compute_type resolves any constant reachable through the model's
  // module nesting and imposes NO subclass relationship — a sibling in the same
  // namespace (e.g. Business::Client.compute_type("Firm")) resolves fine. The STI
  // subclass constraint lives in find_sti_class ({@link stiClassFor}), not here.
  return resolveComputedType(baseClass, typeName);
}

/**
 * Build the ordered constant-name candidates `compute_type` tries, mirroring
 * Rails' `name.scan(/::|$/) { candidates.unshift "#{$`}::#{type_name}" }` — the
 * model's own qualified name plus each enclosing namespace prefix, innermost
 * (most specific) first, then the bare `type_name`. So a `Firm` nested in
 * `MyApp::Business` resolving `"Account"` tries `MyApp::Business::Firm::Account`,
 * `MyApp::Business::Account`, `MyApp::Account`, then `Account`.
 *
 * @internal
 */
function computeTypeCandidates(baseClass: typeof Base, typeName: string): string[] {
  const segs = qualifiedName(baseClass).split("::");
  const candidates: string[] = [];
  for (let i = segs.length; i > 0; i--) {
    candidates.push(`${segs.slice(0, i).join("::")}::${typeName}`);
  }
  candidates.push(typeName);
  return candidates;
}

/**
 * Ruby-style namespace-relative constant resolution, mirroring
 * ActiveRecord::Inheritance::ClassMethods#compute_type. Walks the model's module
 * nesting (see {@link computeTypeCandidates}) and returns the first candidate that
 * resolves to a registered class whose own qualified name equals the candidate —
 * Rails' `candidate == constant.to_s` guard, which rejects an outer-scope constant
 * leaking through (so a demodulized type stored under a namespaced model resolves
 * via the namespace prefix even when the bare name is unregistered). A leading
 * `::` is an absolute reference resolved directly. Throws NameError when nothing
 * resolves. Does NOT enforce a subclass relationship — that is {@link stiClassFor}'s
 * (Rails' find_sti_class's) job, leaving this usable for polymorphic and sibling
 * targets.
 *
 * @internal
 */
function resolveComputedType(baseClass: typeof Base, typeName: string): typeof Base {
  if (typeName.startsWith("::")) {
    const absolute = typeName.slice(2);
    const klass = modelRegistry.get(absolute);
    if (!klass) throw new NameError(`uninitialized constant ${absolute}`);
    return klass;
  }
  const candidates = computeTypeCandidates(baseClass, typeName);
  for (const candidate of candidates) {
    const klass = modelRegistry.get(candidate);
    if (klass && qualifiedName(klass) === candidate) return klass;
  }
  throw new NameError(`uninitialized constant ${candidates[0]}`);
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
 * Hierarchical half of Rails' `descends_from_active_record?`: the `self == Base`
 * / abstract-superclass recursion / `superclass == Base` structure, with the
 * inheritance-column-presence test left to the caller. Splitting it out lets
 * {@link isFinderNeedsTypeCondition} memoize the stable structural answer without
 * caching a transient cold-schema column miss.
 *
 * Independent of the explicit `enableSti` sentinel that {@link isStiSubclass}
 * keys off — that sentinel still gates the registry-resolved row-dispatch paths.
 *
 * @internal
 */
function descendsFromActiveRecordByHierarchy(modelClass: typeof Base): boolean {
  // Rails: `self == Base` → false.
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) return false;
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  if (!parent || parent === Function.prototype || typeof parent.name !== "string") return true;
  // Rails: `elsif superclass.abstract_class?` → recurse through the abstract chain.
  if (getAbstractClass.call(parent)) return descendsFromActiveRecordByHierarchy(parent);
  // Rails else branch begins with `superclass == Base`.
  return Object.prototype.hasOwnProperty.call(parent, "_isActiveRecordBase");
}

/**
 * Check if a model descends directly from ActiveRecord::Base — i.e. it is a
 * hierarchy root rather than a concrete STI subclass.
 *
 * Mirrors Rails' else branch `superclass == Base || !columns_hash.include?(inheritance_column)`:
 * a non-root class still "descends" (is not an STI subclass) when it doesn't
 * actually carry the inheritance column, or STI is disabled. trails uses the
 * column-aware {@link classHasAttribute} (declared attribute or reflected column)
 * in place of Rails' `columns_hash.include?`, since schema reflection is lazy.
 * Decoupled from the explicit `enableSti` sentinel ({@link isStiSubclass}), which
 * still gates the registry-resolved row-dispatch paths.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#descends_from_active_record?
 */
export function isDescendsFromActiveRecord(modelClass: typeof Base): boolean {
  if (descendsFromActiveRecordByHierarchy(modelClass)) return true;
  return (
    inheritanceColumnDisabled(modelClass) ||
    !classHasAttribute(modelClass, getInheritanceColumn(modelClass))
  );
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
 * The fully-qualified Rails constant name for `modelClass`. JS class names
 * carry no module path, so a namespaced model declares its `::`-joined Ruby
 * module path via `static moduleName` (`"ClothingItem"`, `"Admin"`). Because
 * trails flattens namespaced classes to collision-free JS names (Rails'
 * `Admin::User` is `class AdminUser`, since a bare `User` already exists), the
 * bare component is the model's `_demodulizedName` (`"User"`) when present,
 * falling back to the JS `name`. Rails' `self.name` for such a model is
 * `"ClothingItem::Used"` — the value STI/polymorphic `type` columns store.
 */
export function qualifiedName(modelClass: typeof Base): string {
  const klass = modelClass as typeof Base & { moduleName?: string; _demodulizedName?: string };
  if (!klass.moduleName) return modelClass.name;
  return `${klass.moduleName}::${klass._demodulizedName ?? modelClass.name}`;
}

/**
 * The namespace segments for `modelClass` — `moduleName.split("::")` or `[]`.
 */
export function namespaceSegments(modelClass: typeof Base): string[] {
  const moduleName = (modelClass as typeof Base & { moduleName?: string }).moduleName;
  return moduleName ? moduleName.split("::") : [];
}

/**
 * The chain of enclosing Ruby module-parent qualified names, innermost first.
 * `"MyApplication::Business::Prefixed"` →
 * `["MyApplication::Business::Prefixed", "MyApplication::Business", "MyApplication"]`.
 * Mirrors Ruby's `Module#module_parents` (sans `Object`).
 */
export function moduleParentChain(moduleName: string | undefined): string[] {
  if (!moduleName) return [];
  const segs = moduleName.split("::");
  const chain: string[] = [];
  for (let i = segs.length; i > 0; i--) {
    chain.push(segs.slice(0, i).join("::"));
  }
  return chain;
}

// Module-level table_name_prefix / table_name_suffix declarations, keyed by the
// module's `::`-joined qualified name. Ruby declares these as `def
// self.table_name_prefix` on a wrapping module; trails has no module objects, so
// namespaced models register their wrapping module's prefix/suffix here.
const moduleTableNamePrefixes = new Map<string, string>();
const moduleTableNameSuffixes = new Map<string, string>();

/** Register a module-level `table_name_prefix` (Ruby `def self.table_name_prefix`). */
export function registerModuleTableNamePrefix(moduleName: string, prefix: string): void {
  moduleTableNamePrefixes.set(moduleName, prefix);
}

/** Register a module-level `table_name_suffix` (Ruby `def self.table_name_suffix`). */
export function registerModuleTableNameSuffix(moduleName: string, suffix: string): void {
  moduleTableNameSuffixes.set(moduleName, suffix);
}

/**
 * Walk `module_parents` innermost-out and return the first parent's
 * decoration, or `undefined` when the walk reaches the top without a hit (the
 * caller then falls back to `self.table_name_prefix`/`_suffix`). Mirrors the
 * `module_parents.detect { |p| p.respond_to?(:table_name_prefix) }` walk in
 * `ActiveRecord::ModelSchema::ClassMethods#full_table_name_{prefix,suffix}`
 * (model_schema.rb:301-307).
 *
 * Two kinds of parent "respond to" the decorator and thus stop the walk:
 * a module that registered one (`registered`), or an *AR-model-class* parent —
 * every class responds via `Base`, returning its own (usually-global) value.
 * The class case is why an outer `Prefixed`-style module does NOT bleed through
 * a nearer AR-model parent: the class short-circuits the detect first.
 */
function lookupModuleDecoration(
  moduleName: string | undefined,
  registered: Map<string, string>,
  classDecoration: (model: typeof Base) => string,
): string | undefined {
  for (const parent of moduleParentChain(moduleName)) {
    const fromModule = registered.get(parent);
    if (fromModule !== undefined) return fromModule;
    const model = modelRegistry.get(parent);
    if (model) return classDecoration(model);
  }
  return undefined;
}

export function lookupModuleTableNamePrefix(moduleName: string | undefined): string | undefined {
  return lookupModuleDecoration(
    moduleName,
    moduleTableNamePrefixes,
    (model) => (model as typeof Base & { _tableNamePrefix?: string })._tableNamePrefix ?? "",
  );
}

export function lookupModuleTableNameSuffix(moduleName: string | undefined): string | undefined {
  return lookupModuleDecoration(
    moduleName,
    moduleTableNameSuffixes,
    (model) => (model as typeof Base & { _tableNameSuffix?: string })._tableNameSuffix ?? "",
  );
}

/**
 * Return the STI name for this class (used as the type column value).
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#sti_name
 */
export function stiName(modelClass: typeof Base): string {
  const name = qualifiedName(modelClass);
  const klass = modelClass as typeof Base & {
    storeFullStiClass?: boolean;
    storeFullClassName?: boolean;
  };
  return klass.storeFullStiClass && klass.storeFullClassName ? name : demodulize(name);
}

/**
 * Return the polymorphic name for this class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#polymorphic_name
 */
export function polymorphicName(modelClass: typeof Base): string {
  const base = baseClass.call(modelClass);
  const name = qualifiedName(base);
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  return klass.storeFullClassName ? name : demodulize(name);
}

/** The bare constant name — the segment after the final `::`. Mirrors Ruby's
 * `String#demodulize`, used by `sti_name`/`polymorphic_name` (and the
 * belongs_to inverse write) when the `store_full_*` flags are off. */
export function demodulize(name: string): string {
  const idx = name.lastIndexOf("::");
  return idx === -1 ? name : name.slice(idx + 2);
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
  // Idempotent, mirroring Rails' DescendantsTracker (a Set): the `inherited`
  // hook registers each subclass exactly once, so a repeat call (e.g. a model
  // file self-registers at import, then registerModel([...]) routes it again)
  // must not double-list it — descendants() would otherwise yield duplicates.
  if (!(parent as any)._subclasses.includes(klass)) {
    (parent as any)._subclasses.push(klass);
  }
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
    return modelClass.columnNames().includes(name);
  } catch {
    return false;
  }
}

/**
 * True when STI is explicitly disabled for this model — Rails'
 * `self.inheritance_column = nil`. trails stores an explicit `null` in
 * `_inheritanceColumn` (distinct from the `undefined` "unset" state, which still
 * defaults to "type"). A disabled model never dispatches STI even when its table
 * carries a real `type` column used for non-inheritance data, so every dispatch
 * gate short-circuits on this. {@link getInheritanceColumn} still resolves to the
 * column *name* "type" — disabling is about *whether* dispatch happens, not where
 * the column lives.
 *
 * @internal
 */
export function inheritanceColumnDisabled(modelClass: object): boolean {
  return (modelClass as any)._inheritanceColumn === null;
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
    if (current._inheritanceColumn) return true;
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
  // Rails' find_sti_class delegates the constant resolution to sti_class_for,
  // which branches on the store_full_* flags: constantize when storing the full
  // STI class name, else namespace-relative compute_type. Routing through
  // {@link stiClassFor} (rather than a bare registry lookup) is what lets an
  // explicitly-STI-enabled hierarchy resolve a namespaced subclass from its
  // demodulized stored type when `store_full_sti_class = false` — the registered
  // candidate is found via the model's own module nesting rather than the bare
  // (unregistered) demodulized name. With the default flags on, sti_class_for
  // falls back to the bare registry lookup, preserving the prior behavior.
  return stiClassFor(baseClass, typeName);
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
  const narrowable = klass.columnNames().filter((c) => !pkSet.has(c) && !rowKeys.has(c));
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
function directInstantiate(
  klass: typeof Base,
  row: Record<string, unknown>,
  block?: (record: Base) => void,
  columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
): Base {
  const hadOwnSuppress = Object.prototype.hasOwnProperty.call(klass, "_suppressInitializeCallback");
  const prevSuppress = klass._suppressInitializeCallback;
  klass._suppressInitializeCallback = true;
  const hadOwnAbstractSuppress = Object.prototype.hasOwnProperty.call(
    klass,
    "_suppressAbstractCheck",
  );
  const prevAbstractSuppress = (klass as any)._suppressAbstractCheck;
  (klass as any)._suppressAbstractCheck = true;
  let record: Base;
  try {
    record = new klass();
  } finally {
    if (hadOwnSuppress) {
      klass._suppressInitializeCallback = prevSuppress;
    } else {
      delete (klass as any)._suppressInitializeCallback;
    }
    if (hadOwnAbstractSuppress) {
      (klass as any)._suppressAbstractCheck = prevAbstractSuppress;
    } else {
      delete (klass as any)._suppressAbstractCheck;
    }
  }
  // Load DB values through deserialize (not the user cast) so encrypted types
  // decrypt and raw DB representations (e.g. an enum's integer `0`) are accepted
  // — mirrors the non-STI Base._instantiate path. Building via `new klass(row)`
  // instead ran every column through the user cast, which rejects raw DB values.
  for (const [key, value] of Object.entries(row)) {
    record._attributes.writeFromDatabase(key, value, columnTypes?.[key]);
  }
  narrowToProjectedColumns(klass, record, row);
  record._newRecord = false;
  (record as any)._dirty.snapshot(record._attributes);
  record.changesApplied();
  if ((klass as any)._strictLoadingByDefault) {
    (record as any)._strictLoading = true;
  }
  // Rails' init_with_attributes yields to the loader block (inverse wiring)
  // before firing after_find then after_initialize.
  block?.(record);
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
export function instantiateSti(
  baseClass: typeof Base,
  row: Record<string, unknown>,
  block?: (record: Base) => void,
  columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
): Base {
  return directInstantiate(discriminateClassForRecord(baseClass, row), row, block, columnTypes);
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
  // Rails: `descends_from_active_record? ? :false : :true`, memoized.
  if (!isDescendsFromActiveRecord(modelClass)) {
    (modelClass as any)._finderNeedsTypeCondition = true;
    return true;
  }
  // `descends` is true. Memoize only the stable reasons (a hierarchy root, or STI
  // explicitly disabled); a non-root model that descends only because its `type`
  // column hasn't reflected yet must recompute once schema warms.
  if (descendsFromActiveRecordByHierarchy(modelClass) || inheritanceColumnDisabled(modelClass)) {
    (modelClass as any)._finderNeedsTypeCondition = false;
  }
  return false;
}

// The primary abstract class is stored in the canonical `ar-config.ts` module
// binding (`ActiveRecord.application_record_class`), not a parallel
// module-local. Read/write it through there so there is a single source of
// truth.

/** Test-only: reset the primary abstract class singleton. */
export function __resetPrimaryAbstractClass(): void {
  setApplicationRecordClass(null);
}

/** @internal */
export function getApplicationRecordClass(): typeof Base | null {
  return applicationRecordClass as typeof Base | null;
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
  if (applicationRecordClass) {
    return modelClass === applicationRecordClass;
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
  if (applicationRecordClass && applicationRecordClass !== modelClass) {
    throw new ArgumentError(
      `The \`primary_abstract_class\` is already set to ${applicationRecordClass.name}. ` +
        "There can only be one `primary_abstract_class` in an application.",
    );
  }
  (modelClass as any).abstractClass = true;
  setApplicationRecordClass(modelClass);
}

/**
 * Returns the class corresponding to the STI type name stored in the
 * inheritance column.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#sti_class_for
 */
export function stiClassFor(modelClass: typeof Base, typeName: string): typeof Base {
  const klass = modelClass as typeof Base & {
    storeFullStiClass?: boolean;
    storeFullClassName?: boolean;
  };
  // Rails splits this across find_sti_class (the subclass check) and
  // sti_class_for (the constant resolution, with a `rescue NameError`):
  // inheritance.rb:311-320, 242-265. Mirror that split so each failure keeps its
  // Rails message — a name that resolves to no constant becomes "failed to
  // locate the subclass" (rescued NameError), while a resolved-but-non-subclass
  // keeps "Invalid single-table inheritance type" (raised *outside* the rescue).
  let subclass: typeof Base;
  try {
    // sti_class_for: constantize when storing the full STI class name, else
    // namespace-relative compute_type. Bare registry lookup is trails' constantize.
    if (klass.storeFullStiClass && klass.storeFullClassName) {
      const resolved = modelRegistry.get(typeName);
      if (!resolved) throw new NameError(`uninitialized constant ${typeName}`);
      subclass = resolved;
    } else {
      subclass = resolveComputedType(modelClass, typeName);
    }
  } catch (cause) {
    if (!(cause instanceof NameError)) throw cause;
    throw new SubclassNotFound(
      `The single-table inheritance mechanism failed to locate the subclass: '${typeName}'. ` +
        `This error is raised because the column '${getInheritanceColumn(modelClass)}' is reserved for storing the class in case of inheritance.`,
      { cause },
    );
  }
  // find_sti_class: `unless subclass == self || descendants.include?(subclass)`.
  if (subclass !== modelClass && !(subclass.prototype instanceof modelClass)) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${subclass.name} is not a subclass of ${modelClass.name}`,
    );
  }
  return subclass;
}

/**
 * Returns the class corresponding to a polymorphic type column value.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#polymorphic_class_for
 */
export function polymorphicClassFor(modelClass: typeof Base, name: string): typeof Base {
  // Mirrors Rails' polymorphic_class_for: constantize when storing the full
  // class name, else namespace-relative compute_type. Polymorphic targets are
  // unrelated models, so (unlike STI) no subclass relationship is enforced.
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  if (klass.storeFullClassName) {
    const resolved = modelRegistry.get(name);
    if (!resolved) throw new NameError(`uninitialized constant ${name}`);
    return resolved;
  }
  return resolveComputedType(modelClass, name);
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
  if (inheritanceColumnDisabled(klass)) return;
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
    return findStiClassForRow(modelClass, typeName);
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
  // Mirrors Rails exactly: `record[inheritance_column].present? &&
  // _has_attribute?(inheritance_column)` — no `stiEnabled` short-circuit. A plain
  // model with a reflected `type` column still passes this gate, but resolves to
  // itself in {@link findStiClassForRow} because its subtree tracks no subclass
  // and STI was never explicitly enabled, so dispatch is a no-op there.
  // `inheritance_column = nil` opts out entirely, even with a real `type` column.
  if (inheritanceColumnDisabled(modelClass)) return false;
  const inheritCol = getInheritanceColumn(modelClass);
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
  let attrsHash = attrs;
  if (typeof (attrs as any).toH === "function") {
    attrsHash = (attrs as any).toH();
  } else if (typeof (attrs as any).toObject === "function") {
    attrsHash = (attrs as any).toObject();
  }

  if (!attrsHash || typeof attrsHash !== "object") return null;

  // `inheritance_column = nil` disables STI even when a real `type` column exists.
  if (inheritanceColumnDisabled(modelClass)) return null;
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
 * descendants). Unlike `findStiClass` it never trusts a bare global
 * `modelRegistry` lookup, where a name like `"Client"` is ambiguous across test
 * files that each define their own STI tree. Returns null when nothing in the
 * subtree matches rather than raising — callers treat a non-match as "build the
 * receiver as-is".
 *
 * A subtree class matches when either its `stiName` equals `typeName` (the
 * common case — now including Ruby-qualified names like `"ClothingItem::Used"`,
 * which `stiName` derives from the model's `moduleName`), or the global registry
 * maps `typeName` to that exact in-subtree class. The second arm survives for
 * namespaced models still registered by Ruby name via `registerModel` (e.g.
 * `company_in_module`), without ambiguity: a registry entry pointing at a class
 * in *another* tree is never `=== klass` here, so it is ignored.
 *
 * @internal
 */
function findStiClassInHierarchy(baseClass: typeof Base, typeName: string): typeof Base | null {
  const registered = modelRegistry.get(typeName);
  for (const klass of [baseClass, ...descendants(baseClass)]) {
    if (stiName(klass) === typeName || klass === registered) return klass;
  }
  return null;
}

/**
 * True when `typeName` names `modelClass` itself or one of its STI ancestors
 * (up to and including the STI base). Used by the `new`-dispatch scope path to
 * preserve the deliberate `_applyScopeAttributes` deviation: a scope that sets
 * `type` to an ancestor (e.g. `Car.new` under `where(type: "Vehicle")`) keeps
 * the receiver's own concrete type instead of raising. The lineage walk needs
 * no global lookup, so it stays free of cross-test ambiguity. (Rails' own valid
 * set is self + descendants and would raise here, so this carve-out is confined
 * to the scope source; explicit attributes follow Rails and raise.)
 *
 * @internal
 */
function namesSelfOrStiAncestor(modelClass: typeof Base, typeName: string): boolean {
  const stiBase = getStiBase(modelClass);
  let cur: typeof Base = modelClass;
  while (cur && (cur as unknown) !== Function.prototype) {
    if (stiName(cur) === typeName) return true;
    if (cur === stiBase) break;
    cur = Object.getPrototypeOf(cur) as typeof Base;
  }
  return false;
}

/**
 * Registry-safe row-path resolver: the database-row analogue of
 * {@link findStiClassInHierarchy} used by {@link discriminateClassForRecord}.
 *
 * It matches `typeName` against `baseClass`'s own tracked subtree first (via the
 * shared {@link findStiClassInHierarchy}, which also resolves Ruby-qualified
 * registered names), rather than the ambiguous global `modelRegistry`. The
 * no-match handling splits on whether STI was *explicitly enabled*:
 *
 *   - `stiEnabled(baseClass)` (an explicit `_inheritanceColumn` sentinel, e.g.
 *     the custom-column Parrot/Vegetable trees): defer to the global
 *     {@link findStiClass} — Rails' autoloader analog — which resolves a
 *     uniquely-named subclass registered via `registerModel` or raises
 *     `SubclassNotFound` for a genuinely bad type, mirroring Rails' `find_sti_class`.
 *   - A canonical base that merely reflects a `type` column and tracks subclasses
 *     (no explicit `enableSti`): DEGRADE to the base class on a miss rather than
 *     raise. trails has no autoloader, so an unloaded-but-valid subclass (e.g. a
 *     `type: "Reply"` row when `reply.ts` hasn't been imported) is
 *     indistinguishable from a genuinely bad type; raising would break unrelated
 *     queries over a shared table (`Topic.all` seeing a `Reply` row). This is the
 *     same graceful-degradation deviation the `new` path takes.
 *   - A plain model with no STI and no tracked subclasses builds the receiver
 *     as-is — its stray `type` value must not raise.
 *
 * @internal
 */
function findStiClassForRow(baseClass: typeof Base, typeName: string): typeof Base {
  const found = findStiClassInHierarchy(baseClass, typeName);
  if (found) return found;
  if (stiEnabled(baseClass)) return findStiClass(baseClass, typeName);
  return baseClass;
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
 * dispatch) when no source names an inheritance value at all.
 *
 * Matching Rails' `subclass_from_attributes` → `find_sti_class`: when an
 * explicitly STI-enabled receiver carries a *present* inheritance value that
 * names no subclass of it, this raises {@link SubclassNotFound} (e.g.
 * `Company.new(type: "Account")` or an unknown `"InvalidType"`) rather than
 * silently building the receiver as-is. The no-match handling mirrors the row
 * path ({@link findStiClassForRow}): the subtree walk resolves in-hierarchy
 * types registry-safely, then only an `enableSti` hierarchy defers to the
 * global `find_sti_class` (which also resolves a registered subclass not tracked
 * as a descendant, and raises for a genuine out-of-hierarchy/unknown type). A
 * model that merely reflects a `type` column without `enableSti` degrades to
 * build-as-is — trails has no autoloader to tell an unloaded-but-valid subclass
 * from a bad type, the same graceful deviation the row path takes.
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
  // `inheritance_column = nil` disables STI even when a real `type` column exists.
  if (inheritanceColumnDisabled(modelClass)) return null;
  const col = getInheritanceColumn(modelClass);
  if (!classHasAttribute(modelClass, col) && descendants(modelClass).length === 0) return null;

  const resolve = (source: unknown, fromScope = false): typeof Base | null => {
    if (!source || typeof source !== "object") return null;
    const cast = castStiValueFromAttrs(modelClass, source as Record<string, unknown>, col);
    if (!cast.found) return null;
    const typeName = cast.value as string;
    const found = findStiClassInHierarchy(modelClass, typeName);
    if (found) return found;
    // Deviation, scope source only: a *scope* that sets `type` to an STI ancestor
    // of the receiver builds it as-is rather than raising (the `_applyScopeAttributes`
    // rule — the receiver already is that type, and its own STI column wins). Rails
    // raises here too (self + descendants), so this is confined to the scope path.
    if (fromScope && namesSelfOrStiAncestor(modelClass, typeName)) return null;
    // No-match handling mirrors the row path ({@link findStiClassForRow}): only an
    // explicitly STI-enabled hierarchy defers to the global find_sti_class, which
    // resolves a registered subclass (incl. one not tracked as a descendant) or
    // raises SubclassNotFound for an out-of-hierarchy/unknown type — matching Rails'
    // Inheritance#new → subclass_from_attributes → find_sti_class. A model that
    // merely reflects a `type` column without enableSti degrades to build-as-is:
    // trails has no autoloader, so an unloaded-but-valid subclass is indistinguishable
    // from a genuinely bad type, and raising would break unrelated construction.
    if (stiEnabled(modelClass)) return findStiClass(modelClass, typeName);
    return null;
  };

  // Rails Inheritance::ClassMethods#new tries each source in turn, stopping at
  // the first that resolves a subclass.
  let subclass = resolve(attrs);
  if (!subclass) {
    const scopeAttrs = (
      modelClass.currentScope as { scopeForCreate?(): unknown } | null
    )?.scopeForCreate?.();
    subclass = resolve(scopeAttrs, true);
  }
  if (!subclass && isBaseClass(modelClass)) {
    subclass = resolve(modelClass.columnDefaults);
  }
  return subclass;
}
