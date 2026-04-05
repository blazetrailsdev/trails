import type { Base } from "./base.js";
import {
  underscore,
  pluralize,
  singularize,
  camelize,
  foreignKey as deriveForeignKey,
} from "@blazetrails/activesupport";
import { Table } from "@blazetrails/arel";
import { modelRegistry } from "./associations.js";
import { BelongsToAssociation } from "./associations/belongs-to-association.js";
import { BelongsToPolymorphicAssociation } from "./associations/belongs-to-polymorphic-association.js";
import { HasManyAssociation } from "./associations/has-many-association.js";
import { HasManyThroughAssociation } from "./associations/has-many-through-association.js";
import { HasOneAssociation } from "./associations/has-one-association.js";
import { HasOneThroughAssociation } from "./associations/has-one-through-association.js";
import {
  AmbiguousSourceReflectionForThroughAssociation,
  HasManyThroughAssociationNotFoundError,
  HasManyThroughAssociationPolymorphicThroughError,
  HasManyThroughAssociationPolymorphicSourceError,
  HasManyThroughAssociationPointlessSourceTypeError,
  HasManyThroughSourceAssociationNotFoundError,
  HasOneAssociationPolymorphicThroughError,
  HasOneThroughCantAssociateThroughCollection,
} from "./associations/errors.js";

type MacroType = "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany" | "composedOf";

function arrayLen(value: string | string[]): number {
  return Array.isArray(value) ? value.length : 1;
}

/**
 * Base class shared by all reflection types.
 *
 * Mirrors: ActiveRecord::Reflection::AbstractReflection
 */
export class AbstractReflection {
  isThroughReflection(): boolean {
    return false;
  }

  get tableName(): string {
    return this.klass.tableName;
  }

  buildAssociation(attributes: Record<string, unknown> = {}): InstanceType<typeof Base> {
    return new (this.klass as any)(attributes);
  }

  get className(): string {
    throw new Error("Subclass must implement className");
  }

  get klass(): typeof Base {
    throw new Error("Subclass must implement klass");
  }

  get scopes(): Array<(...args: any[]) => any> {
    return this.scope ? [this.scope] : [];
  }

  get scope(): ((...args: any[]) => any) | null {
    return null;
  }

  get strictLoading(): boolean {
    return false;
  }

  belongsTo(): boolean {
    return false;
  }

  isBelongsTo(): boolean {
    return this.belongsTo();
  }

  hasOne(): boolean {
    return false;
  }

  isHasOne(): boolean {
    return this.hasOne();
  }

  isHasMany(): boolean {
    return (this as any).macro === "hasMany";
  }

  isCollection(): boolean {
    return false;
  }

  isPolymorphic(): boolean {
    return false;
  }

  isThrough(): boolean {
    return this.isThroughReflection();
  }

  get chain(): AbstractReflection[] {
    return this.collectJoinChain();
  }

  collectJoinChain(): AbstractReflection[] {
    return [this];
  }

  buildScope(_table?: Table): any {
    return (this.klass as any).all();
  }

  joinScope(table: Table, foreignTable: Table, foreignKlass: typeof Base): any {
    let scope = this.klassJoinScope(table);

    const typeCol = (this as any).type;
    if (typeCol) {
      scope = scope.where({ [typeCol]: foreignKlass.name });
    }

    for (const chainScope of this.joinScopes(table)) {
      scope = scope.merge(chainScope);
    }

    const primaryKeys = this._arrayWrap((this as any).joinPrimaryKey);
    const foreignKeys = this._arrayWrap((this as any).joinForeignKey);

    if (primaryKeys.length !== foreignKeys.length) {
      throw new Error(
        `joinScope: joinPrimaryKey and joinForeignKey must have the same number of columns ` +
          `(got ${primaryKeys.length} primary key column(s) and ${foreignKeys.length} foreign key column(s))`,
      );
    }

    for (let i = 0; i < primaryKeys.length; i++) {
      scope = scope.where(table.get(primaryKeys[i]).eq(foreignTable.get(foreignKeys[i])));
    }

    return scope;
  }

  joinScopes(table: Table): any[] {
    if (this.scope) {
      const rel = this.buildScope(table);
      const result = this.scope.call(null, rel);
      return [result || rel];
    }
    return [];
  }

  klassJoinScope(_table?: Table): any {
    return this.buildScope(_table);
  }

  constraints(): Array<(...args: any[]) => any> {
    return this.chain.flatMap((r) => r.scopes);
  }

  counterCacheColumn(): string | null {
    const counterCache = (this as any).options?.counterCache;
    const explicitColumn =
      typeof counterCache === "string"
        ? counterCache
        : counterCache && typeof counterCache === "object" && counterCache.column
          ? (counterCache.column as string)
          : null;

    if (this.belongsTo()) {
      if (!counterCache) return null;
      return (
        explicitColumn || `${pluralize(underscore((this as any).activeRecord?.name ?? ""))}_count`
      );
    }
    return explicitColumn || `${(this as any).name}_count`;
  }

