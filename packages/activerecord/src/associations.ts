import type { Base } from "./base.js";
import type { Relation } from "./relation.js";
import { SpellChecker } from "@blazetrails/did-you-mean";
import type { CollectionProxy, AssociationProxy } from "./associations/collection-proxy.js";
import { _CollectionProxyCtor } from "./associations/collection-proxy-slot.js";
import { hasDefaultScopeOverride } from "./scoping/default.js";
import {
  delegateArrayMethod,
  delegateEnumerableMethod,
  classMethodDelegator,
  generateRelationMethod,
  uncacheableMethods,
  DELEGATION_RECORD_METHOD_NAMES,
  delegateRecordMethodSync,
} from "./relation/delegation.js";
import { rubyInspectArray } from "./relation/ruby-inspect.js";
import { qualifiedName } from "./inheritance.js";
// Re-export the slot's setter so the package entry and other internal
// callers don't need to import the slot module directly.
export { _setCollectionProxyCtor } from "./associations/collection-proxy-slot.js";

/**
 * Eagerly initializes the association modules needed for the
 * constructor-slot registration cycle used by `association()` and
 * `CollectionProxy`. Delegates to `initializeAssociations()`.
 *
 * **Rails parity note:** Rails' `Associations.eager_load!` uses Ruby's
 * `ActiveSupport::Autoload` to force-load `BelongsToAssociation`,
 * `HasManyAssociation`, `Preloader`, `JoinDependency`, `AssociationScope`,
 * etc. In TypeScript/ESM there is no `autoload` — those modules are
 * already statically imported throughout the codebase and therefore
 * always present. The only genuinely lazy initialization in our port is
 * the `CollectionProxy` constructor-slot, which this method resolves.
 *
 * Mirrors: ActiveRecord::Associations.eager_load!
 */
export async function eagerLoadBang(): Promise<void> {
  await initializeAssociations();
}

/**
 * Explicit initialization hook for subpath consumers.
 *
 * The package entry (`@blazetrails/activerecord`) loads
 * CollectionProxy eagerly so `association()` works out of the box.
 * Consumers who deep-import `@blazetrails/activerecord/associations`
 * without touching the entry won't trigger that registration; calling
 * `await initializeAssociations()` once before `association()` is the
 * supported alternative.
 *
 * Uses a dynamic `import()` so it doesn't participate in the static
 * dependency cycle (associations → CP → Relation → Base →
 * associations) that forced the late-binding in the first place.
 *
 * @noRailsEquivalent trails-only ESM module-cycle escape hatch with no Rails
 * analogue: `initialize_associations` is defined nowhere in the Rails source
 * (verified by grep over vendor/rails). The associations -> CollectionProxy ->
 * Relation -> Base -> associations cycle forces CollectionProxy registration to
 * be late-bound; the package entry does it eagerly, and this is the supported
 * explicit hook for consumers who deep-import
 * `@blazetrails/activerecord/associations` without touching the entry. Ruby's
 * require/autoload resolves such cycles at load time, so there is nothing to
 * port. Public by intent (a documented consumer hook), so marking it internal
 * would be inaccurate.
 */
export async function initializeAssociations(): Promise<void> {
  // Load all late-binding slots. `association-relation.js` imports
  // `collection-proxy.js` for the late-bind ctor setter, so importing
  // AR first also registers CP transitively; we still import CP
  // explicitly as a belt-and-suspenders guarantee. DJAS registers its
  // scope builder via the same slot pattern (_scope-slots.ts) so it is
  // TDZ-safe here — all static imports are resolved by the time this
  // function is called.
  await Promise.all([
    import("./associations/collection-proxy.js"),
    import("./association-relation.js"),
    import("./associations/disable-joins-association-scope.js"),
  ]);
}
import { ConfigurationError, NameError } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { strictLoadingViolationBang } from "./core.js";
import { StatementCache } from "./statement-cache.js";
import { HasManyThroughAssociationNotFoundError } from "./associations/errors.js";
import {
  AssociationNotFoundError,
  InverseOfAssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
} from "./associations/errors.js";
import { AssociationScope, invokeScopeLambda } from "./associations/association-scope.js";
import type { Association as AssociationInstance } from "./associations/association.js";
import {
  validateThroughReflection,
  routeThroughCheckValidity,
} from "./associations/validate-through-reflection.js";
import { joinTableName as joinHabtmTableNames } from "./migration/join-table.js";
export { joinTableName as joinHabtmTableNames } from "./migration/join-table.js";
import {
  underscore,
  singularize,
  pluralize,
  camelize,
  foreignKey as deriveForeignKey,
} from "@blazetrails/activesupport";
import { registerSubclass, polymorphicName } from "./inheritance.js";
import { flushPendingCounterCacheColumns } from "./counter-cache.js";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { HasMany as HasManyBuilder } from "./associations/builder/has-many.js";
import { HasAndBelongsToMany as HabtmBuilder } from "./associations/builder/has-and-belongs-to-many.js";
import { addAutosaveAssociationCallbacks } from "./autosave-association.js";
import * as Reflection from "./reflection.js";
import type { AssociationReflection } from "./reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";
import { foreignKeyPresentFor } from "./associations/foreign-association.js";
import { throughForeignKeyPresent } from "./associations/through-association.js";

/**
 * One `before_add`/`after_add`/`before_remove`/`after_remove` entry. Mirrors
 * the three arms Rails' `Builder::CollectionAssociation.define_callback`
 * accepts (builder/collection_association.rb:44-52): a method name on the
 * owner, a callable, or an object that responds to the callback kind itself.
 */
export type CollectionCallback<K extends string> =
  | string
  | ((owner: Base, record: Base) => void | false)
  | { [P in K]: (owner: Base, record: Base) => void | false };

/**
 * Association options.
 */
export interface AssociationOptions {
  foreignKey?: string | string[];
  className?: string;
  primaryKey?: string | string[];
  queryConstraints?: string[];
  dependent?: "destroy" | "nullify" | "delete" | "restrictWithException" | "restrictWithError";
  inverseOf?: string | false;
  through?: string;
  source?: string;
  sourceType?: string;
  polymorphic?: boolean;
  as?: string;
  counterCache?: boolean | string;
  touch?: boolean | string | string[];
  autosave?: boolean;
  scope?: (rel: any, owner?: any) => any;
  validate?: boolean;
  required?: boolean;
  optional?: boolean;
  /** belongs_to-only: sets the association from this block when the foreign
   * key is nil. Mirrors Rails' before_validation default
   * (associations/builder/belongs_to.rb#add_default_callbacks): the block fills
   * the FK before validation, so `belongsTo(name, { default, optional: false })`
   * saves cleanly — the required-association presence validation sees the
   * defaulted target. A possibly-async block (e.g. `() => Developer.first()`) is
   * resolved in an async pre-validation phase on save; a synchronous block also
   * fires during a standalone `valid?`. */
  default?: (owner: Base) => Base | null | Promise<Base | null>;
  beforeAdd?: CollectionCallback<"beforeAdd"> | CollectionCallback<"beforeAdd">[];
  afterAdd?: CollectionCallback<"afterAdd"> | CollectionCallback<"afterAdd">[];
  beforeRemove?: CollectionCallback<"beforeRemove"> | CollectionCallback<"beforeRemove">[];
  afterRemove?: CollectionCallback<"afterRemove"> | CollectionCallback<"afterRemove">[];
  /** Mixes methods into the association's CollectionProxy and every
   * relation spawned from it, mirroring Rails' `has_many :things,
   * extend: ModA` / `extend: [ModA, ModB]`. A module is an object whose
   * function values become callable on `owner.things` (and
   * `owner.things.where(...)`). Rails always stores extensions as Modules
   * — `Reflection#extensions` is `Array(options[:extend])`, and even the
   * block form (`has_many :things do ... end`) is compiled to a Module
   * via `Module.new(&block)` — so the TS surface is the object-of-methods
   * form, not a relation-mutating callback. */
  extend?:
    | Record<string, (...args: unknown[]) => unknown>
    | Record<string, (...args: unknown[]) => unknown>[];
  /** Load through associations via multiple queries instead of JOIN.
   * Currently a no-op since through loading already uses multi-query by default.
   * Exists for Rails API parity — Rails uses this to switch between JOIN and
   * multi-query strategies. */
  disableJoins?: boolean;
  /** HABTM-only: target-side FK column on the join table. Overrides the
   * `class_name.foreign_key` default. Mirrors Rails'
   * `has_and_belongs_to_many :tags, association_foreign_key: ...`. */
  associationForeignKey?: string;
  /** Overrides the column used to store the polymorphic type string.
   * Mirrors Rails' `belongs_to :thing, polymorphic: true, foreign_type: "sponsorable_type"`.
   * When absent the default is `${underscore(associationName)}_type`. */
  foreignType?: string;
  /** When true, records loaded through this association are marked
   * strict-loading, causing further lazy loads on them to raise.
   *
   * Mirrors Rails' `has_many :foo, strict_loading: true` — checked via
   * `reflection.strict_loading?` during query execution. */
  strictLoading?: boolean;
  /** When true (or `:nested_attributes_order`), propagated validation errors
   * include the child record's position in the collection. Mirrors Rails'
   * `index_errors` option on collection associations. */
  indexErrors?: boolean | "nestedAttributesOrder";
}

export interface AssociationDefinition {
  type: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  name: string;
  options: AssociationOptions & { joinTable?: string };
}

/**
 * Structural view of the reflection fields consumed within associations.ts.
 * Avoids importing the concrete `AssociationReflection`/`ThroughReflection`
 * types so the dep arrow stays one-way (this file already imports the
 * Reflection namespace for HABTM registration, but that's value-side only).
 * @internal
 */
export interface ReflectionLike {
  joinForeignKey: string | string[];
  throughReflection?: { joinForeignKey: string | string[] } | null;
  scope?: ((...args: any[]) => any) | null;
  klass: typeof Base;
  activeRecordPrimaryKey?: string | string[];
  isThroughReflection?: () => boolean;
  isNested?: () => boolean;
  sourceReflection?: { belongsTo?: () => boolean; isPolymorphic?: () => boolean } | null;
}

/**
 * Model registry that tracks a monotonic `generation`, bumped whenever a name
 * is bound to a different class (or unbound). Reflections memoize their
 * resolved `klass` alongside the generation it was resolved at, so a
 * re-registration under the same name invalidates every stale memo at once
 * instead of poisoning it permanently. Without this, a test file registering a
 * bespoke model under a canonical name poisons the canonical reflections for
 * the rest of the vitest worker's life.
 * @internal
 */
class ModelRegistry extends Map<string, typeof Base> {
  #generation = 0;

  /** Bumps only on a mutation that can change what a name resolves to. */
  get generation(): number {
    return this.#generation;
  }

  override set(name: string, model: typeof Base): this {
    if (super.get(name) !== model) this.#generation++;
    return super.set(name, model);
  }

  override delete(name: string): boolean {
    const deleted = super.delete(name);
    if (deleted) this.#generation++;
    return deleted;
  }

  override clear(): void {
    if (this.size > 0) this.#generation++;
    super.clear();
  }
}

/**
 * Registry to hold model classes by name. Models must be registered
 * here so associations can resolve class references.
 */
export const modelRegistry = new ModelRegistry();

/**
 * Find the framework `Base` class in `model`'s prototype chain without
 * importing the `Base` value (which would create a module-init cycle). `Base`
 * is the single class that *owns* the static `_modelsByName` map; subclasses
 * inherit it. Falls back to `null` for the (impossible-in-practice) case of a
 * class that never reaches `Base`.
 * @internal
 */
function frameworkBase(model: typeof Base): typeof Base | null {
  let c: unknown = model;
  while (typeof c === "function" && c !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(c, "_modelsByName")) return c as typeof Base;
    c = Object.getPrototypeOf(c);
  }
  return null;
}

/**
 * Throw when a bespoke class is registered under a name a canonical model
 * already owns. The registry is global and never torn down between tests, so
 * such a shadow silently poisons every later test that resolves the name as an
 * association target (a wrong value, not an error). Fires only when the name is
 * in the canonical autoload index AND the class differs, so re-registering the
 * canonical class itself (self-registration or autoload fault-in) still passes.
 * @internal
 */
