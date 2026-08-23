/**
 * Inheritance — STI, abstract classes, and subclass tracking.
 *
 * Mirrors: ActiveRecord::Inheritance
 */

import type { Base } from "./base.js";
import { modelRegistry, registerModelConstant } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import {
  camelize,
  constantize,
  isPresent,
  safeConstantize,
  underscore,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { DescendantsTracker } from "@blazetrails/activesupport";
import { ActiveRecord } from "./ar-config.js";

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
  const casted = (
    modelClass.typeForAttribute(inheritCol) as { cast(value: unknown): unknown }
  ).cast(value);
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
  if (typeName.startsWith("::")) {
    return constantize(typeName) as typeof Base;
  }
  const candidates = computeTypeCandidates(baseClass, typeName);
  for (const candidate of candidates) {
    const klass = safeConstantize(candidate) as typeof Base | undefined;
    if (klass && qualifiedName(klass) === candidate) return klass;
  }
  throw new NameError(`uninitialized constant ${candidates[0]}`, candidates[0]);
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
 * Return direct subclasses of a model class.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#subclasses
 *
 * Ruby's `Class#subclasses` is maintained by the VM, so
 * `DescendantsTracker.subclasses(klass)` is a plain delegation to it
 * (descendants_tracker.rb:97-100) and there is exactly one registry. JS has no
 * such hook, so trails fills two by hand — `_subclasses` from an explicit
 * `registerSubclass`, and `ActiveSupport`'s `DescendantsTracker` from
 * `_default_attributes`. Read both, so callers get the one answer Ruby gets.
 */
export function subclasses(modelClass: typeof Base): (typeof Base)[] {
  const result: (typeof Base)[] = Object.prototype.hasOwnProperty.call(modelClass, "_subclasses")
    ? [...((modelClass as any)._subclasses as (typeof Base)[])]
    : [];
  for (const klass of DescendantsTracker.subclasses(
    modelClass as never,
  ) as unknown as (typeof Base)[]) {
    if (klass !== modelClass && !result.includes(klass)) result.push(klass);
  }
  return result;
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
 * Independent of the explicit `inheritanceColumn` sentinel that
 * {@link isStiSubclass} keys off — that sentinel still gates the
 * registry-resolved row-dispatch paths.
 *
 * @internal
 */
function descendsFromActiveRecordByHierarchy(modelClass: typeof Base): boolean {
  // Rails: `self == Base` → false.
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) return false;
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  if (!parent || parent === Function.prototype || typeof parent.name !== "string") return true;
  // Rails: `elsif superclass.abstract_class?` → recurse through the abstract chain.
  if (parent.abstractClass) return descendsFromActiveRecordByHierarchy(parent);
  // Rails else branch begins with `superclass == Base`.
  return Object.prototype.hasOwnProperty.call(parent, "_isActiveRecordBase");
}

/**
 * Check if a model descends directly from ActiveRecord::Base — i.e. it is a
 * hierarchy root rather than a concrete STI subclass.
 *
 * Mirrors Rails' else branch `superclass == Base || !columns_hash.include?(inheritance_column)`:
 * a non-root class still "descends" (is not an STI subclass) when it doesn't
 * actually carry the inheritance column, or STI is disabled. The membership
 * test is Rails' own `columns_hash.include?`: a *declared* `attribute :type`
 * with no backing column must not make a model an STI subclass, which is why
 * this reader asks for column metadata rather than `attribute_types`.
 * Decoupled from the explicit `inheritanceColumn` sentinel
 * ({@link isStiSubclass}), which still gates the registry-resolved row-dispatch
 * paths.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#descends_from_active_record?
 */
export function isDescendsFromActiveRecord(this: typeof Base): boolean {
  const modelClass = this;
  // Rails' first arm, `if self == Base` → false, returns before the column
  // test — Base has no table, so asking it for `columns_hash` raises.
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) return false;
  if (descendsFromActiveRecordByHierarchy(modelClass)) return true;
  const columnsHash = modelClass.columnsHash();
  const inheritCol = modelClass.inheritanceColumn;
  // Ruby `columns_hash.include?(inheritance_column)` is false for the nil
  // `inheritance_column` of an STI-disabled model, so no separate arm.
  return !Object.keys(columnsHash).includes(inheritCol as string);
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
  const parentIsAbstract = parent.abstractClass;
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
 *
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activerecord/lib/active_record/model_schema.rb:302-307` —
 *   `full_table_name_prefix`/`full_table_name_suffix` reach the namespace through `module_parents`,
 *   i.e. Ruby's object model; JS classes carry no module path).
 * Ruby resolves a model's namespace through the constant path (`Module#name`,
 *   `Module#module_parents`) and reads a module-level `table_name_prefix`/`table_name_suffix` off the
 *   enclosing module object — see `full_table_name_prefix` in model_schema.rb:302-307. JS classes
 *   carry no module path and there are no module objects to respond to those readers, so trails
 *   substitutes an explicit registry: namespaced models declare `static moduleName` and their
 *   wrapping module registers its decoration here. There is no Ruby `def` to match because Ruby gets
 *   this from the object model.
 */
