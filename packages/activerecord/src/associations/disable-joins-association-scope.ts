import { ArgumentError } from "@blazetrails/ruby-compat";
import { any } from "@blazetrails/activesupport";
import { Nodes } from "@blazetrails/arel";
import type { AliasTracker } from "./alias-tracker.js";
import {
  AssociationScope,
  ReflectionProxy,
  type AssociationScopeable,
  type ValueTransformation,
  unionOrderClauses,
} from "./association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { disableJoinsAssociationRelationClassFor } from "../relation/delegation.js";
import type { Relation } from "../relation.js";
import { WhereClause } from "../relation/where-clause.js";
import type { ExceptKey } from "../relation/query-methods.js";
import type { Base } from "../base.js";
import type { AbstractReflection } from "../reflection.js";
import { setDjasScopeBuilder } from "./_scope-slots.js";

type ChainEntry = AbstractReflection | ReflectionProxy;

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
  constructor(valueTransformation: ValueTransformation = (v) => v) {
    super(valueTransformation);
  }

  /** @missingRailsCall add_constraints — PERMANENT */
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

  /** @missingRailsCall add_constraints — PERMANENT */
  private async lastScopeChain(
    reverseChain: ChainEntry[],
    owner: Base,
  ): Promise<[ChainEntry, boolean, JoinIds]> {
    const work = reverseChain.slice();
    const firstItem = work.shift();
    if (!firstItem) {
      throw new Error("DisableJoinsAssociationScope: empty chain");
    }
    const firstFk = (firstItem as { joinForeignKey: string | string[] }).joinForeignKey;
    const firstFkCols = keyColumns(firstFk, "joinForeignKey");
    const seedTuple = readTuple(owner, firstFkCols);
    const initialIds: JoinIds = firstFkCols.length === 1 ? [seedTuple[0]] : [seedTuple];
    let acc: [ChainEntry, boolean, JoinIds] = [firstItem, false, initialIds];

    for (const nextReflection of work) {
      const [reflection, ordered, joinIds] = acc;
      const foreignKey = (nextReflection as { joinForeignKey: string | string[] }).joinForeignKey;
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
    const klass = (reflection as { klass: typeof Base }).klass;
    let scope: unknown = (
      reflection as unknown as {
        buildScope(table?: unknown): unknown;
        aliasedTable?: unknown;
      }
    ).buildScope((reflection as { aliasedTable?: unknown }).aliasedTable);
    if (keyCols.length === 1) {
      scope = (scope as { where: (c: Record<string, unknown>) => unknown }).where({
        [keyCols[0]]: joinIds,
      });
    } else {
      const arity = keyCols.length;
      const tuples = joinIds.map((t, i) => {
        if (!Array.isArray(t)) {
          throw new ArgumentError(
            `DisableJoinsAssociationScope: composite joinIds[${i}] must be an array (got ${typeof t})`,
          );
        }
        if (t.length !== arity) {
          throw new ArgumentError(
            `DisableJoinsAssociationScope: composite joinIds[${i}] arity ${t.length} does not match key columns [${keyCols.join(", ")}] (arity ${arity})`,
          );
        }
        return t;
      }) as unknown[][];
      scope = (scope as { where: (c: string[], t: unknown[][]) => unknown }).where(keyCols, tuples);
    }

    const sfa = (
      klass as unknown as { scopeForAssociation?: () => unknown }
    ).scopeForAssociation?.();
    if (sfa) {
      const stripped = (sfa as { except: (...keys: ExceptKey[]) => unknown }).except(
        "select",
        "createWith",
        "includes",
        "preload",
        "eagerLoad",
        "joins",
        "leftOuterJoins",
      );
      scope = (scope as { merge: (o: unknown) => unknown }).merge(stripped);
    }

    const constraints =
      (
        reflection as { constraints?: () => Array<(...args: unknown[]) => unknown> }
      ).constraints?.() ?? [];
    for (const scopeChainItem of constraints) {
      if (typeof scopeChainItem !== "function") continue;
      const item = this.evalScope(reflection, scopeChainItem, owner);
      const itemUnscope = (item as { unscopeValues?: unknown[] }).unscopeValues ?? [];
      if (itemUnscope.length > 0) {
        (scope as { unscopeBang: (...v: unknown[]) => unknown }).unscopeBang(...itemUnscope);
      }
      const merged = scope as { whereClause: WhereClause; orderValues?: unknown[] };
      const itemPredicates =
        (item as { whereClause?: { predicates?: unknown[] } }).whereClause?.predicates ?? [];
      if (itemPredicates.length > 0) {
        merged.whereClause = merged.whereClause.plus(
          new WhereClause(itemPredicates as Nodes.Node[]),
        );
      }
      const itemOrders = (item as { orderValues?: unknown[] }).orderValues ?? [];
      if (itemOrders.length > 0) {
        merged.orderValues = unionOrderClauses(itemOrders, merged.orderValues ?? []);
      }
      scope = merged;
    }

    const finalOrd = scope as { orderValues?: unknown[] };
    const finalOrders = (finalOrd.orderValues?.length ?? 0) > 0 ? [1] : [];
    if (finalOrders.length === 0 && ordered) {
      if ((scope as { _isNone: boolean })._isNone) return scope;
      const Ctor = disableJoinsAssociationRelationClassFor(klass);
      const split =
        keyCols.length === 1
          ? new Ctor(klass, keyCols[0], joinIds as unknown[])
          : new Ctor(klass, keyCols, joinIds as unknown[][]);
      const sourceWhere = (scope as { whereClause?: WhereClause }).whereClause;
      if (sourceWhere && sourceWhere.predicates.length > 0) {
        const target = split as unknown as { whereClause: WhereClause };
        target.whereClause = target.whereClause.plus(sourceWhere);
      }
      return split;
    }
    return scope;
  }
}

setDjasScopeBuilder((assoc) =>
  DisableJoinsAssociationScope.create().scope(assoc as AssociationScopeable),
);
