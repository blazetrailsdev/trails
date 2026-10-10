import {
  block,
  fetch,
  first,
  rbEqual,
  rbInspect,
  rbModName,
  rbModToS,
  zip,
} from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { ConfigurationError, NameError, UnknownPrimaryKey } from "./errors.js";
import { cachedFindByStatement } from "./core.js";
import { TableMetadata } from "./table-metadata.js";
import {
  underscore,
  pluralize,
  singularize,
  camelize,
  demodulize,
  constantize,
  foreignKey as deriveForeignKey,
  merge,
  DelegationError,
  classAttribute,
  included,
  kernelArray,
} from "@blazetrails/activesupport";
import {
  NotImplementedError,
  RuntimeError,
  StandardError,
  except,
  mergeBang,
  rbRegMatchP,
  rtest,
  toS,
} from "@blazetrails/ruby-compat";
import { Table, Nodes } from "@blazetrails/arel";
import { deriveJoinTableName } from "./model-schema.js";

import * as ReflectionModule from "./reflection.js";
import {
  hasQueryConstraints,
  queryConstraintsList,
  compositeQueryConstraintsList,
} from "./persistence.js";
import type { BelongsToAssociation } from "./associations/belongs-to-association.js";
import type { BelongsToPolymorphicAssociation } from "./associations/belongs-to-polymorphic-association.js";
import type { HasManyAssociation } from "./associations/has-many-association.js";
import type { HasManyThroughAssociation } from "./associations/has-many-through-association.js";
import type { HasOneAssociation } from "./associations/has-one-association.js";
import type { HasOneThroughAssociation } from "./associations/has-one-through-association.js";
import { ActiveRecord, Associations } from "./namespaces.js";
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
  InverseOfAssociationNotFoundError,
  InverseOfAssociationRecursiveError,
  CompositePrimaryKeyMismatchError,
} from "./associations/errors.js";
import { polymorphicName, typeCondition } from "./inheritance.js";
import { Relation } from "./relation.js";

type MacroType = "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany" | "composedOf";

export interface ConcreteReflection {
  readonly macro: MacroType;
  readonly name: string;
  readonly options: Record<string, unknown>;
  readonly activeRecord: typeof Base;
  readonly pluralName: string;
  readonly className: string;
  readonly klass: typeof Base;
  readonly type?: string;
  foreignKey?(kwargs?: { inferFromInverseOf?: boolean }): string | string[];
  readonly scope?: ((...args: any[]) => any) | null;
  joinPrimaryKey?(klass?: typeof Base): string | string[];
  readonly joinForeignKey?: string | string[];
  readonly parentReflection?: AssociationReflection | ThroughReflection | null;
  scopeFor(relation: any, owner?: any): any;
}

export type ReflectionWithMacro<M extends MacroType> = ConcreteReflection & { readonly macro: M };

function asConcrete(reflection: AbstractReflection): ConcreteReflection {
  return reflection as unknown as ConcreteReflection;
}

function arrayLen(value: string | string[]): number {
  return Array.isArray(value) ? value.length : 1;
}

export abstract class AbstractReflection {
  private _className?: string;
  /** @internal */
  private _counterCacheColumn?: string | null;
  private _inverseWhichUpdatesCounterCacheDefined?: boolean;
  private _inverseWhichUpdatesCounterCache?: AbstractReflection;

  /** @internal */
  protected _concrete(): ConcreteReflection {
    return this as unknown as ConcreteReflection;
  }

  isThroughReflection(): boolean {
    return false;
  }

  protected primaryKey(klass: typeof Base): string | string[] {
    const pk = klass.primaryKey;
    if (!pk) throw new UnknownPrimaryKey(klass);
    return pk;
  }

  get tableName(): string | null {
    return this.klass.tableName;
  }

  buildAssociation(
    attributes: Record<string, unknown> = {},
    block?: (record: InstanceType<typeof Base>) => void,
  ): InstanceType<typeof Base> {
    return new (this.klass as any)(attributes, block);
  }

  get className(): string {
    return (this._className ??= toS(
      this._concrete().options.className ??
        (this as unknown as { deriveClassName(): string }).deriveClassName(),
    ));
  }

  abstract get klass(): typeof Base;

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

  isCollection(): boolean {
    return false;
  }

  isPolymorphic(): boolean {
    return false;
  }

  get chain(): AbstractReflection[] {
    return this.collectJoinChain();
  }

  collectJoinChain(): AbstractReflection[] {
    return [this];
  }

  buildScope(table?: Table | Nodes.TableAlias, predicateBuilder?: any, klass?: typeof Base): any {
    return Relation.create(klass ?? this.klass, { table, predicateBuilder });
  }

  joinScope(
    table: Table | Nodes.TableAlias,
    foreignTable: Table | Nodes.TableAlias,
    foreignKlass: typeof Base,
  ): any {
    const predicateBuilder = (this.klass as any).predicateBuilder.with(
      new TableMetadata(this.klass, table),
    );
    const scopeChainItems = this.joinScopes(table, predicateBuilder);
    const klassScope = this.klassJoinScope(table, predicateBuilder);

    const type = this._concrete().type;
    if (type) {
      klassScope.whereBang({ [type]: polymorphicName(foreignKlass) });
    }

    scopeChainItems.reduce((scope, item) => scope.mergeBang(item), klassScope);

    const primaryKeyColumnNames = kernelArray(this._concrete().joinPrimaryKey!());
    const foreignKeyColumnNames = kernelArray(this._concrete().joinForeignKey);

    const primaryForeignKeyPairs = zip(primaryKeyColumnNames, foreignKeyColumnNames);

    for (const [primaryKeyColumnName, foreignKeyColumnName] of primaryForeignKeyPairs) {
      klassScope.whereBang(
        table.get(primaryKeyColumnName!).eq(foreignTable.get(foreignKeyColumnName!)),
      );
    }

    if ((this.klass as any).isFinderNeedsTypeCondition()) {
      klassScope.whereBang(typeCondition(this.klass as any, table));
    }

    return klassScope;
  }

