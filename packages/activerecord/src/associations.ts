import type { Base } from "./base.js";
import { Table as ArelTable } from "@blazetrails/arel";
import type { CollectionProxy, AssociationProxy } from "./associations/collection-proxy.js";
import { _CollectionProxyCtor } from "./associations/collection-proxy-slot.js";
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
 */
export async function initializeAssociations(): Promise<void> {
  // Load both ctor slots. `association-relation.js` imports
  // `collection-proxy.js` for the late-bind ctor setter, so importing
  // AR first also registers CP transitively; we still import CP
  // explicitly as a belt-and-suspenders guarantee.
  await Promise.all([
    import("./associations/collection-proxy.js"),
    import("./association-relation.js"),
  ]);
}
import { StrictLoadingViolationError, ConfigurationError, Rollback } from "./errors.js";
import {
  AssociationNotFoundError,
  DeleteRestrictionError,
  InverseOfAssociationNotFoundError,
  HasOneThroughNestedAssociationsAreReadonly,
  CompositePrimaryKeyMismatchError,
} from "./associations/errors.js";
import { ForeignAssociation } from "./associations/foreign-association.js";
import { AssociationScope } from "./associations/association-scope.js";
import { validateThroughReflection } from "./associations/validate-through-reflection.js";
import { underscore, singularize, pluralize, camelize } from "@blazetrails/activesupport";
import { getInheritanceColumn, findStiClass } from "./inheritance.js";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { HasMany as HasManyBuilder } from "./associations/builder/has-many.js";
import { HasAndBelongsToMany as HabtmBuilder } from "./associations/builder/has-and-belongs-to-many.js";
import * as Reflection from "./reflection.js";

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
  scope?: (rel: any) => any;
  validate?: boolean;
  required?: boolean;
  optional?: boolean;
  beforeAdd?:
    | ((owner: Base, record: Base) => void | false)
    | ((owner: Base, record: Base) => void | false)[];
  afterAdd?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
  beforeRemove?:
    | ((owner: Base, record: Base) => void | false)
    | ((owner: Base, record: Base) => void | false)[];
  afterRemove?: ((owner: Base, record: Base) => void) | ((owner: Base, record: Base) => void)[];
  extend?:
    | Record<string, (...args: unknown[]) => unknown>
    | Record<string, (...args: unknown[]) => unknown>[];
  /** Load through associations via multiple queries instead of JOIN.
   * Currently a no-op since through loading already uses multi-query by default.
   * Exists for Rails API parity — Rails uses this to switch between JOIN and
   * multi-query strategies. */
  disableJoins?: boolean;
  /** When true, records loaded through this association are marked
   * strict-loading, causing further lazy loads on them to raise.
   *
   * Mirrors Rails' `has_many :foo, strict_loading: true` — checked via
   * `reflection.strict_loading?` during query execution. */
  strictLoading?: boolean;
}

export interface AssociationDefinition {
  type: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  name: string;
  options: AssociationOptions & { joinTable?: string };
}

/**
 * Registry to hold model classes by name. Models must be registered
 * here so associations can resolve class references.
 */
export const modelRegistry = new Map<string, typeof Base>();

/**
 * Register a model class for association resolution.
 * Can be called as registerModel(Model) or registerModel("Name", Model).
 */
export function registerModel(nameOrModel: string | typeof Base, model?: typeof Base): void {
  if (typeof nameOrModel === "string") {
    if (!model) throw new Error("registerModel(name, model) requires a model class");
    modelRegistry.set(nameOrModel, model);
  } else {
    modelRegistry.set(nameOrModel.name, nameOrModel);
  }
}

/**
 * Resolve a model class by name.
 */
export function resolveModel(name: string): typeof Base {
  const model = modelRegistry.get(name);
  if (!model) {
    throw new Error(`Model "${name}" not found in registry. Did you call registerModel(${name})?`);
  }
  return model;
}

/**
 * Validate that an inverse_of association exists on the target model.
 * Throws InverseOfAssociationNotFoundError if not found.
 */
