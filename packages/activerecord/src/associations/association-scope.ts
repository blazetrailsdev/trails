import { Table as ArelTable, Nodes } from "@blazetrails/arel";
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
import { eachCons, kernelArray } from "@blazetrails/activesupport";
import { drop, first, isEmpty, last, rbEqual, union } from "@blazetrails/ruby-compat";
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

  static getBindValues(owner: Base, chain: ReadonlyArray<AssociationReflection>): unknown[] {
    const binds: unknown[] = [];
    const lastReflection = last(chain)!;

    binds.push(...lastReflection.joinIdFor(owner));
    if (lastReflection.type) {
      binds.push((owner.constructor as typeof Base).polymorphicName());
    }

    eachCons(chain as AssociationReflection[], 2).forEach(([reflection, nextReflection]) => {
      if (reflection.type) {
        binds.push(nextReflection.klass.polymorphicName());
      }
    });
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
    if (rbEqual(scope.table, table)) {
      return scope.whereBang({ [key]: value });
    } else {
      return scope.whereBang({ [table.name as string]: { [key]: value } });
    }
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
      .map(
        ([joinPrimaryKey, foreignKey]): Nodes.Node =>
          table.get(joinPrimaryKey).eq(foreignTable.get(foreignKey)),
      )
      .reduce((memo, node) => memo.and(node));

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
    scope = this.lastChainScope(scope, last(chain)!, owner);

    eachCons(chain, 2, ([reflection, nextReflection]) => {
      scope = this.nextChainScope(scope, reflection, nextReflection);
    });

    const chainHead = first(chain)!;
    for (const reflection of chain.slice().reverse()) {
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

Associations.AssociationScope = AssociationScope;
