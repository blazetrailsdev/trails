import { Table as ArelTable, Nodes } from "@blazetrails/arel";
import { TableMetadata } from "../table-metadata.js";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import type {
  AssociationReflection,
  AbstractReflection,
  PolymorphicReflection,
  ThroughReflection,
} from "../reflection.js";
import { RuntimeReflection } from "../reflection.js";
import { AliasTracker } from "./alias-tracker.js";
import { kernelArray } from "@blazetrails/activesupport";
import { drop, isEmpty, union } from "@blazetrails/ruby-compat";
import { methodMissingProxy } from "@blazetrails/ruby-compat";
import { Associations } from "../namespaces.js";

export type ValueTransformation<T = unknown> = (v: T) => unknown;

export interface AssociationScopeable {
  readonly owner: Base;
  readonly reflection: AssociationReflection;
  readonly klass: typeof Base;
}

type ChainReflection =
  | RuntimeReflection
  | (ReflectionProxy & (AssociationReflection | ThroughReflection | PolymorphicReflection));

export class ReflectionProxy {
  readonly aliasedTable: ArelTable | Nodes.TableAlias;

  constructor(reflection: AbstractReflection, aliasedTable: ArelTable | Nodes.TableAlias) {
    this.aliasedTable = aliasedTable;
    return methodMissingProxy(this, { delegate: () => reflection });
  }

  allIncludes<T>(_cb?: () => T): T | null {
    return null;
  }
}

export class AssociationScope {
  private readonly _valueTransformation: ValueTransformation;

  constructor(valueTransformation: ValueTransformation) {
    this._valueTransformation = valueTransformation;
  }

  static create<T extends typeof AssociationScope>(
    this: T,
    valueTransformation?: ValueTransformation,
  ): InstanceType<T> {
    return new this(valueTransformation ?? ((v: unknown) => v)) as InstanceType<T>;
  }

  static readonly INSTANCE: AssociationScope = AssociationScope.create();

  static scope(association: AssociationScopeable): unknown {
    return AssociationScope.INSTANCE.scope(association);
  }

  static getBindValues(owner: Base, chain: ReadonlyArray<AbstractReflection>): unknown[] {
    const binds: unknown[] = [];
    const last = chain[chain.length - 1];
    if (!last) return binds;
    const joinFk = (last as { joinForeignKey?: string | string[] }).joinForeignKey;
    const fks = Array.isArray(joinFk) ? joinFk : joinFk ? [joinFk] : [];
    for (const fk of fks) binds.push(owner._readAttribute(fk));
    if ((last as { type?: string | null }).type) {
      binds.push((owner.constructor as typeof Base).polymorphicName());
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const refl = chain[i];
      const next = chain[i + 1];
      if ((refl as { type?: string | null }).type) {
        const nextKlass = (next as { klass?: typeof Base }).klass;
        binds.push(nextKlass ? nextKlass.polymorphicName() : null);
      }
    }
    return binds;
  }

  scope(association: AssociationScopeable): unknown {
    const { owner, reflection, klass } = association;
    let scope: Relation<Base> = klass.unscoped();
    const chain = this.getChain(reflection, association, scope.aliasTracker());

    scope.extendingBang(...reflection.extensions());
    scope = this.addConstraints(scope, owner, chain);
    if (!reflection.isCollection()) scope.limitBang(1);
    return scope;
  }

  /** @internal */
  private get valueTransformation(): ValueTransformation {
    return this._valueTransformation;
  }

  private transformValue<T>(value: T): unknown {
    return this.valueTransformation(value);
  }

  private applyScope(
    scope: Relation<Base>,
    table: ArelTable | Nodes.TableAlias,
    key: string,
    value: unknown,
  ): Relation<Base> {
    if (scope.table && !arelTableEql(scope.table, table)) {
      const meta = new TableMetadata(null, table as unknown as ArelTable);
      const nodes = meta.predicateBuilder.buildFromHash({ [key]: value });
      let result = scope;
      for (const node of nodes) {
        result = result.where(node);
      }
      return result;
    }
    return scope.where({ [key]: value });
  }

  private lastChainScope(
    scope: Relation<Base>,
    reflection: ChainReflection,
    owner: Base,
  ): Relation<Base> {
    const primaryKey = kernelArray(reflection.joinPrimaryKey());
    const foreignKey = kernelArray(reflection.joinForeignKey);

    const table = reflection.aliasedTable;
    const primaryKeyForeignKeyPairs = primaryKey.map((key, i) => [key, foreignKey[i]] as const);
    for (const [joinKey, foreignKey] of primaryKeyForeignKeyPairs) {
      const value = this.transformValue(owner._readAttribute(foreignKey));
      scope = this.applyScope(scope, table, joinKey, value);
    }

    if (reflection.type) {
      const polymorphicType = this.transformValue(
        (owner.constructor as typeof Base).polymorphicName(),
      );
      scope = this.applyScope(scope, table, reflection.type, polymorphicType);
    }

    return scope;
  }