function guardCanonicalNameShadow(name: string, model: typeof Base): void {
  const canonical = canonicalModelAutoloadIndex?.get(name);
  if (canonical && canonical !== model) {
    throw new Error(
      `registerModel(${JSON.stringify(name)}, …) would shadow the canonical model of the ` +
        `same name in the global registry, poisoning every later test that resolves it as an ` +
        `association target. Use the canonical model, or a distinct non-canonical name.`,
    );
  }
}

/**
 * Register a model class for association resolution.
 *
 * Three forms:
 * - `registerModel(Model)` — register a single class by its `.name`.
 * - `registerModel("Name", Model)` — register under an explicit name.
 * - `registerModel([A, B, C])` — batch-register an array of classes. Each is
 *   registered as in the single form, and any STI subclass (one whose direct
 *   prototype is another AR model rather than `Base` itself) is additionally
 *   routed through {@link registerSubclass} so it lands in its parent's
 *   `_subclasses`. STI on the parent must still be enabled explicitly via
 *   `Parent.inheritanceColumn = ...` — the array form does not set it.
 *
 * @noRailsEquivalent trails-only model registry with no Rails analogue:
 * `register_model` is defined nowhere in the Rails source (verified by grep over
 * vendor/rails). Ruby resolves an association's class through constant lookup —
 * Reflection#compute_class (reflection.rb:434 and :490) into Object.const_get,
 * backed by ActiveSupport autoloading — so Rails never registers models
 * anywhere. ESM has no constant namespace to walk and no autoload hook, so
 * trails must be told which classes exist. Deliberately public (re-exported from
 * index.ts) because application code has to call it, so marking it internal
 * would be a lie rather than a fix. Kept in associations.ts because association
 * class resolution is its only consumer path.
 */
export function registerModel(model: typeof Base): void;
export function registerModel(name: string, model: typeof Base): void;
export function registerModel(models: (typeof Base)[]): void;
export function registerModel(
  nameOrModel: string | typeof Base | (typeof Base)[],
  model?: typeof Base,
): void {
  if (Array.isArray(nameOrModel)) {
    for (const m of nameOrModel) {
      registerModel(m);
      // STI subclass: its direct prototype is another AR model, not the
      // framework `Base` (a base model's prototype is `Base` directly). We
      // locate `Base` by walking the chain for the class that *owns*
      // `_modelsByName` — `Base` declares it; every subclass inherits it —
      // rather than importing the `Base` value (that would create an
      // associations.ts ⇄ base.ts module-init cycle).
      const proto = Object.getPrototypeOf(m) as typeof Base;
      if (proto && proto !== Function.prototype && proto !== frameworkBase(m)) {
        registerSubclass(m);
      }
    }
    return;
  }
  if (typeof nameOrModel === "string") {
    if (!model) throw new Error("registerModel(name, model) requires a model class");
    guardCanonicalNameShadow(nameOrModel, model);
    modelRegistry.set(nameOrModel, model);
    model._modelsByName.set(nameOrModel, model);
    // Attach registry key so counter-cache pending-map lookup can match it.
    const keys: string[] = model._registryKeys ?? [];
    if (!keys.includes(nameOrModel)) keys.push(nameOrModel);
    model._registryKeys = keys;
    flushPendingCounterCacheColumns(model);
  } else {
    guardCanonicalNameShadow(nameOrModel.name, nameOrModel);
    modelRegistry.set(nameOrModel.name, nameOrModel);
    nameOrModel._modelsByName.set(nameOrModel.name, nameOrModel);
    // A namespaced model carries its Ruby module path via `static moduleName`;
    // derive the `::`-qualified registry key from it (e.g.
    // "MyApplication::Billing::Firm") so cross-namespace `className` resolution
    // finds the flattened JS class without a hand-written `registerModel(name, …)`
    // call. `qualifiedName` returns the bare `.name` for non-namespaced models,
    // so the extra registration only happens when it actually differs.
    const qualified = qualifiedName(nameOrModel);
    if (qualified !== nameOrModel.name) {
      registerModel(qualified, nameOrModel);
    }
    flushPendingCounterCacheColumns(nameOrModel);
  }
}

/**
 * Zeitwerk analog: a fallback name→class index populated by the canonical
 * test-models barrel. When {@link resolveModel} or reflection's `computeClass`
 * miss {@link modelRegistry}, they consult this index to autoload a canonical
 * model by name — the trails equivalent of Rails autoloading a constant on
 * first reference from an already-indexed `test/models/` tree. It stays
 * undefined in production (no index installed), so a genuine miss still throws.
 * @internal
 */
let canonicalModelAutoloadIndex: ReadonlyMap<string, typeof Base> | undefined;

/**
 * Install the eager canonical-model autoload index. Called once, as a side
 * effect, by the canonical test-models index module.
 * @internal
 */
export function _setCanonicalModelAutoloadIndex(index: ReadonlyMap<string, typeof Base>): void {
  canonicalModelAutoloadIndex = index;
}

/**
 * Look up a model by name, falling back to the canonical autoload index on a
 * {@link modelRegistry} miss. A hit in the index is registered so subsequent
 * lookups resolve directly from the registry. Returns undefined on a genuine
 * miss (name in neither the registry nor the index).
 * @internal
 */
export function lookupModelWithAutoload(name: string): typeof Base | undefined {
  const model = modelRegistry.get(name);
  if (model) return model;
  const autoloaded = canonicalModelAutoloadIndex?.get(name);
  if (autoloaded) {
    registerModel(autoloaded);
    return autoloaded;
  }
  return undefined;
}

/**
 * Resolve a model class by name.
 *
 * @internal Registry lookup, not a Rails method. Ruby resolves association
 * class names through constant lookup — `Reflection#compute_class`
 * (`reflection.rb:434` and `:490`) into `Object.const_get` — so `resolve_model`
 * is defined nowhere in the Rails source; trails needs an explicit registry
 * because ESM has no constant namespace to walk. Sits between the
 * already-`@internal` {@link lookupModelWithAutoload} and
 * {@link resolveAssocClass}, which are the same invention.
 */
export function resolveModel(name: string): typeof Base {
  const model = lookupModelWithAutoload(name);
  if (!model) {
    throw new NameError(`uninitialized constant ${name}`);
  }
  return model;
}

/**
 * Resolve the target model for an association using the rich reflection's
 * namespace-aware klass when available, falling back to flat resolveModel.
 * Skips `.klass` for polymorphic associations (checked via `isPolymorphic()`)
 * because polymorphic reflections intentionally throw on `.klass` access.
 * Non-polymorphic errors (e.g. not-an-AR-subclass) propagate unchanged.
 * @internal
 */
export function resolveAssocClass(
  recordOrClass: Base | typeof Base,
  assocName: string,
  className: string,
): typeof Base {
  const ctor = (
    typeof recordOrClass === "function" ? recordOrClass : recordOrClass.constructor
  ) as typeof Base & {
    _reflectOnAssociation?: (
      name: string,
    ) => { klass?: typeof Base; isPolymorphic?: () => boolean } | null;
  };
  const refl = ctor._reflectOnAssociation?.(assocName);
  // Skip .klass for polymorphic associations — it throws by design.
  // All other errors (e.g. not-an-AR-subclass) must propagate.
  if (refl && !refl.isPolymorphic?.()) {
    const richKlass = refl.klass;
    if (richKlass) return richKlass;
  }
  return resolveModel(className);
}

/**
 * Validate that an inverse_of association exists on the target model.
 * Throws InverseOfAssociationNotFoundError if not found.
 *
 * @internal
 */
export function validateInverseOf(
  targetModel: typeof Base,
  assocName: string,
  inverseOf: string,
): void {
  const targetAssocs: AssociationDefinition[] = targetModel._associations ?? [];
  if (targetAssocs.length === 0) return;
  if (targetAssocs.some((a) => a.name === inverseOf)) return;

  const dictionary = targetAssocs.map((a) => a.name);
  const corrections = _correctNames(dictionary, inverseOf);
  throw new InverseOfAssociationNotFoundError(assocName, inverseOf, corrections, targetModel.name);
}

/**
 * Resolve the inverse association name for a load — combines an explicit
 * `inverseOf` option with reflection-based automatic detection so both
 * paths wire the parent reference back onto the child.
 *
 * Mirrors: ActiveRecord::Reflection::AssociationReflection#inverse_name
 *
 * @internal
 */
export function _resolveInverseName(
  ownerCtor: typeof Base,
  assocName: string,
  options: AssociationOptions,
): string | null {
  if (options.inverseOf === false) return null;
  // Explicit inverseOf wins everywhere, including polymorphic belongs_to
  // (where automatic detection can't pick a target).
  if (typeof options.inverseOf === "string") return options.inverseOf;
  if (options.polymorphic) return null;
  const refl = ownerCtor._reflectOnAssociation?.(assocName);
  return refl?.inverseName?.() ?? null;
}

/**
 * Cache `owner` on `child` under `inverseName`. Centralizes inverse caching so
 * every load/set path routes a singular inverse to its holder and a collection
 * inverse to its proxy.
 *
 * Mirrors: ActiveRecord::Associations::Association#inversed_from
 *
 * @internal
 */
export function _wireInverseAssociation(owner: Base, child: Base, inverseName: string): void {
  const childCtor = child.constructor as typeof Base;
  const inverseRefl = childCtor._reflectOnAssociation?.(inverseName);
  // Rails `BelongsToAssociation#invertible_for?` (belongs_to_association.rb:159):
  // when the inverse is a has_many, wiring is gated on `klass.has_many_inversing`.
  // Without the flag, Rails does NOT touch the parent collection. Route the
  // write through the proxy's `_wireInverseTarget` so the in-memory target and
  // `@replaced_or_added_targets` are maintained in one place (the proxy). This removes the C2 (#2591)
  // seam that used to reach into `proxy._replacedOrAddedTargets` from here.
  if (inverseRefl?.macro === "hasMany") {
    if (!childCtor.hasManyInversing) return;
    const proxy = association(child, inverseName) as unknown as {
      _wireInverseTarget: (record: Base) => void;
    };
    proxy._wireInverseTarget(owner);
    return;
  }
  _cacheSingularTarget(child, inverseName, owner);
}

/**
 * Write a singular (belongs_to / has_one) target onto the record's
 * `SingularAssociation` holder, reached via `record.association(name)` and
 * stored there as `target` — the trails analog of Rails' `@target` living on
 * the association object (`@association_cache[name]`). Only singular inverses
 * get the holder write; a collection inverse name is left to its proxy.
 *
 * RFC 0022: writers and inverse-of seeders route through the holder, which is
 * the single source of truth — surfaced to readers via `Base#_associationCache`.
 *
 * @internal
 */
export function _cacheSingularTarget(record: Base, assocName: string, target: Base | null): void {
  const macro = (record.constructor as typeof Base)._reflectOnAssociation?.(assocName)?.macro;
  if (macro === "belongsTo" || macro === "hasOne") {
    const assoc = record.association(assocName);
    // Route through `inversedFrom`, not `setTarget`, to mirror Rails'
    // `set_inverse_instance` → `inversed_from`. For belongs_to this runs
    // `replace_keys` (writing the owner FK) *before* the `_staleState`
    // snapshot taken by `loadedBang`, so `isStaleTarget()` is authoritative
    // for the cached target rather than over-reporting against a nil/stale FK.
    // For has_one the FK lives on the target, so `inversedFrom` is equivalent
    // to `setTarget` (assign + loadedBang) with no owner FK write.
    assoc.inversedFrom(target);
    // Flag as an explicit assignment so the inner loaders' short-circuit
    // (`_loadedSingularTarget`) distinguishes it from a memoized query load.
    (assoc as unknown as { _explicitTarget: boolean })._explicitTarget = true;
    return;
  }
  // Undeclared inverse name (an inverse reached via automatic-inverse wiring
  // whose reflection isn't a declared singular association): cache the value on
  // a minimal loaded holder keyed by the name for ad-hoc inverses. Surfaced
  // through `Base#_associationCache`.
  const existing = record._associationInstances.get(assocName) as
    | { _setTargetFromLoader(t: unknown): void; _explicitTarget?: boolean }
    | undefined;
  if (existing) {
    existing._setTargetFromLoader(target);
    existing._explicitTarget = true;
  } else {
    record._associationInstances.set(assocName, {
      target,
      _explicitTarget: true,
      isLoaded: () => true,
      setTarget(this: { target: unknown }, t: unknown) {
        this.target = t;
      },
    } as never);
  }
}