function validateInverseOf(targetModel: typeof Base, assocName: string, inverseOf: string): void {
  const targetAssocs: AssociationDefinition[] = (targetModel as any)._associations ?? [];
  if (targetAssocs.length === 0) return;
  if (targetAssocs.some((a) => a.name === inverseOf)) return;

  const corrections: string[] = [];
  for (const a of targetAssocs) {
    if (levenshtein(a.name, inverseOf) <= 3) {
      corrections.push(a.name);
    }
  }
  throw new InverseOfAssociationNotFoundError(assocName, inverseOf, corrections, targetModel.name);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Resolve the counter cache column for a hasMany association by inspecting
 * the child model's belongsTo reflection for a counterCache option.
 * Falls back to `${assocName}_count` if no reflection is found.
 */
export function resolveCounterColumn(
  parentModel: typeof Base,
  assoc: { type: string; name: string; options: any },
  counterName: string,
): string {
  // If counter name was passed as a column name directly, use it
  if (counterName.endsWith("_count")) return counterName;

  const childClassName = assoc.options.className ?? camelize(singularize(assoc.name));
  if (!modelRegistry.has(childClassName)) {
    return `${assoc.name}_count`;
  }
  const childModel = resolveModel(childClassName);
  const childAssocs = (childModel as any)._associations as
    | Array<{ type: string; name: string; options: any }>
    | undefined;
  if (childAssocs) {
    // Check against parent name and STI base class name
    const parentNames = new Set([parentModel.name]);
    let proto = Object.getPrototypeOf(parentModel);
    while (proto && proto.name && proto !== Function.prototype) {
      parentNames.add(proto.name);
      proto = Object.getPrototypeOf(proto);
    }
    const belongsTo = childAssocs.find(
      (a) =>
        a.type === "belongsTo" &&
        a.options.counterCache &&
        (parentNames.has(a.options.className) || parentNames.has(camelize(a.name))),
    );
    if (belongsTo) {
      if (typeof belongsTo.options.counterCache === "string") {
        return belongsTo.options.counterCache;
      }
      return `${pluralize(underscore(childModel.name))}_count`;
    }
  }
  return `${assoc.name}_count`;
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
    HabtmBuilder.build(this, name, options as Record<string, unknown>, {
      defaultJoinTableName,
      singleFk,
      createHabtmJoinModel,
      modelRegistry,
    });
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
 * Shared by loadHasMany and loadHasOne so the gating rules can't drift.
 */
export function _canRouteThroughViaAssociationScope(
  reflection: unknown,
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
  const refl = reflection as {
    isThroughReflection?: () => boolean;
    isNested?: () => boolean;
  };
  if (typeof refl.isThroughReflection !== "function" || !refl.isThroughReflection()) {
    return false;
  }
  // Through-a-through (nested) cases — either the throughReflection
  // OR the sourceReflection is itself a ThroughReflection. Rails
  // exposes both via ThroughReflection#isNested (reflection.ts:1187);
  // PR 3c sticks with chain-length-2, so any nested shape falls back
  // to the 2-step loader.
  if (typeof refl.isNested === "function" && refl.isNested()) return false;
  const src = (reflection as { sourceReflection?: unknown }).sourceReflection as
    | { belongsTo?: () => boolean; isPolymorphic?: () => boolean }
    | undefined;
  if (!src) return false;
  // Polymorphic has_many / has_one source (rare): the chain walker
  // would need inversion machinery not present in PR 3c. Polymorphic
  // belongsTo source WITH sourceType is routed — AssociationScope's
  // _nextChainScope now uses ThroughReflection#joinPrimaryKeyFor(klass)
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
 * Disable-joins routing gate. Mirrors `_canRouteThroughViaAssociationScope`
 * but for `disable_joins: true` through associations — runs the chain
 * via the Rails-faithful `DisableJoinsAssociationScope` (per-step pluck
 * + IN list) rather than the legacy `loadHasManyThrough` 2-step.
 *
 * Currently routes: single-column and composite-key through
 * associations (PR #645), polymorphic-source + `sourceType`
 * through-associations (PR #661), and nested-through
 * (`has_many :through → has_many :through`) associations (this PR).
 * Rails' DJAS has no routing gate at all and handles each shape via
 * the generic chain walk — `reflection.chain` flattens nested-through
 * into a straight list of reflection steps, and `_getChain` / the
 * reverseChain walk iterate that list uniformly.
 */
function _canRouteThroughViaDisableJoinsAssociationScope(
  reflection: unknown,
  options: AssociationOptions,
): boolean {
  if (!reflection) return false;
  if (!options.disableJoins) return false;
  const refl = reflection as {
    isThroughReflection?: () => boolean;
  };
  if (typeof refl.isThroughReflection !== "function" || !refl.isThroughReflection()) return false;
  const src = (reflection as { sourceReflection?: unknown }).sourceReflection as
    | { isPolymorphic?: () => boolean }
    | undefined;
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
 * Build (or return cached) base AssociationScope. When the owner has
 * a registered `Association` instance for this name, route through
 * its `associationScope()` so calls hit Rails' `@association_scope`-
 * style memoization (cleared on `reload()`). Without an instance,
 * fall back to a fresh `AssociationScope.scope(...)` build — matches
 * test paths that exercise loaders without going through
 * `record.association(name)`.
 *
 * Disable-joins associations bypass the cache (Rails' `Association#scope`
 * creates a fresh `DisableJoinsAssociationScope` per call,
 * association.rb:107-117). The disableJoins routing is already
 * handled above this call site, so falling through to the fresh
 * `AssociationScope.scope(...)` here only matters if a future caller
 * stretches the contract.
 */
function _builtAssociationScope(
  record: Base,
  assocName: string,
  reflection: unknown,
  targetModel: typeof Base,
): unknown {
  // Materialize the Association instance if missing — proxy paths
  // (CollectionProxy, AssociationProxy) call loaders directly without
  // first going through `record.association(name)`, so an instance-
  // only cache wouldn't hit in the common case. Rails caches on the
  // Association instance too, but Rails' proxy IS the Association so
  // the instance always exists. Calling `record.association(name)`
  // here bridges that gap.
  let instance: { disableJoins?: boolean; associationScope?: () => unknown } | undefined;
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
  if (instance && !instance.disableJoins && typeof instance.associationScope === "function") {
    return instance.associationScope();
  }
  return AssociationScope.scope({
    owner: record,
    reflection: reflection as never,
    klass: targetModel,
  });
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
 */
export function ownerHasUnresolvedThroughKey(record: Base, reflection: unknown): boolean {
  if (record.isNewRecord()) return true;
  const activeRecordPk = (reflection as { activeRecordPrimaryKey?: string | string[] })
    .activeRecordPrimaryKey;
  const ownerPkCols =
    activeRecordPk == null ? [] : Array.isArray(activeRecordPk) ? activeRecordPk : [activeRecordPk];
  return ownerPkCols.some((col) => {
    const v = record._readAttribute(col);
    return v === null || v === undefined;
  });
}

async function _loadThroughViaDisableJoinsScope(
  record: Base,
  reflection: unknown,
  options?: AssociationOptions,
): Promise<Base[]> {
  if (ownerHasUnresolvedThroughKey(record, reflection)) return [];
  // Lazy-import to avoid an eager cycle: DJAS imports
  // DisableJoinsAssociationRelation → relation.ts → associations.ts.
  const { DisableJoinsAssociationScope } =
    await import("./associations/disable-joins-association-scope.js");
  const klass = (reflection as { klass: typeof Base }).klass;
  // DJAS.scope() now returns a sync deferred-chain Relation — the
  // async chain walk runs on first toArray(). No more Promise<{relation}>
  // boxing to unwrap.
  let rel: unknown = DisableJoinsAssociationScope.INSTANCE.scope({
    owner: record,
    reflection: reflection as any,
    klass,
  });
  // Apply caller-supplied `options.scope` when it differs from the
  // reflection's own scope — same rule the JOIN-based loaders use
  // (line 488 etc.). Skipping when equal avoids double-application
  // since DJAS already consumed the reflection's scope via constraints.
  const reflScope = (reflection as { scope?: unknown }).scope;
  if (options?.scope && options.scope !== reflScope) {
    rel = options.scope(rel as never);
  }
  return (rel as { toArray: () => Promise<Base[]> }).toArray();
}

/**
 * Sync loaded result to the association instance if one exists.
 */
function syncToAssociationInstance(record: Base, assocName: string, result: unknown): void {
  const instances = (record as any)._associationInstances as Map<string, any> | undefined;
  if (instances?.has(assocName)) {
    instances.get(assocName)!.setTarget(result);
  }
}

/**
 * Load a belongs_to association.
 */
export async function loadBelongsTo(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base | null;
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base | null;
  }

  // Strict loading check: this is a lazy load
  if ((record as any)._strictLoading && !(record as any)._strictLoadingBypassCount) {
    throw StrictLoadingViolationError.forAssociation(record, assocName);
  }

  const ctor = record.constructor as typeof Base;
  const defaultFk = `${underscore(assocName)}_id`;

  // Polymorphic: use the _type column to determine the target model
  let className: string;
  if (options.polymorphic) {
    const typeCol = `${underscore(assocName)}_type`;
    const typeName = record._readAttribute(typeCol) as string | null;
    if (!typeName) return null;
    className = typeName;
  } else {
    className = options.className ?? camelize(assocName);
  }

  const targetModel = resolveModel(className);

  if (options.inverseOf && !options.polymorphic) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  // Resolve foreign key and primary key (may be arrays for CPK).
  const foreignKey =
    options.foreignKey ??
    (options.queryConstraints
      ? options.queryConstraints
      : Array.isArray(targetModel.primaryKey) && !options.primaryKey
        ? targetModel.primaryKey.map((col: string) => `${underscore(assocName)}_${col}`)
        : defaultFk);
  const primaryKey = options.primaryKey ?? targetModel.primaryKey;

  // Route through AssociationScope when reflection is registered.
  // For polymorphic belongsTo, AssociationScope receives the
  // runtime-resolved klass; the reflection's own joinPrimaryKey
  // returns associationPrimaryKey (target's PK) and joinForeignKey
  // returns the owner-side FK, so the WHERE shape is identical to
  // the non-polymorphic case.
  const reflection = ctor._reflectOnAssociation?.(assocName);
  // Null-FK short-circuit: avoid a query when owner's FK column is null.
  // The check must read the SAME columns the eventual query uses —
  // reflection.joinForeignKey when routing through AssociationScope,
  // options-derived foreignKey otherwise. Reading from a different
  // column would silently return null while a real query would have
  // found the row (or vice versa).
  const fkColsForCheck = reflection
    ? Array.isArray((reflection as any).joinForeignKey)
      ? ((reflection as any).joinForeignKey as string[])
      : [(reflection as any).joinForeignKey as string]
    : Array.isArray(foreignKey)
      ? foreignKey
      : [foreignKey as string];
  for (const fk of fkColsForCheck) {
    const v = record._readAttribute(fk);
    if (v === null || v === undefined) return null;
  }

  let result: Base | null;
  if (reflection) {
    const built = _builtAssociationScope(record, assocName, reflection, targetModel) as any;
    const baseRelation = (targetModel as any).scopeForAssociation?.() ?? (targetModel as any).all();
    let rel = baseRelation.merge(built);
    if (options.scope && options.scope !== (reflection as any).scope) {
      rel = options.scope(rel);
    }
    result = await rel.first();
  } else {
    // Inline fallback: no reflection registered.
    if (Array.isArray(foreignKey)) {
      const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
      if (pkCols.length !== foreignKey.length) {
        throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[pkCols[i]] = record._readAttribute(foreignKey[i]);
      }
      result = await targetModel.findBy(conditions);
    } else {
      result = await targetModel.findBy({
        [primaryKey as string]: record._readAttribute(foreignKey as string),
      });
    }
  }

  // Set inverse_of: store reference back to the owner
  if (result && options.inverseOf) {
    (result as any)._cachedAssociations = (result as any)._cachedAssociations ?? new Map();
    (result as any)._cachedAssociations.set(options.inverseOf, record);
  }

  syncToAssociationInstance(record, assocName, result);
  return result;
}

/**
 * Load a has_one association.
 */
export async function loadHasOne(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  if (options.through) {
    validateThroughReflection(record.constructor as typeof Base, assocName);
  }
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base | null;
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base | null;
  }

  // Strict loading check
  if ((record as any)._strictLoading && !(record as any)._strictLoadingBypassCount) {
    throw StrictLoadingViolationError.forAssociation(record, assocName);
  }

  // Handle has_one :through. Same routing rules as loadHasMany —
  // route through AssociationScope's JOIN-based path for the simple
  // shape; everything else falls back to the 2-step loadHasOneThrough.
  if (options.through) {
    const ctorEarly = record.constructor as typeof Base;
    const reflEarly = ctorEarly._reflectOnAssociation?.(assocName);
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflEarly, options)) {
      const records = await _loadThroughViaDisableJoinsScope(record, reflEarly, options);
      return records[0] ?? null;
    }
    if (!_canRouteThroughViaAssociationScope(reflEarly, options)) {
      return loadHasOneThrough(record, assocName, options);
    }
    // Fall through into the AssociationScope path below.
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(assocName);
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveModel(className);

  if (options.inverseOf) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  // Resolve FK columns (may be array for CPK; `:as` swaps to the
  // polymorphic FK column).
  const foreignKey = options.as
    ? (options.foreignKey ?? `${underscore(options.as)}_id`)
    : (options.foreignKey ??
      (options.queryConstraints
        ? options.queryConstraints
        : Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));

  // Polymorphic `:as` doesn't model composite owner-PK or composite
  // FK in Rails. Reject explicitly so the caller gets a clear error
  // rather than `readAttribute(undefined)` building a broken WHERE.
  if (options.as && (Array.isArray(primaryKey) || Array.isArray(foreignKey))) {
    throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
  }
  // Route through AssociationScope (handles scalar, composite, :as, STI
  // in a single Rails-faithful path). reflection.isCollection() === false
  // for hasOne, so AssociationScope.scope adds limit(1) automatically.
  const reflection = ctor._reflectOnAssociation?.(assocName);
  // Null-PK short-circuit: read the SAME columns the eventual query
  // reads. For non-through, reflection.joinForeignKey is the owner-
  // side activeRecordPrimaryKey for hasOne. For through reflections,
  // joinForeignKey delegates to the SOURCE reflection (whose FK is on
  // the through table, not the owner). The relevant owner-side
  // column is on the through_reflection.
  const reflForOwnerFk =
    reflection && (reflection as any).throughReflection
      ? ((reflection as any).throughReflection as { joinForeignKey: string | string[] })
      : reflection
        ? (reflection as { joinForeignKey: string | string[] })
        : null;
  const pkCheckCols = reflForOwnerFk
    ? Array.isArray(reflForOwnerFk.joinForeignKey)
      ? reflForOwnerFk.joinForeignKey
      : [reflForOwnerFk.joinForeignKey]
    : Array.isArray(primaryKey)
      ? primaryKey
      : [primaryKey as string];
  for (const pk of pkCheckCols) {
    const v = record._readAttribute(pk);
    if (v === null || v === undefined) return null;
  }

  let result: Base | null;
  if (reflection) {
    const built = _builtAssociationScope(record, assocName, reflection, targetModel) as any;
    const baseRelation = (targetModel as any).scopeForAssociation?.() ?? (targetModel as any).all();
    let rel = baseRelation.merge(built);
    if (options.scope && options.scope !== (reflection as any).scope) {
      rel = options.scope(rel);
    }
    result = await rel.first();
  } else {
    // Inline fallback: no reflection registered.
    if (Array.isArray(foreignKey)) {
      const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
      if (pkCols.length !== foreignKey.length) {
        throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[foreignKey[i]] = record._readAttribute(pkCols[i]);
      }
      result = await targetModel.findBy(conditions);
    } else if (options.as) {
      const typeCol = `${underscore(options.as)}_type`;
      result = await targetModel.findBy({
        [foreignKey as string]: record._readAttribute(primaryKey as string),
        [typeCol]: ctor.name,
      });
    } else if (options.scope) {
      let rel = (targetModel as any)
        .all()
        .where({ [foreignKey as string]: record._readAttribute(primaryKey as string) });
      rel = options.scope(rel);
      result = await rel.first();
    } else {
      result = await targetModel.findBy({
        [foreignKey as string]: record._readAttribute(primaryKey as string),
      });
    }
  }

  // Set inverse_of: store reference back to the owner
  if (result && options.inverseOf) {
    (result as any)._cachedAssociations = (result as any)._cachedAssociations ?? new Map();
    (result as any)._cachedAssociations.set(options.inverseOf, record);
  }

  syncToAssociationInstance(record, assocName, result);
  return result;
}

/**
 * Build (but don't save) a has_one associated record.
 *
 * Mirrors: ActiveRecord::Associations::HasOneAssociation#build_record
 */
export function buildHasOne(
  record: Base,
  _assocName: string,
  options: AssociationOptions,
  attrs: Record<string, unknown> = {},
): Base {
  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(_assocName);
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const foreignKey = options.as
    ? (options.foreignKey ?? `${underscore(options.as)}_id`)
    : (options.foreignKey ?? `${underscore(ctor.name)}_id`);

  const buildAttrs: Record<string, unknown> = {
    ...attrs,
    [foreignKey as string]: record._readAttribute(primaryKey as string),
  };
  if (options.as) {
    buildAttrs[`${underscore(options.as)}_type`] = ctor.name;
  }

  let targetModel = resolveModel(className);
  const inheritanceCol = getInheritanceColumn(targetModel);
  if (inheritanceCol && buildAttrs[inheritanceCol]) {
    const typeName = buildAttrs[inheritanceCol] as string;
    targetModel = findStiClass(targetModel, typeName);
  }

  return new targetModel(buildAttrs);
}

/**
 * Build (but don't save) a belongs_to associated record.
 *
 * Mirrors: ActiveRecord::Associations::BelongsToAssociation#build_record
 */
export function buildBelongsTo(
  _record: Base,
  _assocName: string,
  options: AssociationOptions,
  attrs: Record<string, unknown> = {},
): Base {
  const className = options.className ?? camelize(_assocName);

  let targetModel = resolveModel(className);
  const inheritanceCol = getInheritanceColumn(targetModel);
  if (inheritanceCol && attrs[inheritanceCol]) {
    const typeName = attrs[inheritanceCol] as string;
    targetModel = findStiClass(targetModel, typeName);
  }

  return new targetModel(attrs);
}

/**
 * Load a has_many association.
 */
export async function loadHasMany(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base[]> {
  if (options.through) {
    validateThroughReflection(record.constructor as typeof Base, assocName);
  }
  // Check cached (inverse_of) first, then preloaded
  if ((record as any)._cachedAssociations?.has(assocName)) {
    return (record as any)._cachedAssociations.get(assocName) as Base[];
  }
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base[];
  }

  // Strict loading check
  if ((record as any)._strictLoading && !(record as any)._strictLoadingBypassCount) {
    throw StrictLoadingViolationError.forAssociation(record, assocName);
  }

  // Handle through associations. Routes through AssociationScope's
  // JOIN-based path for the simple shape (see
  // _canRouteThroughViaAssociationScope); everything else stays on the
  // 2-step loadHasManyThrough.
  if (options.through) {
    const ctorEarly = record.constructor as typeof Base;
    const reflEarly = ctorEarly._reflectOnAssociation?.(assocName);
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflEarly, options)) {
      return _loadThroughViaDisableJoinsScope(record, reflEarly, options);
    }
    if (!_canRouteThroughViaAssociationScope(reflEarly, options)) {
      return loadHasManyThrough(record, assocName, options);
    }
    // Fall through into the AssociationScope path below.
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveModel(className);

  if (options.inverseOf) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  // Resolve FK columns (may be array for CPK; `:as` swaps to the
  // polymorphic FK column).
  const foreignKey = options.as
    ? (options.foreignKey ?? `${underscore(options.as)}_id`)
    : (options.foreignKey ??
      (options.queryConstraints
        ? options.queryConstraints
        : Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));

  // Polymorphic `:as` doesn't model composite owner-PK or composite
  // FK in Rails. Reject explicitly so the caller gets a clear error
  // rather than `readAttribute(undefined)` building a broken WHERE.
  if (options.as && (Array.isArray(primaryKey) || Array.isArray(foreignKey))) {
    throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
  }
  // Route through AssociationScope when we have a reflection registered.
  // AssociationScope handles scalar, composite, polymorphic `:as`, and
  // STI in a single path matching Rails' `AssociationScope.scope`.
  // Inline fallback only when the reflection hasn't been registered
  // (happens in tests that define associations via the lower-level API
  // without going through Reflection.create).
  const reflection = ctor._reflectOnAssociation?.(assocName);
  // Null-FK short-circuit: read the SAME columns the eventual query
  // reads. For non-through, reflection.joinForeignKey is the owner-
  // side activeRecordPrimaryKey for hasMany. For through reflections,
  // joinForeignKey delegates to the SOURCE reflection (whose FK is on
  // the through table, not the owner) — wrong column. The relevant
  // owner-side column is on the through_reflection (chain.last in the
  // chain ordering).
  const reflForOwnerFk =
    reflection && (reflection as any).throughReflection
      ? ((reflection as any).throughReflection as { joinForeignKey: string | string[] })
      : reflection
        ? (reflection as { joinForeignKey: string | string[] })
        : null;
  const fkCheckPks = reflForOwnerFk
    ? Array.isArray(reflForOwnerFk.joinForeignKey)
      ? reflForOwnerFk.joinForeignKey
      : [reflForOwnerFk.joinForeignKey]
    : Array.isArray(primaryKey)
      ? primaryKey
      : [primaryKey as string];
  for (const pk of fkCheckPks) {
    const v = record._readAttribute(pk);
    if (v === null || v === undefined) return [];
  }

  let rel: any;
  if (reflection) {
    // Rails' `Association#scope` is
    //   AssociationRelation.create(klass, self).merge!(klass.scope_for_association)
    // (association.rb:313), so the unscoped+constraints relation MUST
    // be merged with `klass.scope_for_association` — otherwise default_scope
    // / scope extensions silently disappear. AssociationScope.scope
    // already merges `reflection.scope` (macro-time lambda) via scopeFor;
    // skip re-applying `options.scope` ONLY when it's that exact same
    // function. Callers like `loadHasManyThrough` synthesize a NEW
    // `options.scope` (wrapping with `sourceType` filtering) — those
    // must still run.
    const built = _builtAssociationScope(record, assocName, reflection, targetModel) as any;
    const baseRelation = (targetModel as any).scopeForAssociation?.() ?? (targetModel as any).all();
    rel = baseRelation.merge(built);
    if (options.scope && options.scope !== (reflection as any).scope) {
      rel = options.scope(rel);
    }
  } else {
    // Inline fallback: no reflection (lower-level test helpers).
    if (Array.isArray(foreignKey)) {
      const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey];
      if (pkCols.length !== foreignKey.length) {
        throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[foreignKey[i]] = record._readAttribute(pkCols[i]);
      }
      rel = (targetModel as any).all().where(conditions);
    } else if (options.as) {
      const typeCol = `${underscore(options.as)}_type`;
      rel = (targetModel as any).all().where({
        [foreignKey as string]: record._readAttribute(primaryKey as string),
        [typeCol]: ctor.name,
      });
    } else {
      rel = (targetModel as any)
        .all()
        .where({ [foreignKey as string]: record._readAttribute(primaryKey as string) });
    }
    if (options.scope) rel = options.scope(rel);
  }
  const results: Base[] = await rel.toArray();

  // Set inverse_of on each loaded child
  if (options.inverseOf) {
    for (const child of results) {
      (child as any)._cachedAssociations = (child as any)._cachedAssociations ?? new Map();
      (child as any)._cachedAssociations.set(options.inverseOf, record);
    }
  }

  syncToAssociationInstance(record, assocName, results);
  return results;
}

/**
 * Compute the WHERE condition hash that scopes a hasMany relation to its
 * owner. Returns null if primary key values are missing (Rails'
 * NullRelation fallback). Pure — no Relation construction.
 *
 * Shared by `buildHasManyRelation` (which wraps it in `all().where(...)`)
 * and CollectionProxy's constructor (which seeds its own where-clause
 * via the same condition).
 */
export function computeHasManyWhere(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Record<string, unknown> | null {
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  if (options.as) {
    const foreignKey = options.foreignKey ?? `${underscore(options.as)}_id`;
    if (Array.isArray(foreignKey) || Array.isArray(primaryKey)) {
      throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
    }
    const pkValue = record._readAttribute(primaryKey as string);
    if (pkValue === null || pkValue === undefined) return null;
    const typeCol = `${underscore(options.as)}_type`;
    return { [foreignKey as string]: pkValue, [typeCol]: ctor.name };
  }

  const foreignKey =
    options.foreignKey ??
    (options.queryConstraints
      ? options.queryConstraints
      : Array.isArray(primaryKey)
        ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
        : `${underscore(ctor.name)}_id`);

  if (Array.isArray(foreignKey)) {
    // Composite FK requires a composite PK of matching length — otherwise
    // we'd silently readAttribute(undefined) and produce a bogus/empty
    // scope. Existing loaders throw CompositePrimaryKeyMismatchError; do
    // the same here so CollectionProxy construction fails loudly.
    if (!Array.isArray(primaryKey) || primaryKey.length !== foreignKey.length) {
      throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
    }
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < foreignKey.length; i++) {
      const pkVal = record._readAttribute(primaryKey[i]);
      if (pkVal === null || pkVal === undefined) return null;
      conditions[foreignKey[i]] = pkVal;
    }
    return conditions;
  }

  // Scalar FK: a composite PK here is a mismatch too.
  if (Array.isArray(primaryKey)) {
    throw new CompositePrimaryKeyMismatchError(ctor.name, assocName);
  }
  const pkValue = record._readAttribute(primaryKey as string);
  if (pkValue === null || pkValue === undefined) return null;
  return { [foreignKey]: pkValue };
}

/**
 * Build the relation for a hasMany association without executing it.
 * Skips caching, strict loading, and inverse_of — used by countHasMany
 * so resetCounters works under strict loading.
 * Returns null if primary key values are missing.
 */
export function buildHasManyRelation(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): any | null {
  const conditions = computeHasManyWhere(record, assocName, options);
  if (conditions === null) return null;
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);
  let rel = (targetModel as any).all().where(conditions);
  if (options.scope) rel = options.scope(rel);
  return rel;
}

/**
 * Count associated records for a hasMany association using COUNT(*)
 * without loading records into memory. Bypasses strict loading checks
 * so resetCounters works on strict-loading models.
 */
export async function countHasMany(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<number> {
  if (options.through) {
    // Temporarily disable strict loading so through-association loading works
    (record as any)._strictLoadingBypassCount++;
    try {
      const records = await loadHasManyThrough(record, assocName, options);
      return records.length;
    } finally {
      (record as any)._strictLoadingBypassCount--;
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
 * Load a has_many :through association.
 */
export async function loadHasManyThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base[]> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw new ConfigurationError(
      `Through association "${options.through}" not found on ${ctor.name}`,
    );
  }

  // Resolve the target model
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);

  // The source defaults to the singularized association name
  const sourceName = options.source ?? singularize(assocName);

  // Look up the source association on the through model early so we can
  // push sourceType filtering into the through query
  const throughClassName =
    throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
  const throughModel = resolveModel(throughClassName);
  const throughModelAssocs: AssociationDefinition[] = (throughModel as any)._associations ?? [];
  const sourceAssoc =
    throughModelAssocs.find((a) => a.name === sourceName) ??
    throughModelAssocs.find((a) => a.name === pluralize(sourceName));
  const sourceAssocKind = sourceAssoc?.type ?? "belongsTo";

  // Load through records
  let throughRecords: Base[];
  if (throughAssoc.type === "hasMany") {
    // If sourceType is set, add the type filter to the through query
    if (
      options.sourceType &&
      sourceAssoc?.options?.polymorphic &&
      sourceAssocKind === "belongsTo"
    ) {
      const resolvedSourceName = sourceAssoc?.name ?? sourceName;
      const sourceTypeCol = `${underscore(resolvedSourceName)}_type`;
      const originalScope = throughAssoc.options.scope;
      const augmentedOptions = {
        ...throughAssoc.options,
        scope: (rel: any) => {
          let r = rel.where({ [sourceTypeCol]: options.sourceType });
          if (originalScope) r = originalScope(r);
          return r;
        },
      };
      throughRecords = await loadHasMany(record, throughAssoc.name, augmentedOptions);
    } else {
      throughRecords = await loadHasMany(record, throughAssoc.name, throughAssoc.options);
    }
  } else if (throughAssoc.type === "hasOne") {
    const one = await loadHasOne(record, throughAssoc.name, throughAssoc.options);
    throughRecords = one ? [one] : [];
  } else if (throughAssoc.type === "belongsTo") {
    const one = await loadBelongsTo(record, throughAssoc.name, throughAssoc.options);
    throughRecords = one ? [one] : [];
  } else {
    throughRecords = [];
  }

  if (throughRecords.length === 0) return [];

  if (sourceAssocKind === "belongsTo") {
    // Through record has FK pointing to target (e.g., tagging.tag_id -> tag.id)
    const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;

    const targetIds = throughRecords
      .map((r) => r._readAttribute(targetFk as string))
      .filter((v) => v !== null && v !== undefined);
    if (targetIds.length === 0) return [];
    let rel = (targetModel as any).all().where({ [targetModel.primaryKey as string]: targetIds });
    if (options.scope) rel = options.scope(rel);
    return rel.toArray();
  } else {
    // Source is has_many/has_one: target has FK pointing back to through record
    const sourceAsName = sourceAssoc?.options?.as;
    const throughClassName =
      throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
    const sourceFk = sourceAsName
      ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
      : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
    const throughIds = throughRecords
      .map((r) => r._readAttribute((r.constructor as typeof Base).primaryKey as string))
      .filter((v) => v !== null && v !== undefined);
    if (throughIds.length === 0) return [];
    const whereConditions: Record<string, unknown> = { [sourceFk as string]: throughIds };
    if (sourceAsName) whereConditions[`${underscore(sourceAsName)}_type`] = throughClassName;
    let rel2 = (targetModel as any).all().where(whereConditions);
    if (options.scope) rel2 = options.scope(rel2);
    return rel2.toArray();
  }
}

/**
 * Load a has_one :through association.
 */
export async function loadHasOneThrough(
  record: Base,
  assocName: string,
  options: AssociationOptions,
): Promise<Base | null> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const throughAssoc = associations.find((a) => a.name === options.through);
  if (!throughAssoc) {
    throw new ConfigurationError(
      `Through association "${options.through}" not found on ${ctor.name}`,
    );
  }

  // Load the through record (could be has_one or belongs_to)
  let throughRecord: Base | null;
  if (throughAssoc.type === "hasOne") {
    throughRecord = await loadHasOne(record, throughAssoc.name, throughAssoc.options);
  } else if (throughAssoc.type === "belongsTo") {
    throughRecord = await loadBelongsTo(record, throughAssoc.name, throughAssoc.options);
  } else if (throughAssoc.type === "hasMany") {
    const throughRecords = await loadHasMany(record, throughAssoc.name, throughAssoc.options);
    throughRecord = throughRecords[0] ?? null;
  } else {
    throughRecord = null;
  }

  if (!throughRecord) return null;

  // Now load the source from the through record
  const sourceName = options.source ?? assocName;
  const throughCtor = throughRecord.constructor as typeof Base;
  const throughAssociations: AssociationDefinition[] = (throughCtor as any)._associations ?? [];
  const sourceAssoc = throughAssociations.find((a) => a.name === sourceName);

  if (sourceAssoc) {
    if (sourceAssoc.type === "belongsTo") {
      return loadBelongsTo(throughRecord, sourceName, sourceAssoc.options);
    } else if (sourceAssoc.type === "hasOne") {
      return loadHasOne(throughRecord, sourceName, sourceAssoc.options);
    }
  }

  // Fallback: try as belongs_to by convention
  const className = options.className ?? camelize(sourceName);
  const targetFk = `${underscore(sourceName)}_id`;
  const fkValue = throughRecord._readAttribute(targetFk);
  if (fkValue === null || fkValue === undefined) return null;
  const targetModel = resolveModel(className);
  return targetModel.findBy({ [targetModel.primaryKey as string]: fkValue });
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

  // Define FK attributes
  JoinModel.attribute(ownerFk, "integer");
  JoinModel.attribute(targetFk, "integer");

  // Delegate adapter to the left (declaring) model
  Object.defineProperty(JoinModel, "adapter", {
    get() {
      return lhsModel.adapter;
    },
    set(_v: unknown) {
      /* no-op: always delegates to lhs */
    },
    configurable: true,
  });

  // Add belongsTo associations matching what loadHasManyThrough expects
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
  (JoinModel as any)._associations = joinAssocs;

  for (const assocDef of joinAssocs) {
    const ref = Reflection.create(
      assocDef.type as any,
      assocDef.name,
      null,
      assocDef.options as Record<string, unknown>,
      JoinModel,
    );
    Reflection.addReflection(JoinModel, assocDef.name, ref as any);
  }

  return JoinModel;
}

function singleFk(fk: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(fk)) {
    throw new ConfigurationError("HABTM associations do not support composite foreign keys");
  }
  return fk ?? fallback;
}