  checkValidityOfInverseBang(): void {
    if (!this.isPolymorphic() && this.hasInverse()) {
      const inverse = this.inverseOf();
      if (inverse == null) {
        throw new Error(`Could not find the inverse association for ${(this as any).name}.`);
      }
      if (
        (inverse as any).name === (this as any).name &&
        (inverse as any).activeRecord === (this as any).activeRecord
      ) {
        throw new Error(`Inverse association for ${(this as any).name} is recursive.`);
      }
    }
  }

  inverseWhichUpdatesCounterCache(): AbstractReflection | null {
    const col = this.counterCacheColumn();
    if (!col) return null;
    const inv = this.inverseOf();
    const candidates: any[] = inv ? [inv] : reflectOnAllAssociations(this.klass, "belongsTo");
    return (
      candidates.find(
        (c: any) =>
          c.counterCacheColumn?.() === col &&
          (c.isPolymorphic?.() || c.klass === (this as any).activeRecord),
      ) ?? null
    );
  }

  isInverseUpdatesCounterInMemory(): boolean {
    const inv = this.inverseOf();
    if (inv == null) return false;
    const iwucc = this.inverseWhichUpdatesCounterCache();
    if (iwucc == null) return false;
    return (
      (inv as any).name === (iwucc as any).name &&
      (inv as any).activeRecord === (iwucc as any).activeRecord
    );
  }

  hasCachedCounter(): boolean {
    const opts = (this as any).options ?? {};
    if (opts.counterCache) return true;
    const iwucc = this.inverseWhichUpdatesCounterCache();
    if (iwucc && (iwucc as any).options?.counterCache) {
      const col = this.counterCacheColumn();
      if (col && (this as any).activeRecord?.hasAttribute?.(col)) return true;
    }
    return false;
  }

  hasActiveCachedCounter(): boolean {
    if (!this.hasCachedCounter()) return false;
    const opts = (this as any).options ?? {};
    const counterCache =
      opts.counterCache || (this.inverseWhichUpdatesCounterCache() as any)?.options?.counterCache;
    if (counterCache && counterCache.active === false) return false;
    return true;
  }

  isCounterMustBeUpdatedByHasMany(): boolean {
    return !this.isInverseUpdatesCounterInMemory() && this.hasCachedCounter();
  }

  aliasCandidate(name: string): string {
    return `${(this as any).pluralName}_${name}`;
  }

  strictLoadingViolationMessage(owner: string): string {
    const assocDesc = this.isPolymorphic()
      ? "polymorphic association"
      : `${this.className} association`;
    return (
      `\`${owner}\` is marked for strict_loading. ` +
      `The ${assocDesc} named \`:${(this as any).name}\` cannot be lazily loaded.`
    );
  }

  hasInverse(): boolean {
    return false;
  }

  inverseOf(): AbstractReflection | null {
    return null;
  }

  private _arrayWrap(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return [];
  }
}

/**
 * Base class for AggregateReflection and AssociationReflection.
 * Holds name, scope, options, and the owning ActiveRecord class.
 *
 * Mirrors: ActiveRecord::Reflection::MacroReflection
 */
export class MacroReflection extends AbstractReflection {
  readonly name: string;
  readonly options: Record<string, unknown>;
  readonly activeRecord: typeof Base;
  readonly pluralName: string;
  private _scope: ((...args: any[]) => any) | null;
  private _klassCache: typeof Base | null = null;

  constructor(
    name: string,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
    activeRecord: typeof Base,
  ) {
    super();
    this.name = name;
    this._scope = scope;
    this.options = options;
    this.activeRecord = activeRecord;
    this.pluralName = pluralize(name);
  }

  set autosave(value: boolean) {
    (this.options as any).autosave = value;
    const parent = (this as any).parentReflection;
    if (parent) {
      if (parent instanceof MacroReflection) {
        parent.autosave = value;
      } else {
        (parent.options as any).autosave = value;
      }
    }
  }

  get scope(): ((...args: any[]) => any) | null {
    return this._scope;
  }

  get className(): string {
    if (this.options.className) return this.options.className as string;
    return camelize(singularize(this.name));
  }

  get klass(): typeof Base {
    if (this._klassCache) return this._klassCache;
    if (this.options.anonymousClass) {
      this._klassCache = this.options.anonymousClass as typeof Base;
      return this._klassCache;
    }
    this._klassCache = this.computeClass(this.className);
    return this._klassCache;
  }

  computeClass(name: string): typeof Base {
    const resolved = modelRegistry.get(name);
    if (!resolved) {
      throw new Error(
        `Could not find model '${name}' in model registry (for '${this.name}' on ${this.activeRecord.name})`,
      );
    }
    return resolved;
  }

  scopeFor(relation: any, owner?: any): any {
    if (this._scope) {
      return this._scope.call(null, relation, owner) || relation;
    }
    return relation;
  }
}

/**
 * Holds metadata about an aggregation (composed_of).
 *
 * Mirrors: ActiveRecord::Reflection::AggregateReflection
 */
export class AggregateReflection extends MacroReflection {
  get macro(): MacroType {
    return "composedOf";
  }

  get tableName(): string {
    return this.activeRecord.tableName;
  }

  get klass(): any {
    if (this.options.anonymousClass) return this.options.anonymousClass;
    return super.klass;
  }