/**
 * Read the explicitly-set singular target for `assocName` — the short-circuit
 * the inner `loadBelongsTo` / `loadHasOne` loaders consult before querying.
 *
 * RFC 0022: singular writers and inverse-of seeders store their target on the
 * `SingularAssociation` holder (`record.association(name).target`, Rails'
 * `@target`) as the source of truth. These inner loaders run *inside* the
 * holder's own `loadTarget` (`doAsyncFindTarget`) and from sibling
 * through-writers, where the holder is not yet loaded — so a loaded holder here
 * carries an explicit set/seed (or a prior explicit load), the short-circuit we
 * want, plus the `_preloadedAssociations` fallback. Returns a one-key box
 * (`{ value }`) on a hit so a loaded-nil target (null) is distinguished from a
 * miss.
 *
 * @internal
 */
export function _loadedSingularTarget(
  record: Base,
  assocName: string,
): { value: Base | null } | null {
  const instance = record._associationInstances.get(assocName) as
    | { isLoaded(): boolean; _explicitTarget?: boolean; target?: Base | null }
    | undefined;
  // Only an *explicit* set/seed short-circuits — a prior query load on the
  // holder must re-query (matches the old `_cachedAssociations` write-shadow,
  // which never recorded query loads).
  if (instance?.isLoaded() && instance._explicitTarget) {
    return { value: instance.target ?? null };
  }
  return _preloadedHolderTarget(record, assocName) as { value: Base | null } | null;
}

/**
 * Read the preloaded/eager-loaded target for `assocName` from the real holder
 * (`record.association(name)`, Rails' `@target`) — the RFC 0022 successor to the
 * legacy `record._preloadedAssociations` shadow `Map`. Returns a one-key box
 * (`{ value }`) on a hit so a preloaded-nil target (the preloader stores
 * `setTarget(null)` for a belongs_to that resolved to no record) is
 * distinguished from a miss; gates on `_loadedFromPreload` (not bare
 * `isLoaded()`) so a lazy query load on the holder still re-queries.
 *
 * @internal
 */
export function _preloadedHolderTarget(
  record: Base,
  assocName: string,
): { value: Base | Base[] | null } | null {
  const instance = record._associationInstances.get(assocName) as
    | { isLoaded(): boolean; _loadedFromPreload?: boolean; target?: Base | Base[] | null }
    | undefined;
  if (instance?.isLoaded() && instance._loadedFromPreload) {
    return { value: instance.target ?? null };
  }
  return null;
}

/**
 * Set the inverse association instance on a freshly built/created collection
 * member, caching the owner on the child under the resolved inverse name.
 * Mirrors `ActiveRecord::Associations::Association#set_inverse_instance`, called
 * from `initialize_attributes` (so the inverse is wired before any build/create
 * block runs) and from `replace_on_target`.
 *
 * @internal
 */
export function _setCollectionInverseInstance(
  owner: Base,
  assocName: string,
  options: AssociationOptions,
  record: Base,
): void {
  const ownerCtor = owner.constructor as typeof Base;
  const inverseName = _resolveInverseName(ownerCtor, assocName, options);
  if (inverseName) _wireInverseAssociation(owner, record, inverseName);
}

/**
 * @internal
 * Builds a HasManyThroughAssociationNotFoundError with DidYouMean-style
 * `corrections` derived from the owner's existing association names —
 * mirrors `ActiveRecord::HasManyThroughAssociationNotFoundError#corrections`.
 */
export function _hmtNotFound(
  ctor: typeof Base,
  assocName: string,
  through: string,
): HasManyThroughAssociationNotFoundError {
  const assocs: AssociationDefinition[] = ctor._associations ?? [];
  const dictionary = assocs.map((a) => a.name).filter((n) => n !== assocName);
  const corrections = _correctNames(dictionary, through);
  return new HasManyThroughAssociationNotFoundError(ctor.name, through, assocName, corrections);
}

/**
 * @internal
 * Builds an AssociationNotFoundError with DidYouMean-style `corrections`
 * derived from the record's declared association names — mirrors
 * `ActiveRecord::AssociationNotFoundError#corrections`, which spell-checks
 * the failing name against `record.class.reflections.keys`.
 */
export function _associationNotFound(record: Base, name: string): AssociationNotFoundError {
  const assocs: AssociationDefinition[] = (record.constructor as typeof Base)._associations ?? [];
  const dictionary = assocs.map((a) => a.name);
  const corrections = _correctNames(dictionary, name);
  return new AssociationNotFoundError(record, name, corrections);
}

/**
 * @internal
 * Shared helper for did_you_mean-style name corrections used by the
 * association error call sites (and reflection.ts).
 */
export function _correctNames(dictionary: string[], input: string): string[] {
  return new SpellChecker({ dictionary }).correct(input);
}

/**
 * Associations mixin — adds belongsTo, hasOne, hasMany to a model class.
 *
 * Mirrors: ActiveRecord::Associations::ClassMethods
 */
export class Associations {
  static _associations: AssociationDefinition[] = [];

  /**
   * Define a belongs_to association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#belongs_to
   */
  static belongsTo(name: string, options: AssociationOptions = {}): void {
    BelongsToBuilder.build(this, name, options as Record<string, unknown>);
  }

  /**
   * Define a has_one association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_one
   */
  static hasOne(name: string, options: AssociationOptions = {}): void {
    HasOneBuilder.build(this, name, options as Record<string, unknown>);
  }

  /**
   * Define a has_many association.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_many
   */
  static hasMany(name: string, options: AssociationOptions = {}): void {
    HasManyBuilder.build(this, name, options as Record<string, unknown>);
  }

  /**
   * Define a has_and_belongs_to_many association.
   *
   * Like Rails, this internally creates an anonymous join model and wires up
   * two has_many associations (a "middle" pointing at the join model and a
   * "through" pointing at the target). All HABTM operations then go through
   * normal ActiveRecord persistence on the join model — no raw SQL.
   *
   * Mirrors: ActiveRecord::Associations::ClassMethods#has_and_belongs_to_many
   */
  static hasAndBelongsToMany(
    name: string,
    options: AssociationOptions & { joinTable?: string } = {},
  ): void {
    // `class_name` Symbol coercion is handled generically in
    // MacroReflection#normalizeOptions (mirroring Rails' AbstractReflection#
    // class_name `.to_s`), but the HABTM builder reads `options.className`
    // directly for foreign-key and join-table derivation — before any
    // reflection is constructed — so the same coercion is repeated here.
    const rawClassName = (options as { className?: unknown }).className;
    if (typeof rawClassName === "symbol") {
      options = { ...options, className: rawClassName.description ?? "" };
    }
    HabtmBuilder.build(this, name, options as Record<string, unknown>, {
      defaultJoinTableName,
      singleFk,
      createHabtmJoinModel,
      modelRegistry,
    });
    // Rails registers the autosave-association callbacks for every HABTM
    // (the underlying has_many :through is built via the standard
    // `has_many` builder, which always calls `define_callbacks`). Wire it
    // here so `validate: false` is observable (`treasure.valid?` must not
    // run child validations) regardless of an explicit `autosave:` option.
    const habtmReflection = Reflection._reflectOnAssociation(this as any, name);
    if (habtmReflection) addAutosaveAssociationCallbacks(this, habtmReflection);
  }
}

/**
 * Returns true if an Association instance (the wrapper that owns
 * load/build/create for a given macro) has already been built for this
 * record. Rails' `@association_cache` stores wrapper instances, populated
 * by `record.association(name)` — see
 * `activerecord/lib/active_record/associations.rb:51-67`. Our equivalent
 * caches are `_associationInstances` (singular: belongsTo/hasOne) and
 * `_collectionProxies` (collection: hasMany/habtm).
 *
 * Mirrors: ActiveRecord::Associations#association_cached?
 */
export function isAssociationCached(record: Base, assocName: string): boolean {
  if (record._associationInstances.has(assocName)) return true;
  return record._collectionProxies.has(assocName);
}

/**
 * Decide whether a `:through` reflection's load can route through
 * AssociationScope's JOIN-based path. PR 3b only handles the simplest
 * shape: source is non-polymorphic `belongsTo`, no `sourceType`, no
 * `disableJoins`. Other shapes (has_many/has_one source, polymorphic
 * source, sourceType, disable-joins) need machinery this PR doesn't
 * yet provide and stay on the existing 2-step IN-list loaders.
 *
 * Shared by findTarget and loadHasOne so the gating rules can't drift.
 */
export function _canRouteThroughViaAssociationScope(
  reflection: ReflectionLike | null | undefined,
  options: AssociationOptions,
): boolean {
  if (!reflection) return false;
  if (options.disableJoins) return false;
  // Only ThroughReflection has a real distinct sourceReflection.
  // AssociationReflection.sourceReflection returns `this` (line 793 in
  // reflection.ts), which means HABTM and other non-through reflections
  // would falsely match. Gate explicitly on isThroughReflection so HABTM's
  // anonymous-join-model machinery (with its own load path) keeps using
  // the existing 2-step loaders.
  if (typeof reflection.isThroughReflection !== "function" || !reflection.isThroughReflection()) {
    return false;
  }
  const src = reflection.sourceReflection;
  if (!src) return false;
  // Nested-through (through-a-through) shapes — either the throughReflection
  // OR the sourceReflection is itself a ThroughReflection. Rails routes ALL
  // nested-through associations through the JOIN-based AssociationScope:
  // `reflection.chain` flattens any nesting into a uniform list of join
  // steps (association_scope.rb `add_constraints` walks that list with no
  // `nested?` special-case). Route them here unconditionally — the
  // per-step poly guards below target the chain-length-2 direct-source
  // shape and don't apply to the flattened multi-step walk.
  if (typeof reflection.isNested === "function" && reflection.isNested()) return true;
  // Polymorphic has_many / has_one source (rare): the chain walker
  // would need inversion machinery not present in PR 3c. Polymorphic
  // belongsTo source WITH sourceType is routed — AssociationScope's
  // nextChainScope now uses ThroughReflection#joinPrimaryKeyFor(klass)
  // so the resolved sourceType class's PK drives the JOIN.
  if (
    typeof src.isPolymorphic === "function" &&
    src.isPolymorphic() &&
    (typeof src.belongsTo !== "function" || !src.belongsTo())
  ) {
    return false;
  }
  // Polymorphic belongsTo source requires sourceType to resolve the
  // target class. Without sourceType the JOIN can't pick a single
  // target table — fall back to the 2-step loader which handles that
  // by grouping through records by type.
  if (typeof src.isPolymorphic === "function" && src.isPolymorphic() && !options.sourceType) {
    return false;
  }
  return true;
}

/**
 * Record-aware routing decision for a `:through` load. Layers the owner's
 * persistence state on top of the structural `_canRouteThroughViaAssociationScope`
 * gate.
 *
 * A nested-through association on an UNSAVED owner is kept on the 2-step
 * `HasManyThroughAssociation#findTarget` / IN-subquery loader: the SQL JOIN can only see through
 * rows already in the database, not an in-memory-assigned through target
 * (`post.author = mary` before save). Rails resolves those from the loaded
 * through target via `find_target?`; our 2-step loader mirrors that. Once the
 * owner is persisted the JOIN path (Rails' flattened `reflection.chain` walk)
 * is authoritative. Non-nested shapes route regardless of owner state — their
 * through rows only exist once the owner has a PK, so an unsaved owner
 * short-circuits to an empty result either way.
 * @internal
 */
