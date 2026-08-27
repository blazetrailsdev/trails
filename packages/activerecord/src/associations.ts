import type { Base } from "./base.js";
import "./relation.js";
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
export { _setCollectionProxyCtor } from "./associations/collection-proxy-slot.js";

import { ArgumentError } from "@blazetrails/activemodel";
import { StatementCache } from "./statement-cache.js";
import { HasManyThroughAssociationNotFoundError } from "./associations/errors.js";
import {
  AssociationNotFoundError,
  InverseOfAssociationNotFoundError,
} from "./associations/errors.js";
import { AssociationScope, invokeScopeLambda } from "./associations/association-scope.js";
import type { Association as AssociationInstance } from "./associations/association.js";
import { validateThroughReflection } from "./associations/validate-through-reflection.js";
export { joinTableName as joinHabtmTableNames } from "./migration/join-table.js";
import {
  constantize,
  registerConstant,
  unregisterConstant,
  privateConstant,
} from "@blazetrails/activesupport";
import { registerSubclass } from "./inheritance.js";
import { flushPendingCounterCacheColumns } from "./counter-cache.js";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { HasMany as HasManyBuilder } from "./associations/builder/has-many.js";
import { HasAndBelongsToMany as HabtmBuilder } from "./associations/builder/has-and-belongs-to-many.js";
import * as Reflection from "./reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";

export async function eagerLoadBang(): Promise<void> {}

export type CollectionCallback<K extends string> =
  | string
  | ((owner: Base, record: Base) => void | false)
  | { [P in K]: (owner: Base, record: Base) => void | false };

export interface AssociationOptions {
  foreignKey?: string | string[];
  className?: string;
  primaryKey?: string | string[];
  queryConstraints?: string[];
  dependent?:
    | "destroy"
    | "destroyAsync"
    | "nullify"
    | "delete"
    | "restrictWithException"
    | "restrictWithError";
  inverseOf?: string | false;
  through?: string;
  source?: string;
  sourceType?: string;
  polymorphic?: boolean;
  as?: string;
  counterCache?: boolean | string;
  touch?: boolean | string | string[];
  autosave?: boolean;
  validate?: boolean;
  required?: boolean;
  optional?: boolean;
  default?: (owner: Base) => Base | null | Promise<Base | null>;
  beforeAdd?: CollectionCallback<"beforeAdd"> | CollectionCallback<"beforeAdd">[];
  afterAdd?: CollectionCallback<"afterAdd"> | CollectionCallback<"afterAdd">[];
  beforeRemove?: CollectionCallback<"beforeRemove"> | CollectionCallback<"beforeRemove">[];
  afterRemove?: CollectionCallback<"afterRemove"> | CollectionCallback<"afterRemove">[];
  extend?:
    | Record<string, (...args: unknown[]) => unknown>
    | Record<string, (...args: unknown[]) => unknown>[];
  disableJoins?: boolean;
  associationForeignKey?: string;
  foreignType?: string;
  strictLoading?: boolean;
  indexErrors?: boolean | "nestedAttributesOrder";
}

export interface AssociationDefinition {
  type: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  name: string;
  options: AssociationOptions & { joinTable?: string };
  scope?: ((...args: any[]) => any) | null;
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  extensions?: () => any[];
  scopeFor?: (relation: any, owner?: any) => any;
  foreignKey?: string | string[];
  associationPrimaryKey?: (klass?: typeof Base) => string | string[];
  counterCacheColumn?: () => string | null;
  hasCachedCounter?: () => boolean;
  hasActiveCachedCounter?: () => boolean;
  isCounterMustBeUpdatedByHasMany?: () => boolean;
  inverseName?: () => string | null;
  isInverseUpdatesCounterCache?: () => unknown;
  klass?: typeof Base;
  foreignType?: string | null;
}

/** @internal */
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

/** @internal */
class ModelRegistry extends Map<string, typeof Base> {
  override set(name: string, model: typeof Base): this {
    registerModelConstant(name, model);
    return super.set(name, model);
  }

  override delete(name: string): boolean {
    const model = super.get(name);
    const deleted = super.delete(name);
    if (deleted) unregisterConstant(name, model);
    return deleted;
  }

  override clear(): void {
    for (const [name, model] of this) unregisterConstant(name, model);
    super.clear();
  }
}

export const modelRegistry = new ModelRegistry();

