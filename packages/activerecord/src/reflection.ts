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

type MacroType = "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany" | "composedOf";

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

  protected collectJoinChain(): AbstractReflection[] {
    return [this];
  }

  /**
   * Build a base Relation for the associated class.
   *
   * Mirrors: ActiveRecord::Reflection::AbstractReflection#build_scope
   */
  buildScope(_table?: Table): any {
    return (this.klass as any).all();
  }

  /**
   * Build a Relation with the join condition between two Arel tables.
   * Uses Arel nodes (table[pk].eq(foreignTable[fk])) for the join predicate.
   *
   * Mirrors: ActiveRecord::Reflection::AbstractReflection#join_scope
   */
  joinScope(table: Table, foreignTable: Table, foreignKlass: typeof Base): any {
    let scope = this.klassJoinScope(table);

    // Polymorphic type constraint
    const typeCol = (this as any).type;
    if (typeCol) {
      scope = scope.where({ [typeCol]: foreignKlass.name });
    }

    // Merge scope chain items
    for (const chainScope of this.joinScopes(table)) {
      scope = scope.merge(chainScope);
    }

    // Primary/foreign key join condition using Arel
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

  /**
   * Returns scopes to apply when joining this association.
   *
   * Mirrors: ActiveRecord::Reflection::AbstractReflection#join_scopes
   */
  joinScopes(table: Table): any[] {
    if (this.scope) {
      const rel = this.buildScope(table);
      const result = this.scope.call(null, rel);
      return [result || rel];
    }
    return [];
  }

  /**
   * Build a scope for the associated class, applying default scopes.
   *
   * Mirrors: ActiveRecord::Reflection::AbstractReflection#klass_join_scope
   */
  klassJoinScope(_table?: Table): any {
    return this.buildScope(_table);
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
  private _klass: typeof Base | null = null;

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

  get scope(): ((...args: any[]) => any) | null {
    return this._scope;
  }

  get className(): string {
    if (this.options.className) return this.options.className as string;
    return camelize(singularize(this.name));
  }

  get klass(): typeof Base {
    if (this._klass) return this._klass;
    if (this.options.anonymousClass) {
      this._klass = this.options.anonymousClass as typeof Base;
      return this._klass;
    }
    this._klass = this.computeClass(this.className);
    return this._klass;
  }

  protected computeClass(name: string): typeof Base {
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
  get macro(): MacroType {
    throw new Error("Subclass must implement macro");
  }

  buildAssociation(attributes: Record<string, unknown> = {}): InstanceType<typeof Base> {
    return new (this.klass as any)(attributes);
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
    return !!this.options.autosave;
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

  /**
   * The column on the associated table used for joins.
   * For has_many/has_one: the foreign key column on the associated table.
   * For belongs_to: the primary key on the associated table.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#join_primary_key
   */
  get joinPrimaryKey(): string | string[] {
    return this.foreignKey;
  }

  /**
   * The column on the owner table used for joins.
   * For has_many/has_one: the primary key on the owner table.
   * For belongs_to: the foreign key on the owner table.
   *
   * Mirrors: ActiveRecord::Reflection::AssociationReflection#join_foreign_key
   */
  get joinForeignKey(): string | string[] {
    return this.activeRecordPrimaryKey;
  }

  get activeRecordPrimaryKey(): string | string[] {
    if (this.options.primaryKey !== undefined) {
      return this.options.primaryKey as string | string[];
    }
    return this.activeRecord.primaryKey;
  }

  protected computeClass(name: string): typeof Base {
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
 * Unlike the other reflection classes, ThroughReflection delegates
 * to an inner reflection rather than inheriting from AssociationReflection.
 *
 * Mirrors: ActiveRecord::Reflection::ThroughReflection
 */
export class ThroughReflection extends AbstractReflection {
  private _delegate: AssociationReflection;
  private _sourceReflection: AssociationReflection | ThroughReflection | null | undefined =
    undefined;
  private _throughReflection: AssociationReflection | ThroughReflection | null | undefined =
    undefined;

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
    // Try to resolve: singular first, then name
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
    if (this._sourceReflection !== undefined) return this._sourceReflection;
    const throughRef = this.throughReflection;
    if (!throughRef) {
      this._sourceReflection = null;
      return null;
    }
    try {
      const throughKlass = throughRef.klass;
      const throughAssocs: any[] = (throughKlass as any)._associations ?? [];
      const candidates = this.options.source
        ? [this.options.source as string]
        : [singularize(this.name), this.name];
      for (const candidate of candidates) {
        const sourceDef = throughAssocs.find((a: any) => a.name === candidate);
        if (sourceDef) {
          this._sourceReflection = createReflection(sourceDef, throughKlass);
          return this._sourceReflection;
        }
      }
      this._sourceReflection = null;
      return null;
    } catch {
      this._sourceReflection = null;
      return null;
    }
  }

  get throughReflection(): AssociationReflection | ThroughReflection | null {
    if (this._throughReflection !== undefined) return this._throughReflection;
    const ownerAssocs: any[] = (this.activeRecord as any)._associations ?? [];
    const throughDef = ownerAssocs.find((a: any) => a.name === this.through);
    if (!throughDef) {
      this._throughReflection = null;
      return null;
    }
    this._throughReflection = createReflection(throughDef, this.activeRecord);
    return this._throughReflection;
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

  protected collectJoinChain(): AbstractReflection[] {
    const result: AbstractReflection[] = [this];
    const through = this.throughReflection;
    if (through) {
      // through.chain recursively builds the chain for nested through associations
      result.push(...through.chain);
    }
    return result;
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
  const reflections = associations.map((assocDef) => createReflection(assocDef, modelClass));

  if (!macro) return reflections;

  return reflections.filter((ref) => {
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
 * Both AssociationReflection and ThroughReflection can be returned
 * from reflectOnAssociation / reflectOnAllAssociations.
 */
export type AssociationLikeReflection = AssociationReflection | ThroughReflection;