/** Resolve the owner primary key column for HABTM, respecting options.primaryKey. */
function habtmOwnerPk(options: AssociationOptions, ctor: typeof Base): string {
  const pk = options.primaryKey ?? ctor.primaryKey;
  if (Array.isArray(pk)) {
    throw new ConfigurationError("HABTM associations do not support composite primary keys");
  }
  return pk as string;
}

function defaultJoinTableName(model1: typeof Base, assocName: string): string {
  const table1 = underscore(model1.name);
  const table2 = underscore(assocName);
  // Sort alphabetically
  const sorted = [pluralize(table1), table2].sort();
  return sorted.join("_");
}

/**
 * Load a has_and_belongs_to_many association.
 */
export async function loadHabtm(
  record: Base,
  assocName: string,
  options: AssociationOptions & { joinTable?: string },
): Promise<Base[]> {
  // Check preloaded cache first
  if ((record as any)._preloadedAssociations?.has(assocName)) {
    return (record as any)._preloadedAssociations.get(assocName) as Base[];
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);
  const joinTable = options.joinTable ?? defaultJoinTableName(ctor, assocName);
  const ownerFk = singleFk(options.foreignKey, `${underscore(ctor.name)}_id`);
  const targetFk = `${underscore(singularize(assocName))}_id`;
  const ownerPkCol = habtmOwnerPk(options, ctor);
  const pkValue = record._readAttribute(ownerPkCol);
  if (pkValue === null || pkValue === undefined) return [];

  // Reject composite target PKs
  const targetPkCol = targetModel.primaryKey;
  if (Array.isArray(targetPkCol)) {
    throw new Error("HABTM associations do not support composite primary keys on the target model");
  }

  // Use Arel subquery: SELECT target_fk FROM join_table WHERE owner_fk = ?
  const joinArelTable = new ArelTable(joinTable);
  const subquery = joinArelTable
    .project(joinArelTable.get(targetFk))
    .where(joinArelTable.get(ownerFk).eq(pkValue));

  const targetArelTable = new ArelTable(targetModel.tableName);
  const inNode = targetArelTable.get(targetPkCol as string).in(subquery);

  return (targetModel as any).all().where(inNode).toArray();
}