  mapping(): [string, string][] {
    const m = this.options.mapping;
    if (!m) return [[this.name, this.name]];
    if (Array.isArray(m)) {
      if (m.length === 0) return [];
      if (Array.isArray(m[0])) return m as [string, string][];
      return [m as unknown as [string, string]];
    }
    return [[this.name, this.name]];
  }
}

/**
 * Holds metadata about an association.
 *
 * Mirrors: ActiveRecord::Reflection::AssociationReflection
 */
export class AssociationReflection extends MacroReflection {
  parentReflection: AssociationReflection | ThroughReflection | null = null;

  get macro(): MacroType {
    throw new Error("Subclass must implement macro");
  }

  get foreignKey(): string | string[] {
    if (this.options.foreignKey) return this.options.foreignKey as string | string[];
    if (this.belongsTo()) return `${underscore(this.name)}_id`;
    if (this.options.as) return `${underscore(this.options.as as string)}_id`;
    return `${underscore(this.activeRecord.name)}_id`;
  }

  get foreignType(): string | null {
    if (!this.options.polymorphic && !this.options.as) return null;
    if (this.belongsTo()) return `${underscore(this.name)}_type`;
    if (this.options.as) return `${underscore(this.options.as as string)}_type`;
    return null;
  }

  get joinTable(): string | null {
    if (this.macro !== "hasAndBelongsToMany") return null;
    if (this.options.joinTable) return this.options.joinTable as string;
    const ownerKey = pluralize(underscore(this.activeRecord.name));
    const assocKey = underscore(this.name);
    return [ownerKey, assocKey].sort().join("_");
  }

  isPolymorphic(): boolean {
    return !!(this.options.polymorphic || this.options.as);
  }

  get validate(): boolean {
    if (this.options.validate !== undefined) return !!this.options.validate;
    return !!(this.options.autosave === true || this.isCollection());
  }

  hasInverse(): boolean {
    return this.options.inverseOf !== undefined && this.options.inverseOf !== false;
  }

  inverseOf(): AssociationReflection | ThroughReflection | null {
    if (this.options.inverseOf === false) return null;
    const inverseName = this.options.inverseOf as string | undefined;
    if (!inverseName) return null;
    const targetAssocs: any[] = (this.klass as any)._associations ?? [];
    const assocDef = targetAssocs.find((a: any) => a.name === inverseName);
    if (!assocDef) return null;
    return createReflection(assocDef, this.klass);
  }

  get associationPrimaryKey(): string | string[] {
    return this.klass.primaryKey;
  }

  get associationForeignKey(): string {
    if (this.options.associationForeignKey) {
      return this.options.associationForeignKey as string;
    }
    return deriveForeignKey(this.className);
  }

  get type(): string | null {
    return this.foreignType;
  }

  get joinPrimaryKey(): string | string[] {
    return this.foreignKey;
  }

  get joinPrimaryType(): string | null {
    return this.type;
  }

  get joinForeignKey(): string | string[] {
    return this.activeRecordPrimaryKey;
  }

  get activeRecordPrimaryKey(): string | string[] {
    if (this.options.primaryKey !== undefined) {
      return this.options.primaryKey as string | string[];
    }
    return this.activeRecord.primaryKey;
  }

  associationScopeCache(klass: typeof Base, _owner: any, block: () => any): any {
    return block();
  }

  checkValidityBang(): void {
    this.checkValidityOfInverseBang();

    if (!this.isPolymorphic()) {
      const arPk = this.activeRecordPrimaryKey;
      const fk = this.foreignKey;
      if (this.hasOne() || this.isCollection()) {
        if (arrayLen(arPk) !== arrayLen(fk)) {
          throw new Error(
            `Association ${this.name}: composite primary key / foreign key length mismatch ` +
              `(${arrayLen(arPk)} primary key column(s) vs ${arrayLen(fk)} foreign key column(s))`,
          );
        }
      } else if (this.belongsTo()) {
        if (arrayLen(this.associationPrimaryKey) !== arrayLen(fk)) {
          throw new Error(
            `Association ${this.name}: composite primary key / foreign key length mismatch ` +
              `(${arrayLen(this.associationPrimaryKey)} primary key column(s) vs ${arrayLen(fk)} foreign key column(s))`,
          );
        }
      }
    }
  }

  checkEagerLoadableBang(): void {
    if (!this.scope) return;
    // In our codebase scopes always receive the relation as first arg (arity 1).
    // Instance-dependent scopes also receive the owner (arity >= 2).
    // Rails checks scope.arity == 0 because it uses instance_exec for the relation.
    if (this.scope.length > 1) {
      throw new Error(
        `The association scope '${this.name}' is instance dependent (the scope ` +
          `block takes more than one argument). Eager loading instance dependent scopes is not supported.`,
      );
    }
  }

  joinIdFor(owner: any): any[] {
    const keys = Array.isArray(this.joinForeignKey) ? this.joinForeignKey : [this.joinForeignKey];
    return keys.map((key) => (owner.readAttribute ? owner.readAttribute(key) : owner[key]));
  }

  get throughReflection(): null {
    return null;
  }

