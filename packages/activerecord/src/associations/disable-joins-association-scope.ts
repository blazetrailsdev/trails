import { any } from "@blazetrails/activesupport";
import type { Table, Nodes } from "@blazetrails/arel";
import { isEmpty, union } from "@blazetrails/ruby-compat";
import { AssociationScope, type AssociationScopeable } from "./association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { DeferredPluck } from "../relation/predicate-builder/deferred-distinct-pk-in.js";
import type { Relation } from "../relation.js";
import type { Base } from "../base.js";
import type { AbstractReflection } from "../reflection.js";
import { Associations } from "../namespaces.js";

type ChainEntry = AbstractReflection & {
  aliasedTable: Table | Nodes.TableAlias;
  joinPrimaryKey(): string | string[];
  joinForeignKey: string | string[];
};

type JoinIds = unknown[] | DeferredPluck;

type EvalScope = { evalScope: AssociationScope["evalScope"] };

export class DisableJoinsAssociationScope extends AssociationScope {
  override scope(association: AssociationScopeable): unknown {
    const sourceReflection = association.reflection;
    const owner = association.owner;
    const unscoped = association.klass.unscoped();
    const reverseChain = this.getChain(
      sourceReflection,
      association,
      unscoped.aliasTracker(),
    ).reverse() as unknown as ChainEntry[];

    const [lastReflection, lastOrdered, lastJoinIds] = this.lastScopeChain(reverseChain, owner);

    return addConstraints.call(
      this,
      lastReflection,
      lastReflection.joinPrimaryKey(),
      lastJoinIds,
      owner,
      lastOrdered,
    );
  }

  private lastScopeChain(reverseChain: ChainEntry[], owner: Base): [ChainEntry, boolean, JoinIds] {
    const firstItem = reverseChain.shift()!;
    const firstForeignKey = firstItem.joinForeignKey;
    const firstScope: [ChainEntry, boolean, JoinIds] = [
      firstItem,
      false,
      [
        Array.isArray(firstForeignKey)
          ? firstForeignKey.map((column) => owner._readAttribute(column))
          : owner._readAttribute(firstForeignKey),
      ],
    ];

    return reverseChain.reduce(([reflection, ordered, joinIds], nextReflection) => {
      const key = reflection.joinPrimaryKey();
      const records = addConstraints.call(this, reflection, key, joinIds, owner, ordered);
      const foreignKey = nextReflection.joinForeignKey;
      const recordIds = new DeferredPluck(records, [foreignKey].flat());
      const recordsOrdered = records != null && any(records.orderValues);

      return [nextReflection, recordsOrdered, recordIds];
    }, firstScope);
  }
}

/** @internal */
export function addConstraints(
  this: DisableJoinsAssociationScope,
  reflection: ChainEntry,
  key: string | string[],
  joinIds: JoinIds,
  owner: Base,
  ordered: boolean,
): Relation<Base> | DisableJoinsAssociationRelation<Base> {
  let scope: Relation<Base> = reflection
    .buildScope(reflection.aliasedTable)
    .where(new Map([[key, joinIds]]));

  const relation: Relation<Base> = reflection.klass.scopeForAssociation();
  scope.mergeBang(
    relation.except(
      "select",
      "createWith",
      "includes",
      "preload",
      "eagerLoad",
      "joins",
      "leftOuterJoins",
    ),
  );

  scope = reflection.constraints().reduce((memo, scopeChainItem) => {
    const item = (this as unknown as EvalScope).evalScope(reflection, scopeChainItem, owner);
    scope.unscopeBang(...item.unscopeValues);
    scope.whereClause = scope.whereClause.plus(item.whereClause);
    scope.orderValues = union(item.orderValues, scope.orderValues);
    return scope;
  }, scope);

  if (isEmpty(scope.orderValues) && ordered) {
    const splitScope = DisableJoinsAssociationRelation.create(scope.model, key, joinIds);
    splitScope.whereClause = splitScope.whereClause.plus(scope.whereClause);
    return splitScope;
  } else {
    return scope;
  }
}

Associations.DisableJoinsAssociationScope = DisableJoinsAssociationScope;