/**
 * Process dependent associations before destroying a record.
 */
export async function processDependentAssociations(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    // HABTM with through: handled by the middle hasMany's dependent: "delete"
    if (assoc.type === "hasAndBelongsToMany") {
      continue;
    }

    if (!assoc.options.dependent) continue;
    if (assoc.type !== "hasMany" && assoc.type !== "hasOne") continue;

    const dep = assoc.options.dependent;

    if (assoc.type === "hasMany") {
      const children = await loadHasMany(record, assoc.name, assoc.options);
      if (dep === "destroy") {
        for (const child of children) {
          await child.destroy();
        }
      } else if (dep === "delete") {
        // Bulk delete avoids N+1 on join tables (HABTM middle hasMany)
        const childModel = resolveModel(
          (assoc.options.className as string) ?? camelize(singularize(assoc.name)),
        );
        const fk = (assoc.options.foreignKey as string) ?? `${underscore(ctor.name)}_id`;
        const pkCol = Array.isArray(ctor.primaryKey) ? ctor.primaryKey[0] : ctor.primaryKey;
        await childModel.where({ [fk]: record._readAttribute(pkCol as string) }).deleteAll();
      } else if (dep === "nullify") {
        const asName = assoc.options.as;
        const foreignKey = asName
          ? (assoc.options.foreignKey ?? `${underscore(asName)}_id`)
          : (assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
        const typeCol = asName ? `${underscore(asName)}_type` : null;
        const nullifiedEntries = Object.entries(
          ForeignAssociation.nullifiedOwnerAttributes({ foreignKey, type: typeCol }),
        );
        for (const child of children) {
          for (const [col, val] of nullifiedEntries) {
            child._writeAttribute(col, val);
          }
          await child.save();
        }
      } else if (dep === "restrictWithException") {
        if (children.length > 0) {
          throw new DeleteRestrictionError(record, assoc.name);
        }
      } else if (dep === "restrictWithError") {
        if (children.length > 0) {
          (record as any).errors?.add("base", "invalid", {
            message: `Cannot delete record because dependent ${assoc.name} exist`,
          });
          throw new DeleteRestrictionError(record, assoc.name);
        }
      }
    } else if (assoc.type === "hasOne") {
      const child = await loadHasOne(record, assoc.name, assoc.options);
      if (!child) continue;
      if (dep === "destroy") {
        await child.destroy();
      } else if (dep === "delete") {
        await child.delete();
      } else if (dep === "nullify") {
        const hasOneAsName = assoc.options.as;
        const foreignKey = hasOneAsName
          ? (assoc.options.foreignKey ?? `${underscore(hasOneAsName)}_id`)
          : (assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`);
        const typeCol = hasOneAsName ? `${underscore(hasOneAsName)}_type` : null;
        const nullified = ForeignAssociation.nullifiedOwnerAttributes({
          foreignKey,
          type: typeCol,
        });
        for (const [col, val] of Object.entries(nullified)) {
          child._writeAttribute(col, val);
        }
        await child.save();
      } else if (dep === "restrictWithException") {
        throw new DeleteRestrictionError(record, assoc.name);
      } else if (dep === "restrictWithError") {
        (record as any).errors?.add("base", "invalid", {
          message: `Cannot delete record because dependent ${assoc.name} exists`,
        });
        throw new DeleteRestrictionError(record, assoc.name);
      }
    }
  }
}

/**
 * Fire one or more association callbacks (before_add, after_add, etc.).
 */
export function fireAssocCallbacks(
  cbs:
    | ((owner: Base, record: Base) => void | false)
    | ((owner: Base, record: Base) => void | false)[]
    | undefined,
  owner: Base,
  record: Base,
): boolean {
  if (!cbs) return true;
  const arr = Array.isArray(cbs) ? cbs : [cbs];
  for (const cb of arr) {
    if (cb(owner, record) === false) return false;
  }
  return true;
}

/**
 * Build a target record for a has_one :through association, along with
 * the intermediate (through) record. The intermediate record gets the
 * owner FK set; the source FK is wired when the target is saved.
 *
 * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation#build
 */
export function buildThroughAssociation(
  record: Base,
  assocName: string,
  attrs: Record<string, unknown> = {},
): { target: Base; through: Base } {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a) => a.name === assocName);
  if (!assocDef || !assocDef.options.through) {
    throw new ConfigurationError(
      `Association "${assocName}" is not a through association on ${ctor.name}`,
    );
  }
  if (assocDef.type !== "hasOne" && (assocDef.type as string) !== "hasOneThrough") {
    throw new Error(
      `buildThroughAssociation is only for has_one :through (got "${assocDef.type}" for ${ctor.name}#${assocName}). Use CollectionProxy for has_many :through.`,
    );
  }

  const throughAssoc = associations.find((a) => a.name === assocDef.options.through);
  if (!throughAssoc) {
    throw new Error(`Through association "${assocDef.options.through}" not found on ${ctor.name}`);
  }

  // Nested through is readonly
  if (
    throughAssoc.options.through ||
    (throughAssoc.type as string) === "hasManyThrough" ||
    (throughAssoc.type as string) === "hasOneThrough"
  ) {
    throw new HasOneThroughNestedAssociationsAreReadonly(ctor.name, assocName);
  }

  if (throughAssoc.type !== "hasOne" && throughAssoc.type !== "hasMany") {
    throw new Error(
      `buildThroughAssociation expects through association "${throughAssoc.name}" to be has_one/has_many (got "${throughAssoc.type}").`,
    );
  }

  // Build target record with STI support
  // has_one uses camelize(name) directly; singularize is for has_many
  const targetClassName = assocDef.options.className ?? camelize(assocName);
  let targetModel = resolveModel(targetClassName);
  const inheritanceCol = getInheritanceColumn(targetModel);
  if (inheritanceCol && attrs[inheritanceCol]) {
    targetModel = findStiClass(targetModel, String(attrs[inheritanceCol]));
  }
  const target = new targetModel(attrs);

  // Reject composite keys
  const ownerFkOption = throughAssoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
  const ownerPkOption = throughAssoc.options.primaryKey ?? ctor.primaryKey;
  if (Array.isArray(ownerFkOption) || Array.isArray(ownerPkOption)) {
    throw new ConfigurationError(
      "Composite foreignKey/primaryKey is not supported for through associations",
    );
  }

  // Build intermediate record with owner FK
  const throughClassName =
    throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
  const throughModel = resolveModel(throughClassName);
  const ownerFk = ownerFkOption as string;
  const ownerPk = ownerPkOption as string;
  const throughAttrs: Record<string, unknown> = {};
  if (throughAssoc.options.as) {
    const polyFk = throughAssoc.options.foreignKey
      ? (throughAssoc.options.foreignKey as string)
      : `${underscore(throughAssoc.options.as)}_id`;
    throughAttrs[polyFk] = record._readAttribute(ownerPk);
    throughAttrs[`${underscore(throughAssoc.options.as)}_type`] = ctor.name;
  } else {
    throughAttrs[ownerFk] = record._readAttribute(ownerPk);
  }
  const through = new throughModel(throughAttrs);

  return { target, through };
}

/**
 * Create a target record for a has_one :through association, along with
 * the intermediate (through) record. Both records are persisted.
 *
 * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation#create
 */
export async function createThroughAssociation(
  record: Base,
  assocName: string,
  attrs: Record<string, unknown> = {},
): Promise<Base> {
  const ctor = record.constructor as typeof Base;
  if (record.isNewRecord()) {
    throw new Error(`Cannot create through association on an unpersisted ${ctor.name}`);
  }

  const { target, through } = buildThroughAssociation(record, assocName, attrs);

  // Resolve source type before any saves to determine save ordering
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a) => a.name === assocName)!;
  const sourceName = assocDef.options.source ?? assocName;

  const throughCtor = through.constructor as typeof Base;
  const throughAssociations: AssociationDefinition[] = (throughCtor as any)._associations ?? [];
  const sourceAssocDef =
    throughAssociations.find((a) => a.name === sourceName) ??
    throughAssociations.find((a) => a.name === pluralize(sourceName));
  const sourceType = sourceAssocDef?.type ?? "belongsTo";

  let success = false;

  await record.transaction(async () => {
    if (sourceType === "belongsTo") {
      // belongsTo: FK on through record -> save target first to get PK, wire through, save through
      const targetSaved = await target.save();
      if (!targetSaved) throw new Rollback();

      const sourceFk = sourceAssocDef?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
      if (Array.isArray(sourceFk)) {
        throw new ConfigurationError(
          "createThroughAssociation does not support composite foreign keys",
        );
      }
      const targetPk =
        (sourceAssocDef?.options?.primaryKey as string) ??
        (target.constructor as typeof Base).primaryKey;
      if (Array.isArray(targetPk)) {
        throw new ConfigurationError(
          "createThroughAssociation does not support composite primary keys",
        );
      }
      through._writeAttribute(sourceFk as string, target._readAttribute(targetPk as string));
      if (sourceAssocDef?.options?.polymorphic) {
        const typeCol = `${underscore(sourceName)}_type`;
        const typeValue = assocDef.options.sourceType ?? (target.constructor as typeof Base).name;
        through._writeAttribute(typeCol, typeValue);
      }

      const throughSaved = await through.save();
      if (!throughSaved) throw new Rollback();
    } else if (sourceType === "hasOne" || sourceType === "hasMany") {
      // hasOne/hasMany: FK on target -> save through first to get PK, wire target, save target
      const throughSaved = await through.save();
      if (!throughSaved) throw new Rollback();

      const sourceAsName = sourceAssocDef?.options?.as;
      const targetFk = sourceAsName
        ? (sourceAssocDef?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
        : (sourceAssocDef?.options?.foreignKey ?? `${underscore(throughCtor.name)}_id`);
      if (Array.isArray(targetFk)) {
        throw new ConfigurationError(
          "createThroughAssociation does not support composite foreign keys",
        );
      }
      const throughPk = sourceAssocDef?.options?.primaryKey ?? throughCtor.primaryKey;
      if (Array.isArray(throughPk)) {
        throw new ConfigurationError(
          "createThroughAssociation does not support composite primary keys",
        );
      }
      target._writeAttribute(targetFk as string, through._readAttribute(throughPk as string));
      if (sourceAsName) {
        target._writeAttribute(`${underscore(sourceAsName)}_type`, throughCtor.name);
      }
      const targetSaved = await target.save();
      if (!targetSaved) throw new Rollback();
    } else {
      throw new Error(
        `createThroughAssociation: unsupported source type "${sourceType}" for ${assocName}`,
      );
    }

    success = true;
  });

  if (success) {
    (record as any)._cachedAssociations = (record as any)._cachedAssociations ?? new Map();
    (record as any)._cachedAssociations.set(assocName, target);
  } else {
    // Transaction rolled back — reset in-memory persisted state and PKs
    for (const rec of [target, through]) {
      rec._newRecord = true;
      const pk = (rec.constructor as typeof Base).primaryKey;
      if (!Array.isArray(pk)) {
        rec._writeAttribute(pk as string, null);
      }
    }
  }

  return target;
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
      const preloaded = record._preloadedAssociations?.get(assocName);
      if (preloaded != null) {
        const records = Array.isArray(preloaded) ? preloaded : [preloaded];
        existing._hydrateFromPreload(records as T[]);
      }
    }
    return existing;
  }

  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];
  const assocDef = associations.find((a) => a.name === assocName);
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
  const proxy = new _CollectionProxyCtor(record, assocName, assocDef) as CollectionProxy<T> & {
    _hydrateFromPreload: (records: T[]) => void;
  };

  // Hydrate from preloaded data if available
  const preloaded = record._preloadedAssociations?.get(assocName);
  if (preloaded != null) {
    const records = Array.isArray(preloaded) ? preloaded : [preloaded];
    proxy._hydrateFromPreload(records as T[]);
  }

  const wrapped = wrapCollectionProxy<T>(proxy);
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
      if (value !== undefined) return value;
      if (prop in target) return value;
      if (typeof prop === "symbol") return value;

      // Numeric indexing — `proxy[0]`, `proxy[1]` read the loaded target
      // via the public `target` accessor. Matches array semantics; same
      // constraint as the other array-likeness on CollectionProxy: reads
      // whatever's loaded. `await proxy` (or `await proxy.load()`) hydrates
      // `_target` first if you need a fresh load.
      if (typeof prop === "string" && NUMERIC_INDEX_PATTERN.test(prop)) {
        return target.target[Number(prop)];
      }

      if (target._record._strictLoading && !target._record._strictLoadingBypassCount) {
        throw StrictLoadingViolationError.forAssociation(target._record, target._assocName);
      }

      const scope = target.scope();
      const scopeVal = Reflect.get(scope, prop, scope);
      if (typeof scopeVal === "function") {
        return (...args: any[]) => scopeVal.apply(scope, args);
      }
      return scopeVal;
    },
  });
}