export function _routeThroughViaAssociationScope(
  record: Base,
  reflection: ReflectionLike | null | undefined,
  options: AssociationOptions,
): boolean {
  if (!_canRouteThroughViaAssociationScope(reflection, options)) return false;
  if (record.isNewRecord() && typeof reflection?.isNested === "function" && reflection.isNested()) {
    return false;
  }
  return true;
}

/**
 * The owner-adjacent step of a through chain. Rails orders `reflection.chain`
 * target→owner, so the LAST element carries the owner's key column in its
 * `joinForeignKey` — the column the null-FK short-circuit must read to decide
 * whether the owner is loadable. For a simple (chain-length-2) through that's
 * the through_reflection; for a nested-through-through the through_reflection
 * is itself a through whose `joinForeignKey` delegates to its own source (a
 * column NOT on the owner), so only `chain.last` reads the right owner column.
 * @internal
 */
export function _ownerChainReflection(reflection: any): any {
  const chain = reflection?.chain;
  return (
    (Array.isArray(chain) && chain.length ? chain[chain.length - 1] : null) ??
    reflection?.throughReflection ??
    reflection ??
    null
  );
}

/**
 * Disable-joins routing gate. Mirrors `_canRouteThroughViaAssociationScope`
 * but for `disable_joins: true` through associations — runs the chain
 * via the Rails-faithful `DisableJoinsAssociationScope` (per-step pluck
 * + IN list) rather than the legacy `HasManyThroughAssociation#findTarget` 2-step.
 *
 * Currently routes: single-column and composite-key through
 * associations (PR #645), polymorphic-source + `sourceType`
 * through-associations (PR #661), and nested-through
 * (`has_many :through → has_many :through`) associations (this PR).
 * Rails' DJAS has no routing gate at all and handles each shape via
 * the generic chain walk — `reflection.chain` flattens nested-through
 * into a straight list of reflection steps, and `getChain` / the
 * reverseChain walk iterate that list uniformly.
 *
 * @internal
 */
export function _canRouteThroughViaDisableJoinsAssociationScope(
  reflection: ReflectionLike | null | undefined,
  options: AssociationOptions,
): boolean {
  if (!reflection) return false;
  if (!options.disableJoins) return false;
  if (typeof reflection.isThroughReflection !== "function" || !reflection.isThroughReflection())
    return false;
  const src = reflection.sourceReflection;
  if (!src) return false;
  // `sourceType` must pair with a polymorphic source. Rails' own
  // reflection validation rejects `has_many :through` with a
  // polymorphic source and no `source_type`
  // (`HasManyThroughAssociationPolymorphicSourceError`), and `source_type`
  // with a non-polymorphic source injects a useless
  // `PolymorphicReflection` whose `foreignType` is null
  // (reflection.ts:544) — `_sourceTypeScope()` would emit
  // `where({[null]: sourceType})` (invalid SQL). Reject both
  // mismatches so the fallback loader handles them predictably:
  // - polymorphic source without sourceType → missing type filter,
  //   through-step pluck could mix ids across polymorphic targets.
  // - sourceType without polymorphic source → no valid type column.
  const srcIsPolymorphic = typeof src.isPolymorphic === "function" && src.isPolymorphic();
  if (srcIsPolymorphic !== (options.sourceType != null)) return false;
  // Composite-key through associations are now supported by DJAS'
  // `_addConstraintsDj`, which builds an Arel `OR`-of-`AND` predicate
  // (`(c1=v1a AND c2=v1b) OR ...`) for the chain walk — same shape
  // counter-cache.ts#buildPkPredicate uses. The previous gate that
  // bailed on multi-column joinPrimaryKey / joinForeignKey is gone —
  // the chain walk handles both single and composite shapes.
  return true;
}

/**
 * Rails' `klass.scope_for_association` — returns the association-aware base
 * relation for the target model. Unlike `all()`, this deliberately drops the
 * enclosing `current_scope`: when a current_scope is active it returns
 * `default_scoped` off a fresh relation (named.rb:36-42), so only default
 * scopes apply to association reads, never the caller's `.scoping` block.
 * `scopeForAssociation` is wired onto Base via `extend()` but its `this:
 * NamedHost` constraint doesn't fully overlap `typeof Base` statically, so
 * the call site needs a structural cast. Centralising it here avoids
 * repeating the cast at every loader.
 * @internal
 */
export function _scopeForAssociation(model: typeof Base): Relation<Base> {
  return (
    (model as unknown as { scopeForAssociation?(): Relation<Base> }).scopeForAssociation?.() ??
    model.all()
  );
}

/**
 * Apply a caller-supplied association `scope:` lambda to a built relation.
 *
 * Mirrors Rails' `AssociationScope#eval_scope`
 * (`activerecord/lib/active_record/associations/association_scope.rb:169-172`):
 *
 *   relation.instance_exec(owner, &scope) || relation
 *
 * The owner is passed as a positional arg so JS scopes can declare
 * `(rel, owner) => rel.where({user_id: owner.id})` — arity-0/1 scopes
 * (the common `(rel) => rel.where(...)` shape used throughout this
 * codebase) silently ignore the extra argument. A falsy return falls
 * back to the input relation, matching Rails' `|| relation` so scopes
 * with conditional bodies (`if owner.foo then rel.where(...); end`)
 * don't accidentally null out the chain.
 *
 * When `reflectionScope` is provided, skip application if `scope` is
 * the exact same function reference. AssociationScope already merges
 * `reflection.scope` (the macro-time lambda) via `scopeFor`; re-applying
 * would double-merge. Callers that synthesize a NEW lambda (e.g.
 * `HasManyThroughAssociation#findTarget` wrapping with `sourceType` filtering) pass a
 * different reference and still run.
 *
 * @internal
 */
export function applyAssociationScope<R>(
  rel: R,
  scope: ((this: R, rel: R, owner: Base) => R | false | null | undefined) | null | undefined,
  owner: Base,
  reflectionScope?: unknown,
): R {
  if (!scope) return rel;
  if (reflectionScope !== undefined && scope === reflectionScope) return rel;
  // See `invokeScopeLambda` in association-scope.ts for the arity /
  // `this`-binding contract. `|| rel` (not `??`) mirrors Ruby's
  // `instance_exec(owner, &scope) || relation` — truthiness-based, so a
  // scope returning `false` (idiomatic JS `cond && rel.where(...)`
  // short-circuit) falls back to the input.
  return invokeScopeLambda(scope, rel, owner) || rel;
}

/**
 * Build (or return cached) base AssociationScope. When the owner has
 * a registered `Association` instance for this name, route through
 * its `scope()` so calls hit Rails' `@association_scope`-style
 * memoization (cleared on `reload()`). Without an instance, fall back
 * to a fresh `AssociationScope.scope(...)` build — matches test paths
 * that exercise loaders without going through `record.association(name)`.
 *
 * Disable-joins associations bypass the cache (Rails' `Association#scope`
 * creates a fresh `DisableJoinsAssociationScope` per call,
 * association.rb:107-117). The disableJoins routing is already
 * handled above this call site, so falling through to the fresh
 * `AssociationScope.scope(...)` here only matters if a future caller
 * stretches the contract.
 *
 * @internal
 */
export function _builtAssociationScope(
  record: Base,
  assocName: string,
  reflection: ReflectionLike,
  targetModel: typeof Base,
): Relation<Base> {
  // Materialize the Association instance if missing — proxy paths
  // (CollectionProxy, AssociationProxy) call loaders directly without
  // first going through `record.association(name)`, so an instance-
  // only cache wouldn't hit in the common case. Rails caches on the
  // Association instance too, but Rails' proxy IS the Association so
  // the instance always exists. Calling `record.association(name)`
  // here bridges that gap.
  let instance: { disableJoins?: boolean; scope?: () => unknown } | undefined;
  const assocFn = (record as { association?: (n: string) => unknown }).association;
  if (typeof assocFn === "function") {
    try {
      instance = assocFn.call(record, assocName) as typeof instance;
    } catch (e) {
      // Only swallow the "association not registered" case (low-level
      // test fixtures that bypass `Associations.hasMany.call`). Real
      // bugs in instance construction must surface — otherwise the
      // fresh-build fallback would silently mask them and callers
      // would see mysterious behavior changes.
      if (e instanceof AssociationNotFoundError) {
        instance = undefined;
      } else {
        throw e;
      }
    }
  }
  if (instance && !instance.disableJoins && typeof instance.scope === "function") {
    return instance.scope() as Relation<Base>;
  }
  return AssociationScope.scope({
    owner: record,
    reflection: reflection as never,
    klass: targetModel,
  }) as Relation<Base>;
}

/**
 * Mirror of Rails' `Association#skip_statement_cache?`
 * (`associations/association.rb:391-396`): the singular-load statement cache
 * is bypassed when the compiled SQL/binds would not be stable across owners.
 *
 *   reflection.has_scope? ||
 *   scope.eager_loading? ||
 *   klass.scope_attributes? ||
 *   reflection.source_reflection.active_record.default_scopes.any?
 *
 * `scope.eager_loading?` is not a distinct check: on the singular load path the
 * scope's eager-loading can only come from a reflection/macro scope lambda
 * (subsumed by `reflection.has_scope?` / `options.scope`) or a target default
 * scope carrying `includes` (subsumed by the `klass.scope_attributes?` arm
 * below), so the remaining arms cover it.
 *
 * Multi-step (through) chains statement-cache too, matching Rails — the base
 * scope in `_loadSingularViaStatementCache` is the association's `target_scope`
 * (which folds each intermediate reflection's `scope_for_association`, carrying
 * the join model's STI `type_condition`), so the compiled SQL is complete and
 * stable across owners.
 */
export function _skipSingularStatementCache(
  reflection: ReflectionLike,
  targetModel: typeof Base,
  options: AssociationOptions,
): boolean {
  // `reflection.has_scope?` — a caller-supplied `scope:` lambda (or the
  // reflection's own macro-time scope) is instance-dependent (it receives the
  // owner), so the compiled SQL can't be shared.
  if (options.scope) return true;
  const refl = reflection as {
    hasScope?(): boolean;
    sourceReflection?: { activeRecord?: { defaultScopes?: unknown[] } } | null;
  };
  if (typeof refl.hasScope === "function" && refl.hasScope()) return true;
  // `klass.scope_attributes?` (`scoping/default.rb:55`) =
  // `current_scope || default_scopes.any? || respond_to?(:default_scope)`. A
  // thread-local scope, any default scope, OR a method-form `default_scope`
  // override makes the relation owner/context-dependent. Mirror all three arms
  // (the third — `hasDefaultScopeOverride` — covers a `def self.defaultScope`
  // that never lands in `defaultScopes`).
  const klass = targetModel as unknown as { currentScope?: unknown; defaultScopes?: unknown[] };
  if (
    klass.currentScope ||
    (klass.defaultScopes?.length ?? 0) > 0 ||
    hasDefaultScopeOverride(targetModel)
  ) {
    return true;
  }
  // `source_reflection.active_record.default_scopes.any?` (through chains).
  if ((refl.sourceReflection?.activeRecord?.defaultScopes?.length ?? 0) > 0) return true;
  return false;
}

/**
 * Load a singular association target through a per-association statement
 * cache, mirroring Rails' `Association#find_target` →
 * `reflection.association_scope_cache(klass, owner) { ... }` /
 * `sc.execute(binds, c)` (`associations/association.rb:243-252`).
 *
 * The cache (memoized on the target class via `cachedFindByStatement`,
 * bucketed by the connection's `prepared_statements`) compiles the
 * association scope ONCE — with `params.bind()` Substitutes standing in for
 * the owner's key values — and on every later load only re-binds the owner's
 * current key values (`AssociationScope.getBindValues`), avoiding an
 * AST/SQL rebuild. Emitted SQL and the unordered LIMIT-1 semantics are
 * identical to the `take()` path this replaces.
 */
