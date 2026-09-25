import type { Base } from "./base.js";
import type { AssociationReflection, ThroughReflection } from "./reflection.js";
import "./relation.js";
import type { Relation } from "./relation.js";
import type { CollectionProxy, AssociationProxy } from "./associations/collection-proxy.js";
import { ActiveRecord, Associations as AssociationsNamespace } from "./namespaces.js";
import { hasDefaultScopeOverride } from "./scoping/default.js";
import { qualifiedName } from "./inheritance.js";

import { ArgumentError } from "@blazetrails/activemodel";
import { StatementCache } from "./statement-cache.js";
import { AssociationNotFoundError } from "./associations/errors.js";
import { AssociationScope } from "./associations/association-scope.js";
import type { Association as AssociationInstance } from "./associations/association.js";
export { joinTableName as joinHabtmTableNames } from "./migration/join-table.js";
import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import { registerSubclass } from "./inheritance.js";
import { flushPendingCounterCacheColumns } from "./counter-cache.js";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { HasMany as HasManyBuilder } from "./associations/builder/has-many.js";
import { HasAndBelongsToMany as HabtmBuilder } from "./associations/builder/has-and-belongs-to-many.js";
import * as Reflection from "./reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";
import { Module, include, rbInspect } from "@blazetrails/ruby-compat";

export async function eagerLoadBang(): Promise<void> {}

export type CollectionCallback<K extends string> =
  | string
  | ((owner: Base, record: Base) => void | false)
  | { [P in K]: (owner: Base, record: Base) => void | false };

export interface AssociationOptions {
  foreignKey?: string | string[];
  className?: string;
  anonymousClass?: typeof Base;
  primaryKey?: string | string[];
  queryConstraints?: string[];
  dependent?:
    | "destroy"
    | "destroyAsync"
    | "nullify"
    | "delete"
    | "deleteAll"
    | "restrictWithException"
    | "restrictWithError";
  ensuringOwnerWas?: string;
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
    | Module
    | Array<Record<string, (...args: unknown[]) => unknown> | Module>;
  disableJoins?: boolean;
  associationForeignKey?: string;
  foreignType?: string;
  strictLoading?: boolean;
  indexErrors?: boolean | "nestedAttributesOrder";
}

export type AssociationDefinition = (AssociationReflection | ThroughReflection) & {
  readonly options: AssociationOptions & { joinTable?: string };
};

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
  if (!autoloaded) return;
  if (frameworkBase(autoloaded)) registerModel(autoloaded);
  else modelRegistry.set(bare, autoloaded);
}

/** @internal */
export function _cacheSingularTarget(record: Base, assocName: string, target: Base | null): void {
  const macro = (record.constructor as typeof Base)._reflectOnAssociation?.(assocName)?.macro;
  if (macro === "belongsTo" || macro === "hasOne") {
    const assoc = record.association(assocName);
    assoc.inversedFrom(target);
    return;
  }
  (associationInstanceGet.call(record, assocName) as AssociationInstance | null)?.inversedFrom(
    target,
  );
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
    extension?: (mod: Module) => void,
  ): void {
    const reflection = HasManyBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
      extension,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasAndBelongsToMany(
    name: string,
    scope: ((...args: any[]) => any) | (AssociationOptions & { joinTable?: string }) | null = {},
    options: AssociationOptions & { joinTable?: string } = {},
    extension?: (mod: Module) => void,
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
    const habtmReflection = new Reflection.HasAndBelongsToManyReflection(
      name,
      scope as ((...args: any[]) => any) | null,
      options as Record<string, unknown>,
      self,
    );

    const builder = new HabtmBuilder(name, self, options as Record<string, unknown>);

    const joinModel = builder.throughModel();

    const registryKey = `${self.name}::${joinModel.name}`;
    modelRegistry.set(registryKey, joinModel);

    const middleReflection = builder.middleReflection(joinModel);
    HasManyBuilder.defineCallbacks(self, middleReflection);
    Reflection.addReflection(self, middleReflection.name, middleReflection);
    middleReflection.parentReflection = habtmReflection;

    include(
      this,
      new Module((mod) => {
        mod.defineMethod("destroyAssociations", async function (this: any): Promise<void> {
          await this.association(middleReflection.name).deleteAll("delete_all");
          this.association(name).reset();
          await mod.superMethod(this, "destroyAssociations")!();
        });
      }),
    );

    const hmOptions: Record<string, unknown> = {};
    hmOptions.through = middleReflection.name;
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

    this.hasMany(name, scope as ((...args: any[]) => any) | null, hmOptions, extension);
    (self._reflections as Record<string, { parentReflection?: unknown }>)[name].parentReflection =
      habtmReflection;
  }
}