  protected getChain(
    reflection: AssociationReflection,
    association: AssociationScopeable,
    tracker: AliasTracker,
  ): Array<ChainReflection> {
    const name = reflection.name;
    const chain: Array<ChainReflection> = [new RuntimeReflection(reflection, association)];
    for (const refl of drop(reflection.chain, 1)) {
      const aliasedTable = tracker.aliasedTableFor(refl.klass.arelTable, null, () =>
        refl.aliasCandidate(name),
      );
      chain.push(new ReflectionProxy(refl, aliasedTable) as ChainReflection);
    }
    return chain;
  }

  private nextChainScope(
    scope: Relation<Base>,
    reflection: ChainReflection,
    nextReflection: ChainReflection,
  ): Relation<Base> {
    const primaryKey = kernelArray(reflection.joinPrimaryKey());
    const foreignKey = kernelArray(reflection.joinForeignKey);

    const table = reflection.aliasedTable;
    const foreignTable = nextReflection.aliasedTable;

    const primaryKeyForeignKeyPairs = primaryKey.map((key, i) => [key, foreignKey[i]] as const);
    const constraints = primaryKeyForeignKeyPairs
      .map(([joinPrimaryKey, foreignKey]) =>
        table.get(joinPrimaryKey).eq(foreignTable.get(foreignKey)),
      )
      .reduce<Nodes.Node | null>((memo, node) => (memo === null ? node : memo.and(node)), null);

    if (reflection.type) {
      const value = this.transformValue(nextReflection.klass.polymorphicName());
      scope = this.applyScope(scope, table, reflection.type, value);
    }

    return scope.joinsBang(this.join(foreignTable, constraints));
  }

  private addConstraints(
    scope: Relation<Base>,
    owner: Base,
    chain: Array<ChainReflection>,
  ): Relation<Base> {
    const last = chain[chain.length - 1];
    scope = this.lastChainScope(scope, last, owner);
    for (let i = 0; i < chain.length - 1; i++) {
      scope = this.nextChainScope(scope, chain[i], chain[i + 1]);
    }

    const chainHead = chain[0];
    for (let i = chain.length - 1; i >= 0; i--) {
      const reflection = chain[i];
      for (const scopeChainItem of reflection.constraints()) {
        const item = this.evalScope(reflection, scopeChainItem, owner);

        if (scopeChainItem === chainHead.scope) {
          scope.mergeBang(item.except("where", "includes", "unscope", "order"));
        } else if (!isEmpty(item.referencesValues)) {
          scope.mergeBang(item.only("joins", "leftOuterJoins"));

          const associations = union(item.eagerLoadValues, item.includesValues);

          if (!isEmpty(associations)) {
            scope.joinsBang(item.constructJoinDependency(associations, Nodes.OuterJoin));
          }
        }

        reflection.allIncludes(() => {
          scope.includesValues = union(scope.includesValues, item.includesValues);
        });

        scope.unscopeBang(...item.unscopeValues);
        scope.whereClause = scope.whereClause.plus(item.whereClause);
        scope.orderValues = union(item.orderValues, scope.orderValues);
      }
    }

    return scope;
  }

  /** @internal */
  protected evalScope(
    reflection: AbstractReflection,
    scope: (...args: unknown[]) => unknown,
    owner: Base,
  ): Relation<Base> {
    const relation: Relation<Base> = reflection.buildScope(
      (reflection as ChainReflection).aliasedTable,
    );
    return (scope.call(relation, owner) as Relation<Base> | null) || relation;
  }

  /** @internal */
  private join(table: unknown, constraint: unknown): Nodes.Join {
    return new Nodes.LeadingJoin(table as never, new Nodes.On(constraint as never));
  }
}

function arelTableEql(a: ArelTable | Nodes.TableAlias, b: ArelTable | Nodes.TableAlias): boolean {
  if (a instanceof ArelTable && b instanceof ArelTable) return a.eql(b);
  if (a instanceof Nodes.TableAlias && b instanceof Nodes.TableAlias) {
    return a.name === b.name && a.tableName === b.tableName;
  }
  return false;
}

Associations.AssociationScope = AssociationScope;