/** @internal */
function frameworkBase(model: typeof Base): typeof Base | null {
  let c: unknown = model;
  while (typeof c === "function" && c !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(c, "_isActiveRecordBase")) return c as typeof Base;
    c = Object.getPrototypeOf(c);
  }
  return null;
}

/** @internal */
function assertActiveRecordBase(model: typeof Base): void {
  if (!frameworkBase(model)) {
    throw new Error(
      `registerModel expects an ActiveRecord::Base subclass, got ${String(model?.name ?? model)}`,
    );
  }
}

/** @internal */
function guardCanonicalNameShadow(name: string, model: typeof Base): void {
  const canonical = canonicalModelAutoloadIndex?.get(name);
  if (canonical && canonical !== model) {
    throw new Error(
      `Registering a class under ${JSON.stringify(name)} would shadow the canonical model of the ` +
        `same name in the global registry, poisoning every later test that resolves it as an ` +
        `association target. Use the canonical model, or a distinct non-canonical name.`,
    );
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerModelConstant(name: string, model: typeof Base): void {
  guardCanonicalNameShadow(name, model);
  registerConstant(name, model);
}

/** @noRailsEquivalent PERMANENT */
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
      const proto = Object.getPrototypeOf(m) as typeof Base;
      if (proto && proto !== Function.prototype && proto !== frameworkBase(m)) {
        registerSubclass(m);
      }
    }
    return;
  }
  if (typeof nameOrModel === "string") {
    if (!model) throw new Error("registerModel(name, model) requires a model class");
    assertActiveRecordBase(model);
    modelRegistry.set(nameOrModel, model);
    const keys: string[] = model._registryKeys ?? [];
    if (!keys.includes(nameOrModel)) keys.push(nameOrModel);
    model._registryKeys = keys;
    flushPendingCounterCacheColumns(model, nameOrModel);
  } else {
    assertActiveRecordBase(nameOrModel);
    modelRegistry.set(nameOrModel.name, nameOrModel);
    const qualified = qualifiedName(nameOrModel);
    if (qualified !== nameOrModel.name) {
      registerModel(qualified, nameOrModel);
    }
    flushPendingCounterCacheColumns(nameOrModel, nameOrModel.name);
  }
}

/** @internal */
let canonicalModelAutoloadIndex: ReadonlyMap<string, typeof Base> | undefined;

