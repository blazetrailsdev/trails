import { any } from "@blazetrails/activesupport";
import type { Table, Nodes } from "@blazetrails/arel";
import type { AliasTracker } from "./alias-tracker.js";
import { union } from "@blazetrails/ruby-compat";
import { AssociationScope, type AssociationScopeable } from "./association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { relationClassFor } from "../relation/delegation.js";
import type { Relation } from "../relation.js";
import type { Base } from "../base.js";
import type { AbstractReflection } from "../reflection.js";
import { Associations } from "../namespaces.js";

type ChainEntry = AbstractReflection & { aliasedTable: Table | Nodes.TableAlias };

type JoinIds = unknown[] | unknown[][];

function keyColumns(key: string | string[], label: string): string[] {
  if (Array.isArray(key)) {
    if (key.length === 0) {
      throw new Error(`DisableJoinsAssociationScope: empty ${label}`);
    }
    return key;
  }
  return [key];
}

function readTuple(owner: Base, cols: string[]): unknown[] {
  return cols.map((c) => owner._readAttribute(c));
}

function resolveJoinPrimaryKey(reflection: unknown, klass?: typeof Base): string | string[] {
  const r = reflection as { joinPrimaryKey(klass?: typeof Base): string | string[] };
  return r.joinPrimaryKey(klass);
}

export class DisableJoinsAssociationScope extends AssociationScope {
  /** @missingRailsCall add_constraints — CONVERGEABLE converge-djar-deferred-chain-walk-mode */
  override scope(association: AssociationScopeable): unknown {
    const sourceReflection = association.reflection;
    const owner = association.owner;
    const klass = association.klass;
    const unscoped = klass.unscoped() as { aliasTracker: () => AliasTracker };
    return DisableJoinsAssociationRelation.deferred(klass, async () => {
      const reverseChain = this.getChain(sourceReflection, association, unscoped.aliasTracker())
        .slice()
        .reverse();
      const [lastReflection, lastOrdered, lastJoinIds] = await this.lastScopeChain(
        reverseChain,
        owner,
      );
      const keyCols = keyColumns(
        resolveJoinPrimaryKey(lastReflection, (lastReflection as { klass?: typeof Base }).klass),
        "joinPrimaryKey",
      );
      const relation = this._addConstraintsDj(
        lastReflection,
        keyCols,
        lastJoinIds,
        owner,
        lastOrdered,
      ) as Relation<Base>;
      return { relation };
    });
  }

  /** @missingRailsCall add_constraints — CONVERGEABLE converge-djar-deferred-chain-walk-mode */
  private async lastScopeChain(
    reverseChain: ChainEntry[],
    owner: Base,
  ): Promise<[ChainEntry, boolean, JoinIds]> {
    const work = reverseChain.slice();
    const firstItem = work.shift();
    if (!firstItem) {
      throw new Error("DisableJoinsAssociationScope: empty chain");
    }
    const firstFk = (firstItem as unknown as { joinForeignKey: string | string[] }).joinForeignKey;
    const firstFkCols = keyColumns(firstFk, "joinForeignKey");
    const seedTuple = readTuple(owner, firstFkCols);
    const initialIds: JoinIds = firstFkCols.length === 1 ? [seedTuple[0]] : [seedTuple];
    let acc: [ChainEntry, boolean, JoinIds] = [firstItem, false, initialIds];

    for (const nextReflection of work) {
      const [reflection, ordered, joinIds] = acc;
      const foreignKey = (nextReflection as unknown as { joinForeignKey: string | string[] })
        .joinForeignKey;
      const foreignKeyCols = keyColumns(foreignKey, "joinForeignKey");
      if (joinIds.length === 0) {
        acc = [nextReflection, false, []];
        continue;
      }
      const keyCols = keyColumns(
        resolveJoinPrimaryKey(reflection, (reflection as { klass?: typeof Base }).klass),
        "joinPrimaryKey",
      );
      const records = this._addConstraintsDj(reflection, keyCols, joinIds, owner, ordered);
      const recordIds = (await (
        records as { pluck: (...cols: string[]) => Promise<unknown[]> }
      ).pluck(...foreignKeyCols)) as JoinIds;
      const ord = records as { orderValues?: unknown[] };
      const recordsOrdered = any(ord.orderValues ?? []);
      acc = [nextReflection, recordsOrdered, recordIds];
    }
    return acc;
  }

  private _addConstraintsDj(
    reflection: ChainEntry,
    keyCols: string[],
    joinIds: JoinIds,
    owner: Base,
    ordered: boolean,
  ): unknown {
    const scope: Relation<Base> = reflection
      .buildScope(reflection.aliasedTable)
      .where(new Map([[keyCols, joinIds]]));

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

    for (const scopeChainItem of reflection.constraints()) {
      const item = this.evalScope(reflection, scopeChainItem, owner);
      scope.unscopeBang(...item.unscopeValues);
      scope.whereClause = scope.whereClause.plus(item.whereClause);
      scope.orderValues = union(item.orderValues, scope.orderValues);
    }

    if (scope.orderValues.length === 0 && ordered) {
      if (scope.isNullRelation()) return scope;
      const Ctor = relationClassFor.call(DisableJoinsAssociationRelation, scope.model);
      const splitScope =
        keyCols.length === 1
          ? new Ctor(scope.model, keyCols[0], joinIds as unknown[])
          : new Ctor(scope.model, keyCols, joinIds as unknown[][]);
      splitScope.whereClause = splitScope.whereClause.plus(scope.whereClause);
      return splitScope;
    } else {
      return scope;
    }
  }
}

Associations.DisableJoinsAssociationScope = DisableJoinsAssociationScope;