  joinScopes(
    table: Table | Nodes.TableAlias,
    predicateBuilder?: any,
    klass?: typeof Base,
    record?: any,
  ): any[] {
    if (this.scope) {
      return [this._concrete().scopeFor(this.buildScope(table, predicateBuilder, klass), record)];
    }
    return [];
  }

  klassJoinScope(table?: Table | Nodes.TableAlias, predicateBuilder?: any): any {
    const relation = this.buildScope(table, predicateBuilder);
    return (this.klass as any).scopeForAssociation(relation);
  }

  constraints(): Array<(...args: any[]) => any> {
    return this.chain.flatMap((r) => r.scopes);
  }

  counterCacheColumn(): string | null {
    return (this._counterCacheColumn ??= (() => {
      const counterCache = this._concrete().options.counterCache as
        | { column: string | null }
        | undefined;

      if (this.belongsTo()) {
        if (counterCache) {
          return (
            counterCache.column ??
            `${pluralize(underscore(demodulize(this._concrete().activeRecord.modelName.name)))}_count`
          );
        }
        return null;
      } else {
        return (counterCache && counterCache.column) ?? `${this._concrete().name}_count`;
      }
    })());
  }

  checkValidityOfInverseBang(): void {
    const hasInverse = this.hasInverse();
    if (!this.isPolymorphic() && hasInverse != null && hasInverse !== false) {
      const inverse = this.inverseOf();
      if (inverse == null) {
        throw new InverseOfAssociationNotFoundError(this._concrete());
      }
      if (
        asConcrete(inverse).name === this._concrete().name &&
        asConcrete(inverse).activeRecord === this._concrete().activeRecord
      ) {
        throw new InverseOfAssociationRecursiveError(this._concrete());
      }
    }
  }

  inverseWhichUpdatesCounterCache(): AbstractReflection | null {
    if (!this._inverseWhichUpdatesCounterCacheDefined) {
      if (this.counterCacheColumn()) {
        const inverseCandidates: any[] = this.inverseOf()
          ? [this.inverseOf()]
          : this.klass.reflectOnAllAssociations("belongsTo");
        this._inverseWhichUpdatesCounterCache = inverseCandidates.find(
          (inverse: any) =>
            inverse.counterCacheColumn() === this.counterCacheColumn() &&
            (inverse.isPolymorphic() || inverse.klass === this._concrete().activeRecord),
        );
      }
      this._inverseWhichUpdatesCounterCacheDefined = true;
    }
    return this._inverseWhichUpdatesCounterCache ?? null;
  }

  isInverseUpdatesCounterCache(): AbstractReflection | null {
    return this.inverseWhichUpdatesCounterCache();
  }

  isInverseUpdatesCounterInMemory(): boolean {
    const inv = this.inverseOf();
    if (inv == null) return false;
    const iwucc = this.inverseWhichUpdatesCounterCache();
    if (iwucc == null) return false;
    return (
      asConcrete(inv).name === asConcrete(iwucc).name &&
      asConcrete(inv).activeRecord === asConcrete(iwucc).activeRecord
    );
  }

  hasCachedCounter(): boolean {
    return !!(
      this._concrete().options.counterCache ||
      (this.inverseWhichUpdatesCounterCache() &&
        asConcrete(this.inverseWhichUpdatesCounterCache()!).options.counterCache &&
        (this._concrete().activeRecord as any).hasAttribute(this.counterCacheColumn()))
    );
  }

  hasActiveCachedCounter(): boolean {
    if (!this.hasCachedCounter()) return false;

    const counterCache = (this._concrete().options.counterCache ||
      (this.inverseWhichUpdatesCounterCache() &&
        asConcrete(this.inverseWhichUpdatesCounterCache()!).options.counterCache)) as {
      active?: unknown;
    };

    return counterCache.active !== false;
  }

  isCounterMustBeUpdatedByHasMany(): boolean {
    return !this.isInverseUpdatesCounterInMemory() && this.hasCachedCounter();
  }

  aliasCandidate(name: string): string {
    return `${underscore(this._concrete().pluralName)}_${name}`;
  }

  strictLoadingViolationMessage(owner: unknown): string {
    let message = `\`${rbModToS(owner as typeof Base)}\` is marked for strict_loading.`;
    message += ` The ${this.isPolymorphic() ? "polymorphic association" : `${rbModToS(this.klass)} association`}`;
    message += ` named \`:${this._concrete().name}\` cannot be lazily loaded.`;
    return message;
  }

  hasInverse(): string | false | null {
    return false;
  }

  inverseOf(): AbstractReflection | null {
    return null;
  }

  /** @internal */
  inverseName(): string | false | null {
    return null;
  }

  /** @internal */
  protected ensureOptionNotGivenAsClassBang(optionName: string): void {
    const opts = this._concrete().options as Record<string, unknown> | undefined;
    const val = opts?.[optionName];
    if (typeof val === "function" && /^class[\s{]/.test(Function.prototype.toString.call(val))) {
      throw new ArgumentError(
        `A class was passed to \`:${underscore(optionName)}\` but we are expecting a string.`,
      );
    }
  }
}

export class MacroReflection extends AbstractReflection {
  readonly name: string;
  readonly options: Record<string, unknown>;
  readonly activeRecord: typeof Base;
  readonly pluralName: string;
  private _scope: ((...args: any[]) => any) | null;
  private _klassCache: typeof Base | null = null;

  constructor(
    name: string | null,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
    activeRecord: typeof Base,
  ) {
    super();
    this.name = name as string;
    this._scope = scope;
    this.options = this.normalizeOptions(options);
    this.activeRecord = activeRecord;
    this.pluralName = activeRecord.pluralizeTableNames ? pluralize(name ?? "") : (name ?? "");
  }