/** @internal */
export function _setCanonicalModelAutoloadIndex(index: ReadonlyMap<string, typeof Base>): void {
  canonicalModelAutoloadIndex = index;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function autoloadModel(name: string): void {
  const bare = name.replace(/^::/, "");
  if (modelRegistry.has(bare)) return;
  const autoloaded = canonicalModelAutoloadIndex?.get(bare);
  if (autoloaded) registerModel(autoloaded);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
  if (refl && !refl.isPolymorphic?.()) {
    const richKlass = refl.klass;
    if (richKlass) return richKlass;
  }
  autoloadModel(className);
  return constantize(className) as typeof Base;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function validateInverseOf(
  owner: typeof Base,
  targetModel: typeof Base,
  assocName: string,
  inverseOf: string,
): void {
  const targetReflections = Reflection.reflections(targetModel);
  if (Object.keys(targetReflections).length === 0) return;
  if (targetModel._reflectOnAssociation(inverseOf) != null) return;

  throw new InverseOfAssociationNotFoundError(owner._reflectOnAssociation(assocName), targetModel);
}

/** @internal */
export function _resolveInverseName(
  ownerCtor: typeof Base,
  assocName: string,
  options: AssociationOptions,
): string | null {
  if (options.inverseOf === false) return null;
  if (typeof options.inverseOf === "string") return options.inverseOf;
  if (options.polymorphic) return null;
  const refl = ownerCtor._reflectOnAssociation?.(assocName);
  return refl?.inverseName?.() ?? null;
}

/** @internal */
export function _wireInverseAssociation(owner: Base, child: Base, inverseName: string): void {
  const childCtor = child.constructor as typeof Base;
  const inverseRefl = childCtor._reflectOnAssociation?.(inverseName);
  if (inverseRefl?.macro === "hasMany") {
    if (!inverseRefl.klass?.hasManyInversing) return;
    (
      child.association(inverseName) as unknown as { inversedFrom(record: Base): void }
    ).inversedFrom(owner);
    return;
  }
  _cacheSingularTarget(child, inverseName, owner);
}

/** @internal */
export function _cacheSingularTarget(record: Base, assocName: string, target: Base | null): void {
  const macro = (record.constructor as typeof Base)._reflectOnAssociation?.(assocName)?.macro;
  if (macro === "belongsTo" || macro === "hasOne") {
    const assoc = record.association(assocName);
    assoc.inversedFrom(target);
    return;
  }
  record._associationInstances.get(assocName)?.inversedFrom(target);
}

/** @internal */
export function _preloadedHolderTarget(
  record: Base,
  assocName: string,
): { value: Base | Base[] | null } | null {
  const instance = record._associationInstances.get(assocName) as
    | {
        isLoaded(): boolean;
        isStaleTarget(): boolean;
        _staleStateIsSnapshotted: boolean;
        target?: Base | Base[] | null;
      }
    | undefined;
  if (instance == null || !instance.isLoaded()) return null;
  if (instance._staleStateIsSnapshotted && instance.isStaleTarget()) return null;
  return { value: instance.target ?? null };
}

/** @internal */
export function _hmtNotFound(
  ctor: typeof Base,
  assocName: string,
  through: string,
): HasManyThroughAssociationNotFoundError {
  const dictionary = Object.keys(Reflection.reflections(ctor)).filter((n) => n !== assocName);
  const corrections = _correctNames(dictionary, through);
  return new HasManyThroughAssociationNotFoundError(ctor.name, through, assocName, corrections);
}

/** @internal */
export function _associationNotFound(record: Base, name: string): AssociationNotFoundError {
  const dictionary = Object.keys(Reflection.reflections(record.constructor as typeof Base));
  const corrections = _correctNames(dictionary, name);
  return new AssociationNotFoundError(record, name, corrections);
}

/** @internal */
export function _correctNames(dictionary: string[], input: string): string[] {
  return new SpellChecker({ dictionary }).correct(input);
}

export class Associations {
  static belongsTo(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
  ): void {
    const reflection = BelongsToBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasOne(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
  ): void {
    const reflection = HasOneBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasMany(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
  ): void {
    const reflection = HasManyBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  /** @missingRailsCall include — PERMANENT */
  static hasAndBelongsToMany(
    name: string,
    scope: ((...args: any[]) => any) | (AssociationOptions & { joinTable?: string }) | null = {},
    options: AssociationOptions & { joinTable?: string } = {},
  ): void {
    if (
      typeof scope === "object" &&
      scope !== null &&
      !Array.isArray(scope) &&
      !(scope instanceof Function)
    ) {
      options = scope;
      scope = null;
    }
    const rawClassName = (options as { className?: unknown }).className;
    if (typeof rawClassName === "symbol") {
      options = { ...options, className: rawClassName.description ?? "" };
    }
    const self = this as any;
    const positionalScope = (typeof scope === "function" ? scope : null) as
      | ((...args: any[]) => any)
      | null;
    const habtmReflection = new Reflection.HasAndBelongsToManyReflection(
      name,
      positionalScope,
      options as Record<string, unknown>,
      self,
    );

    const builder = new HabtmBuilder(name, self, options as Record<string, unknown>);

    const joinModel = builder.throughModel();

    const registryKey = `${self.name}::${joinModel.name}`;
    modelRegistry.set(registryKey, joinModel);
    privateConstant(registryKey);

    const middleReflection = builder.middleReflection(joinModel);
    const middleName = middleReflection.name;
    HasManyBuilder.defineCallbacks(self, middleReflection);
    Reflection.addReflection(self, middleName, middleReflection);
    middleReflection.parentReflection = habtmReflection;

    const HABTM_WRAPPED_NAMES = Symbol.for("blazetrails.habtm.destroyAssociations.names");
    const ownWrappedNames: Set<string> = Object.prototype.hasOwnProperty.call(
      self.prototype,
      HABTM_WRAPPED_NAMES,
    )
      ? self.prototype[HABTM_WRAPPED_NAMES]
      : Object.defineProperty(self.prototype, HABTM_WRAPPED_NAMES, {
          value: new Set<string>(),
          configurable: true,
          writable: false,
        })[HABTM_WRAPPED_NAMES];
    const prevDestroyAssociations = self.prototype.destroyAssociations;
    if (!ownWrappedNames.has(name)) {
      ownWrappedNames.add(name);
      self.prototype.destroyAssociations = async function (this: {
        association(n: string): { handleDependency(): Promise<void>; reset(): void };
        _collectionProxies?: { delete(n: string): void };
      }): Promise<void> {
        await this.association(middleName).handleDependency();
        this.association(name).reset();
        this._collectionProxies?.delete(name);
        if (typeof prevDestroyAssociations === "function") {
          await prevDestroyAssociations.call(this);
        }
      };
    }

    const hmOptions: Record<string, unknown> = {};
    hmOptions.through = middleName;
    hmOptions.source = joinModel.rightReflection.name;

    for (const k of [
      "beforeAdd",
      "afterAdd",
      "beforeRemove",
      "afterRemove",
      "autosave",
      "validate",
      "joinTable",
      "className",
      "extend",
      "strictLoading",
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(options, k)) hmOptions[k] = options[k];
    }

    this.hasMany(name, positionalScope, hmOptions);
    (self._reflections as Record<string, { parentReflection?: unknown }>)[name].parentReflection =
      habtmReflection;
  }
}

export function isAssociationCached(record: Base, assocName: string): boolean {
  if (record._associationInstances.has(assocName)) return true;
  return record._collectionProxies.has(assocName);
}

export function _canRouteThroughViaAssociationScope(
  reflection: ReflectionLike | null | undefined,
  options: AssociationOptions,
): boolean {
  if (!reflection) return false;
  if (options.disableJoins) return false;
  if (typeof reflection.isThroughReflection !== "function" || !reflection.isThroughReflection()) {
    return false;
  }
  const src = reflection.sourceReflection;
  if (!src) return false;
  if (typeof reflection.isNested === "function" && reflection.isNested()) return true;
  if (
    typeof src.isPolymorphic === "function" &&
    src.isPolymorphic() &&
    (typeof src.belongsTo !== "function" || !src.belongsTo())
  ) {
    return false;
  }
  if (typeof src.isPolymorphic === "function" && src.isPolymorphic() && !options.sourceType) {
    return false;
  }
  return true;
}

/** @internal */
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

/** @internal */
export function _ownerChainReflection(reflection: any): any {
  const chain = reflection?.chain;
  return (
    (Array.isArray(chain) && chain.length ? chain[chain.length - 1] : null) ??
    reflection?.throughReflection ??
    reflection ??
    null
  );
}

/** @internal */
export function _scopeForAssociation(model: typeof Base): Relation<Base> {
  return (
    (model as unknown as { scopeForAssociation?(): Relation<Base> }).scopeForAssociation?.() ??
    model.all()
  );
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function applyAssociationScope<R>(
  rel: R,
  scope: ((this: R, rel: R, owner: Base) => R | false | null | undefined) | null | undefined,
  owner: Base,
  reflectionScope?: unknown,
): R {
  if (!scope) return rel;
  if (reflectionScope !== undefined && scope === reflectionScope) return rel;
  return invokeScopeLambda(scope, rel, owner) || rel;
}

/** @internal */
export function _builtAssociationScope(
  record: Base,
  assocName: string,
  reflection: ReflectionLike,
  targetModel: typeof Base,
): Relation<Base> {
  let instance: { disableJoins?: boolean; scope?: () => unknown } | undefined;
  const assocFn = (record as { association?: (n: string) => unknown }).association;
  if (typeof assocFn === "function") {
    try {
      instance = assocFn.call(record, assocName) as typeof instance;
    } catch (e) {
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

export function _skipSingularStatementCache(
  reflection: ReflectionLike,
  targetModel: typeof Base,
  options: AssociationOptions,
): boolean {
  if (reflection.scope) return true;
  const refl = reflection as {
    hasScope?(): boolean;
    sourceReflection?: { activeRecord?: { defaultScopes?: unknown[] } } | null;
  };
  if (typeof refl.hasScope === "function" && refl.hasScope()) return true;
  const klass = targetModel as unknown as {
    currentScope?(): unknown;
    defaultScopes?: unknown[];
  };
  if (
    klass.currentScope?.() ||
    (klass.defaultScopes?.length ?? 0) > 0 ||
    hasDefaultScopeOverride(targetModel)
  ) {
    return true;
  }
  if ((refl.sourceReflection?.activeRecord?.defaultScopes?.length ?? 0) > 0) return true;
  return false;
}

export async function _loadSingularViaStatementCache(
  record: Base,
  assocName: string,
  reflection: ReflectionLike,
  targetModel: typeof Base,
): Promise<Base | null> {
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
  const baseScope = (): Relation<Base> =>
    (typeof instance?.targetScope === "function"
      ? (instance.targetScope() as Relation<Base>)
      : undefined) ?? _scopeForAssociation(targetModel);
  const sc = (
    reflection as unknown as {
      associationScopeCache(
        klass: typeof Base,
        owner: Base,
        block: (params: { bind(): unknown }) => unknown,
      ): unknown;
    }
  ).associationScopeCache(targetModel, record, (params: { bind(): unknown }) => {
    const as = AssociationScope.create(() => params.bind());
    const built = as.scope({
      owner: record,
      reflection: reflection as never,
      klass: targetModel,
    }) as Relation<Base>;
    return baseScope().merge(built) as never;
  }) as StatementCache;
  const chain = (reflection as unknown as { chain: never[] }).chain;
  const binds = AssociationScope.getBindValues(record, chain);
  const records = await sc.execute(binds, connection, { allowRetry: true });
  return records[0] ?? null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function syncToAssociationInstance(record: Base, assocName: string, result: unknown): void {
  const holder = record._associationInstances.get(assocName) as
    | {
        _setTargetFromLoader(t: Base | Base[] | null): void;
        _loaderWritebackSuppressed?: number;
        isCollection(): boolean;
        _mergeLoaderResults(rows: Base[]): void;
      }
    | undefined;
  if (!holder || holder._loaderWritebackSuppressed) return;
  if (holder.isCollection()) {
    holder._mergeLoaderResults((result ?? []) as Base[]);
    return;
  }
  holder._setTargetFromLoader(result as Base | Base[] | null);
}

/** @internal */
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
  const scalarOwnerKey = Array.isArray(primaryKey) ? "id" : primaryKey;
  return { fkCols: [scalarFk], ownerKeyCols: [scalarOwnerKey] };
}

/** @internal */
export function _associateRecordsToOwner(association: AssociationInstance, records: Base[]): void {
  if (association.isCollection()) {
    const target = association.target;
    const notPersistedRecords = (Array.isArray(target) ? target : []).filter(
      (r) => !r.isPersisted(),
    );
    association.target = [...records, ...notPersistedRecords];
  } else {
    association.target = records[0] ?? null;
  }
}

export function association<T extends Base = Base>(
  record: Base,
  assocName: string,
): AssociationProxy<T> {
  const existing = record._collectionProxies.get(assocName) as AssociationProxy<T> | undefined;
  if (existing) {
    if (!existing.loaded) {
      const preloaded = _preloadedHolderTarget(record, assocName)?.value;
      if (preloaded != null) {
        const records = Array.isArray(preloaded) ? preloaded : [preloaded];
        _associateRecordsToOwner(existing.proxyAssociation, records as T[]);
      }
    }
    (existing as unknown as { resetScope(): unknown }).resetScope();
    return existing;
  }

  const ctor = record.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation(assocName) as unknown as AssociationDefinition | null;
  if (!assocDef) {
    throw new Error(`Association "${assocName}" not found on ${ctor.name}`);
  }
  validateThroughReflection(ctor, assocName);
  const instance = record.association(assocName) as unknown as { isCollection(): boolean };
  if (!instance.isCollection()) {
    throw new TypeError(
      `association() builds a CollectionProxy, which Rails has only for a collection ` +
        `reflection; "${assocName}" on ${ctor.name} is singular. ` +
        `Use record.association("${assocName}") for the singular association object.`,
    );
  }
  if (!_CollectionProxyCtor) {
    throw new Error(
      "CollectionProxy not registered. Either import '@blazetrails/activerecord' " +
        "once (the package entry loads CollectionProxy eagerly), or, if you are " +
        "using subpath imports such as '@blazetrails/activerecord/associations' or " +
        "'@blazetrails/activerecord/base', import " +
        "'@blazetrails/activerecord/associations' before the first " +
        "`association()` call.",
    );
  }
  const proxy = (
    _CollectionProxyCtor as unknown as {
      _create: (r: Base, n: string, d: AssociationDefinition) => CollectionProxy<T>;
    }
  )._create(record, assocName, assocDef);

  const preloaded = _preloadedHolderTarget(record, assocName)?.value;
  if (preloaded != null) {
    const records = Array.isArray(preloaded) ? preloaded : [preloaded];
    _associateRecordsToOwner(proxy.proxyAssociation, records as T[]);
  }

  const wrapped = wrapCollectionProxy<T>(proxy);
  (proxy as any)._proxySelf = wrapped;
  record._collectionProxies.set(assocName, wrapped);
  return wrapped;
}

const NUMERIC_INDEX_PATTERN = /^(0|[1-9]\d*)$/;

function wrapCollectionProxy<T extends Base = Base>(
  proxy: CollectionProxy<T>,
): AssociationProxy<T> {
  return new Proxy(proxy, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);
      const preferSyncRecordDelegate =
        typeof prop === "string" && target.loaded && DELEGATION_RECORD_METHOD_NAMES.has(prop);
      if (typeof prop === "symbol") return value;
      if (Reflect.has(target, prop) && !preferSyncRecordDelegate) return value;
      if (value !== undefined && !preferSyncRecordDelegate) return value;

      if (typeof prop === "string" && NUMERIC_INDEX_PATTERN.test(prop)) {
        return target.target[Number(prop)];
      }

      if (target.loaded) {
        const recordDelegate =
          typeof prop === "string"
            ? delegateRecordMethodSync(prop, () => target.target)
            : undefined;
        if (recordDelegate) return recordDelegate;
        const arrayDelegate = delegateArrayMethod(prop, () => target.target);
        if (arrayDelegate) return arrayDelegate;
      }

      const enumerableDelegate = delegateEnumerableMethod(prop, () => target.records());
      if (enumerableDelegate) return enumerableDelegate;

      const scope = target.scope();
      const scopeVal = Reflect.get(scope, prop, scope);
      if (typeof scopeVal === "function") {
        return (...args: any[]) => scopeVal.apply(scope, args);
      }

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
    has(target: any, prop: string | symbol) {
      if (Reflect.has(target, prop)) return true;
      if (typeof prop === "symbol") return false;
      const modelClass = target.model as typeof Base & { _scopes?: Map<string, unknown> };
      if (modelClass._scopes?.has(prop)) return true;
      if (delegateEnumerableMethod(prop, () => target.records()) !== undefined) return true;
      return typeof (modelClass as any)[prop] === "function";
    },
  });
}

/** @internal */
export function initInternals(this: Base, super_: () => void): void {
  super_();
  this._resetAssociationCaches();
}

export function initializeDup(this: Base, super_: (other: unknown) => void, other: unknown): void {
  this._resetAssociationCaches();
  super_(other);
}

/** @internal */
export function associationInstanceGet(this: Base, name: string): unknown {
  const record = this as Base & {
    association?(name: string): unknown;
    _collectionProxies?: Map<string, unknown>;
  };
  const existing = record._associationInstances.get(name) as
    | { isLoaded(): boolean; target?: unknown }
    | undefined;
  if (typeof record.association !== "function") {
    return existing?.isLoaded() ? existing : null;
  }
  const proxy = record._collectionProxies?.get?.(name) as
    | { loaded?: boolean; target?: unknown[] }
    | undefined;
  const proxyHasBuiltRecords = Array.isArray(proxy?.target) && proxy.target.length > 0;
  const existingHasBuiltRecords =
    Array.isArray(existing?.target) && (existing.target as unknown[]).length > 0;
  const hasCachedData =
    !!_preloadedHolderTarget(record, name) ||
    !!proxy?.loaded ||
    proxyHasBuiltRecords ||
    existingHasBuiltRecords ||
    !!existing?.isLoaded();
  if (!hasCachedData) return null;
  try {
    const inst = record.association(name) as
      | { isLoaded(): boolean; target?: unknown; _writeTargetStore?(t: unknown): void }
      | undefined;
    if (inst?.isLoaded()) return inst;
    if (proxyHasBuiltRecords && inst && Array.isArray(inst.target)) {
      inst._writeTargetStore?.(proxy.target);
      return inst;
    }
    if (existingHasBuiltRecords && inst && inst === existing) {
      return inst;
    }
    return null;
  } catch (err) {
    if (err instanceof AssociationNotFoundError) return null;
    throw err;
  }
}

/** @internal */
export function associationInstanceSet(this: Base, name: string, association: unknown): void {
  this._associationInstances.set(name, association as AssociationInstance);
}
