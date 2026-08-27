import { WhereClause } from "../relation/where-clause.js";
import { Merger } from "../relation/merger.js";

interface Rebaseable {
  whereClause: WhereClause;
  _isNone: boolean;
  initializeCopy(source: unknown): void;
}

export function rebaseNewOwnerSeed(
  target: Rebaseable,
  freshScope: unknown,
  seedPredicates: readonly unknown[],
): void {
  target.whereClause = new WhereClause(
    target.whereClause.predicates.filter((p) => !seedPredicates.includes(p)),
  );
  target._isNone = false;
  const merged = new Merger(freshScope, target).merge();
  target.initializeCopy(merged);
}