export function isAssociationCached(record: Base, name: string): boolean {
  return record._associationCache.has(name);
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
  const baseScope = (): Relation<Base> =>
    (typeof instance?.targetScope === "function"
      ? (instance.targetScope() as Relation<Base>)
      : undefined) ?? _scopeForAssociation(targetModel);
  const sc = (await (
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
  })) as StatementCache;
  const chain = (reflection as unknown as { chain: never[] }).chain;
  const binds = AssociationScope.getBindValues(record, chain);
  const records = await targetModel.withConnection((c) =>
    sc.execute(binds, c, { allowRetry: true }),
  );
  return records[0] ?? null;
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
          `\`${rbInspect(qc)}\` and the foreign key is \`${scalarFk}\`. ` +
          `You need to explicitly set the query constraints for this association.`,
      );
    }
  }
  const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
  return { fkCols: [scalarFk], ownerKeyCols: Array.isArray(ownerKey) ? ownerKey : [ownerKey] };
}

/** @noRailsEquivalent CONVERGEABLE disambiguate-association-vs-collection-proxy-accessor */
export function collectionProxyFor<T extends Base = Base>(
  record: Base,
  assocName: string,
): AssociationProxy<T> {
  const instance = record.association(assocName) as unknown as {
    isCollection(): boolean;
    reflection: AssociationDefinition;
    _proxy?: AssociationProxy<T>;
  };
  if (instance._proxy) return instance._proxy;

  const ctor = record.constructor as typeof Base;
  if (!instance.isCollection()) {
    throw new TypeError(
      `association() builds a CollectionProxy, which Rails has only for a collection ` +
        `reflection; "${assocName}" on ${ctor.name} is singular. ` +
        `Use record.association("${assocName}") for the singular association object.`,
    );
  }
  const proxy = (
    AssociationsNamespace.CollectionProxy as unknown as {
      _create: (r: Base, n: string, d: AssociationDefinition) => CollectionProxy<T>;
    }
  )._create(record, assocName, instance.reflection);

  instance._proxy = proxy as AssociationProxy<T>;
  return instance._proxy;
}

/** @internal */
export function _buildAssociationInstance(
  this: Base,
  assocDef: AssociationDefinition,
): AssociationInstance {
  const opts = (assocDef.options ?? {}) as Record<string, unknown>;
  switch (assocDef.macro) {
    case "belongsTo":
      if (opts.polymorphic)
        return new AssociationsNamespace.BelongsToPolymorphicAssociation(this, assocDef as any);
      return new AssociationsNamespace.BelongsToAssociation(this, assocDef as any);
    case "hasOne":
      if (opts.through)
        return new AssociationsNamespace.HasOneThroughAssociation(this, assocDef as any);
      return new AssociationsNamespace.HasOneAssociation(this, assocDef as any);
    case "hasMany":
      if (opts.through)
        return new AssociationsNamespace.HasManyThroughAssociation(this, assocDef as any);
      return new AssociationsNamespace.HasManyAssociation(this, assocDef as any);
    default:
      return new AssociationsNamespace.HasManyThroughAssociation(this, assocDef as any);
  }
}

export function association(this: Base, name: string): AssociationInstance {
  const existing = associationInstanceGet.call(this, name) as AssociationInstance | null;
  if (existing) return existing;

  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation?.(name) as unknown as
    | AssociationDefinition
    | undefined;
  if (!assocDef) {
    throw new AssociationNotFoundError(this, name);
  }

  const instance = _buildAssociationInstance.call(this, assocDef);
  associationInstanceSet.call(this, name, instance);
  return instance;
}

/** @internal */
export function initInternals(this: Base, super_: () => void): void {
  super_();
  this._associationCache = new Map();
}

export function initializeDup(this: Base, super_: (other: unknown) => void, other: unknown): void {
  this._associationCache = new Map();
  super_(other);
}

/** @internal */
export function associationInstanceGet(this: Base, name: string): unknown {
  return this._associationCache.get(name) ?? null;
}

/** @internal */
export function associationInstanceSet(this: Base, name: string, association: unknown): void {
  this._associationCache.set(name, association as AssociationInstance);
}

ActiveRecord.Associations = AssociationsNamespace;