/**
 * Update counter caches after a record is created or destroyed.
 *
 * Mirrors: ActiveRecord::CounterCache
 */
export async function updateCounterCaches(
  record: Base,
  direction: "increment" | "decrement",
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (assoc.type !== "belongsTo" || !assoc.options.counterCache) continue;

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const fkValue = record._readAttribute(foreignKey as string);
    if (fkValue === null || fkValue === undefined) continue;

    // For polymorphic, resolve model from _type column
    let className: string;
    if (assoc.options.polymorphic) {
      const typeCol = `${underscore(assoc.name)}_type`;
      const typeName = record._readAttribute(typeCol) as string | null;
      if (!typeName) continue;
      className = typeName;
    } else {
      className = assoc.options.className ?? camelize(assoc.name);
    }
    const targetModel = resolveModel(className);

    // Counter column name
    const counterCol =
      typeof assoc.options.counterCache === "string"
        ? assoc.options.counterCache
        : `${pluralize(underscore(ctor.name))}_count`;

    const parent = await targetModel.findBy({ [targetModel.primaryKey as string]: fkValue });
    if (!parent) continue;

    if (direction === "increment") {
      await parent.incrementBang(counterCol);
    } else {
      await parent.decrementBang(counterCol);
    }
  }
}

/**
 * Touch parent associations after a record is saved or destroyed.
 *
 * Mirrors: ActiveRecord::Associations::Builder::BelongsTo touch option
 */