export function qualifiedName(modelClass: typeof Base): string {
  const klass = modelClass as typeof Base & { moduleName?: string; _demodulizedName?: string };
  if (!klass.moduleName) return modelClass.name;
  return `${klass.moduleName}::${klass._demodulizedName ?? modelClass.name}`;
}

/**
 * The namespace segments for `modelClass` — `moduleName.split("::")` or `[]`.
 *
 * @internal
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
 *
 * @internal
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

/**
 * Register a module-level `table_name_prefix` (Ruby `def self.table_name_prefix`).
 *
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activerecord/lib/active_record/model_schema.rb:302-307` —
 *   `full_table_name_prefix` reads `table_name_prefix` off the enclosing module object; ESM has no
 *   module objects to respond to it).
 * Ruby resolves a model's namespace through the constant path (`Module#name`,
 *   `Module#module_parents`) and reads a module-level `table_name_prefix`/`table_name_suffix` off the
 *   enclosing module object — see `full_table_name_prefix` in model_schema.rb:302-307. JS classes
 *   carry no module path and there are no module objects to respond to those readers, so trails
 *   substitutes an explicit registry: namespaced models declare `static moduleName` and their
 *   wrapping module registers its decoration here. There is no Ruby `def` to match because Ruby gets
 *   this from the object model.
 */
export function registerModuleTableNamePrefix(moduleName: string, prefix: string): void {
  moduleTableNamePrefixes.set(moduleName, prefix);
}

/**
 * Register a module-level `table_name_suffix` (Ruby `def self.table_name_suffix`).
 *
 * @noRailsEquivalent PERMANENT
 *   (`vendor/rails/activerecord/lib/active_record/model_schema.rb:302-307` —
 *   `full_table_name_suffix` reads `table_name_suffix` off the enclosing module object; ESM has no
 *   module objects to respond to it).
 * Ruby resolves a model's namespace through the constant path (`Module#name`,
 *   `Module#module_parents`) and reads a module-level `table_name_prefix`/`table_name_suffix` off the
 *   enclosing module object — see `full_table_name_prefix` in model_schema.rb:302-307. JS classes
 *   carry no module path and there are no module objects to respond to those readers, so trails
 *   substitutes an explicit registry: namespaced models declare `static moduleName` and their
 *   wrapping module registers its decoration here. There is no Ruby `def` to match because Ruby gets
 *   this from the object model.
 */
export function registerModuleTableNameSuffix(moduleName: string, suffix: string): void {
  moduleTableNameSuffixes.set(moduleName, suffix);
}

/**
 * Walk `module_parents` innermost-out and return the first parent's
 * decoration, or `undefined` when the walk reaches the top without a hit (the
 * caller then falls back to `self.table_name_prefix`/`_suffix`). Mirrors the
 * `module_parents.detect { |p| p.respond_to?(:table_name_prefix) }` walk in
 * `ActiveRecord::ModelSchema::ClassMethods#full_table_name_{prefix,suffix}`
 * (model_schema.rb:302-307).
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

/** @internal */
export function lookupModuleTableNamePrefix(moduleName: string | undefined): string | undefined {
  return lookupModuleDecoration(
    moduleName,
    moduleTableNamePrefixes,
    (model) => (model as typeof Base & { _tableNamePrefix?: string })._tableNamePrefix ?? "",
  );
}