  protected get nameString(): string {
    return this.name ?? "";
  }

  equals(other: unknown): boolean {
    return (
      this === other ||
      (other instanceof (this.constructor as typeof MacroReflection) &&
        this.name === other.name &&
        other.options != null &&
        this.activeRecord === other.activeRecord)
    );
  }

  set autosave(value: boolean) {
    (this.options as any).autosave = value;
    const parent = asConcrete(this).parentReflection;
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

  get klass(): typeof Base {
    if (this._klassCache) return this._klassCache;
    const resolved = this.options.anonymousClass
      ? (this.options.anonymousClass as typeof Base)
      : this._klass(this.className);
    this._klassCache = resolved;
    return resolved;
  }

  _klass(className: string): typeof Base {
    if (demodulize(rbModName(this.activeRecord)!) === className) {
      try {
        return this.computeClass(`::${className}`);
      } catch (error) {
        if (!(error instanceof StandardError)) throw error;
      }
    }

    return this.computeClass(className);
  }

  computeClass(name: string): typeof Base {
    return constantize(name) as typeof Base;
  }

  scopeFor(relation: any, owner: any = null): any {
    return this._scope!.call(relation, owner) || relation;
  }

  /** @internal */
  protected deriveClassName(): string {
    return camelize(this.nameString);
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
        active = fetch(cc, "active", true);
        column = cc.column != null ? String(cc.column) : null;
      }

      options = { ...options, counterCache: { active, column } };
    }
    return options;
  }
}

export class AggregateReflection extends MacroReflection {
  get macro(): MacroType {
    return "composedOf";
  }

  get tableName(): string | null {
    return this.activeRecord.tableName;
  }

  get klass(): any {
    if (this.options.anonymousClass) return this.options.anonymousClass;
    return super.klass;
  }

  mapping(): [string, string][] {
    const mapping = (this.options.mapping as unknown[]) || [this.name, this.name];
    return (Array.isArray(first(mapping)) ? mapping : [mapping]) as [string, string][];
  }
}

export class AssociationReflection extends MacroReflection {
  parentReflection: AssociationReflection | ThroughReflection | null = null;
  private _foreignKeyCache: string | string[] | null = null;
  private _activeRecordPrimaryKeyCache: string | string[] | null = null;

  constructor(
    name: string | null,
    scope: ((...args: any[]) => any) | null,
    options: Record<string, unknown>,
    activeRecord: typeof Base,
  ) {
    const opts = { ...options };

    if (opts.queryConstraints) {
      const macro = new.target.name.replace(/Reflection$/, "");
      const macroName = macro.charAt(0).toLowerCase() + macro.slice(1);
      throw new ConfigurationError(
        `Setting \`queryConstraints:\` option on \`${activeRecord.name}.${macroName} :${name ?? ""}\` ` +
          `is not allowed. To get the same behavior, use the \`foreignKey\` option instead.`,
      );
    }

    if (Array.isArray(opts.foreignKey)) {
      opts.queryConstraints = opts.foreignKey;
      delete opts.foreignKey;
    }

    super(name, scope, opts, activeRecord);

    this.ensureOptionNotGivenAsClassBang("className");
  }

  get macro(): MacroType {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/reflection.rb:691
    throw new NotImplementedError();
  }

  foreignKey({ inferFromInverseOf = true }: { inferFromInverseOf?: boolean } = {}):
    | string
    | string[] {
    if (this._foreignKeyCache !== null) return this._foreignKeyCache;

    if (this.options.foreignKey) {
      if (Array.isArray(this.options.foreignKey)) {
        this._foreignKeyCache = this.options.foreignKey.map((fk) => String(fk));
      } else {
        this._foreignKeyCache = String(this.options.foreignKey);
      }
    } else if (this.options.queryConstraints) {
      this._foreignKeyCache = (this.options.queryConstraints as string[]).map((fk) => String(fk));
    } else {
      let derivedFk: string | string[] = this.deriveForeignKey({ inferFromInverseOf });

      if (hasQueryConstraints.call(this.activeRecord as any)) {
        derivedFk = this.deriveFkQueryConstraints(derivedFk);
      }

      this._foreignKeyCache = derivedFk;
    }

    return this._foreignKeyCache;
  }

  private deriveForeignKey({
    inferFromInverseOf = true,
  }: { inferFromInverseOf?: boolean } = {}): string {
    if (this.belongsTo()) return `${underscore(this.nameString)}_id`;
    if (this.options.as) return `${underscore(this.options.as as string)}_id`;
    if (this.options.inverseOf && inferFromInverseOf) {
      return this.inverseOf()!.foreignKey({ inferFromInverseOf: false }) as string;
    }
    const baseName = rbModName(this.activeRecord)!;
    return `${underscore(demodulize(baseName))}_id`;
  }

  private deriveFkQueryConstraints(foreignKey: string): string | string[] {
    const primaryQueryConstraints = queryConstraintsList.call(this.activeRecord as any)!;
    const ownerPk = this.activeRecord.primaryKey as string;

    if (primaryQueryConstraints.length > 2) {
      throw new ArgumentError(
        `The query constraints list on the \`${this.activeRecord.name}\` model has more than 2 ` +
          `attributes. Active Record is unable to derive the query constraints ` +
          `for the association. You need to explicitly define the query constraints ` +
          `for this association.`,
      );
    }

    if (!primaryQueryConstraints.includes(ownerPk)) {
      throw new ArgumentError(
        `The query constraints on the \`${this.activeRecord.name}\` model does not include the primary ` +
          `key so Active Record is unable to derive the foreign key constraints for ` +
          `the association. You need to explicitly define the query constraints for this ` +
          `association.`,
      );
    }

    if (primaryQueryConstraints.includes(foreignKey)) return foreignKey;

    const [firstKey, lastKey] = primaryQueryConstraints;

    if (firstKey === ownerPk) {
      return [foreignKey, lastKey];
    } else if (lastKey === ownerPk) {
      return [firstKey, foreignKey];
    }

    throw new ArgumentError(
      `Active Record couldn't correctly interpret the query constraints ` +
        `for the \`${this.activeRecord.name}\` model. The query constraints on \`${this.activeRecord.name}\` are ` +
        `\`${rbInspect(primaryQueryConstraints)}\` and the foreign key is \`${foreignKey}\`. ` +
        `You need to explicitly set the query constraints for this association.`,
    );
  }