/**
 * Set a belongs_to association on a record.
 * Sets the foreign key and caches the associated record.
 * Also sets inverse_of on the target if configured.
 *
 * Mirrors: ActiveRecord::Associations::BelongsToAssociation#writer
 */
export function setBelongsTo(
  record: Base,
  assocName: string,
  target: Base | null,
  options: AssociationOptions = {},
): void {
  const targetCtor = target ? (target.constructor as typeof Base) : null;
  let resolvedPk: string | string[] = "id";
  if (options.primaryKey) {
    resolvedPk = options.primaryKey;
  } else if (targetCtor) {
    resolvedPk = targetCtor.primaryKey;
  } else if (options.className) {
    try {
      const resolved = resolveModel(options.className);
      resolvedPk = resolved.primaryKey;
    } catch {
      // model not registered, fall back to "id"
    }
  }
  const primaryKey = resolvedPk;
  const foreignKey =
    options.foreignKey ??
    options.queryConstraints ??
    (Array.isArray(primaryKey)
      ? primaryKey.map((col: string) => `${underscore(assocName)}_${col}`)
      : `${underscore(assocName)}_id`);

  if (target) {
    if (Array.isArray(foreignKey) && !Array.isArray(primaryKey)) {
      throw new Error(
        `Composite foreignKey for belongs_to "${assocName}" requires primaryKey to also be an array`,
      );
    }
    if (
      Array.isArray(foreignKey) &&
      Array.isArray(primaryKey) &&
      foreignKey.length !== primaryKey.length
    ) {
      throw new Error(
        `Mismatched composite keys for belongs_to "${assocName}": foreignKey length (${foreignKey.length}) does not match primaryKey length (${primaryKey.length})`,
      );
    }
    if (Array.isArray(foreignKey)) {
      const pkCols = primaryKey as string[];
      for (let i = 0; i < foreignKey.length; i++) {
        record._writeAttribute(foreignKey[i], target._readAttribute(pkCols[i]));
      }
    } else {
      if (Array.isArray(primaryKey)) {
        throw new Error(
          `belongs_to "${assocName}" has a single foreignKey but the target model has a composite primaryKey. Provide an explicit foreignKey array or primaryKey option.`,
        );
      }
      record._writeAttribute(foreignKey as string, target._readAttribute(primaryKey as string));
    }
    if (options.polymorphic) {
      const typeCol = `${underscore(assocName)}_type`;
      record._writeAttribute(typeCol, targetCtor!.name);
    }
  } else {
    if (Array.isArray(foreignKey)) {
      for (const fk of foreignKey) {
        record._writeAttribute(fk, null);
      }
    } else {
      record._writeAttribute(foreignKey as string, null);
    }
    if (options.polymorphic) {
      const typeCol = `${underscore(assocName)}_type`;
      record._writeAttribute(typeCol, null);
    }
  }

  // Cache the association
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, target);

  // Set inverse on target
  if (target && options.inverseOf) {
    if (!(target as any)._cachedAssociations) (target as any)._cachedAssociations = new Map();
    (target as any)._cachedAssociations.set(options.inverseOf, record);
  }
}