export async function _loadSingularViaStatementCache(
  record: Base,
  assocName: string,
  reflection: ReflectionLike,
  targetModel: typeof Base,
): Promise<Base | null> {
  // Materialize the Association instance (as `_builtAssociationScope` does on
  // the take() path) so the post-load `syncToAssociationInstance` finds a
  // holder to `setTarget`/`loadedBang` — otherwise the cached target is never
  // marked loaded and every read re-queries. Only the "not registered" case is
  // swallowed; real construction bugs must surface.
  let instance: { targetScope?: () => unknown } | undefined;
  const assocFn = (record as { association?: (n: string) => unknown }).association;
  if (typeof assocFn === "function") {
    try {
      instance = assocFn.call(record, assocName) as typeof instance;
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }
  const connection = (targetModel as unknown as { connection: unknown }).connection;
  // Rails: `sc = reflection.association_scope_cache(klass, owner) { |params|
  // target_scope.merge!(AssociationScope.create { params.bind }.scope(self)) }`.
  // `associationScopeCache` memoizes the compiled StatementCache on the target
  // class (keyed by reflection + polymorphic owner type).
  //
  // The base is the association's `target_scope`, NOT a bare
  // `_scopeForAssociation(targetModel)`. For a through association
  // `ThroughAssociation#target_scope` folds each intermediate reflection's
  // `klass.scope_for_association` into the query (through_association.rb) — this
  // is what carries the join model's STI `type_condition` (e.g.
  // `memberships.type = 1` for a `CurrentMembership` join) that
  // `AssociationScope` alone does not emit. Falling back to
  // `_scopeForAssociation` only when no Association instance exists (low-level
  // loader paths that bypass `record.association(name)`).
  const baseScope = (): Relation<Base> =>
    (typeof instance?.targetScope === "function"
      ? (instance.targetScope() as Relation<Base>)
      : undefined) ?? _scopeForAssociation(targetModel);
  const sc = (
    reflection as unknown as {
      associationScopeCache(klass: typeof Base, owner: Base, block: () => unknown): unknown;
    }
  ).associationScopeCache(targetModel, record, () =>
    StatementCache.create(connection as never, (params) => {
      const as = AssociationScope.create(() => params.bind());
      const built = as.scope({
        owner: record,
        reflection: reflection as never,
        klass: targetModel,
      }) as Relation<Base>;
      return baseScope().merge(built) as never;
    }),
  ) as StatementCache;
  const chain = (reflection as unknown as { chain: never[] }).chain;
  const binds = AssociationScope.getBindValues(record, chain);
  const records = await sc.execute(binds, connection, { allowRetry: true });
  return records[0] ?? null;
}

/**
 * Unsaved-owner / null-PK short-circuit shared by every entry point
 * that runs the DJAS chain walk against an owner record.
 *
 * Why it's correctness-not-just-perf: PredicateBuilder's ArrayHandler
 * folds `where({key: [null]})` into `key IS NULL`. With no guard,
 * DJAS would seed `joinIds = [null]` for an unsaved owner and the
 * first-step WHERE would match orphan through rows whose FK is null,
 * leaking them into the chain as phantom associations.
 *
 * Read from the OUTER reflection's `activeRecordPrimaryKey` —
 * that's the owner's own PK column(s), never a delegated downstream
 * target. `isNewRecord()` covers unsaved records; the explicit
 * PK-null check covers the defensive edge where a saved record
 * somehow has a null composite-PK component.
 *
 * @internal No Rails counterpart (`owner_has_unresolved_through_key` is defined
 * nowhere in the Rails source). Rails spells this guard inline at each site —
 * `if owner.new_record?`, or `CollectionAssociation#null_scope?`
 * (`associations/collection_association.rb:304`) — so there is no method to
 * port. Extracted here only because trails has several entry points into the
 * DJAS chain walk that must not diverge on the guard.
 */
export function ownerHasUnresolvedThroughKey(
  record: Base,
  reflection: ReflectionLike | null | undefined,
): boolean {
  if (record.isNewRecord()) return true;
  const activeRecordPk = reflection?.activeRecordPrimaryKey;
  const ownerPkCols =
    activeRecordPk == null ? [] : Array.isArray(activeRecordPk) ? activeRecordPk : [activeRecordPk];
  return ownerPkCols.some((col) => {
    const v = record._readAttribute(col);
    return v === null || v === undefined;
  });
}

// Returns the built relation BOXED in `{ rel }`. The relation is a
// thenable (Relation#then is a `toArray` shortcut), so returning it bare
// across this async boundary would let `Promise.resolve` adopt it and
// unwrap to a records array. The box defeats that — callers read `.rel`.
async function _buildDisableJoinsScopeRelation(
  record: Base,
  reflection: ReflectionLike | null | undefined,
  options?: AssociationOptions,
): Promise<{ rel: unknown } | null> {
  if (!reflection || ownerHasUnresolvedThroughKey(record, reflection)) return null;
  // Lazy-import to avoid an eager cycle: DJAS imports
  // DisableJoinsAssociationRelation → relation.ts → associations.ts.
  const { DisableJoinsAssociationScope } =
    await import("./associations/disable-joins-association-scope.js");
  const klass = reflection.klass;
  // DJAS.scope() now returns a sync deferred-chain Relation — the
  // async chain walk runs on first toArray(). No more Promise<{relation}>
  // boxing to unwrap.
  let rel: unknown = DisableJoinsAssociationScope.INSTANCE.scope({
    owner: record,
    reflection: reflection as never,
    klass,
  });
  // Apply caller-supplied `options.scope` when it differs from the
  // reflection's own scope — same rule the JOIN-based loaders use.
  // Skipping when equal avoids double-application since DJAS already
  // consumed the reflection's scope via constraints.
  rel = applyAssociationScope(rel as never, options?.scope, record, reflection.scope);
  return { rel };
}

/** @internal */
export async function _loadThroughViaDisableJoinsScope(
  record: Base,
  reflection: ReflectionLike | null | undefined,
  options?: AssociationOptions,
): Promise<Base[]> {
  const built = await _buildDisableJoinsScopeRelation(record, reflection, options);
  if (built == null) return [];
  return (built.rel as { toArray: () => Promise<Base[]> }).toArray();
}

/**
 * Singular (has_one/belongs_to) load through the disable_joins scope.
 *
 * Rails' `SingularAssociation#find_target` (singular_association.rb:47)
 * routes the `disable_joins` branch through `scope.first` →
 * `Relation#first` → `ordered_relation`, which adds `ORDER BY` primary
 * key. So unlike the plural collection load (and unlike the normal
 * non-disable-joins singular branch, which takes an unordered
 * `Array#first`), the disable_joins singular load is ORDERED. Calling
 * `rel.first()` (vs. `toArray()[0]`) preserves that: DJAR#first runs
 * `findNthWithLimit`, applying ORDER BY pk inside the connection shim.
 * @internal
 */
export async function _loadSingularThroughViaDisableJoinsScope(
  record: Base,
  reflection: ReflectionLike | null | undefined,
  options?: AssociationOptions,
): Promise<Base | null> {
  const built = await _buildDisableJoinsScopeRelation(record, reflection, options);
  if (built == null) return null;
  return (built.rel as { first: () => Promise<Base | null> }).first();
}

/**
 * Sync loaded result to the association instance if one exists.
 *
 * @internal
 */
export function syncToAssociationInstance(record: Base, assocName: string, result: unknown): void {
  const holder = record._associationInstances.get(assocName) as
    | {
        _setTargetFromLoader(t: Base | Base[] | null): void;
        _loaderWritebackSuppressed?: number;
        isCollection?(): boolean;
        _mergeLoaderResults?(rows: Base[]): void;
      }
    | undefined;
  if (!holder || holder._loaderWritebackSuppressed) return;
  if (holder.isCollection?.()) {
    holder._mergeLoaderResults?.((result ?? []) as Base[]);
    return;
  }
  holder._setTargetFromLoader(result as Base | Base[] | null);
}

/**
 * Whether lazily loading an association on `record` is a strict-loading
 * violation. Mirrors Rails' `Association#violates_strict_loading?`:
 *
 *   return if @skip_strict_loading
 *   return unless owner.validation_context.nil?
 *   return reflection.strict_loading? if reflection.options.key?(:strict_loading)
 *   owner.strict_loading? && !owner.strict_loading_n_plus_one_only?
 *
 * A reflection-level `strictLoading` option wins over the owner's flag; the
 * `n_plus_one_only` clause lets the first level load lazily.
 *
 * @internal
 */
export function _violatesStrictLoading(record: Base, options: AssociationOptions): boolean {
  if (record._strictLoadingBypassCount) return false;
  if (record._validationContext != null) return false;
  if (Object.prototype.hasOwnProperty.call(options, "strictLoading")) {
    return options.strictLoading === true;
  }
  return record._strictLoading && !record.isStrictLoadingNPlusOneOnly();
}

/**
 * Whether a lazy load would actually reach `find_target` — and therefore
 * `violates_strict_loading?`. Rails gates the strict-loading check inside
 * `find_target`, which `find_target?` only enters under macro-specific rules:
 *
 *   - has_one/has_many/habtm (`Association#find_target?`, association.rb:320):
 *     `!loaded? && (!owner.new_record? || foreign_key_present?) && klass` — a
 *     persisted owner always reaches it; a *new* owner only when the FK is
 *     present.
 *   - belongs_to (`BelongsToAssociation#find_target?`,
 *     belongs_to_association.rb:124): `!loaded? && foreign_key_present? && klass`
 *     — there is NO new-record short-circuit; the owner-side FK must be present
 *     even for a persisted owner. (Mirrors the OO belongs_to override of
 *     `findTargetNeeded` in belongs-to-association.ts.)
 *
 * So a strict-loading owner that never reaches `find_target` returns nil/[]
 * silently. This returns false for exactly those cases so callers can skip the
 * violation, matching `find_target?` / `null_scope?`.
 *
 * `foreign_key_present?` has the same two-branch dispatch used by the OO
 * association and `CollectionProxy._foreignKeyPresent`: a belongs_to reads the
 * owner-side FK columns; a `:through` routes through its belongs_to
 * (`ThroughAssociation#foreign_key_present?`); a vanilla has_one/has_many/habtm
 * requires the owner's `active_record_primary_key`
 * (`ForeignAssociation#foreign_key_present?`).
 *
 * @internal
 */
export function _findTargetReachable(
  record: Base,
  assocName: string,
  options: AssociationOptions,
  kind: "belongsTo" | "foreign",
): boolean {
  // belongs_to requires foreign_key_present? regardless of new/persisted state.
  if (kind === "belongsTo") {
    return _associationForeignKeyPresent(record, assocName, options, kind);
  }
  if (!record.isNewRecord()) return true;
  return _associationForeignKeyPresent(record, assocName, options, kind);
}

function _associationForeignKeyPresent(
  record: Base,
  assocName: string,
  options: AssociationOptions,
  kind: "belongsTo" | "foreign",
): boolean {
  const ctor = record.constructor as typeof Base;
  const reflection = ctor._reflectOnAssociation?.(assocName);
  if (options.through) {
    return reflection ? throughForeignKeyPresent({ owner: record, reflection }) : false;
  }
  if (kind === "belongsTo") {
    const fk = options.foreignKey ?? options.queryConstraints;
    const fkNames =
      typeof fk === "string" ? [fk] : Array.isArray(fk) ? fk : [`${underscore(assocName)}_id`];
    return fkNames.every((name) => record._readAttribute(name) != null);
  }
  return reflection ? foreignKeyPresentFor(reflection as AssociationReflection, record) : false;
}

/**
 * Resolve a foreign association's (has_one / has_many / through) owner foreign
 * key from the *rich* reflection, which derives it from the class that
 * *declared* the association (`reflection.active_record`), not the owner
 * instance's class. For an STI subclass owner — e.g. a `SpecialPost` row whose
 * `has_many :special_comments` is declared on `Post` — this yields `post_id`,
 * not `special_post_id`. Mirrors Rails `reflection.foreign_key`. Returns
 * `undefined` for an unregistered association so callers keep their fallback.
 *
 * @internal
 */
export function ownerReflectionForeignKey(
  ctor: typeof Base,
  assocName: string,
): string | string[] | undefined {
  return (
    ctor as unknown as {
      _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | undefined;
    }
  )._reflectOnAssociation?.(assocName)?.foreignKey;
}

/**
 * Resolve the owner-side key for an inline (no-reflection) association
 * fallback, mirroring `reflection.activeRecordPrimaryKey` semantics
 * (reflection.rb:587 `active_record_primary_key`): for a composite-FK
 * query_constraints owner with a scalar primary key, key on the owner's
 * query_constraints list rather than the scalar `id`; for a composite-PK
 * owner without query_constraints, collapse the PK array to `"id"` when it
 * contains it, else keep the full composite PK (reflection.rb:597-600).
 * `primaryKey` already reflects any explicit `options.primaryKey`, so only
 * widen the default.
 *
 * @internal
 */
export function _inlineOwnerKey(
  ctor: typeof Base,
  options: AssociationOptions,
  primaryKey: string | string[],
): string | string[] {
  if (options.primaryKey !== undefined) {
    return primaryKey;
  }
  if (options.queryConstraints || hasQueryConstraints.call(ctor as any)) {
    return queryConstraintsList.call(ctor as any) ?? primaryKey;
  }
  // Mirror reflection.rb:597-600 active_record_primary_key composite_primary_key?
  // branch: a composite-PK owner without query_constraints collapses to "id"
  // when the PK array contains it, else keeps the full composite PK. (After the
  // options.primaryKey early return, primaryKey === ctor.primaryKey, so an array
  // PK already implies ctor.compositePrimaryKey.)
  if (Array.isArray(primaryKey)) {
    return primaryKey.includes("id") ? "id" : primaryKey;
  }
  return primaryKey;
}

/**
 * Resolve the foreign-key column(s) and matching owner-key column(s) for an
 * inline (no-reflection) polymorphic (`options.as`) association fallback,
 * mirroring the reflection path: `reflection.activeRecordPrimaryKey` for the
 * owner key and `BelongsToReflection#deriveFkQueryConstraints` for the
 * foreign key (reflection.rb).
 *
 * For a query_constraints owner the scalar `${as}_id` FK widens to the
 * composite `[shardKey, ${as}_id]` and the owner key becomes the
 * query_constraints list — so the inline fallback keys against the full
 * query_constraints list (e.g. `[blog_id, id]`) like AssociationScope, not
 * the scalar `id` alone. A plain (non-query_constraints) owner keeps the
 * scalar FK and the `_inlineOwnerKey`-resolved scalar key.
 *
 * @internal trails-only inline fallback helper (no Rails public counterpart);
 * exported solely so its underivable-query_constraints raise can be unit-tested.
 */
export function _inlinePolymorphicKeys(
  ctor: typeof Base,
  options: AssociationOptions,
  primaryKey: string | string[],
  scalarFk: string,
): { fkCols: string[]; ownerKeyCols: string[] } {
  if (
    options.primaryKey === undefined &&
    (options.queryConstraints || hasQueryConstraints.call(ctor as any))
  ) {
    const qc = options.queryConstraints ?? queryConstraintsList.call(ctor as any);
    // Mirror deriveFkQueryConstraints (reflection.ts) faithfully — including its
    // ArgumentError raises for the underivable query_constraints shapes: a list
    // with >2 attributes, a list missing the owner's scalar primary key (or a
    // composite owner PK), and a list whose keys can't be interpreted against
    // the owner PK. The inline (no-reflection) path is no excuse to silently
    // scalar-collapse those configs.
    if (qc) {
      const ownerPk = ctor.primaryKey;

      if (qc.length > 2) {
        throw new ArgumentError(
          `The query constraints list on the \`${ctor.name}\` model has more than 2 ` +
            `attributes. Active Record is unable to derive the query constraints ` +
            `for the association. You need to explicitly define the query constraints ` +
            `for this association.`,
        );
      }

      const ownerPkStr = Array.isArray(ownerPk) ? undefined : ownerPk;
      if (!ownerPkStr || !qc.includes(ownerPkStr)) {
        throw new ArgumentError(
          `The query constraints on the \`${ctor.name}\` model does not include the primary ` +
            `key so Active Record is unable to derive the foreign key constraints for ` +
            `the association. You need to explicitly define the query constraints for this ` +
            `association.`,
        );
      }

      if (qc.includes(scalarFk)) {
        return { fkCols: [scalarFk], ownerKeyCols: [ownerPkStr] };
      }

      const [firstKey, lastKey] = qc;
      if (firstKey === ownerPkStr) {
        return { fkCols: [scalarFk, lastKey], ownerKeyCols: qc };
      } else if (lastKey === ownerPkStr) {
        return { fkCols: [firstKey, scalarFk], ownerKeyCols: qc };
      }

      throw new ArgumentError(
        `Active Record couldn't correctly interpret the query constraints ` +
          `for the \`${ctor.name}\` model. The query constraints on \`${ctor.name}\` are ` +
          `\`${rubyInspectArray(qc)}\` and the foreign key is \`${scalarFk}\`. ` +
          `You need to explicitly set the query constraints for this association.`,
      );
    }
  }
  // Scalar path — identical to the pre-fix inline behavior
  // (`Array.isArray(primaryKey) ? "id" : primaryKey`): a scalar polymorphic FK
  // pairs with a single owner key. `_inlineOwnerKey` can return the
  // query_constraints array, which a scalar FK can't zip against, so collapse
  // here rather than delegating.
  const scalarOwnerKey = Array.isArray(primaryKey) ? "id" : primaryKey;
  return { fkCols: [scalarFk], ownerKeyCols: [scalarOwnerKey] };
}

/**
 * Compute the WHERE condition hash that scopes a hasMany relation to its
 * owner. Returns null if primary key values are missing (Rails'
 * NullRelation fallback). Pure — no Relation construction.
 *
 * Shared by `buildHasManyRelation` (which wraps it in `all().where(...)`)
 * and CollectionProxy's constructor (which seeds its own where-clause
 * via the same condition).
 *
 * @internal No Rails counterpart (`compute_has_many_where` is defined nowhere
 * in the Rails source). Rails never materializes the owner-scoping hash on its
 * own: `AssociationScope#add_constraints`
 * (`associations/association_scope.rb:124`) writes the predicate straight onto
 * the relation being built. This is a trails-only factoring so the two
 * construction sites can't drift.
 */
export function computeHasManyWhere(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Record<string, unknown> | null {
  const ctor = record.constructor as typeof Base;
  let primaryKey = options.primaryKey ?? ctor.primaryKey;

  if (options.as) {
    const foreignKey = options.foreignKey ?? `${underscore(options.as)}_id`;
    if (Array.isArray(foreignKey)) {
      // Rails permits an explicit composite FK on a polymorphic `:as`
      // association when it zips against the owner's composite PK (e.g.
      // Cpk::Post has_many :comments, as: :commentable,
      // foreign_key: [:commentable_title, :commentable_author]).
      if (Array.isArray(primaryKey) && primaryKey.length === foreignKey.length) {
        const typeCol = `${underscore(options.as)}_type`;
        const conditions: Record<string, unknown> = { [typeCol]: polymorphicName(ctor) };
        for (let i = 0; i < foreignKey.length; i++) {
          const pkValue = record._readAttribute(primaryKey[i]);
          if (pkValue === null || pkValue === undefined) return null;
          conditions[foreignKey[i]] = pkValue;
        }
        return conditions;
      }
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message;
      // a no-op for polymorphic `:as` (Rails permits no composite key there).
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    // Collapse CPK to "id" when present (matching Rails' join_id_for).
    // CPK without "id" cannot map to a scalar <as>_id column.
    if (Array.isArray(primaryKey) && !primaryKey.includes("id")) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message;
      // a no-op for polymorphic `:as` (Rails permits no composite key there).
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    const typeCol = `${underscore(options.as)}_type`;
    // Same query_constraints widening as the inline findTarget/loadHasOne
    // polymorphic fallback: a query_constraints owner keys on the composite
    // `[shardKey, ${as}_id]` against the query_constraints list, not the
    // scalar `id` alone (which would leak cross-shard rows).
    const { fkCols, ownerKeyCols } = _inlinePolymorphicKeys(ctor, options, primaryKey, foreignKey);
    const conditions: Record<string, unknown> = { [typeCol]: polymorphicName(ctor) };
    for (let i = 0; i < fkCols.length; i++) {
      const pkValue = record._readAttribute(ownerKeyCols[i]);
      if (pkValue === null || pkValue === undefined) return null;
      conditions[fkCols[i]] = pkValue;
    }
    return conditions;
  }

  // Prefer the reflection's foreign key, which is derived from the class that
  // *declared* the association (`reflection.active_record`), not the owner
  // instance's class. For an STI subclass owner (e.g. a `SpecialPost` row whose
  // `has_many :special_comments` is declared on `Post`) the column is still
  // `post_id`, not `special_post_id`. Mirrors Rails using `reflection.foreign_key`.
  const reflection = (ctor as any)._reflectOnAssociation?.(assocName);
  const reflectionFk = reflection?.foreignKey;
  const foreignKey =
    options.foreignKey ??
    reflectionFk ??
    (options.queryConstraints
      ? options.queryConstraints
      : Array.isArray(primaryKey)
        ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
        : `${underscore(ctor.name)}_id`);

  if (Array.isArray(foreignKey)) {
    // A composite FK derived from the owner's query_constraints (e.g.
    // Sharded::BlogPost `[blog_id, id]`) is keyed against those constraint
    // columns, not the owner's scalar `id`. Defer to the reflection's
    // `activeRecordPrimaryKey` — the single resolver the join/preload paths
    // already use (Rails `reflection.active_record_primary_key`).
    if (!Array.isArray(primaryKey) && Array.isArray(reflection?.activeRecordPrimaryKey)) {
      primaryKey = reflection.activeRecordPrimaryKey;
    }
    // Composite FK requires a composite PK of matching length — otherwise
    // we'd silently readAttribute(undefined) and produce a bogus/empty
    // scope. Existing loaders throw CompositePrimaryKeyMismatchError; do
    // the same here so CollectionProxy construction fails loudly.
    if (!Array.isArray(primaryKey) || primaryKey.length !== foreignKey.length) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message;
      // a no-op for polymorphic `:as` (Rails permits no composite key there).
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < foreignKey.length; i++) {
      const pkVal = record._readAttribute(primaryKey[i]);
      if (pkVal === null || pkVal === undefined) return null;
      conditions[foreignKey[i]] = pkVal;
    }
    return conditions;
  }

  // Scalar FK against a composite-PK owner collapses to the "id" component,
  // matching `reflection.active_record_primary_key` (reflection.rb) — the same
  // resolver findTarget's AssociationScope path uses. A composite PK lacking
  // "id" can't map to a scalar FK, so that remains a mismatch.
  if (Array.isArray(primaryKey)) {
    const inferred = reflection?.activeRecordPrimaryKey;
    if (typeof inferred === "string") {
      primaryKey = inferred;
    } else {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message.
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
  }
  const pkValue = record._readAttribute(primaryKey);
  if (pkValue === null || pkValue === undefined) return null;
  return { [foreignKey]: pkValue };
}

/**
 * Build the relation for a hasMany association without executing it.
 * Skips caching, strict loading, and inverse_of — used by countHasMany
 * so resetCounters works under strict loading.
 * Returns null if primary key values are missing.
 *
 * @internal No Rails counterpart (`build_has_many_relation` is defined nowhere
 * in the Rails source). Rails gets an unexecuted, side-effect-free relation for
 * free via `association.scope` — `Association#scope`
 * (`associations/association.rb:107`) into `AssociationScope#scope`
 * (`associations/association_scope.rb:21`). trails' `findTarget` fuses
 * relation building with caching/strict-loading/inverse_of, so the bypass has
 * to be spelled out as its own function until that fusion is undone.
 */
export function buildHasManyRelation(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): any | null {
  const conditions = computeHasManyWhere(record, assocName, options);
  if (conditions === null) return null;
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveAssocClass(record, assocName, className);
  // `scopeForAssociation` (not `all()`) so an enclosing `Model.where(...).scoping`
  // block doesn't leak the class `current_scope` into association reads. Rails'
  // association readers build from `scope_for_association`, which applies only
  // default scopes (unless flagged `all_queries: true`), never `current_scope`.
  let rel = _scopeForAssociation(targetModel).where(conditions);
  rel = applyAssociationScope(rel, options.scope, record);
  return rel;
}

/**
 * Build the JOIN-based AssociationScope relation for a through / HABTM
 * association without executing it — the exact relation `findTarget` runs to
 * materialize rows (`SELECT target.* FROM target INNER JOIN join_table ...`).
 *
 * Counting over this relation yields Rails' `scope.count(:all)`: a single
 * `COUNT(*)` over the JOIN that preserves join-row multiplicity (three
 * `developers_projects` rows for one project count as 3). This is distinct
 * from the proxy's `_buildThroughScope()`, which models the target as an
 * `id IN (SELECT source_fk ...)` subquery that structurally collapses
 * duplicate join rows to one row per id — wrong for a non-distinct `size`.
 *
 * Returns null when the owner FK is absent (unsaved owner / null PK), matching
 * the short-circuit in `findTarget`.
 *
 * @internal No Rails counterpart (`build_through_join_scope` is defined nowhere
 * in the Rails source), for the same reason as {@link buildHasManyRelation}: in
 * Rails this relation IS `association.scope`, and
 * `HasManyAssociation#count_records` (`associations/has_many_association.rb:80`)
 * just calls `scope.count(:all)` on it (`:84`). Named separately here only
 * because trails builds the JOIN form inside `findTarget` rather than in an
 * AssociationScope.
 */
export function buildThroughJoinScope(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): any | null {
  const ctor = record.constructor as typeof Base;
  const reflection = ctor._reflectOnAssociation?.(assocName);
  if (!reflection) return null;
  // Null-FK short-circuit on the owner-side column (chain.last's
  // joinForeignKey — see `_ownerChainReflection`), mirroring findTarget.
  const reflForOwnerFk = _ownerChainReflection(reflection);
  const fkCols = Array.isArray(reflForOwnerFk.joinForeignKey)
    ? reflForOwnerFk.joinForeignKey
    : [reflForOwnerFk.joinForeignKey];
  for (const col of fkCols) {
    const v = record._readAttribute(col);
    if (v === null || v === undefined) return null;
  }
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveAssocClass(record, assocName, className);
  const built = _builtAssociationScope(record, assocName, reflection, targetModel);
  const baseRelation = _scopeForAssociation(targetModel);
  let rel = baseRelation.merge(built);
  rel = applyAssociationScope(rel, options.scope, record, (reflection as any).scope);
  return rel;
}

/**
 * Count associated records for a hasMany association using COUNT(*)
 * without loading records into memory. Bypasses strict loading checks
 * so resetCounters works on strict-loading models.
 *
 * @internal No Rails counterpart. Rails' `reset_counters` counts with
 * `object.send(counter_association).count(:all)` — the proxy delegates to
 * `association.scope`, which is side-effect-free. The Rails-named
 * `HasManyAssociation#count_records` already exists as `countRecords`
 * (`associations/has-many-association.ts`) and is a *different* method (it
 * reads the counter cache and trims the target). This function exists only
 * because trails fuses relation building with caching/strict-loading inside
 * `loadHasMany`, the same deviation documented on its two callees
 * {@link buildHasManyRelation} and {@link buildThroughJoinScope}; it
 * disappears when that fusion is undone.
 */
export async function countHasMany(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<number> {
  if (options.through) {
    // COUNT(*) over the JOIN — matching Rails' scope.count(:all) — instead of
    // materializing rows just to read their length. Temporarily disable strict
    // loading so the count works on strict-loading models.
    record._strictLoadingBypassCount++;
    try {
      // Preserve `HasManyThroughAssociation#findTarget`'s loud failure for a misconfigured through:
      // buildThroughJoinScope returns null for a missing reflection, which would
      // otherwise silently count as 0.
      const ctor = record.constructor as typeof Base;
      const throughRegistered = (ctor._associations ?? []).some((a) => a.name === options.through);
      if (!throughRegistered) {
        throw _hmtNotFound(ctor, assocName, options.through);
      }
      const rel = buildThroughJoinScope(record, assocName, options);
      if (!rel) return 0;
      const result = await rel.count();
      if (typeof result !== "number") {
        throw new Error(
          `countHasMany expected a numeric count but got ${typeof result} — ` +
            `association "${assocName}" may have a grouped scope`,
        );
      }
      return result;
    } finally {
      record._strictLoadingBypassCount--;
    }
  }
  const rel = buildHasManyRelation(record, assocName, options);
  if (!rel) return 0;
  const result = await rel.count();
  if (typeof result !== "number") {
    throw new Error(
      `countHasMany expected a numeric count but got ${typeof result} — ` +
        `association "${assocName}" may have a grouped scope`,
    );
  }
  return result;
}

/**
 * Compute the default join table name for HABTM.
 * Uses the two table names in alphabetical order, joined by underscore.
 */
/** Coerce a foreignKey option to a single string. HABTM doesn't support composite keys. */
/**
 * Create an anonymous join model class for HABTM associations.
 * The join model has two belongsTo associations (left side and target),
 * delegates its adapter to the declaring model, and uses the specified
 * join table name.
 *
 * Mirrors: ActiveRecord::Associations::Builder::HasAndBelongsToMany#through_model
 */
function createHabtmJoinModel(
  lhsModel: typeof Base,
  joinModelName: string,
  joinTableName: string,
  ownerFk: string,
  targetFk: string,
  targetClassName: string,
  sourceName: string,
): typeof Base {
  // Walk up to the root AR Base class to avoid inheriting domain callbacks/validations.
  // Stop at the last class that still has `create` (i.e., the AR Base class).
  let BaseClass: typeof Base = lhsModel;
  let parent = Object.getPrototypeOf(BaseClass);
  while (parent && parent !== Function.prototype && typeof parent.create === "function") {
    BaseClass = parent;
    parent = Object.getPrototypeOf(BaseClass);
  }
  const JoinModel = class extends BaseClass {} as typeof Base;
  Object.defineProperty(JoinModel, "name", {
    value: joinModelName,
    writable: false,
    configurable: true,
  });

  // Set table name and composite PK — HABTM join tables typically have no id column,
  // so the join model uses [ownerFk, targetFk] as its primary key to support
  // delete/destroy operations that issue PK-based WHERE clauses.
  JoinModel._tableName = joinTableName;
  JoinModel.primaryKey = [ownerFk, targetFk];

  // Carry the declaring model's Ruby module path onto the anonymous join model
  // so its source `belongsTo` resolves an unqualified target class name
  // (e.g. "Article") namespace-relative to the owner (→ "Publisher::Article").
  // Without this, the join model's `activeRecord` is the bare `HABTM_*` class
  // and the compute_type walk has no nesting to try.
  if ((lhsModel as { moduleName?: string }).moduleName) {
    (JoinModel as { moduleName?: string }).moduleName = (
      lhsModel as { moduleName?: string }
    ).moduleName;
  }

  // Delegate connection to the left (declaring) model. The join model is rooted
  // at the AR Base class (to shed domain callbacks), so it would otherwise
  // resolve to the primary pool. Delegating the connection-spec name keeps writes
  // (and the threaded-connection check in `threadedConnectionFor`) on the owner's
  // pool — required when the owner lives in an alternate database.
  Object.defineProperty(JoinModel, "connection", {
    get() {
      return lhsModel.connection;
    },
    configurable: true,
  });
  // `connectionPool` resolves via `connectionSpecificationName`, which reads the
  // `_connectionSpecificationName` backing field (own-property check + accessor).
  // Delegating that field — not just the public static accessor — is what routes
  // the pool lookup to the owner's database.
  Object.defineProperty(JoinModel, "_connectionSpecificationName", {
    get() {
      return lhsModel.connectionSpecificationName;
    },
    set(_v: unknown) {
      /* no-op: always delegates to lhs */
    },
    configurable: true,
  });
  Object.defineProperty(JoinModel, "adapter", {
    get() {
      return lhsModel.connection;
    },
    set(_v: unknown) {
      /* no-op: always delegates to lhs */
    },
    configurable: true,
  });

  // Add belongsTo associations matching what `HasManyThroughAssociation#findTarget` expects
  const joinAssocs: AssociationDefinition[] = [];
  joinAssocs.push({
    type: "belongsTo",
    name: "leftSide",
    options: { className: lhsModel.name, foreignKey: ownerFk },
  });
  joinAssocs.push({
    type: "belongsTo",
    name: sourceName,
    options: { className: targetClassName, foreignKey: targetFk },
  });
  JoinModel._associations = joinAssocs;

  for (const assocDef of joinAssocs) {
    const ref = Reflection.create(
      assocDef.type,
      assocDef.name,
      null,
      assocDef.options as Record<string, unknown>,
      JoinModel,
    );
    Reflection.addReflection(JoinModel, assocDef.name, ref);
  }

  // No presence validations on the join model's belongs_to sides: Rails builds
  // both with `required: false` hardcoded (Builder::HasAndBelongsToMany
  // add_left/right_association), so define_validations always resolves
  // `optional`/`required` to opt out — `belongs_to_required_by_default` never
  // applies to the implicit join model. This keeps habtm usable even when the
  // owner declares it under a true global flag (see project.rb:21-26 and the
  // "usable with belongs to required by default" test).

  return JoinModel;
}

function singleFk(fk: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(fk)) {
    throw new ConfigurationError("HABTM associations do not support composite foreign keys");
  }
  return fk ?? fallback;
}

/**
 * Compute the default HABTM join-table name.
 *
 * Mirrors ActiveRecord::Associations::Builder::HasAndBelongsToMany#table_name:
 * sort both side table names, then collapse a shared `[._]`-terminated prefix
 * so `b30_posts` + `b30_tags` → `b30_posts_tags` (not `b30_posts_b30_tags`).
 */
function defaultJoinTableName(
  model1: typeof Base,
  assocName: string,
  options?: { className?: string },
): string {
  const lhsTable = (model1 as any).tableName ?? fallbackTableName(model1.name);
  const className = options?.className ?? camelize(singularize(assocName));
  const targetModel = modelRegistry.get(className);
  const rhsTable = (targetModel as any)?.tableName ?? fallbackTableName(className);
  return joinHabtmTableNames(lhsTable, rhsTable);
}

// Mirrors builder/has-and-belongs-to-many.ts#_fallbackTableName: namespaced
// class names (`Admin::Tag`) underscore to `admin/tag`, which would leak a
// `/` into the join-table name. Rails' `klass.table_name` normalizes to
// underscores, so do the same when the target model isn't registered yet.
function fallbackTableName(name: string): string {
  return underscore(pluralize(name)).replace(/\//g, "_");
}

/**
 * Compute the target-side FK for a HABTM. Mirrors Rails
 * Builder::HasAndBelongsToMany#belongs_to_options:
 *   1. explicit `associationForeignKey` override
 *   2. `class_name.foreign_key` (demodulize+underscore+"_id")
 *   3. default belongs_to: singularized association name + "_id"
 * @internal
 */
export function habtmTargetFk(
  assocName: string,
  options: { className?: unknown; associationForeignKey?: unknown },
): string {
  if (options.associationForeignKey) return String(options.associationForeignKey);
  if (options.className) return deriveForeignKey(String(options.className));
  return `${underscore(singularize(assocName))}_id`;
}

/**
 * Factory to get a CollectionProxy for a has_many association.
 * Returns a cached proxy if one exists on the record.
 */
export function association<T extends Base = Base>(
  record: Base,
  assocName: string,
): AssociationProxy<T> {
  const existing = record._collectionProxies.get(assocName) as AssociationProxy<T> | undefined;
  if (existing) {
    // Hydrate from preloaded data if proxy was cached before preloading ran
    if (!existing.loaded) {
      const preloaded = _preloadedHolderTarget(record, assocName)?.value;
      if (preloaded != null) {
        const records = Array.isArray(preloaded) ? preloaded : [preloaded];
        existing._hydrateFromPreload(records as T[]);
      }
    }
    return existing;
  }

  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = ctor._associations ?? [];
  // Most-derived override wins (subclass appends after the cloned parent
  // entry), aligning with `_reflections`' keyed override semantics. Covered by
  // has-one-associations.test.ts "nullification on association change" (a
  // DependentFirm whose `account` override must beat the inherited Company one).
  const assocDef = associations
    .slice()
    .reverse()
    .find((a) => a.name === assocName);
  if (!assocDef) {
    throw new Error(`Association "${assocName}" not found on ${ctor.name}`);
  }
  validateThroughReflection(ctor, assocName);
  if (!_CollectionProxyCtor) {
    // Deliberate constraint: `associations.ts`, `relation.ts`,
    // `collection-proxy.ts`, and `base.ts` form a mandatory mutual
    // dependency — CP `extends Relation`, Relation/Base call back
    // into the association wiring, and attempting to value-import CP
    // at this module's top would observe a partial module during
    // init. The package entry (`@blazetrails/activerecord`) loads CP
    // explicitly and triggers self-registration; deep-importing
    // `associations.js` bypasses that. See the collection-proxy-slot
    // module for the load-order details.
    throw new Error(
      "CollectionProxy not registered. Either import '@blazetrails/activerecord' " +
        "once (the package entry loads CollectionProxy eagerly), or, if you are " +
        "using subpath imports such as '@blazetrails/activerecord/associations' or " +
        "'@blazetrails/activerecord/base', call `await initializeAssociations()` " +
        "(exported from '@blazetrails/activerecord/associations') before the first " +
        "`association()` call.",
    );
  }
  // Route through the CollectionProxy per-model subclass carrier (its `_create`
  // factory) so generated relation methods resolve as real methods on the proxy.
  const proxy = (
    _CollectionProxyCtor as unknown as {
      _create: (r: Base, n: string, d: AssociationDefinition) => CollectionProxy<T>;
    }
  )._create(record, assocName, assocDef) as CollectionProxy<T> & {
    _hydrateFromPreload: (records: T[]) => void;
    _adoptSharedTarget: (records: Base[], loaded: boolean) => void;
  };

  const instance = record._associationInstances.get(assocName);
  if (instance?.isCollection?.()) {
    const raw = instance._rawTarget;
    proxy._adoptSharedTarget(Array.isArray(raw) ? raw : [], instance._rawLoaded);
  }

  const preloaded = _preloadedHolderTarget(record, assocName)?.value;
  if (preloaded != null) {
    const records = Array.isArray(preloaded) ? preloaded : [preloaded];
    proxy._hydrateFromPreload(records as T[]);
  }

  const wrapped = wrapCollectionProxy<T>(proxy);
  // Record the JS Proxy wrapper on the underlying instance so methods that
  // return `self` (push / concat / append) hand back the same object callers
  // hold — `this` inside a method is the raw target, not the wrapper.
  (proxy as any)._proxySelf = wrapped;
  record._collectionProxies.set(assocName, wrapped);
  return wrapped;
}

/**
 * Wrap a CollectionProxy in a Proxy that delegates unknown property access
 * to the underlying Relation (via scope()). This mirrors Ruby's
 * CollectionProxy#method_missing which delegates to the association scope.
 *
 * Priority:
 * 1. Own/prototype properties (CollectionProxy methods, extend methods)
 * 2. Relation query methods + named scopes (via scope()'s own proxy)
 */
const NUMERIC_INDEX_PATTERN = /^(0|[1-9]\d*)$/;

function wrapCollectionProxy<T extends Base = Base>(
  proxy: CollectionProxy<T>,
): AssociationProxy<T> {
  return new Proxy(proxy, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);
      // Curated `to: :records` delegations (`each`, `join`, `reverse`, …) are now
      // real *async* methods on the Relation base. On a *loaded* proxy they must
      // keep Rails' synchronous `records` delegation, so fall through to the sync
      // record delegate below. CollectionProxy-specialized names (slice/reduce/
      // indexOf/…) are absent from DELEGATION_RECORD_METHOD_NAMES, so they win here.
      const preferSyncRecordDelegate =
        typeof prop === "string" && target.loaded && DELEGATION_RECORD_METHOD_NAMES.has(prop);
      if (value !== undefined && !preferSyncRecordDelegate) return value;
      if (prop in target && !preferSyncRecordDelegate) return value;
      if (typeof prop === "symbol") return value;

      // Numeric indexing — `proxy[0]`, `proxy[1]` read the loaded target
      // via the public `target` accessor. Matches array semantics; same
      // constraint as the other array-likeness on CollectionProxy: reads
      // whatever's loaded. `await proxy` (or `await proxy.load()`) hydrates
      // `_target` first if you need a fresh load.
      if (typeof prop === "string" && NUMERIC_INDEX_PATTERN.test(prop)) {
        return target.target[Number(prop)];
      }

      if (_violatesStrictLoading(target._record, target._assocDef.options)) {
        strictLoadingViolationBang(target._record, target._assocName, {
          className: target._assocDef.options.className ?? camelize(singularize(target._assocName)),
        });
      }

      // Class-method delegations resolve through the `Reflect.get(scope, prop,
      // scope)` fallback below: `target.scope()` returns an `AssociationRelation`
      // wrapped by `wrapWithScopeProxy`, whose miss path runs the
      // `classMethodDelegator` (delegation.rb:118-131). This CollectionProxy
      // delegate class is NOT yet on the per-model prototype carrier — only the
      // base `Relation` is (story
      // `delegation-remaining-delegate-class-prototype-carriers` tracks the
      // rest) — so no real-method / side-table branch belongs here.

      // Array-method delegation (sync fast-path) — when already loaded, delegate
      // synchronously against `target.target` (the hydrated records array).
      // Checked before scope lookup so it matches `wrapWithScopeProxy`'s pattern
      // and returns the same sync value a caller expects post-load. The curated
      // `to: :records` set (Rails names: `each`, `index`, `to_sentence`, …) goes
      // first so a loaded proxy delegates those to its records synchronously
      // (delegation.rb:101), matching Rails; the JS-name array delegate covers
      // the broader Enumerable surface (map/filter/sort/…).
      if (target.loaded) {
        const recordDelegate =
          typeof prop === "string"
            ? delegateRecordMethodSync(prop, () => target.target)
            : undefined;
        if (recordDelegate) return recordDelegate;
        const arrayDelegate = delegateArrayMethod(prop, () => target.target);
        if (arrayDelegate) return arrayDelegate;
      }

      // Enumerable-method delegation — async + self-loading, checked before
      // scope lookup so it routes to the collection cache via `target.load()`
      // rather than the scope relation's `_records`. Covers `partition` and all
      // DELEGATED_ARRAY_METHODS on *unloaded* proxies (the sync path above
      // handles loaded proxies). Rails' `CollectionProxy#records` calls
      // `load_target`, hydrating `@target` and marking the association loaded;
      // `target.load()` does the same.
      const enumerableDelegate = delegateEnumerableMethod(prop, () => target.load());
      if (enumerableDelegate) return enumerableDelegate;

      // Named scopes are memoized per association load (trails-specific, RFC
      // 0030 — Rails rebuilds the named-scope relation on every call and has no
      // such cache). Route them through `_cachedNamedScopeRelation` so repeated
      // `things.someScope()` within one association load returns the same
      // relation object until a reset/insert/remove invalidates the cache.
      const scopeModel = target.model as typeof Base & {
        _scopes?: Map<string, unknown>;
      };
      if (typeof prop === "string" && scopeModel._scopes?.has(prop)) {
        return (...args: any[]) => target._cachedNamedScopeRelation(prop, args);
      }

      const scope = target.scope();
      const scopeVal = Reflect.get(scope, prop, scope);
      if (typeof scopeVal === "function") {
        return (...args: any[]) => scopeVal.apply(scope, args);
      }

      // Rails delegation.rb:118-131 (ClassSpecificRelation#method_missing):
      // if the scope doesn't respond to the method, check the model class and
      // delegate via `scoping { model.public_send(method, ...) }`.
      // Sync methods (returning Relation) restore the scope immediately so
      // the Relation is directly chainable. Async methods (returning a native
      // Promise) defer restoration until the promise settles — mirrors Rails'
      // synchronous block-scoping across the full method body.
      const modelClass = target.model;
      const classMethod = modelClass[prop];
      if (typeof classMethod === "function") {
        const delegator = classMethodDelegator(prop);
        if (!uncacheableMethods().has(prop)) {
          generateRelationMethod(modelClass, prop, delegator);
        }
        return (...args: any[]) => delegator.apply(scope, args);
      }

      return scopeVal;
    },
  });
}

/**
 * Sync a record's optimistic lock column in memory after a counter-cache UPDATE
 * advanced it in the database. Uses `writeFromDatabase` so the new value is a
 * clean, DB-sourced attribute (not dirty, not diffed against a stale baseline).
 *
 * Coupling note: callers invoke this immediately after `parent.incrementBang(...)`.
 * The wired instance `incrementBang` is `Persistence#incrementBang`
 * (`persistence.ts`, registered in `base.ts`), which persists via
 * `this.constructor.updateCounters` → the `Locking::Optimistic#updateCounters`
 * override that merges `locking_column => 1` into the DB statement — and it does
 * NOT write `lock_version` into memory (it only clears the counter column's
 * change). So this +1 is the sole in-memory lock write and exactly mirrors the
 * DB. (The separate `Locking::Optimistic#incrementBang` in `locking/optimistic.ts`,
 * which uses `updateColumn` and would bypass that override, is intentionally not
 * wired for instance dispatch; if a future change routes instance dispatch
 * through it, the DB bump disappears and this sync must be revisited.)
 *
 * @internal No Rails counterpart. Rails never needs an in-memory
 * `lock_version` sync here: `Locking::Optimistic#update_counters` merges the
 * locking-column bump into the same UPDATE, and the in-memory record is
 * reconciled by the `_update_record` lock-version write rather than by a
 * separate reflect step. This function only exists to close the in-memory gap
 * described above and has no Rails method to converge onto.
 */
export function reflectLockVersionBump(record: Base): void {
  const ctor = record.constructor as typeof Base;
  if (!ctor.lockingEnabled) return;
  const lc = ctor.lockingColumn;
  const bumped = (Number((record as any).readAttribute?.(lc)) || 0) + 1;
  (record as any)._attributes?.writeFromDatabase(lc, bumped);
}

/**
 * Per-instance association-cache reset hook. Rails initializes
 * `@association_cache = {}` here; our equivalents are pre-allocated by the
 * `Base` class fields, so this only needs to clear them when called on an
 * existing record (e.g. from `initialize_dup`). Routes through the single
 * `Base#_resetAssociationCaches` lifecycle seam (RFC-0022 b5).
 *
 * Mirrors: ActiveRecord::Associations#init_internals
 *
 * @internal
 */
function initInternals(record: Base): void {
  record._resetAssociationCaches();
}

/**
 * Returns the cached `Association` wrapper for `name`, or `null` if none
 * has been built yet. Mirrors Rails' `@association_cache[name]` lookup —
 * always reads `_associationInstances` (the canonical Association cache,
 * matching how `instance-methods.ts:association()` populates it).
 * `_collectionProxies` is a separate, Trails-specific user-facing layer
 * and is intentionally not consulted here.
 *
 * Mirrors: ActiveRecord::Associations#association_instance_get
 *
 * @internal
 */
export function associationInstanceGet(this: Base, name: string): unknown {
  return this._associationInstances.get(name) ?? null;
}

/**
 * Stores the built `Association` wrapper for `name` in the canonical
 * `_associationInstances` cache, mirroring Rails'
 * `@association_cache[name] = association`. The Trails-specific
 * `_collectionProxies` wrapper map is populated separately by the
 * collection-proxy machinery, not here.
 *
 * Mirrors: ActiveRecord::Associations#association_instance_set
 *
 * @internal
 */
export function associationInstanceSet(this: Base, name: string, association: unknown): void {
  this._associationInstances.set(name, association as AssociationInstance);
}