  get foreignType(): string | null {
    if (!this.options.polymorphic && !this.options.as) return null;
    if (this.belongsTo())
      return (
        (this.options.foreignType as string | undefined) ?? `${underscore(this.nameString)}_type`
      );
    if (this.options.as) {
      return (
        (this.options.foreignType as string | undefined) ??
        `${underscore(this.options.as as string)}_type`
      );
    }
    return null;
  }

  get joinTable(): string {
    if (this.options.joinTable) return this.options.joinTable as string;
    return this.deriveJoinTable();
  }

  isPolymorphic(): boolean {
    return !!this.options.polymorphic;
  }

  isValidate(): boolean {
    return this.options.validate != null
      ? !!this.options.validate
      : this.options.autosave === true || this.isCollection();
  }

  hasInverse(): string | false | null {
    return this.inverseName();
  }

  inverseOf(): AssociationReflection | ThroughReflection | null {
    const name = this.inverseName();
    if (!name) return null;
    if (this._inverseOfCache) return this._inverseOfCache;
    this._inverseOfCache = this.klass._reflectOnAssociation(name) ?? null;
    return this._inverseOfCache;
  }

  private _inverseNameCache: string | false | null | undefined = undefined;
  private _inverseOfCache: AssociationReflection | ThroughReflection | null | undefined = undefined;

  /** @internal */
  override inverseName(): string | false | null {
    if (this._inverseNameCache !== undefined) return this._inverseNameCache;
    this._inverseNameCache = fetch<string | false | null>(
      this.options,
      "inverseOf",
      block(() => this.automaticInverseOf()),
    );
    return this._inverseNameCache;
  }

  private automaticInverseOf(): string | null {
    if (this.canFindInverseOfAutomatically(this)) {
      const inverseName = camelize(
        underscore((this.options.as as string) || demodulize(rbModName(this.activeRecord)!)),
        false,
      );

      let reflection: AssociationReflection | ThroughReflection | null | false;
      try {
        reflection = this.klass._reflectOnAssociation(inverseName);
        if (!reflection && this.activeRecord.automaticallyInvertPluralAssociations) {
          const pluralInverseName = pluralize(inverseName);
          reflection = this.klass._reflectOnAssociation(pluralInverseName);
        }
      } catch (error: unknown) {
        if (error instanceof NameError && error.constantName === this.className) {
          reflection = false;
        } else {
          throw error;
        }
      }

      if (this.validInverseReflection(reflection)) {
        return (reflection as AssociationReflection | ThroughReflection).name;
      }
    }
    return null;
  }

  private validInverseReflection(
    reflection: AssociationReflection | ThroughReflection | null | false,
  ): boolean {
    return !!(
      reflection &&
      (reflection as AbstractReflection) !== this &&
      rbEqual(this.foreignKey(), reflection.foreignKey()) &&
      (this.klass === reflection.activeRecord ||
        this.klass.prototype instanceof reflection.activeRecord) &&
      this.canFindInverseOfAutomatically(reflection, true)
    );
  }

  protected canFindInverseOfAutomatically(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection = false,
  ): boolean {
    const opts = asConcrete(reflection).options;
    if (opts?.inverseOf === false) return false;
    if (opts?.through) return false;
    if (opts?.foreignKey) return false;
    return this.scopeAllowsAutomaticInverseOf(reflection, inverseReflection);
  }

  private scopeAllowsAutomaticInverseOf(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection: boolean,
  ): boolean {
    if (inverseReflection) {
      return !reflection.scope;
    } else {
      return !reflection.scope || !!reflection.klass.automaticScopeInversing;
    }
  }

  associationPrimaryKey(klass?: typeof Base): string | string[] {
    return this.primaryKey(klass || this.klass);
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

  joinPrimaryKey(_klass?: typeof Base): string | string[] {
    return this.foreignKey();
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
      const pk = this.primaryKey(this.activeRecord);
      this._activeRecordPrimaryKeyCache = Array.isArray(pk) && pk.includes("id") ? "id" : pk;
    } else {
      this._activeRecordPrimaryKeyCache = this.primaryKey(this.activeRecord);
    }

    return this._activeRecordPrimaryKeyCache;
  }

  associationScopeCache(klass: typeof Base, owner: any, block: (params: any) => any): any {
    let key: unknown = this;
    if (this.isPolymorphic()) {
      key = [key, owner._readAttribute(this.foreignType)];
    }
    return klass.withConnection((connection) =>
      cachedFindByStatement.call(klass as any, connection, key, block),
    );
  }

  checkValidityBang(): void {
    this.checkValidityOfInverseBang();

    if (
      !this.isPolymorphic() &&
      ((this.klass as any).compositePrimaryKey || (this.activeRecord as any).compositePrimaryKey)
    ) {
      const fk = this.foreignKey();
      if (this.hasOne() || this.isCollection()) {
        if (arrayLen(this.activeRecordPrimaryKey) !== arrayLen(fk)) {
          throw new CompositePrimaryKeyMismatchError(this);
        }
      } else if (this.belongsTo()) {
        if (arrayLen(this.associationPrimaryKey()) !== arrayLen(fk)) {
          throw new CompositePrimaryKeyMismatchError(this);
        }
      }
    }
  }

