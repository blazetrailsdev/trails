import { block, fetch } from "@blazetrails/ruby-compat";
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
  safeConstantize,
  foreignKey as deriveForeignKey,
  merge,
} from "@blazetrails/activesupport";
import { except, mergeBang } from "@blazetrails/ruby-compat";
import { Table, Nodes } from "@blazetrails/arel";
import { deriveJoinTableName } from "./model-schema.js";
import { rubyInspectArray } from "./relation/ruby-inspect.js";

import { modelRegistry, autoloadModel } from "./associations.js";
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
  readonly foreignKey?: string | string[];
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

/**
 * Extract the explicit counter-cache column from the `counterCache` option,
 * accepting its raw (`true` | `"<column>"`) or normalized (`{ column }`) form.
 * Returns null when no explicit column is configured.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the options[:counter_cache] normalization Ruby does inline in counter_cache_column (reflection.rb:244).
 */
export function counterCacheColumnOption(counterCache: unknown): string | null {
  if (typeof counterCache === "string") return counterCache;
  if (counterCache && typeof counterCache === "object") {
    return (counterCache as { column?: string | null }).column ?? null;
  }
  return null;
}

/**
 * Single source of truth for the belongs_to counter-cache column. Mirrors
 * Rails `ActiveRecord::Reflection#counter_cache_column` for `belongs_to?`:
 * the explicit column, else the pluralized owner model name + `_count`.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the belongs_to? arm of Reflection#counter_cache_column (reflection.rb:244) as a free function.
 */
export function belongsToCounterCacheColumn(
  counterCache: unknown,
  ownerName: string,
): string | null {
  if (!counterCache) return null;
  return (
    counterCacheColumnOption(counterCache) ||
    `${pluralize(underscore(demodulize(ownerName)))}_count`
  );
}

export class AbstractReflection {
  /** @internal */
  private _counterCacheColumn?: string | null;
  private _counterCacheColumnKlass?: typeof Base;

  /** @internal */
  protected _concrete(): ConcreteReflection {
    return this as unknown as ConcreteReflection;
  }

  isThroughReflection(): boolean {
    return false;
  }

  protected primaryKeyForModel(klass: typeof Base): string | string[] {
    const pk = klass.primaryKey;
    if (!pk) throw new UnknownPrimaryKey(klass);
    return pk;
  }

  get tableName(): string {
    return this.klass.tableName;
  }

  buildAssociation(
    attributes: Record<string, unknown> = {},
    block?: (record: InstanceType<typeof Base>) => void,
  ): InstanceType<typeof Base> {
    return new (this.klass as any)(attributes, block);
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
    return this._concrete().macro === "hasMany";
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
    let scope = this.klassJoinScope(table, predicateBuilder);

    const typeCol = this._concrete().type;
    if (typeCol) {
      scope = scope.where({ [typeCol]: polymorphicName(foreignKlass) });
    }

    for (const chainScope of scopeChainItems) {
      scope = scope.merge(chainScope);
    }

    const primaryKeys = this._arrayWrap(this._concrete().joinPrimaryKey!());
    const foreignKeys = this._arrayWrap(this._concrete().joinForeignKey);

    if (primaryKeys.length !== foreignKeys.length) {
      throw new ArgumentError(
        `joinScope: joinPrimaryKey and joinForeignKey must have the same number of columns ` +
          `(got ${primaryKeys.length} primary key column(s) and ${foreignKeys.length} foreign key column(s))`,
      );
    }

    for (let i = 0; i < primaryKeys.length; i++) {
      scope = scope.where(table.get(primaryKeys[i]).eq(foreignTable.get(foreignKeys[i])));
    }

    const targetKlass = this.klass as any;
    if (targetKlass.isFinderNeedsTypeCondition()) {
      scope = scope.where(typeCondition(targetKlass, table));
    }

    return scope;
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
    const klass = this.klass as any;
    return klass.scopeForAssociation ? klass.scopeForAssociation(relation) : relation;
  }

  constraints(): Array<(...args: any[]) => any> {
    return this.chain.flatMap((r) => r.scopes);
  }

