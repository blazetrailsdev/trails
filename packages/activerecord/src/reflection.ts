import type { Base } from "./base.js";
import {
  underscore,
  pluralize,
  singularize,
  camelize,
  demodulize,
  foreignKey as deriveForeignKey,
} from "@blazetrails/activesupport";
import { Table } from "@blazetrails/arel";
import { modelRegistry } from "./associations.js";
import {
  hasQueryConstraints,
  queryConstraintsList,
  compositeQueryConstraintsList,
} from "./persistence.js";
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
  HasManyThroughOrderError,
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

  buildScope(_table?: Table, _predicateBuilder?: any, klass?: typeof Base): any {
    return ((klass ?? this.klass) as any).all();
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

  joinScopes(table: Table, predicateBuilder?: any, klass?: typeof Base, record?: any): any[] {
    if (this.scope) {
      const rel = this.buildScope(table, predicateBuilder, klass);
      const result = (this as any).scopeFor?.(rel, record) ?? this.scope(rel);
      return [result || rel];
    }
    return [];
  }

  klassJoinScope(_table?: Table, _predicateBuilder?: any): any {
    return this.buildScope(_table, _predicateBuilder);
  }

  constraints(): Array<(...args: any[]) => any> {
    return this.chain.flatMap((r) => r.scopes);
  }

  counterCacheColumn(): string | null {
    const counterCache = (this as any).options?.counterCache;
    if (!counterCache) {
      if (this.belongsTo()) return null;
      return `${(this as any).name}_count`;
    }

    const column: string | null =
      counterCache && typeof counterCache === "object" ? (counterCache.column ?? null) : null;

    if (this.belongsTo()) {
      return column || `${pluralize(underscore((this as any).activeRecord?.name ?? ""))}_count`;
    }
    return column || `${(this as any).name}_count`;
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
    this.options = this.normalizeOptions(options);
    this.activeRecord = activeRecord;
    this.pluralName = pluralize(name);
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof (this.constructor as typeof MacroReflection))) return false;
    const o = other as MacroReflection;
    return this.name === o.name && o.options != null && this.activeRecord === o.activeRecord;
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
    this._klassCache = this._klass(this.className);
    return this._klassCache;
  }

  _klass(className: string): typeof Base {
    // Rails uses this for namespace-aware resolution (tries ::ClassName
    // before Module::ClassName). Our model registry is flat, so this
    // delegates directly to computeClass. When namespace support is
    // added, this should try top-level resolution first.
    return this.computeClass(className);
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
      // Match Rails instance_exec: 0-arity scopes run with this=relation,
      // 1+-arity scopes receive relation as first arg
      if (this._scope.length === 0) {
        return this._scope.call(relation) || relation;
      }
      return this._scope.call(relation, relation, owner) || relation;
    }
    return relation;
  }

  private normalizeOptions(options: Record<string, unknown>): Record<string, unknown> {
    const counterCache = options.counterCache;
    if (counterCache) {
      let active = true;
      let column: string | null = null;

      if (typeof counterCache === "string") {
        column = counterCache;
      } else if (typeof counterCache === "object" && counterCache !== null) {
        const cc = counterCache as Record<string, unknown>;
        active = cc.active !== undefined ? !!cc.active : true;
        column = cc.column != null ? String(cc.column) : null;
      }

      options = { ...options, counterCache: { active, column } };
    }
    return options;
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
  private _foreignKeyCache: string | string[] | null = null;
  private _activeRecordPrimaryKeyCache: string | string[] | null = null;

  constructor(
    name: string,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
    activeRecord: typeof Base,
  ) {
    const opts = { ...options };

    if (opts.queryConstraints) {
      throw new Error(
        `Setting \`queryConstraints:\` option on \`${activeRecord.name}.${name}\` is not allowed. ` +
          `To get the same behavior, use the \`foreignKey\` option instead.`,
      );
    }

    if (Array.isArray(opts.foreignKey)) {
      opts.queryConstraints = opts.foreignKey;
      delete opts.foreignKey;
    }

    if (opts.className && typeof opts.className === "function") {
      throw new Error("A class was passed to `:className` but we are expecting a string.");
    }

    super(name, scope, opts, activeRecord);
  }

  get macro(): MacroType {
    throw new Error("Subclass must implement macro");
  }

  get foreignKey(): string | string[] {
    return this.computeForeignKey();
  }

  computeForeignKey(inferFromInverseOf = true): string | string[] {
    if (this._foreignKeyCache !== null) return this._foreignKeyCache;

    if (this.options.foreignKey) {
      const fk = this.options.foreignKey;
      this._foreignKeyCache = Array.isArray(fk) ? fk.map(String) : String(fk);
    } else if (this.options.queryConstraints) {
      this._foreignKeyCache = (this.options.queryConstraints as string[]).map(String);
    } else {
      let derivedFk: string | string[] = this.deriveForeignKey(inferFromInverseOf);

      if (hasQueryConstraints.call(this.activeRecord as any)) {
        derivedFk = this.deriveFkQueryConstraints(derivedFk as string);
      }

      this._foreignKeyCache = derivedFk;
    }

    return this._foreignKeyCache;
  }

  private deriveForeignKey(inferFromInverseOf = true): string {
    if (this.belongsTo()) return `${underscore(this.name)}_id`;
    if (this.options.as) return `${underscore(this.options.as as string)}_id`;
    if (this.options.inverseOf && inferFromInverseOf) {
      const inv = this.inverseOf();
      if (inv) return String((inv as any).computeForeignKey?.(false) ?? (inv as any).foreignKey);
    }
    return `${underscore(this.activeRecord.name)}_id`;
  }

  private deriveFkQueryConstraints(foreignKey: string): string | string[] {
    const primaryQueryConstraints = queryConstraintsList.call(this.activeRecord as any);
    if (!primaryQueryConstraints) return foreignKey;

    const ownerPk = this.activeRecord.primaryKey;
    const ownerPkStr = Array.isArray(ownerPk) ? undefined : ownerPk;

    if (primaryQueryConstraints.length > 2) {
      throw new Error(
        `The query constraints list on the \`${this.activeRecord.name}\` model has more than 2 ` +
          `attributes. Active Record is unable to derive the query constraints ` +
          `for the association. You need to explicitly define the query constraints ` +
          `for this association.`,
      );
    }

    if (ownerPkStr && !primaryQueryConstraints.includes(ownerPkStr)) {
      throw new Error(
        `The query constraints on the \`${this.activeRecord.name}\` model do not include the primary ` +
          `key so Active Record is unable to derive the foreign key constraints for ` +
          `the association. You need to explicitly define the query constraints for this ` +
          `association.`,
      );
    }

    if (primaryQueryConstraints.includes(foreignKey)) return foreignKey;

    const [firstKey, lastKey] = primaryQueryConstraints;

    if (firstKey === ownerPkStr) {
      return [foreignKey, lastKey];
    } else if (lastKey === ownerPkStr) {
      return [firstKey, foreignKey];
    }

    throw new Error(
      `Active Record couldn't correctly interpret the query constraints ` +
        `for the \`${this.activeRecord.name}\` model. The query constraints on \`${this.activeRecord.name}\` are ` +
        `\`${primaryQueryConstraints}\` and the foreign key is \`${foreignKey}\`. ` +
        `You need to explicitly set the query constraints for this association.`,
    );
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
    return !!this.options.polymorphic;
  }

  get validate(): boolean {
    if (this.options.validate !== undefined) return !!this.options.validate;
    return !!(this.options.autosave === true || this.isCollection());
  }

  hasInverse(): boolean {
    return !!this.inverseName();
  }

  inverseOf(): AssociationReflection | ThroughReflection | null {
    const name = this.inverseName();
    if (!name) return null;
    if (this._inverseOfCache !== undefined) return this._inverseOfCache;
    const result = this.klass._reflectOnAssociation(name) ?? null;
    this._inverseOfCache = result;
    return result;
  }

  private _inverseNameCache: string | null | undefined = undefined;
  private _inverseOfCache: AssociationReflection | ThroughReflection | null | undefined = undefined;

  private inverseName(): string | null {
    if (this._inverseNameCache !== undefined) return this._inverseNameCache;
    const explicit = this.options.inverseOf;
    if (explicit !== undefined) {
      this._inverseNameCache = explicit === false ? null : (explicit as string);
    } else {
      this._inverseNameCache = this.automaticInverseOf();
    }
    return this._inverseNameCache;
  }

  private automaticInverseOf(): string | null {
    if (!this.canFindInverseOfAutomatically(this)) return null;

    const inverseName = this.options.as
      ? underscore(this.options.as as string)
      : underscore(demodulize(this.activeRecord.name));

    let reflection: AssociationReflection | ThroughReflection | null | false;
    try {
      reflection = this.klass._reflectOnAssociation(inverseName);

      if (!reflection && this.activeRecord.automaticallyInvertPluralAssociations) {
        const pluralInverseName = pluralize(inverseName);
        reflection = this.klass._reflectOnAssociation(pluralInverseName);
      }
    } catch (e: unknown) {
      // Rails: rescue NameError => error; raise unless error.name.to_s == class_name
      // Only swallow model-not-found errors from computeClass, re-raise anything else
      if (e instanceof Error && e.message.startsWith("Could not find model")) {
        reflection = false;
      } else {
        throw e;
      }
    }

    if (this.validInverseReflection(reflection)) {
      return (reflection as any).name;
    }
    return null;
  }

  private validInverseReflection(
    reflection: AssociationReflection | ThroughReflection | null | false,
  ): boolean {
    if (!reflection) return false;
    if (reflection === (this as any)) return false;

    const reflFk = (reflection as any).foreignKey;
    const thisFk = this.foreignKey;
    if (JSON.stringify(reflFk) !== JSON.stringify(thisFk)) return false;

    const reflActiveRecord = (reflection as any).activeRecord;
    if (this.klass !== reflActiveRecord) {
      let proto = Object.getPrototypeOf(this.klass);
      let isSubclass = false;
      while (proto) {
        if (proto === reflActiveRecord) {
          isSubclass = true;
          break;
        }
        proto = Object.getPrototypeOf(proto);
      }
      if (!isSubclass) return false;
    }

    return this.canFindInverseOfAutomatically(reflection as AssociationReflection, true);
  }

  protected canFindInverseOfAutomatically(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection = false,
  ): boolean {
    if ((reflection as any).options?.inverseOf === false) return false;
    if ((reflection as any).options?.through) return false;
    if ((reflection as any).options?.foreignKey) return false;
    return this.scopeAllowsAutomaticInverseOf(reflection, inverseReflection);
  }

  private scopeAllowsAutomaticInverseOf(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection: boolean,
  ): boolean {
    if (inverseReflection) {
      return !(reflection as any).scope;
    }
    if (!(reflection as any).scope) return true;
    try {
      return !!(reflection as any).klass?.automaticScopeInversing;
    } catch {
      return false;
    }
  }

  associationPrimaryKeyFor(klass?: typeof Base): string | string[] {
    return this.primaryKeyForModel(klass || this.klass);
  }

  get associationPrimaryKey(): string | string[] {
    return this.associationPrimaryKeyFor();
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
    if (this._activeRecordPrimaryKeyCache !== null) return this._activeRecordPrimaryKeyCache;

    const customPk = this.options.primaryKey;
    if (customPk !== undefined) {
      this._activeRecordPrimaryKeyCache = Array.isArray(customPk)
        ? customPk.map(String)
        : String(customPk);
    } else if (
      hasQueryConstraints.call(this.activeRecord as any) ||
      this.options.queryConstraints
    ) {
      this._activeRecordPrimaryKeyCache =
        queryConstraintsList.call(this.activeRecord as any) ?? this.activeRecord.primaryKey;
    } else if ((this.activeRecord as any).compositePrimaryKey) {
      const pk = this.primaryKeyForModel(this.activeRecord);
      this._activeRecordPrimaryKeyCache = Array.isArray(pk) && pk.includes("id") ? "id" : pk;
    } else {
      this._activeRecordPrimaryKeyCache = this.primaryKeyForModel(this.activeRecord);
    }

    return this._activeRecordPrimaryKeyCache;
  }

  protected primaryKeyForModel(klass: typeof Base): string | string[] {
    const pk = klass.primaryKey;
    if (!pk) throw new Error(`Unknown primary key for ${klass.name}`);
    return pk;
  }

  associationScopeCache(klass: typeof Base, _owner: any, block: () => any): any {
    return block();
  }

  checkValidityBang(): void {
    this.checkValidityOfInverseBang();

    if (
      !this.isPolymorphic() &&
      ((this.klass as any).compositePrimaryKey ||
        (this.activeRecord as any).compositePrimaryKey ||
        Array.isArray(this.foreignKey))
    ) {
      const fk = this.foreignKey;
      if (this.hasOne() || this.isCollection()) {
        if (arrayLen(this.activeRecordPrimaryKey) !== arrayLen(fk)) {
          throw new Error(
            `Association ${this.name}: composite primary key / foreign key length mismatch ` +
              `(${arrayLen(this.activeRecordPrimaryKey)} primary key column(s) vs ${arrayLen(fk)} foreign key column(s))`,
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
      const name = this.inverseName();
      if (!name) return null;
      const inverseRelationship = associatedClass._reflectOnAssociation(name);
      if (!inverseRelationship) {
        throw new Error(
          `Could not find the inverse association for ${this.name} (:${name} in ${associatedClass.name})`,
        );
      }
      return inverseRelationship;
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

  get type(): string | null {
    return null;
  }

  associationClass(): typeof BelongsToAssociation | typeof BelongsToPolymorphicAssociation {
    return this.isPolymorphic() ? BelongsToPolymorphicAssociation : BelongsToAssociation;
  }

  protected override canFindInverseOfAutomatically(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection = false,
  ): boolean {
    if (this.isPolymorphic()) return false;
    return super.canFindInverseOfAutomatically(reflection, inverseReflection);
  }

  associationPrimaryKeyFor(klass?: typeof Base): string | string[] {
    const targetKlass = klass || this.klass;
    const pk = this.options.primaryKey;
    if (pk !== undefined) {
      return Array.isArray(pk) ? pk.map(String) : String(pk);
    }

    if (hasQueryConstraints.call(targetKlass as any) || this.options.queryConstraints) {
      return compositeQueryConstraintsList.call(targetKlass as any);
    }

    if ((targetKlass as any).compositePrimaryKey) {
      const primaryKey = targetKlass.primaryKey;
      if (Array.isArray(primaryKey) && primaryKey.includes("id")) return "id";
      return primaryKey;
    }

    return this.primaryKeyForModel(targetKlass);
  }

  get associationPrimaryKey(): string | string[] {
    return this.associationPrimaryKeyFor();
  }

  joinPrimaryKeyFor(klass?: typeof Base): string | string[] {
    return this.isPolymorphic()
      ? this.associationPrimaryKeyFor(klass)
      : this.associationPrimaryKeyFor();
  }

  get joinPrimaryKey(): string | string[] {
    if (this.isPolymorphic()) {
      const pk = this.options.primaryKey;
      if (pk !== undefined) {
        return Array.isArray(pk) ? pk.map(String) : String(pk);
      }
      return "id";
    }
    return this.joinPrimaryKeyFor();
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
        const singular = singularize(this.name);
        if (throughRef.klass._reflectOnAssociation(singular)) return singular;
        if (throughRef.klass._reflectOnAssociation(this.name)) return this.name;
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
      const src = throughRef.klass._reflectOnAssociation(srcName) ?? null;
      this._sourceReflectionCache = src;
      return src;
    } catch {
      this._sourceReflectionCache = null;
      return null;
    }
  }

  get throughReflection(): AssociationReflection | ThroughReflection | null {
    if (this._throughReflectionCache !== undefined) return this._throughReflectionCache;
    const through = this.activeRecord._reflectOnAssociation(this.through) ?? null;
    this._throughReflectionCache = through;
    return through;
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

  joinScopes(table: Table, predicateBuilder?: any, klass?: typeof Base, record?: any): any[] {
    const sourceScopes =
      this.sourceReflection?.joinScopes(table, predicateBuilder, klass, record) ?? [];
    return [...sourceScopes, ...super.joinScopes(table, predicateBuilder, klass, record)];
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
      const singular = singularize(this.name);
      const candidates = [...new Set([singular, this.name])];
      const matching = candidates.filter((n) => throughRef.klass._reflectOnAssociation(n) != null);

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

    if (!(this._delegate as any).parentReflection) {
      const refs = Object.keys(normalizedReflections(this.activeRecord));
      const throughIdx = refs.indexOf((this.throughReflection as any).name);
      const selfIdx = refs.indexOf(this.name);
      if (throughIdx > selfIdx) {
        throw new HasManyThroughOrderError(
          this.activeRecord.name,
          this.name,
          (this.throughReflection as any).name,
        );
      }
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

  joinScopes(table: Table, predicateBuilder?: any, klass?: typeof Base, record?: any): any[] {
    const scopes = super.joinScopes(table, predicateBuilder, klass, record);
    if (!(this._previousReflection as any).isThroughReflection?.()) {
      const prevScopes =
        (this._previousReflection as any).joinScopes?.(table, predicateBuilder, klass, record) ??
        [];
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
    return new ThroughReflection(reflection);
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
    return new ThroughReflection(reflection);
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

const _normalizedReflectionsCache = new WeakMap<
  typeof Base,
  Record<string, AssociationReflection | ThroughReflection>
>();

export function normalizedReflections(
  modelClass: typeof Base,
): Record<string, AssociationReflection | ThroughReflection> {
  const cached = _normalizedReflectionsCache.get(modelClass);
  if (cached) return cached;

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

  Object.freeze(result);
  _normalizedReflectionsCache.set(modelClass, result);
  return result;
}

export function clearReflectionsCache(modelClass: typeof Base): void {
  _normalizedReflectionsCache.delete(modelClass);
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

export function _reflectOnAssociation(
  modelClass: typeof Base,
  name: string,
): AssociationReflection | ThroughReflection | null {
  const rawReflections: Record<string, any> = (modelClass as any)._reflections ?? {};
  return rawReflections[name] ?? null;
}

export function reflectOnAssociation(
  modelClass: typeof Base,
  name: string,
): AssociationReflection | ThroughReflection | null {
  const normalized = normalizedReflections(modelClass);
  return normalized[name] ?? null;
}

export function reflectOnAllAssociations(
  modelClass: typeof Base,
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
): Array<AssociationReflection | ThroughReflection> {
  const allReflections = Object.values(normalizedReflections(modelClass));

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