  checkEagerLoadableBang(): void {
    if (!this.scope) return;
    if (this.scope.length !== 0) {
      throw new ArgumentError(
        `The association scope '${this.nameString}' is instance dependent (the scope ` +
          `block takes an argument). Eager loading instance dependent scopes is not supported.`,
      );
    }
  }

  joinIdFor(owner: any): any[] {
    const keys = Array.isArray(this.joinForeignKey) ? this.joinForeignKey : [this.joinForeignKey];
    return keys.map((key) => {
      if (typeof owner._readAttribute === "function") return owner._readAttribute(key);
      if (typeof owner.readAttribute === "function") return owner.readAttribute(key);
      return owner[key];
    });
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

  clearAssociationScopeCache(): void {}

  isNested(): boolean {
    return false;
  }

  hasScope(): boolean {
    return !!this.scope;
  }

  polymorphicInverseOf(
    associatedClass: typeof Base,
  ): AssociationReflection | ThroughReflection | null {
    const hasInverse = this.hasInverse();
    if (hasInverse != null && hasInverse !== false) {
      const inverseRelationship = associatedClass._reflectOnAssociation(
        this.options.inverseOf as string,
      );
      if (inverseRelationship) {
        return inverseRelationship;
      } else {
        throw new InverseOfAssociationNotFoundError(this._concrete(), associatedClass);
      }
    }
    return null;
  }

  associationClass():
    | typeof BelongsToAssociation
    | typeof HasManyAssociation
    | typeof HasOneAssociation {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/reflection.rb:719
    throw new NotImplementedError();
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
    if (Array.isArray(this.options.extend)) return this.options.extend;
    if (this.options.extend) return [this.options.extend];
    return [];
  }

  computeClass(name: string): typeof Base {
    if (this.isPolymorphic()) {
      throw new ArgumentError("Polymorphic associations do not support computing the class.");
    }

    let klass: typeof Base;
    try {
      klass = this.activeRecord.computeType(name);
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      if (rbRegMatchP(new RegExp(`(?:^|::)${name}$`), error.constantName)) {
        let message = `Missing model class ${name} for the ${rbModName(this.activeRecord)}#${this.name} association.`;
        if (!rtest(this.options.className)) {
          message += " You can specify a different model class with the :class_name option.";
        }
        throw new NameError(message, name);
      } else {
        throw error;
      }
    }

    if (!(klass.prototype instanceof ActiveRecord.Base)) {
      throw new ArgumentError(
        `The ${name} model class for the ${rbModName(this.activeRecord)}#${this.name} association is not an ActiveRecord::Base subclass.`,
      );
    }

    return klass;
  }

  get strictLoading(): boolean {
    return !!this.options.strictLoading;
  }

  /** @internal */
  protected override deriveClassName(): string {
    let className = this.nameString;
    if (this.isCollection()) className = singularize(className);
    return camelize(className);
  }

  /** @internal */
  protected actualSourceReflection(): this {
    return this;
  }

  /** @internal */
  protected deriveJoinTable(): string {
    return deriveJoinTableName(this.activeRecord.tableName, this.klass.tableName);
  }
}

export class HasManyReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasMany";
  }

  isCollection(): boolean {
    return true;
  }

  associationClass(): typeof HasManyAssociation | typeof HasManyThroughAssociation {
    return this.options.through
      ? Associations.HasManyThroughAssociation
      : Associations.HasManyAssociation;
  }
}

export class HasOneReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasOne";
  }

  hasOne(): boolean {
    return true;
  }

  associationClass(): typeof HasOneAssociation | typeof HasOneThroughAssociation {
    return this.options.through
      ? Associations.HasOneThroughAssociation
      : Associations.HasOneAssociation;
  }
}

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
    return this.isPolymorphic()
      ? Associations.BelongsToPolymorphicAssociation
      : Associations.BelongsToAssociation;
  }

  protected override canFindInverseOfAutomatically(
    reflection: AssociationReflection | ThroughReflection,
    inverseReflection = false,
  ): boolean {
    if (this.isPolymorphic()) return false;
    return super.canFindInverseOfAutomatically(reflection, inverseReflection);
  }

  associationPrimaryKey(klass?: typeof Base): string | string[] {
    const pk = this.options.primaryKey;
    if (pk !== undefined) {
      return Array.isArray(pk) ? pk.map(String) : String(pk);
    }

    const targetKlass = klass || this.klass;
    if (hasQueryConstraints.call(targetKlass as any) || this.options.queryConstraints) {
      return compositeQueryConstraintsList.call(targetKlass as any);
    }

    if ((targetKlass as any).compositePrimaryKey) {
      const primaryKey = targetKlass.primaryKey;
      if (Array.isArray(primaryKey) && primaryKey.includes("id")) return "id";
      return primaryKey;
    }

    return this.primaryKey(targetKlass);
  }

  joinPrimaryKey(klass?: typeof Base): string | string[] {
    return this.isPolymorphic() ? this.associationPrimaryKey(klass) : this.associationPrimaryKey();
  }

  get joinForeignKey(): string | string[] {
    return this.foreignKey();
  }

  get joinForeignType(): string | null {
    return this.foreignType;
  }

  get activeRecordPrimaryKey(): string | string[] {
    return this.activeRecord.primaryKey;
  }
}

export class HasAndBelongsToManyReflection extends AssociationReflection {
  get macro(): MacroType {
    return "hasAndBelongsToMany";
  }

  isCollection(): boolean {
    return true;
  }
}

export class ThroughReflection extends AbstractReflection {
  private _delegate: AssociationReflection;
  private _associationPrimaryKey?: string;

  /** @internal */
  get delegateReflection(): AssociationReflection {
    return this._delegate;
  }
  private _sourceReflectionName: string | null | undefined;
  private _klassCache: typeof Base | null = null;