  get sourceReflection(): this {
    return this;
  }

  collectJoinChain(): AbstractReflection[] {
    return [this];
  }

  clearAssociationScopeCache(): void {
    // Rails calls klass.initialize_find_by_cache — no-op until we have statement caching
  }

  isNested(): boolean {
    return false;
  }

  hasScope(): boolean {
    return !!this.scope;
  }

  polymorphicInverseOf(
    associatedClass: typeof Base,
  ): AssociationReflection | ThroughReflection | null {
    if (this.hasInverse()) {
      const inverseName = this.options.inverseOf as string;
      const assocs: any[] = (associatedClass as any)._associations ?? [];
      const assocDef = assocs.find((a: any) => a.name === inverseName);
      if (!assocDef) {
        throw new Error(
          `Could not find the inverse association for ${this.name} (:${this.options.inverseOf} in ${associatedClass.name})`,
        );
      }
      return createReflection(assocDef, associatedClass);
    }
    return null;
  }

  associationClass():
    | typeof BelongsToAssociation
    | typeof HasManyAssociation
    | typeof HasOneAssociation {
    throw new Error("Subclass must implement associationClass");
  }

  polymorphicName(): string {
    return (this.activeRecord as any).polymorphicName?.() ?? this.activeRecord.name;
  }

  addAsSource(seed: AbstractReflection[]): AbstractReflection[] {
    return seed;
  }

  addAsPolymorphicThrough(
    reflection: AbstractReflection,
    seed: AbstractReflection[],
  ): AbstractReflection[] {
    return [...seed, new PolymorphicReflection(this, reflection)];
  }

  addAsThrough(seed: AbstractReflection[]): AbstractReflection[] {
    return [...seed, this];
  }

  extensions(): any[] {
    if (Array.isArray(this.options.extend)) return this.options.extend as any[];
    if (this.options.extend) return [this.options.extend];
    return [];
  }

  computeClass(name: string): typeof Base {
    if (this.isPolymorphic()) {
      throw new Error("Polymorphic associations do not support computing the class.");
    }
    return super.computeClass(name);
  }

  get strictLoading(): boolean {
    return !!this.options.strictLoading;
  }

  get className(): string {
    if (this.options.className) return this.options.className as string;
    if (this.isCollection()) {
      return camelize(singularize(this.name));
    }
    return camelize(this.name);
  }
}

/**
 * Mirrors: ActiveRecord::Reflection::HasManyReflection
 */
export class HasManyReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasMany";
  }

  isCollection(): boolean {
    return true;
  }

  associationClass(): typeof HasManyAssociation | typeof HasManyThroughAssociation {
    return this.options.through ? HasManyThroughAssociation : HasManyAssociation;
  }
}

/**
 * Mirrors: ActiveRecord::Reflection::HasOneReflection
 */
export class HasOneReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasOne";
  }

  hasOne(): boolean {
    return true;
  }

  associationClass(): typeof HasOneAssociation | typeof HasOneThroughAssociation {
    return this.options.through ? HasOneThroughAssociation : HasOneAssociation;
  }
}

/**
 * Mirrors: ActiveRecord::Reflection::BelongsToReflection
 */
export class BelongsToReflection extends AssociationReflection {
  get macro(): MacroType {
    return "belongsTo";
  }

  belongsTo(): boolean {
    return true;
  }

  associationClass(): typeof BelongsToAssociation | typeof BelongsToPolymorphicAssociation {
    return this.isPolymorphic() ? BelongsToPolymorphicAssociation : BelongsToAssociation;
  }

  get associationPrimaryKey(): string | string[] {
    if (this.options.primaryKey) return this.options.primaryKey as string | string[];
    return this.klass.primaryKey ?? "id";
  }

  get joinPrimaryKey(): string | string[] {
    return this.associationPrimaryKey;
  }

  get joinForeignKey(): string | string[] {
    return this.foreignKey;
  }

  get joinForeignType(): string | null {
    return this.foreignType;
  }

  get activeRecordPrimaryKey(): string | string[] {
    return this.activeRecord.primaryKey;
  }
}

/**
 * Mirrors: ActiveRecord::Reflection::HasAndBelongsToManyReflection
 */
export class HasAndBelongsToManyReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasAndBelongsToMany";
  }

  isCollection(): boolean {
    return true;
  }
}

/**
 * Wraps an AssociationReflection for :through associations.
 *
 * Mirrors: ActiveRecord::Reflection::ThroughReflection
 */
export class ThroughReflection extends AbstractReflection {
  private _delegate: AssociationReflection;
  private _sourceReflectionCache: AssociationReflection | ThroughReflection | null | undefined =
    undefined;
  private _throughReflectionCache: AssociationReflection | ThroughReflection | null | undefined =
    undefined;
  private _sourceReflectionNameCache: string | null | undefined = undefined;

  constructor(delegate: AssociationReflection) {
    super();
    this._delegate = delegate;
  }

  get name(): string {
    return this._delegate.name;
  }

  get macro(): MacroType {
    return this._delegate.macro;
  }

  get options(): Record<string, unknown> {
    return this._delegate.options;
  }