/** @internal */
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
 *
 * @noRailsEquivalent PERMANENT (`vendor/rails/activerecord/lib/active_record/inheritance.rb:287` —
 *   the `inherited` hook; JS has no class-definition hook).
 * Stands in for Ruby's `inherited` hook (inheritance.rb:287), which Rails uses
 *   to register each subclass with the DescendantsTracker. TypeScript has no class-definition hook, so subclasses call
 *   `registerSubclass(Klass)` from a static initializer block instead. CLAUDE.md already routes Ruby
 *   lifecycle hooks to a no-TS-equivalent skip; SKIP_GROUPS is keyed by *Ruby* name and only
 *   suppresses the missing-method direction, so the extra TS surface it creates is recorded here.
 */
export function registerSubclass(klass: typeof Base): void {
  const parent = Object.getPrototypeOf(klass) as typeof Base;
  if (!parent || parent === Function.prototype) return;
  // Guard before any mutation: a rejected registration must not leave the
  // shadowing subclass permanently listed in subclasses()/descendants().
  if (klass.name) registerModelConstant(klass.name, klass);
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
 * True when STI was explicitly enabled on this class or an ancestor (the
 * inherited `_inheritanceColumn` sentinel). Distinct from `inheritanceColumn`,
 * which resolves to a name (default "type") for any model that hasn't disabled
 * STI: the column merely names where STI *would* read the type; this reports
 * whether the model actually participates in STI.
 *
 * Used to gate the database-row dispatch paths (instantiate, association build),
 * which resolve through the ambiguous global registry and so must stay scoped to
 * explicitly-modeled hierarchies. The `new`-from-attributes path resolves within
 * the class's own subtree and instead gates on the column-aware
 * `_has_attribute?`.
 *
 * @internal
 */
export function stiEnabled(modelClass: object): boolean {
  return (modelClass as any)._inheritanceColumn != null;
}

/**
 * Check if a model class is an STI subclass (not the base STI class).
 *
 * @internal
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

/** Mirrors: ActiveRecord::Inheritance::ClassMethods */
export class ClassMethods {
  /** Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class */
  static get abstractClass(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_abstractClass")
      ? (this as any)._abstractClass
      : false;
  }

  /** Mirrors: ActiveRecord::Inheritance::ClassMethods#abstract_class= */
  static set abstractClass(value: boolean) {
    (this as any)._abstractClass = value;
  }
}

/**
 * Get the STI base class for a model.
 *
 * @internal
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
  // Rails casts through `base_class`, not the receiver (inheritance.rb:312), so a
  // subclass that overrides the inheritance column's attribute type still resolves
  // against the hierarchy's own type.
  typeName = baseClass.baseClass
    .typeForAttribute(baseClass.inheritanceColumn as string)
    .cast(typeName) as string;

  // Rails' find_sti_class delegates the constant resolution to sti_class_for,
  // which branches on the store_full_* flags: constantize when storing the full
  // STI class name, else namespace-relative compute_type. Routing through
  // {@link stiClassFor} (rather than a bare registry lookup) is what lets an
  // explicitly-STI-enabled hierarchy resolve a namespaced subclass from its
  // demodulized stored type when `store_full_sti_class = false` — the registered
  // candidate is found via the model's own module nesting rather than the bare
  // (unregistered) demodulized name. With the default flags on, sti_class_for
  // falls back to the bare registry lookup, preserving the prior behavior.
  const subclass = baseClass.stiClassFor(typeName);

  if (!(subclass === baseClass || baseClass.descendants.includes(subclass))) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${subclass.name} is not a subclass of ${baseClass.name}`,
    );
  }

  return subclass;
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
 * `_instantiate` and narrows here per concrete class — same end state.)
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
  overrideTypes?: Record<string, { deserialize(value: unknown): unknown }>,
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
    narrowTo(
      names: Iterable<string>,
      overrideTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    ): void;
  };
  const keep = new Set(rowKeys);
  const drop = new Set(narrowable);
  for (const name of attrs.keys()) {
    if (!drop.has(name)) keep.add(name);
  }
  attrs.narrowTo(keep, overrideTypes);
}

const SELECT_ALIAS_READERS = Symbol.for("activerecord.selectAliasReaders");

/**
 * Reconcile per-instance readers for non-column select aliases so a loaded
 * record exposes them via property access (`record.post_count`).
 *
 * Rails answers `record.post_count` for a `SELECT COUNT(*) AS post_count`
 * projection through `method_missing` → `attribute_missing`, gated on
 * `@attributes.key?(name)` (attribute_methods.rb). TypeScript has no
 * method_missing, so we install own-property getters on the instance for each
 * loaded attribute that has no accessor on the prototype chain (i.e. isn't a
 * declared column) — matching Rails' `relation.map(&:post_count)`.
 *
 * This runs on every attribute-set swap (instantiate, dup, reload), so it also
 * drops readers whose alias is gone from the new attribute set: Rails' gate is
 * `@attributes.key?`, so once `reload` swaps in a plain `SELECT *` attribute set
 * `record.post_count` raises `NoMethodError` — we mirror that by deleting the
 * stale getter (property access then yields `undefined`, the trails analog).
 *
 * @internal
 */
export function defineDynamicSelectReaders(record: Base): void {
  const attrs = (record as any)._attributes as { keys(): Iterable<string> };
  const rec = record as unknown as Record<string | symbol, unknown>;
  const installed = (rec[SELECT_ALIAS_READERS] as Set<string> | undefined) ?? new Set<string>();
  // Drop readers whose alias no longer appears in the fresh attribute set
  // (mirrors Rails' `@attributes.key?` gate now returning false after the swap).
  if (installed.size > 0) {
    const live = new Set(attrs.keys());
    for (const name of installed) {
      if (!live.has(name)) {
        delete rec[name];
        installed.delete(name);
      }
    }
  }
  // Install a reader for every loaded attribute key that has no accessor on the
  // prototype chain. `attrs.keys()` is initialized-only (Rails' `key?` gate), so
  // a full `SELECT *` of ordinary columns — all of which carry prototype
  // accessors — finds nothing to install and never walks the chain past the
  // hasProtoMember check. This covers Rails' method_missing reaching `key?` for
  // BOTH a bare select alias and an ignored column whose value a raw `SELECT *`
  // actually projected (`AttributedDeveloper#name` → "Developer: name"): Rails
  // makes both respond via `attribute_missing`. narrowToProjectedColumns has
  // already uninitialized any ignored column the row did not carry, so a narrowed
  // reload leaves its declared-but-ignored default out of `keys()` and no reader
  // is installed — matching Rails' `key?` being false for that uninitialized slot.
  const proto = Object.getPrototypeOf(record) as object;
  for (const name of attrs.keys()) {
    if (installed.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(record, name)) continue;
    // A non-column key can still resolve to a real method or an aliased
    // accessor on the prototype chain (Rails' `respond_to_without_attributes?`
    // short-circuit in method_missing); only truly unclaimed names fall
    // through to an alias reader.
    let hasProtoMember = false;
    for (let p: object | null = proto; p != null; p = Object.getPrototypeOf(p)) {
      if (Object.getOwnPropertyDescriptor(p, name)) {
        hasProtoMember = true;
        break;
      }
    }
    if (hasProtoMember) continue;
    Object.defineProperty(record, name, {
      get(this: Base) {
        return (this as any).readAttribute(name);
      },
      configurable: true,
      enumerable: false,
    });
    installed.add(name);
  }
  if (installed.size > 0 && rec[SELECT_ALIAS_READERS] === undefined) {
    Object.defineProperty(record, SELECT_ALIAS_READERS, {
      value: installed,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Methods missing from parity:api — added for 100% parity
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
  if (!modelClass.isDescendsFromActiveRecord()) {
    (modelClass as any)._finderNeedsTypeCondition = true;
    return true;
  }
  // `descends` is true. Memoize only the stable reasons (a hierarchy root, or STI
  // explicitly disabled); a non-root model that descends only because its `type`
  // column hasn't reflected yet must recompute once schema warms.
  if (descendsFromActiveRecordByHierarchy(modelClass) || modelClass.inheritanceColumn === null) {
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
  ActiveRecord.applicationRecordClass = null;
}

/** @internal */
export function getApplicationRecordClass(): typeof Base | null {
  return ActiveRecord.applicationRecordClass as typeof Base | null;
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
  if (ActiveRecord.applicationRecordClass) {
    return modelClass === ActiveRecord.applicationRecordClass;
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
  if (ActiveRecord.applicationRecordClass && ActiveRecord.applicationRecordClass !== modelClass) {
    throw new ArgumentError(
      `The \`primary_abstract_class\` is already set to ${ActiveRecord.applicationRecordClass.name}. ` +
        "There can only be one `primary_abstract_class` in an application.",
    );
  }
  (modelClass as any).abstractClass = true;
  ActiveRecord.applicationRecordClass = modelClass;
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
  let subclass: typeof Base;
  try {
    if (klass.storeFullStiClass && klass.storeFullClassName) {
      subclass = constantize(typeName) as typeof Base;
    } else {
      subclass = modelClass.computeType(typeName);
    }
  } catch (cause) {
    if (!(cause instanceof NameError)) throw cause;
    throw new SubclassNotFound(
      `The single-table inheritance mechanism failed to locate the subclass: '${typeName}'. ` +
        `This error is raised because the column '${modelClass.inheritanceColumn}' is reserved for storing the class in case of inheritance.`,
      { cause },
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
  // Polymorphic targets are unrelated models, so (unlike STI) no subclass
  // relationship is enforced.
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  if (klass.storeFullClassName) {
    return constantize(name) as typeof Base;
  }
  return modelClass.computeType(name);
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
  const inheritCol = klass.inheritanceColumn;
  if (inheritCol === null) return;
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
  if (modelClass.usingSingleTableInheritance(record)) {
    const inheritCol = modelClass.inheritanceColumn;
    if (inheritCol === null) return modelClass;
    // Rails casts through `base_class`, not the receiver (find_sti_class,
    // inheritance.rb:312), so a subclass that overrides the inheritance column's
    // attribute type still resolves against the hierarchy's own type. Only the
    // subclass lookup and its `subclass == self || descendants.include?` check
    // stay on the receiver.
    const castValue = castInheritanceColumnValue(
      baseClass.call(modelClass),
      inheritCol,
      record[inheritCol],
    );
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
export function usingSingleTableInheritance(
  this: typeof Base,
  record: Record<string, unknown>,
): boolean {
  const modelClass = this;
  // Mirrors Rails exactly: `record[inheritance_column].present? &&
  // _has_attribute?(inheritance_column)` — no `stiEnabled` short-circuit. A plain
  // model with a reflected `type` column still passes this gate, but resolves to
  // itself in {@link findStiClassForRow} because its subtree tracks no subclass
  // and STI was never explicitly enabled, so dispatch is a no-op there.
  // `inheritance_column = nil` opts out entirely, even with a real `type` column.
  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) return false;
  if (!isPresent(record[inheritCol])) return false;
  return stiColumnIsAttribute(modelClass, inheritCol, record);
}

/**
 * Rails' class-level `_has_attribute?(name)` is `attribute_types.key?(name)`,
 * true for any real DB column as well as any explicitly declared `attribute()`.
 * In trails schema reflection is lazy, so it is not always warm by the time
 * `instantiate` dispatches. A custom STI column like `Parrot#parrot_sti_class`
 * is a real column but not a declared `attribute()`, and when the schema cache
 * is cold the default attribute set omits it — which silently hydrated those
 * rows as the base class.
 *
 * Accept either of two signals that prove the column is a real model attribute:
 *   1. `_has_attribute?` itself;
 *   2. the column appearing as a key on the record being instantiated — every
 *      key in an `instantiate` row is a real DB column by construction, and that
 *      DB-row path is the only one that reaches STI dispatch.
 *
 * @internal
 */
function stiColumnIsAttribute(
  modelClass: typeof Base,
  inheritCol: string,
  record: Record<string, unknown>,
): boolean {
  if (Object.prototype.hasOwnProperty.call(record, inheritCol)) return true;
  return modelClass._hasAttribute(inheritCol);
}

/**
 * Build a WHERE condition that scopes queries to this class and its descendants' type values.
 *
 * Mirrors: ActiveRecord::Inheritance::ClassMethods#type_condition
 * @internal Private method, used internally for STI type filtering in queries.
 */
export function typeCondition(modelClass: typeof Base, arelTable?: any): any {
  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) {
    throw new ActiveRecordError("Cannot build type condition without an inheritance column");
  }
  const table = arelTable || (modelClass as any).arelTable;
  if (!table) throw new ActiveRecordError("Cannot build type condition without arel table");

  const stiColumn = typeof table.get === "function" ? table.get(inheritCol) : table[inheritCol];
  const stiNames = ([modelClass] as (typeof Base)[])
    .concat(modelClass.descendants)
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
  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) return null;
  // Rails gates STI dispatch on `_has_attribute?(inheritance_column)` — only
  // models that actually carry the column dispatch.
  if (!modelClass._hasAttribute(inheritCol)) return null;

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
  // Rails reaches this through `subclass_from_attributes` → `find_sti_class`
  // (inheritance.rb:312), which casts through `base_class`, not the receiver.
  // Only the subclass lookup and its `subclass == self` check stay on it.
  return {
    found: true,
    value: castInheritanceColumnValue(baseClass.call(modelClass), inheritCol, subclassValue),
  };
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
 *     (no explicit `inheritanceColumn` assignment): DEGRADE to the base class
 *     on a miss rather than raise. trails has no autoloader, so an
 *     unloaded-but-valid subclass (e.g. a `type: "Reply"` row when `reply.ts`
 *     hasn't been imported) is
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
 * column-aware `_has_attribute?` — or, for a
 * receiver that is explicitly STI-enabled ({@link stiEnabled}), on that
 * assignment, which is the same structural fact Rails reads off
 * `_has_attribute?`. Rails reads `_has_attribute?` alone because
 * `attribute_types` loads the schema synchronously on first touch; trails
 * cannot query the database from a synchronous constructor, so reflection can
 * still be cold at `new` and the `stiEnabled` arm covers exactly that window
 * (an STI *leaf* whose `type` column had not reflected yet otherwise built
 * as-is where Rails raises). Returns null (no dispatch) when no source names
 * an inheritance value at all.
 *
 * Matching Rails' `subclass_from_attributes` → `find_sti_class`: a receiver
 * carrying a *present* inheritance value that names no subclass of it raises
 * {@link SubclassNotFound} (e.g. `Company.new(type: "Account")` or an unknown
 * `"InvalidType"`) rather than silently building the receiver as-is. All three
 * sources resolve identically — `find_sti_class`'s valid set is
 * `self || descendants` (`inheritance.rb:242-265`), so a scope naming an STI
 * *ancestor* of the receiver raises just as an explicit attribute does. The
 * subtree walk resolves in-hierarchy types registry-safely first, then defers
 * to the global `find_sti_class`, which also resolves a registered subclass not
 * tracked as a descendant and raises for a genuine out-of-hierarchy/unknown
 * type.
 *
 * @internal Used by Base's constructor to dispatch `new` to a subclass.
 */
export function subclassFromAttributesForNew(
  modelClass: typeof Base,
  attrs: Record<string, unknown> | null | undefined,
): typeof Base | null {
  // Rails gates the whole `new` dispatch on `_has_attribute?(inheritance_column)`
  // (inheritance.rb:61) so a stray `type` key on a non-STI model can never
  // dispatch. `inheritance_column` defaults to "type"; the column-aware
  // `_has_attribute?` (declared attribute or reflected DB column) is the guard.
  // Rails' `attribute_types` loads the schema synchronously on first touch and so
  // is never cold; trails cannot query from a synchronous constructor, so an
  // explicit `stiEnabled` assignment stands in over the window where a canonical
  // STI class's `type` column has not reflected yet.
  // `inheritance_column = nil` disables STI even when a real `type` column exists.
  const col = modelClass.inheritanceColumn;
  if (col === null) return null;
  if (!modelClass._hasAttribute(col) && !stiEnabled(modelClass)) return null;

  const resolve = (source: unknown): typeof Base | null => {
    if (!source || typeof source !== "object") return null;
    const cast = castStiValueFromAttrs(modelClass, source as Record<string, unknown>, col);
    if (!cast.found) return null;
    const typeName = cast.value as string;
    const found = findStiClassInHierarchy(modelClass, typeName);
    if (found) return found;
    // Rails' subclass_from_attributes calls find_sti_class unconditionally
    // (inheritance.rb:331-340), which resolves a registered subclass — including
    // one not tracked as a descendant — or raises SubclassNotFound for an
    // out-of-hierarchy/unknown type.
    return findStiClass(modelClass, typeName);
  };

  // Rails Inheritance::ClassMethods#new tries each source in turn, stopping at
  // the first that resolves a subclass.
  let subclass = resolve(attrs);
  if (!subclass) {
    const scopeAttrs = (
      modelClass.currentScope?.() as { scopeForCreate?(): unknown } | null
    )?.scopeForCreate?.();
    subclass = resolve(scopeAttrs);
  }
  if (!subclass && isBaseClass(modelClass)) {
    subclass = resolve(modelClass.columnDefaults);
  }
  return subclass;
}