  constructor(delegate: AssociationReflection) {
    super();
    this._delegate = delegate;
    this._sourceReflectionName = delegate.options.source as string | undefined;
    this.ensureOptionNotGivenAsClassBang("sourceType");
  }

  get name(): string {
    return this.delegateReflection.name;
  }

  private get nameString(): string {
    return this.name ?? "";
  }

  get macro(): MacroType {
    return this.delegateReflection.macro;
  }

  associationScopeCache(klass: typeof Base, owner: any, block: (params: any) => any): any {
    return this.delegateReflection.associationScopeCache(klass, owner, block);
  }

  get options(): Record<string, unknown> {
    return this.delegateReflection.options;
  }

  extensions(): any[] {
    return this.delegateReflection.extensions();
  }

  set autosave(value: boolean) {
    this.delegateReflection.autosave = value;
  }

  get parentReflection(): AssociationReflection | ThroughReflection | null {
    return this.delegateReflection.parentReflection;
  }

  set parentReflection(value: AssociationReflection | ThroughReflection | null) {
    this.delegateReflection.parentReflection = value;
  }

  get activeRecord(): typeof Base {
    return this.delegateReflection.activeRecord;
  }

  get pluralName(): string {
    return this.delegateReflection.pluralName;
  }

  foreignKey(kwargs?: { inferFromInverseOf?: boolean }): string | string[] {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("foreign_key", "source_reflection");
    return _.foreignKey(kwargs);
  }

  get foreignType(): string | null {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("foreign_type", "source_reflection");
    return _.foreignType;
  }

  joinIdFor(owner: any): any[] {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("join_id_for", "source_reflection");
    return _.joinIdFor(owner);
  }

  get type(): string | null {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("type", "source_reflection");
    return _.type;
  }

  get scope(): ((...args: any[]) => any) | null {
    return this.delegateReflection.scope;
  }

  get klass(): typeof Base {
    if (this._klassCache) return this._klassCache;
    const anonymousClass = this._delegate.options.anonymousClass as typeof Base | undefined;
    this._klassCache = anonymousClass ?? this._delegate._klass(this.className);
    return this._klassCache;
  }

  isThroughReflection(): boolean {
    return true;
  }

  isCollection(): boolean {
    return this._delegate.isCollection();
  }