  get activeRecord(): typeof Base {
    return this._delegate.activeRecord;
  }

  get pluralName(): string {
    return this._delegate.pluralName;
  }

  get foreignKey(): string | string[] {
    return this.sourceReflection?.foreignKey ?? this._delegate.foreignKey;
  }

  get foreignType(): string | null {
    return this.sourceReflection?.foreignType ?? this._delegate.foreignType;
  }

  get scope(): ((...args: any[]) => any) | null {
    return this._delegate.scope;
  }

  get className(): string {
    return this._delegate.className;
  }

  get klass(): typeof Base {
    return this._delegate.klass;
  }

  isThroughReflection(): boolean {
    return true;
  }

  isCollection(): boolean {
    return this._delegate.isCollection();
  }

  isPolymorphic(): boolean {
    return this._delegate.isPolymorphic();
  }

  belongsTo(): boolean {
    return this._delegate.belongsTo();
  }

  hasOne(): boolean {
    return this._delegate.hasOne();
  }

  get validate(): boolean {
    return this._delegate.validate;
  }

  get strictLoading(): boolean {
    return this._delegate.strictLoading;
  }

  get through(): string {
    return this.options.through as string;
  }

  get source(): string {
    if (this.options.source) return this.options.source as string;
    const throughRef = this.throughReflection;
    if (throughRef) {
      try {
        const throughAssocs: any[] = (throughRef.klass as any)._associations ?? [];
        const singular = singularize(this.name);
        if (throughAssocs.some((a: any) => a.name === singular)) return singular;
        if (throughAssocs.some((a: any) => a.name === this.name)) return this.name;
      } catch {
        /* klass resolution may fail */
      }
    }
    return this._delegate.isCollection() ? singularize(this.name) : this.name;
  }

  get sourceReflection(): AssociationReflection | ThroughReflection | null {
    if (this._sourceReflectionCache !== undefined) return this._sourceReflectionCache;
    const srcName = this.sourceReflectionName();
    if (!srcName) {
      this._sourceReflectionCache = null;
      return null;
    }
    const throughRef = this.throughReflection;
    if (!throughRef) {
      this._sourceReflectionCache = null;
      return null;
    }
    try {
      const throughAssocs: any[] = (throughRef.klass as any)._associations ?? [];
      const sourceDef = throughAssocs.find((a: any) => a.name === srcName);
      if (sourceDef) {
        this._sourceReflectionCache = createReflection(sourceDef, throughRef.klass);
        return this._sourceReflectionCache;
      }
      this._sourceReflectionCache = null;
      return null;
    } catch {
      this._sourceReflectionCache = null;
      return null;
    }
  }

  get throughReflection(): AssociationReflection | ThroughReflection | null {
    if (this._throughReflectionCache !== undefined) return this._throughReflectionCache;
    const ownerAssocs: any[] = (this.activeRecord as any)._associations ?? [];
    const throughDef = ownerAssocs.find((a: any) => a.name === this.through);
    if (!throughDef) {
      this._throughReflectionCache = null;
      return null;
    }
    this._throughReflectionCache = createReflection(throughDef, this.activeRecord);
    return this._throughReflectionCache;
  }

  get joinTable(): string | null {
    return this._delegate.joinTable;
  }

  get joinPrimaryKey(): string | string[] {
    return this.sourceReflection?.joinPrimaryKey ?? this._delegate.joinPrimaryKey;
  }

  get joinForeignKey(): string | string[] {
    return this.sourceReflection?.joinForeignKey ?? this._delegate.joinForeignKey;
  }

  joinScopes(table: Table): any[] {
    const sourceScopes = this.sourceReflection?.joinScopes(table) ?? [];
    return [...sourceScopes, ...super.joinScopes(table)];
  }

  collectJoinChain(): AbstractReflection[] {
    return this._collectJoinReflections([this]);
  }

  clearAssociationScopeCache(): void {
    this._delegate.clearAssociationScopeCache();
    this.sourceReflection?.clearAssociationScopeCache();
    this.throughReflection?.clearAssociationScopeCache();
  }

  get scopes(): Array<(...args: any[]) => any> {
    const sourceScopes = this.sourceReflection?.scopes ?? [];
    return [...sourceScopes, ...super.scopes];
  }

  hasScope(): boolean {
    return (
      !!this.scope ||
      !!this.options.sourceType ||
      !!(this.sourceReflection as any)?.hasScope?.() ||
      !!(this.throughReflection as any)?.hasScope?.()
    );
  }

  isNested(): boolean {
    return (
      !!(this.sourceReflection as any)?.isThroughReflection?.() ||
      !!(this.throughReflection as any)?.isThroughReflection?.()
    );
  }

  get associationPrimaryKey(): string | string[] {
    return this.sourceReflection?.associationPrimaryKey ?? this._delegate.associationPrimaryKey;
  }

  get activeRecordPrimaryKey(): string | string[] {
    return this._delegate.activeRecordPrimaryKey;
  }

  get associationForeignKey(): string {
    return this.sourceReflection?.associationForeignKey ?? this._delegate.associationForeignKey;
  }

  hasInverse(): boolean {
    return this._delegate.hasInverse();
  }