/**
 * Set a has_one association on a record.
 * Sets the foreign key on the target and caches.
 *
 * Mirrors: ActiveRecord::Associations::HasOneAssociation#writer
 */
export async function setHasOne(
  record: Base,
  assocName: string,
  target: Base | null,
  options: AssociationOptions = {},
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const pkValue = record._readAttribute(primaryKey as string);

  // Polymorphic "as" option
  const asName = options.as;
  const foreignKey = asName
    ? (options.foreignKey ?? `${underscore(asName)}_id`)
    : (options.foreignKey ?? `${underscore(ctor.name)}_id`);
  const typeCol = asName ? `${underscore(asName)}_type` : null;

  // Nullify old target
  const className = options.className ?? camelize(assocName);
  const targetModel = resolveModel(className);
  const findConditions: Record<string, unknown> = { [foreignKey as string]: pkValue };
  if (typeCol) findConditions[typeCol] = ctor.name;
  const existing = await targetModel.findBy(findConditions);
  if (existing && existing !== target) {
    existing._writeAttribute(foreignKey as string, null);
    if (typeCol) existing._writeAttribute(typeCol, null);
    await existing.save();
  }

  if (target) {
    target._writeAttribute(foreignKey as string, pkValue);
    if (typeCol) target._writeAttribute(typeCol, ctor.name);
    if (target.isPersisted()) await target.save();
  }

  // Cache
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, target);

  // Set inverse
  if (target && options.inverseOf) {
    if (!(target as any)._cachedAssociations) (target as any)._cachedAssociations = new Map();
    (target as any)._cachedAssociations.set(options.inverseOf, record);
  }
}