  checkEagerLoadableBang(): void {
    return this._delegate.checkEagerLoadableBang();
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

  isValidate(): boolean {
    return this._delegate.isValidate();
  }

  get strictLoading(): boolean {
    return this._delegate.strictLoading;
  }

  get through(): string {
    return this.options.through as string;
  }

  get sourceReflection(): AssociationReflection | ThroughReflection | null {
    const srcName = this.sourceReflectionName();
    if (!srcName) return null;
    const throughRef = this.throughReflection;
    if (!throughRef) return null;
    return throughRef.klass._reflectOnAssociation(srcName) ?? null;
  }

  get throughReflection(): AssociationReflection | ThroughReflection | null {
    return this.activeRecord._reflectOnAssociation(this.through) ?? null;
  }

  get joinTable(): string {
    return this._delegate.joinTable;
  }

  joinPrimaryKey(klass: typeof Base = this.klass): string | string[] {
    const src = this.sourceReflection;
    if (!src) this.checkValidityBang();
    return src!.joinPrimaryKey(klass);
  }

  get joinForeignKey(): string | string[] {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("join_foreign_key", "source_reflection");
    return _.joinForeignKey;
  }

  scopeFor(relation: any, owner?: any): any {
    return this.delegateReflection.scopeFor(relation, owner);
  }

  joinScopes(
    table: Table | Nodes.TableAlias,
    predicateBuilder?: any,
    klass?: typeof Base,
    record?: any,
  ): any[] {
    const sourceScopes =
      this.sourceReflection?.joinScopes(table, predicateBuilder, klass, record) ?? [];
    return [...sourceScopes, ...super.joinScopes(table, predicateBuilder, klass, record)];
  }

  collectJoinChain(): AbstractReflection[] {
    return this.collectJoinReflections([this]);
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

  associationPrimaryKey(klass?: typeof Base): string | string[] {
    const primaryKey = (this.actualSourceReflection() as unknown as ConcreteReflection).options
      ?.primaryKey;
    if (primaryKey != null && primaryKey !== false) {
      return (this._associationPrimaryKey ??= Array.isArray(primaryKey)
        ? rbInspect(primaryKey)
        : String(primaryKey));
    } else {
      return this.primaryKey(klass || this.klass);
    }
  }

  get activeRecordPrimaryKey(): string | string[] {
    const _ = this.sourceReflection;
    if (_ == null) {
      throw DelegationError.nilTarget("active_record_primary_key", "source_reflection");
    }
    return _.activeRecordPrimaryKey;
  }

  get associationForeignKey(): string {
    const _ = this.sourceReflection;
    if (_ == null) throw DelegationError.nilTarget("association_foreign_key", "source_reflection");
    return _.associationForeignKey;
  }

  hasInverse(): string | false | null {
    return this._delegate.hasInverse();
  }

  inverseOf(): AssociationReflection | ThroughReflection | null {
    const name = this.inverseName();
    if (!name) return null;
    if (this._inverseOfCache) return this._inverseOfCache;
    this._inverseOfCache = this.klass._reflectOnAssociation(name) ?? null;
    return this._inverseOfCache;
  }
  private _inverseOfCache: AssociationReflection | ThroughReflection | null | undefined = undefined;

  /** @internal */
  override inverseName(): string | false | null {
    return this._delegate.inverseName();
  }

  sourceReflectionNames(): string[] {
    if (this.options.source) return [this.options.source as string];
    const singular = singularize(this.nameString);
    const names = [singular, this.name];
    return [...new Set(names)];
  }

  sourceReflectionName(): string | null {
    return (this._sourceReflectionName ||= (() => {
      let names = [...new Set([singularize(this.nameString), this.name])];
      names = names.filter((n) => this.throughReflection!.klass._reflectOnAssociation(n) != null);

      if (names.length > 1) {
        throw new AmbiguousSourceReflectionForThroughAssociation(
          this.activeRecord.name,
          this.name,
          this.sourceReflectionNames(),
        );
      }
      return first(names) ?? null;
    })());
  }

  sourceOptions(): Record<string, unknown> {
    return this.sourceReflection?.options ?? {};
  }

  throughOptions(): Record<string, unknown> {
    return this.throughReflection?.options ?? {};
  }

  checkValidityBang(): void {
    if (!this.throughReflection) {
      throw new HasManyThroughAssociationNotFoundError(this.activeRecord as any, this as any);
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
    const scopeChain = this.sourceReflection!.constraints();
    if (this.scope) scopeChain.push(this.scope);
    return scopeChain;
  }

  addAsSource(seed: AbstractReflection[]): AbstractReflection[] {
    return this.collectJoinReflections(seed);
  }

  addAsPolymorphicThrough(
    reflection: AbstractReflection,
    seed: AbstractReflection[],
  ): AbstractReflection[] {
    return this.collectJoinReflections([...seed, new PolymorphicReflection(this, reflection)]);
  }

  addAsThrough(seed: AbstractReflection[]): AbstractReflection[] {
    return this.collectJoinReflections([...seed, this]);
  }

  /** @internal */
  protected actualSourceReflection(): AbstractReflection {
    const src = this.sourceReflection;
    if (!src) return this;
    return (src as any).actualSourceReflection?.() ?? src;
  }

  /** @internal */
  protected deriveClassName(): string {
    return (this.options.sourceType as string | undefined) ?? this.sourceReflection!.className;
  }

  /** @internal */
  private collectJoinReflections(seed: AbstractReflection[]): AbstractReflection[] {
    const a = this.sourceReflection!.addAsSource(seed);
    if (this.options.sourceType) {
      return this.throughReflection!.addAsPolymorphicThrough(this, a);
    } else {
      return this.throughReflection!.addAsThrough(a);
    }
  }
}

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

  joinPrimaryKey(klass: typeof Base = this.klass): string | string[] {
    return (this._reflection as AssociationReflection).joinPrimaryKey(klass);
  }

  get joinForeignKey(): string | string[] {
    return (this._reflection as any).joinForeignKey;
  }

  get name(): string {
    return (this._reflection as any).name;
  }

  scopeFor(relation: any, owner?: any): any {
    return (this._reflection as any).scopeFor?.(relation, owner) ?? relation;
  }

  joinScopes(
    table: Table | Nodes.TableAlias,
    predicateBuilder?: any,
    klass?: typeof Base,
    record?: any,
  ): any[] {
    const scopes = super.joinScopes(table, predicateBuilder, klass, record);
    if (!(this._previousReflection as any).isThroughReflection?.()) {
      const prevScopes =
        (this._previousReflection as any).joinScopes?.(table, predicateBuilder, klass, record) ??
        [];
      scopes.push(...prevScopes);
    }
    scopes.push(
      this.sourceTypeScope().call(this.buildScope(table, predicateBuilder, klass), record),
    );
    return scopes;
  }

  constraints(): Array<(...args: any[]) => any> {
    return [...this._reflection.constraints(), this.sourceTypeScope()];
  }

  /** @internal */
  private sourceTypeScope(): (...args: any[]) => any {
    const type = (this._previousReflection as any).foreignType;
    const sourceType = (this._previousReflection as any).options?.sourceType;
    return function (this: any, object: any) {
      return this.where({ [type]: sourceType });
    };
  }
}

export class RuntimeReflection extends AbstractReflection {
  private _reflection: AbstractReflection;
  private _association: any;

  constructor(reflection: AbstractReflection, association: any) {
    super();
    this._reflection = reflection;
    this._association = association;
  }

  get scope(): ((...args: any[]) => any) | null {
    return (this._reflection as any).scope;
  }

  get type(): string | null {
    return (this._reflection as any).type;
  }

  constraints(): Array<(...args: any[]) => any> {
    return this._reflection.constraints();
  }

  get joinForeignKey(): string | string[] {
    return (this._reflection as any).joinForeignKey;
  }

  get klass(): typeof Base {
    return this._association.klass;
  }

  get aliasedTable(): Table {
    return (this.klass as any).arelTable;
  }

  joinPrimaryKey(klass: typeof Base = this.klass): string | string[] {
    return (this._reflection as AssociationReflection).joinPrimaryKey(klass);
  }

  allIncludes(callback: () => any): any {
    return callback();
  }
}

/** @internal */
function reflectionClassFor(
  macro: string,
): new (
  name: string | null,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  activeRecord: typeof Base,
) => MacroReflection {
  switch (macro) {
    case "composedOf":
      return AggregateReflection;
    case "hasMany":
      return HasManyReflection;
    case "hasOne":
      return HasOneReflection;
    case "belongsTo":
      return BelongsToReflection;
    default:
      throw new RuntimeError(`Unsupported Macro: ${macro}`);
  }
}

export function create(
  macro: Exclude<MacroType, "composedOf">,
  name: string | null,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  activeRecord: typeof Base,
): AssociationReflection | ThroughReflection;
export function create(
  macro: "composedOf",
  name: string | null,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  activeRecord: typeof Base,
): AggregateReflection;
export function create(
  macro: MacroType,
  name: string | null,
  scope: ((...args: any[]) => any) | null,
  options: Record<string, unknown>,
  ar: typeof Base,
): AssociationReflection | ThroughReflection | AggregateReflection {
  const ReflectionClass = reflectionClassFor(macro);
  const reflection = new ReflectionClass(name, scope, options, ar);
  return options.through
    ? new ThroughReflection(reflection as AssociationReflection)
    : (reflection as AssociationReflection | AggregateReflection);
}

export function addReflection(
  ar: typeof Base,
  name: string,
  reflection: AssociationReflection | ThroughReflection,
): void {
  clearReflectionsCache(ar);
  (ar as any)._reflections = mergeBang(
    except((ar as any)._reflections as Record<string, unknown>, name),
    { [name]: reflection },
  );
}

export function addAggregateReflection(
  ar: typeof Base,
  name: string,
  reflection: AggregateReflection,
): void {
  ar.aggregateReflections = merge(ar.aggregateReflections, { [name]: reflection });
}

export function reflections(
  modelClass: typeof Base,
): Readonly<Record<string, AssociationReflection | ThroughReflection>> {
  return normalizedReflections(modelClass);
}

/** @internal */
type RawReflection = (AssociationReflection | ThroughReflection) & {
  readonly parentReflection?: AssociationReflection | ThroughReflection | null;
};

const _normalizedReflectionsCache = new WeakMap<
  typeof Base,
  Readonly<Record<string, AssociationReflection | ThroughReflection>>
>();

export function normalizedReflections(
  modelClass: typeof Base,
): Readonly<Record<string, AssociationReflection | ThroughReflection>> {
  const cached = _normalizedReflectionsCache.get(modelClass);
  if (cached) return cached;

  const rawReflections = modelClass._reflections as Record<string, RawReflection>;
  const result: Record<string, AssociationReflection | ThroughReflection> = {};
  for (const [name, ref] of Object.entries(rawReflections)) {
    const parent = ref.parentReflection;
    if (parent) {
      result[parent.name] = parent;
    } else {
      result[name] = ref;
    }
  }

  Object.freeze(result);
  const frozen = result as Readonly<Record<string, AssociationReflection | ThroughReflection>>;
  _normalizedReflectionsCache.set(modelClass, frozen);
  return frozen;
}

export function clearReflectionsCache(modelClass: typeof Base): void {
  _normalizedReflectionsCache.delete(modelClass);
}

export function _reflectOnAssociation(
  modelClass: typeof Base,
  association: string,
): AssociationReflection | ThroughReflection | null {
  return modelClass._reflections[toS(association)] ?? null;
}

export function _reflectOnAssociationClassMethod(
  this: typeof Base,
  association: string,
): AssociationReflection | ThroughReflection | null {
  return _reflectOnAssociation(this, association);
}

export function reflectOnAssociation(
  modelClass: typeof Base,
  association: string,
): AssociationReflection | ThroughReflection | null {
  const normalized = normalizedReflections(modelClass);
  return normalized[association] ?? null;
}

export function reflectOnAllAssociations(
  modelClass: typeof Base,
  macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
): Array<AssociationReflection | ThroughReflection> {
  const allReflections = Object.values(normalizedReflections(modelClass));

  if (!macro) return allReflections;

  return allReflections.filter((ref) => {
    const refMacro = ref instanceof ThroughReflection ? ref.macro : ref.macro;
    if (macro === "hasAndBelongsToMany") {
      return refMacro === "hasAndBelongsToMany";
    }
    return refMacro === macro;
  });
}

export function reflectOnAllAggregations(modelClass: typeof Base): AggregateReflection[] {
  return Object.values(modelClass.aggregateReflections);
}

export function reflectOnAggregation(
  modelClass: typeof Base,
  aggregation: string,
): AggregateReflection | null {
  return modelClass.aggregateReflections[aggregation] ?? null;
}

export function reflectOnAllAutosaveAssociations(
  modelClass: typeof Base,
): AssociationLikeReflection[] {
  return reflectOnAllAssociations(modelClass).filter((ref) => {
    const opts = ref instanceof ThroughReflection ? ref.options : ref.options;
    return !!opts.autosave;
  });
}

export type AssociationLikeReflection = AssociationReflection | ThroughReflection;

export interface Reflection {
  readonly _reflections: Record<string, AssociationReflection>;
  readonly aggregateReflections: Record<string, AggregateReflection>;
  readonly automaticScopeInversing: boolean;
  readonly automaticallyInvertPluralAssociations: boolean;
}

export const Reflection = {
  [included](base: object): void {
    classAttribute.call(base, "_reflections", { instanceWriter: false, default: {} });
    classAttribute.call(base, "aggregateReflections", { instanceWriter: false, default: {} });
    classAttribute.call(base, "automaticScopeInversing", { instanceWriter: false, default: false });
    classAttribute.call(base, "automaticallyInvertPluralAssociations", {
      instanceWriter: false,
      default: false,
    });
  },
};

export const ClassMethods = {
  reflections(
    this: typeof Base,
  ): Readonly<Record<string, AssociationReflection | ThroughReflection>> {
    return reflections(this);
  },
  normalizedReflections(
    this: typeof Base,
  ): Readonly<Record<string, AssociationReflection | ThroughReflection>> {
    return normalizedReflections(this);
  },
  reflectOnAssociation(
    this: typeof Base,
    association: string,
  ): AssociationReflection | ThroughReflection | null {
    return reflectOnAssociation(this, association);
  },
  reflectOnAllAssociations(
    this: typeof Base,
    macro?: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany",
  ): Array<AssociationReflection | ThroughReflection> {
    return reflectOnAllAssociations(this, macro);
  },
  reflectOnAllAggregations(this: typeof Base): AggregateReflection[] {
    return reflectOnAllAggregations(this);
  },
  reflectOnAggregation(this: typeof Base, aggregation: string): AggregateReflection | null {
    return reflectOnAggregation(this, aggregation);
  },
  reflectOnAllAutosaveAssociations(this: typeof Base): AssociationLikeReflection[] {
    return reflectOnAllAutosaveAssociations(this);
  },
  _reflectOnAssociation: _reflectOnAssociationClassMethod,
};

ActiveRecord.Reflection = ReflectionModule;