  inverseOf(): AssociationReflection | ThroughReflection | null {
    return this._delegate.inverseOf();
  }

  sourceReflectionNames(): string[] {
    if (this.options.source) return [this.options.source as string];
    const singular = singularize(this.name);
    const names = [singular, this.name];
    return [...new Set(names)];
  }

  sourceReflectionName(): string | null {
    if (this._sourceReflectionNameCache !== undefined) return this._sourceReflectionNameCache;

    if (this.options.source) {
      this._sourceReflectionNameCache = this.options.source as string;
      return this._sourceReflectionNameCache;
    }

    const throughRef = this.throughReflection;
    if (!throughRef) {
      this._sourceReflectionNameCache = null;
      return null;
    }

    try {
      const throughAssocs: any[] = (throughRef.klass as any)._associations ?? [];
      const singular = singularize(this.name);
      const candidates = [...new Set([singular, this.name])];
      const matching = candidates.filter((n) => throughAssocs.some((a: any) => a.name === n));

      if (matching.length > 1) {
        throw new AmbiguousSourceReflectionForThroughAssociation(
          this.activeRecord.name,
          this.name,
          this.sourceReflectionNames(),
        );
      }
      this._sourceReflectionNameCache = matching[0] ?? null;
    } catch (e: unknown) {
      if (e instanceof AmbiguousSourceReflectionForThroughAssociation) throw e;
      this._sourceReflectionNameCache = null;
    }
    return this._sourceReflectionNameCache ?? null;
  }

  sourceOptions(): Record<string, unknown> {
    return this.sourceReflection?.options ?? {};
  }

  throughOptions(): Record<string, unknown> {
    return this.throughReflection?.options ?? {};
  }

  checkValidityBang(): void {
    if (!this.throughReflection) {
      throw new HasManyThroughAssociationNotFoundError(this.activeRecord.name, this.through);
    }

    if (this.throughReflection.isPolymorphic()) {
      if (this.hasOne()) {
        throw new HasOneAssociationPolymorphicThroughError(this.activeRecord.name, this.name);
      } else {
        throw new HasManyThroughAssociationPolymorphicThroughError(
          this.activeRecord.name,
          this.name,
        );
      }
    }

    if (!this.sourceReflection) {
      throw new HasManyThroughSourceAssociationNotFoundError(
        this.activeRecord.name,
        this.through,
        this.sourceReflectionNames().join(" or "),
        this.name,
      );
    }

    if (this.options.sourceType && !this.sourceReflection.isPolymorphic()) {
      throw new HasManyThroughAssociationPointlessSourceTypeError(
        this.activeRecord.name,
        this.name,
        (this.sourceReflection as any).name,
      );
    }

    if (this.sourceReflection.isPolymorphic() && !this.options.sourceType) {
      throw new HasManyThroughAssociationPolymorphicSourceError(
        this.activeRecord.name,
        this.name,
        (this.sourceReflection as any).name,
      );
    }

    if (this.hasOne() && this.throughReflection.isCollection()) {
      throw new HasOneThroughCantAssociateThroughCollection(
        this.activeRecord.name,
        this.name,
        (this.throughReflection as any).name,
      );
    }

    this.checkValidityOfInverseBang();
  }

  constraints(): Array<(...args: any[]) => any> {
    const sourceConstraints = this.sourceReflection?.constraints?.() ?? [];
    return this.scope ? [...sourceConstraints, this.scope] : sourceConstraints;
  }

  addAsSource(seed: AbstractReflection[]): AbstractReflection[] {
    return this._collectJoinReflections(seed);
  }

  addAsPolymorphicThrough(
    reflection: AbstractReflection,
    seed: AbstractReflection[],
  ): AbstractReflection[] {
    return this._collectJoinReflections([...seed, new PolymorphicReflection(this, reflection)]);
  }

  addAsThrough(seed: AbstractReflection[]): AbstractReflection[] {
    return this._collectJoinReflections([...seed, this]);
  }

  private _collectJoinReflections(seed: AbstractReflection[]): AbstractReflection[] {
    const src = this.sourceReflection;
    if (!src) return seed;
    const a = src.addAsSource(seed);
    if (this.options.sourceType) {
      const through = this.throughReflection;
      return through ? through.addAsPolymorphicThrough(this, a) : a;
    }
    const through = this.throughReflection;
    return through ? through.addAsThrough(a) : a;
  }
}

/**
 * Wraps a reflection for polymorphic :through associations, adding a type constraint.
 *
 * Mirrors: ActiveRecord::Reflection::PolymorphicReflection
 */
export class PolymorphicReflection extends AbstractReflection {
  private _reflection: AbstractReflection;
  private _previousReflection: AbstractReflection;

  constructor(reflection: AbstractReflection, previousReflection: AbstractReflection) {
    super();
    this._reflection = reflection;
    this._previousReflection = previousReflection;
  }

  get klass(): typeof Base {
    return (this._reflection as any).klass;
  }

  get scope(): ((...args: any[]) => any) | null {
    return (this._reflection as any).scope;
  }

  get pluralName(): string {
    return (this._reflection as any).pluralName;
  }