/**
 * Set a has_many association (replace entire collection).
 * Nullifies old targets' FKs, sets new ones.
 *
 * Mirrors: ActiveRecord::Associations::HasManyAssociation#writer
 */
export async function setHasMany(
  record: Base,
  assocName: string,
  targets: Base[],
  options: AssociationOptions = {},
): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const primaryKey = options.primaryKey ?? ctor.primaryKey;
  const pkValue = record._readAttribute(primaryKey as string);

  // Polymorphic "as" option
  const asName = options.as;
  const foreignKey = asName
    ? (options.foreignKey ?? `${underscore(asName)}_id`)
    : (options.foreignKey ?? `${underscore(ctor.name)}_id`);
  const typeCol = asName ? `${underscore(asName)}_type` : null;

  // Nullify old targets
  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveModel(className);
  const findConditions: Record<string, unknown> = { [foreignKey as string]: pkValue };
  if (typeCol) findConditions[typeCol] = ctor.name;
  const existing = await (targetModel as any).where(findConditions).toArray();
  for (const old of existing) {
    if (!targets.includes(old)) {
      old._writeAttribute(foreignKey, null);
      if (typeCol) old._writeAttribute(typeCol, null);
      await old.save();
    }
  }

  // Set FK on new targets
  for (const t of targets) {
    t._writeAttribute(foreignKey as string, pkValue);
    if (typeCol) t._writeAttribute(typeCol, ctor.name);
    if (t.isPersisted()) await t.save();

    // Set inverse
    if (options.inverseOf) {
      if (!(t as any)._cachedAssociations) (t as any)._cachedAssociations = new Map();
      (t as any)._cachedAssociations.set(options.inverseOf, record);
    }
  }

  // Cache the collection
  if (!(record as any)._cachedAssociations) (record as any)._cachedAssociations = new Map();
  (record as any)._cachedAssociations.set(assocName, targets);
}

export async function touchBelongsToParents(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (assoc.type !== "belongsTo" || !assoc.options.touch) continue;

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const fkValue = record._readAttribute(foreignKey as string);
    if (fkValue === null || fkValue === undefined) continue;

    let className: string;
    if (assoc.options.polymorphic) {
      const typeCol = `${underscore(assoc.name)}_type`;
      const typeName = record._readAttribute(typeCol) as string | null;
      if (!typeName) continue;
      className = typeName;
    } else {
      className = assoc.options.className ?? camelize(assoc.name);
    }
    const targetModel = resolveModel(className);

    const parent = await targetModel.findBy({ [targetModel.primaryKey as string]: fkValue });
    if (!parent) continue;

    const touchOpt = assoc.options.touch;
    if (touchOpt === true) {
      await parent.touch();
    } else if (typeof touchOpt === "string") {
      await parent.touch(touchOpt);
    } else if (Array.isArray(touchOpt) && touchOpt.length > 0) {
      await parent.touch(...(touchOpt as string[]));
    }
  }
}