  counterCacheColumn(): string | null {
    const self = this._concrete();
    const counterCache = self.options?.counterCache;
    if (this.belongsTo()) {
      const explicit = counterCacheColumnOption(counterCache);
      if (explicit) return explicit;
      if (!counterCache) return null;
      try {
        const ownerName = self.activeRecord?.name ?? "";
        const btFk =
          self.options?.foreignKey ??
          self.options?.queryConstraints ??
          `${underscore(self.name)}_id`;
        const normFk = (fk: unknown): string[] =>
          Array.isArray(fk) ? fk.map(String) : [String(fk)];
        const btFkNorm = normFk(btFk);
        const klassName = self.className;
        const resolvedKlass = modelRegistry.get(klassName);
        if (!resolvedKlass) throw new Error(`${klassName} not in registry`);
        if (this._counterCacheColumnKlass === resolvedKlass) {
          return this._counterCacheColumn as string | null;
        }
        const targetAssocs = reflectOnAllAssociations(resolvedKlass, "hasMany");
        const hmDefaultFk = `${underscore((resolvedKlass as any).name)}_id`;
        const inverseHm = targetAssocs.find((a) => {
          if (a.className !== ownerName) return false;
          const hmFkNorm = normFk(
            a.options.foreignKey ?? a.options.queryConstraints ?? hmDefaultFk,
          );
          return hmFkNorm.length === btFkNorm.length && hmFkNorm.every((k, i) => k === btFkNorm[i]);
        });
        const column =
          inverseHm && ownerName.endsWith(camelize(singularize(inverseHm.name)))
            ? `${underscore(inverseHm.name)}_count`
            : belongsToCounterCacheColumn(counterCache, ownerName);
        this._counterCacheColumnKlass = resolvedKlass;
        this._counterCacheColumn = column;
        return column;
      } catch {
        return belongsToCounterCacheColumn(counterCache, self.activeRecord?.name ?? "");
      }
    }
    return counterCacheColumnOption(counterCache) || `${self.name}_count`;
  }