  get type(): string | null {
    return (this._reflection as any).type;
  }

  get joinPrimaryKey(): string | string[] {
    return (this._reflection as any).joinPrimaryKey;
  }

  get joinForeignKey(): string | string[] {
    return (this._reflection as any).joinForeignKey;
  }

  get name(): string {
    return (this._reflection as any).name;
  }

  get className(): string {
    return (this._reflection as any).className;
  }

  scopeFor(relation: any, owner?: any): any {
    return (this._reflection as any).scopeFor?.(relation, owner) ?? relation;
  }

  joinScopes(table: Table): any[] {
    const scopes = super.joinScopes(table);
    if (!(this._previousReflection as any).isThroughReflection?.()) {
      const prevScopes = (this._previousReflection as any).joinScopes?.(table) ?? [];
      scopes.push(...prevScopes);
    }
    return scopes;
  }

  constraints(): Array<(...args: any[]) => any> {
    const reflConstraints = (this._reflection as any).constraints?.() ?? [];
    const typeConstraint = this._sourceTypeScope();
    return [...reflConstraints, typeConstraint];
  }

  private _sourceTypeScope(): (...args: any[]) => any {
    const typeCol = (this._previousReflection as any).foreignType;
    const sourceType = (this._previousReflection as any).options?.sourceType;
    return (rel: any) => rel?.where?.({ [typeCol]: sourceType }) ?? rel;
  }
}

/**
 * A runtime reflection that delegates to an actual reflection but can resolve
 * the klass from an association instance.
 *
 * Mirrors: ActiveRecord::Reflection::RuntimeReflection
 */
export class RuntimeReflection extends AbstractReflection {
  private _reflection: AbstractReflection;
  private _association: any;

  constructor(reflection: AbstractReflection, association: any) {
    super();
    this._reflection = reflection;
    this._association = association;
  }

  get name(): string {
    return (this._reflection as any).name;
  }

  get className(): string {
    return (this._reflection as any).className;
  }

  get pluralName(): string {
    return (this._reflection as any).pluralName;
  }

  get scope(): ((...args: any[]) => any) | null {
    return (this._reflection as any).scope;
  }

  get type(): string | null {
    return (this._reflection as any).type;
  }

  constraints(): Array<(...args: any[]) => any> {
    return (this._reflection as any).constraints?.() ?? [];
  }

  get joinForeignKey(): string | string[] {
    return (this._reflection as any).joinForeignKey;
  }

  get klass(): typeof Base {
    return this._association.klass;
  }

  aliasedTable(): Table {
    return (this.klass as any).arelTable;
  }

  get joinPrimaryKey(): string | string[] {
    return (this._reflection as any).joinPrimaryKey;
  }

  allIncludes(callback: () => any): any {
    return callback();
  }
}

// ---------------------------------------------------------------------------
// Column reflection (unchanged from before)
// ---------------------------------------------------------------------------

export class ColumnReflection {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: unknown;

  constructor(name: string, type: string, defaultValue: unknown) {
    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
  }
}

// ---------------------------------------------------------------------------
// Factory & public API
// ---------------------------------------------------------------------------

function reflectionClassFor(
  macro: string,
): new (
  name: string,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  activeRecord: typeof Base,
) => AssociationReflection {
  switch (macro) {
    case "hasMany":
      return HasManyReflection;
    case "hasOne":
      return HasOneReflection;
    case "belongsTo":
      return BelongsToReflection;
    case "hasAndBelongsToMany":
      return HasAndBelongsToManyReflection;
    default:
      return AssociationReflection;
  }
}

/**
 * Create a reflection from an association definition.
 * Returns ThroughReflection wrapper for :through associations.
 */
export function createReflection(
  assocDef: { name: string; type: string; options: Record<string, unknown> },
  ownerClass: typeof Base,
): AssociationReflection | ThroughReflection {
  const normalizedType =
    assocDef.type === "hasManyThrough"
      ? "hasMany"
      : assocDef.type === "hasOneThrough"
        ? "hasOne"
        : assocDef.type;

  const ReflectionClass = reflectionClassFor(normalizedType);
  const { scope: assocScope, ...restOptions } = assocDef.options as {
    scope?: (...args: any[]) => any;
  } & Record<string, unknown>;
  const reflection = new ReflectionClass(
    assocDef.name,
    assocScope ?? null,
    restOptions,
    ownerClass,
  );

  if (
    assocDef.type !== "hasAndBelongsToMany" &&
    (assocDef.options.through ||
      assocDef.type === "hasManyThrough" ||
      assocDef.type === "hasOneThrough")
  ) {
    const through = new ThroughReflection(reflection);
    reflection.parentReflection = through;
    return through;
  }

  return reflection;
}

/**
 * Mirrors: ActiveRecord::Reflection.create
 */
export function create(
  macro: MacroType,
  name: string,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  activeRecord: typeof Base,
): AssociationReflection | ThroughReflection | AggregateReflection {
  if (macro === "composedOf") {
    return new AggregateReflection(name, scope, options, activeRecord);
  }
  const ReflectionClass = reflectionClassFor(macro);
  const reflection = new ReflectionClass(name, scope, options, activeRecord);
  if (options.through) {
    const through = new ThroughReflection(reflection);
    reflection.parentReflection = through;
    return through;
  }
  return reflection;
}

/**
 * Mirrors: ActiveRecord::Reflection.add_reflection
 */
export function addReflection(
  activeRecord: typeof Base,
  name: string,
  reflection: AssociationReflection | ThroughReflection,
): void {
  clearReflectionsCache(activeRecord);
  const hasOwn = Object.prototype.hasOwnProperty.call(activeRecord, "_reflections");
  const inherited: Record<string, any> = (activeRecord as any)._reflections ?? {};
  const reflections = hasOwn ? inherited : { ...inherited };
  reflections[name] = reflection;
  (activeRecord as any)._reflections = reflections;
}

/**
 * Mirrors: ActiveRecord::Reflection.add_aggregate_reflection
 */
export function addAggregateReflection(
  activeRecord: typeof Base,
  name: string,
  reflection: AggregateReflection,
): void {
  const hasOwn = Object.prototype.hasOwnProperty.call(activeRecord, "_aggregateReflections");
  const existing = (activeRecord as any)._aggregateReflections;
  const aggs: Map<string, AggregateReflection> =
    hasOwn && existing instanceof Map
      ? existing
      : new Map<string, AggregateReflection>(existing instanceof Map ? existing : undefined);
  aggs.set(name, reflection);
  (activeRecord as any)._aggregateReflections = aggs;
}

// ---------------------------------------------------------------------------
// ClassMethods — standalone functions mirroring ActiveRecord::Reflection::ClassMethods.
// In Rails these are mixed into the model class; here they are module-level
// functions that take the model class as the first argument.
// ---------------------------------------------------------------------------

export function reflections(modelClass: typeof Base): Record<string, any> {
  return normalizedReflections(modelClass);
}

export function normalizedReflections(
  modelClass: typeof Base,
): Record<string, AssociationReflection | ThroughReflection> {
  const rawReflections: Record<string, any> = (modelClass as any)._reflections ?? {};
  const result: Record<string, any> = {};
  for (const [name, ref] of Object.entries(rawReflections)) {
    const parent = ref.parentReflection;
    if (parent) {
      result[parent.name] = parent;
    } else {
      result[name] = ref;
    }
  }
  return result;
}

export function clearReflectionsCache(_modelClass: typeof Base): void {
  // No-op until normalizedReflections adds memoization.
  // Rails clears @__reflections here so the next call to normalized_reflections
  // recomputes the collapsed reflection map.
}

// ---------------------------------------------------------------------------
// Public helper functions
// ---------------------------------------------------------------------------

export function columns(modelClass: typeof Base): ColumnReflection[] {
  return Array.from(modelClass._attributeDefinitions.entries()).map(
    ([name, def]) => new ColumnReflection(name, def.type.constructor.name, def.defaultValue),
  );
}

export function columnNames(modelClass: typeof Base): string[] {
  return Array.from(modelClass._attributeDefinitions.keys());
}

export function contentColumns(modelClass: typeof Base): ColumnReflection[] {
  const contentNames = new Set(modelClass.contentColumns());
  return columns(modelClass).filter((col) => contentNames.has(col.name));
}

export function reflectOnAssociation(
  modelClass: typeof Base,
  name: string,
): AssociationReflection | ThroughReflection | null {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const assocDef = associations.find((a: any) => a.name === name);
  if (!assocDef) return null;
  return createReflection(assocDef, modelClass);
}

export function reflectOnAllAssociations(
  modelClass: typeof Base,
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
): Array<AssociationReflection | ThroughReflection> {
  const associations: any[] = (modelClass as any)._associations ?? [];
  const allReflections = associations.map((assocDef) => createReflection(assocDef, modelClass));

  if (!macro) return allReflections;

  return allReflections.filter((ref) => {
    const refMacro =
      ref instanceof ThroughReflection ? ref.macro : (ref as AssociationReflection).macro;
    if (macro === "hasAndBelongsToMany") {
      return refMacro === "hasAndBelongsToMany";
    }
    return refMacro === macro;
  });
}

export function reflectOnAllAggregations(modelClass: typeof Base): AggregateReflection[] {
  const aggregations: Map<string, AggregateReflection> | undefined = (modelClass as any)
    ._aggregateReflections;
  if (!aggregations) return [];
  return Array.from(aggregations.values());
}

export function reflectOnAggregation(
  modelClass: typeof Base,
  name: string,
): AggregateReflection | null {
  const aggregations: Map<string, AggregateReflection> | undefined = (modelClass as any)
    ._aggregateReflections;
  if (!aggregations) return null;
  return aggregations.get(name) ?? null;
}

export function reflectOnAllAutosaveAssociations(
  modelClass: typeof Base,
): AssociationLikeReflection[] {
  return reflectOnAllAssociations(modelClass).filter((ref) => {
    const opts =
      ref instanceof ThroughReflection ? ref.options : (ref as AssociationReflection).options;
    return !!opts.autosave;
  });
}

/**
 * Union type for reflections returned by the public API.
 */
export type AssociationLikeReflection = AssociationReflection | ThroughReflection;