  checkValidityOfInverseBang(): void {
    if (!this.isPolymorphic() && this.hasInverse()) {
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
    const col = this.counterCacheColumn();
    if (!col) return null;
    const inv = this.inverseOf();
    const candidates: any[] = inv ? [inv] : this.klass.reflectOnAllAssociations("belongsTo");
    return (
      candidates.find((c: any) => {
        try {
          return (
            c.counterCacheColumn?.() === col &&
            (c.isPolymorphic?.() || c.klass === this._concrete().activeRecord)
          );
        } catch {
          return false;
        }
      }) ?? null
    );
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
    const opts = this._concrete().options ?? {};
    if (opts.counterCache) return true;
    const iwucc = this.inverseWhichUpdatesCounterCache();
    if (iwucc && asConcrete(iwucc).options?.counterCache) {
      const counterCacheColumn = this.counterCacheColumn();
      const owner = this._concrete().activeRecord as any;
      if (counterCacheColumn && owner?.hasAttribute?.(counterCacheColumn)) return true;
    }
    return false;
  }

  hasActiveCachedCounter(): boolean {
    if (!this.hasCachedCounter()) return false;
    const opts = this._concrete().options ?? {};
    const iwucc = this.inverseWhichUpdatesCounterCache();
    const counterCache =
      opts.counterCache || (iwucc ? asConcrete(iwucc).options?.counterCache : undefined);
    if (counterCache && (counterCache as { active?: unknown }).active === false) return false;
    return true;
  }

  isCounterMustBeUpdatedByHasMany(): boolean {
    return !this.isInverseUpdatesCounterInMemory() && this.hasCachedCounter();
  }

  aliasCandidate(name: string): string {
    return `${underscore(this._concrete().pluralName)}_${name}`;
  }

  strictLoadingViolationMessage(owner: unknown): string {
    const ownerName =
      typeof owner === "string" ? owner : ((owner as { name?: string })?.name ?? "Record");
    let message = `\`${ownerName}\` is marked for strict_loading.`;
    message += ` The ${this.isPolymorphic() ? "polymorphic association" : `${this.klass.name} association`}`;
    message += ` named \`:${this._concrete().name}\` cannot be lazily loaded.`;
    return message;
  }

  hasInverse(): boolean {
    return false;
  }

  inverseOf(): AbstractReflection | null {
    return null;
  }

  /** @internal */
  inverseName(): string | false | null {
    return null;
  }

  private _arrayWrap(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return [];
  }

  /** @internal */
  protected ensureOptionNotGivenAsClassBang(optionName: string): void {
    const opts = this._concrete().options as Record<string, unknown> | undefined;
    const val = opts?.[optionName];
    if (typeof val === "function" && /^class[\s{]/.test(Function.prototype.toString.call(val))) {
      throw new ArgumentError(
        `A class was passed to \`:${optionName}\` but we are expecting a string.`,
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
    if (this === other) return true;
    if (!(other instanceof (this.constructor as typeof MacroReflection))) return false;
    const o = other;
    return this.name === o.name && o.options != null && this.activeRecord === o.activeRecord;
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

  get className(): string {
    if (this.options.className) return this.options.className as string;
    return camelize(singularize(this.nameString));
  }

  get klass(): typeof Base {
    if (this._klassCache) return this._klassCache;
    const resolved = this.options.anonymousClass
      ? (this.options.anonymousClass as typeof Base)
      : this._klass(this.className);
    this._klassCache = resolved;
    return resolved;
  }

  /** @internal */
  protected activeRecordRegistryName(): string {
    const ar = this.activeRecord as any;
    if (Object.prototype.hasOwnProperty.call(ar, "_registryKeys")) {
      const matching = (ar._registryKeys as string[]).filter(
        (k) => modelRegistry.get(k) === this.activeRecord,
      );
      if (matching.length > 0) {
        return matching.reduce((best, k) =>
          (k.match(/::/g) ?? []).length > (best.match(/::/g) ?? []).length ? k : best,
        );
      }
    }
    return this.activeRecord.name;
  }

  _klass(className: string): typeof Base {
    const arName = this.activeRecordRegistryName();
    if (demodulize(arName) === className) {
      try {
        return this.computeClass(`::${className}`);
      } catch (e) {
        if (e instanceof ArgumentError) throw e;
      }
    }
    return this.computeClass(className);
  }

  computeClass(name: string): typeof Base {
    autoloadModel(name);
    return constantize(name) as typeof Base;
  }

  scopeFor(relation: any, owner?: any): any {
    if (this._scope) {
      if (this._scope.length === 0) {
        return this._scope.call(relation) || relation;
      }
      return this._scope.call(relation, relation, owner) || relation;
    }
    return relation;
  }

  /** @internal */
  protected deriveClassName(): string {
    return camelize(this.nameString);
  }

  private normalizeOptions(options: Record<string, unknown>): Record<string, unknown> {
    if (typeof options.className === "symbol") {
      options = { ...options, className: options.className.description ?? "" };
    }
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
        derivedFk = this.deriveFkQueryConstraints(derivedFk);
      }

      this._foreignKeyCache = derivedFk;
    }

    return this._foreignKeyCache;
  }

  private deriveForeignKey(inferFromInverseOf = true): string {
    if (this.belongsTo()) return `${underscore(this.nameString)}_id`;
    if (this.options.as) return `${underscore(this.options.as as string)}_id`;
    if (this.options.inverseOf && inferFromInverseOf) {
      const inv = this.inverseOf();
      if (inv) return String((inv as any).computeForeignKey?.(false) ?? (inv as any).foreignKey);
    }
    const baseName = (this.activeRecord as any)._demodulizedName ?? this.activeRecord.name;
    return `${underscore(demodulize(baseName))}_id`;
  }

  private deriveFkQueryConstraints(foreignKey: string): string | string[] {
    const primaryQueryConstraints = queryConstraintsList.call(this.activeRecord as any);
    if (!primaryQueryConstraints) return foreignKey;

    const ownerPk = this.activeRecord.primaryKey;

    if (primaryQueryConstraints.length > 2) {
      throw new ArgumentError(
        `The query constraints list on the \`${this.activeRecord.name}\` model has more than 2 ` +
          `attributes. Active Record is unable to derive the query constraints ` +
          `for the association. You need to explicitly define the query constraints ` +
          `for this association.`,
      );
    }

    const ownerPkStr = Array.isArray(ownerPk) ? undefined : ownerPk;
    if (!ownerPkStr || !primaryQueryConstraints.includes(ownerPkStr)) {
      throw new ArgumentError(
        `The query constraints on the \`${this.activeRecord.name}\` model does not include the primary ` +
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

    throw new ArgumentError(
      `Active Record couldn't correctly interpret the query constraints ` +
        `for the \`${this.activeRecord.name}\` model. The query constraints on \`${this.activeRecord.name}\` are ` +
        `\`${rubyInspectArray(primaryQueryConstraints)}\` and the foreign key is \`${foreignKey}\`. ` +
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
    if (this._inverseOfCache) return this._inverseOfCache;
    this._inverseOfCache = this.klass._reflectOnAssociation(name) ?? null;
    return this._inverseOfCache;
  }

  private _inverseNameCache: string | false | null | undefined = undefined;
  private _inverseOfCache: AssociationReflection | ThroughReflection | null | undefined = undefined;

  /**
   * @internal
   * @missingRailsArgs fetch — PERMANENT
   */
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
    if (!this.canFindInverseOfAutomatically(this)) return null;

    const modelBaseName = (this.activeRecord as any)._demodulizedName ?? this.activeRecord.name;
    const snakeInverseName = this.options.as
      ? underscore(this.options.as as string)
      : underscore(demodulize(modelBaseName));
    const camelInverseName = camelize(snakeInverseName, false);
    const candidateNames =
      camelInverseName === snakeInverseName
        ? [snakeInverseName]
        : [camelInverseName, snakeInverseName];

    let reflection: AssociationReflection | ThroughReflection | null | false = null;
    try {
      const lookupNames: string[] = [...candidateNames];
      if (this.activeRecord.automaticallyInvertPluralAssociations) {
        for (const inverseName of candidateNames) lookupNames.push(pluralize(inverseName));
      }
      for (const n of lookupNames) {
        const r = this.klass._reflectOnAssociation(n);
        if (r && this.validInverseReflection(r)) {
          reflection = r;
          break;
        }
      }
    } catch (e: unknown) {
      if (e instanceof NameError && e.constantName === this.className) {
        reflection = false;
      } else {
        throw e;
      }
    }

    if (this.validInverseReflection(reflection)) {
      return asConcrete(reflection as AbstractReflection).name;
    }
    return null;
  }

  private validInverseReflection(
    reflection: AssociationReflection | ThroughReflection | null | false,
  ): boolean {
    if (!reflection) return false;
    if ((reflection as AbstractReflection) === this) return false;

    const reflFk = asConcrete(reflection).foreignKey;
    const thisFk = this.foreignKey;
    if (JSON.stringify(reflFk) !== JSON.stringify(thisFk)) return false;

    const reflActiveRecord = asConcrete(reflection).activeRecord;
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
      return !asConcrete(reflection).scope;
    }
    if (!asConcrete(reflection).scope) return true;
    try {
      return !!(asConcrete(reflection).klass as any)?.automaticScopeInversing;
    } catch {
      return false;
    }
  }

  associationPrimaryKey(klass?: typeof Base): string | string[] {
    return this.primaryKeyForModel(klass || this.klass);
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

  associationScopeCache(klass: typeof Base, owner: any, block: (params: any) => any): any {
    let key = `assocScope:${this.activeRecord.name}#${this.nameString}`;
    if (this.isPolymorphic()) {
      key += `:${owner?._readAttribute?.(this.foreignType)}`;
    }
    return cachedFindByStatement.call(klass as any, (klass as any).connection, key, block);
  }

  checkValidityBang(): void {
    this.checkValidityOfInverseBang();

    if (
      !this.isPolymorphic() &&
      ((this.klass as any).compositePrimaryKey || (this.activeRecord as any).compositePrimaryKey)
    ) {
      const fk = this.foreignKey;
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
    if (this.scope.length > 1) {
      throw new ArgumentError(
        `The association scope '${this.nameString}' is instance dependent (the scope ` +
          `block takes more than one argument). Eager loading instance dependent scopes is not supported.`,
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
    if (this.hasInverse()) {
      const name = this.inverseName();
      if (!name) return null;
      const inverseRelationship = associatedClass._reflectOnAssociation(name);
      if (!inverseRelationship) {
        throw new InverseOfAssociationNotFoundError(this._concrete(), associatedClass);
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
    if (Array.isArray(this.options.extend)) return this.options.extend;
    if (this.options.extend) return [this.options.extend];
    return [];
  }

  computeClass(name: string): typeof Base {
    if (this.isPolymorphic()) {
      throw new ArgumentError("Polymorphic associations do not support computing the class.");
    }

    const isAbsolute = name.startsWith("::");
    const simpleName = isAbsolute ? name.slice(2) : name;

    if (!isAbsolute) {
      const arName = this.activeRecordRegistryName();
      const moduleName = (this.activeRecord as { moduleName?: string }).moduleName;
      const nestingSource = arName.includes("::") ? arName : moduleName;
      if (nestingSource) {
        const segments = nestingSource.split("::");
        for (let i = segments.length; i > 0; i--) {
          const candidate = [...segments.slice(0, i), simpleName].join("::");
          autoloadModel(candidate);
          const resolved = safeConstantize(candidate) as typeof Base | undefined;
          if (resolved) {
            if (!(resolved as any)._isActiveRecordBase) {
              throw new ArgumentError(
                `The ${candidate} model class for the ${this.activeRecord.name}#${this.nameString} association is not an ActiveRecord::Base subclass.`,
              );
            }
            return resolved;
          }
        }
      }
    }

    autoloadModel(simpleName);
    let resolved: typeof Base;
    try {
      resolved = constantize(simpleName) as typeof Base;
    } catch (error) {
      if (!(error instanceof NameError)) throw error;
      if (!new RegExp(`(?:^|::)${simpleName}$`).test(error.constantName ?? "")) throw error;
      let message = `Missing model class ${simpleName} for the ${this.activeRecord.name}#${this.nameString} association.`;
      if (!this.options.className) {
        message += " You can specify a different model class with the :class_name option.";
      }
      throw new NameError(message, simpleName);
    }
    if (!(resolved as any)._isActiveRecordBase) {
      throw new ArgumentError(
        `The ${simpleName} model class for the ${this.activeRecord.name}#${this.nameString} association is not an ActiveRecord::Base subclass.`,
      );
    }
    return resolved;
  }

  get strictLoading(): boolean {
    return !!this.options.strictLoading;
  }

  get className(): string {
    if (this.options.className) return this.options.className as string;
    if (this.isCollection()) {
      return camelize(singularize(this.nameString));
    }
    return camelize(this.nameString);
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
    return this.options.through ? HasManyThroughAssociation : HasManyAssociation;
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
    return this.options.through ? HasOneThroughAssociation : HasOneAssociation;
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
    return this.isPolymorphic() ? BelongsToPolymorphicAssociation : BelongsToAssociation;
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

    return this.primaryKeyForModel(targetKlass);
  }

  joinPrimaryKey(klass?: typeof Base): string | string[] {
    return this.isPolymorphic() ? this.associationPrimaryKey(klass) : this.associationPrimaryKey();
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
  private _sourceReflectionNameCache: string | null | undefined = undefined;
  private _klassCache: typeof Base | null = null;

  constructor(delegate: AssociationReflection) {
    super();
    this._delegate = delegate;
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

  get foreignKey(): string | string[] {
    return this.sourceReflection?.foreignKey ?? this.delegateReflection.foreignKey;
  }

  get foreignType(): string | null {
    return this.sourceReflection?.foreignType ?? this.delegateReflection.foreignType;
  }

  get type(): string | null {
    return this.sourceReflection?.type ?? null;
  }

  get scope(): ((...args: any[]) => any) | null {
    return this.delegateReflection.scope;
  }

  get className(): string {
    return (
      (this.options.className as string | undefined) ||
      this.deriveClassName() ||
      this.delegateReflection.className
    );
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
    const src = this.sourceReflection;
    if (!src) this.checkValidityBang();
    return src!.joinForeignKey;
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
        ? rubyInspectArray(primaryKey)
        : String(primaryKey));
    } else {
      return this.primaryKeyForModel(klass || this.klass);
    }
  }

  get activeRecordPrimaryKey(): string | string[] {
    return this.sourceReflection?.activeRecordPrimaryKey ?? this._delegate.activeRecordPrimaryKey;
  }

  get associationForeignKey(): string {
    return this.sourceReflection?.associationForeignKey ?? this._delegate.associationForeignKey;
  }

  hasInverse(): boolean {
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
    if (this._sourceReflectionNameCache) return this._sourceReflectionNameCache;

    if (this.options.source) {
      this._sourceReflectionNameCache = this.options.source as string;
      return this._sourceReflectionNameCache;
    }

    const throughRef = this.throughReflection;
    if (!throughRef) return null;

    const singular = singularize(this.nameString);
    let names = [...new Set([singular, this.name])];
    names = names.filter((n) => throughRef.klass._reflectOnAssociation(n) != null);

    if (names.length > 1) {
      throw new AmbiguousSourceReflectionForThroughAssociation(
        this.activeRecord.name,
        this.name,
        this.sourceReflectionNames(),
      );
    }
    this._sourceReflectionNameCache = names[0] ?? null;
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
    const sourceConstraints = this.sourceReflection?.constraints?.() ?? [];
    return this.scope ? [...sourceConstraints, this.scope] : sourceConstraints;
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
    return (this.options.sourceType as string) || (this.sourceReflection as any)?.className || "";
  }

  /** @internal */
  private collectJoinReflections(seed: AbstractReflection[]): AbstractReflection[] {
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

  get className(): string {
    return (this._reflection as any).className;
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
    const sourceTypeFn = this.sourceTypeScope();
    const typeScope = this.buildScope(table, predicateBuilder, klass);
    scopes.push(sourceTypeFn(typeScope));
    return scopes;
  }

  constraints(): Array<(...args: any[]) => any> {
    const reflConstraints = (this._reflection as any).constraints?.() ?? [];
    return [...reflConstraints, this.sourceTypeScope()];
  }

  /** @internal */
  private sourceTypeScope(): (...args: any[]) => any {
    const typeCol = (this._previousReflection as any).foreignType;
    const sourceType = (this._previousReflection as any).options?.sourceType;
    return (rel: any) => rel?.where?.({ [typeCol]: sourceType }) ?? rel;
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

  get aliasedTable(): Table {
    return (this.klass as any).arelTable;
  }

  joinPrimaryKey(klass: typeof Base = this.klass): string | string[] {
    return (this._reflection as AssociationReflection).joinPrimaryKey(klass);
  }

  allIncludes(callback: () => any): any {
    return callback();
  }

  get options(): Record<string, unknown> {
    return asConcrete(this._reflection).options;
  }

  override isThroughReflection(): boolean {
    return this._reflection.isThroughReflection();
  }

  override isCollection(): boolean {
    return this._reflection.isCollection();
  }

  override isPolymorphic(): boolean {
    return this._reflection.isPolymorphic();
  }

  scopeFor(relation: unknown, owner?: unknown): unknown {
    return asConcrete(this._reflection).scopeFor?.(relation, owner) ?? relation;
  }

  override get chain(): AbstractReflection[] {
    return this._reflection.chain;
  }

  get sourceReflection(): AbstractReflection | null {
    return (
      (this._reflection as unknown as { sourceReflection?: AbstractReflection | null })
        .sourceReflection ?? null
    );
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
    case "hasAndBelongsToMany":
      return HasAndBelongsToManyReflection;
    default:
      return AssociationReflection;
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

/** @missingRailsArgs merge! — PERMANENT */
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

  const rawReflections: Record<string, RawReflection> =
    (modelClass as { _reflections?: Record<string, RawReflection> })._reflections ?? {};
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
  const rawReflections: Record<string, unknown> = (modelClass as any)._reflections ?? {};
  return (
    (rawReflections[association] as AssociationReflection | ThroughReflection | undefined) ?? null
  );
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
