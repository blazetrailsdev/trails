import { Nodes } from "@blazetrails/arel";

import { JoinDependency } from "../associations/join-dependency.js";
import type { AssociationSpec } from "./query-methods.js";
import { constructJoinDependency, structuralUnionEq } from "./query-methods.js";

interface JoinFoldRelation {
  model: unknown;
  _joinClauses: unknown[];
  _joinValues: unknown[];
  _joinsValues: unknown[];
  _namedInnerJoins: unknown[];
  _leftOuterJoinsValues: unknown[];
  joinsValues?: unknown[];
  leftOuterJoinsValues?: unknown[];
  _isNamedJoinValue(v: unknown): boolean;
}

function joinsUnionEq(v: unknown, existing: unknown): boolean {
  return v instanceof JoinDependency || existing instanceof JoinDependency
    ? v === existing
    : rawJoinDup(v, existing) || structuralUnionEq(v, existing);
}

function rawJoinDup(v: unknown, existing: unknown): boolean {
  const node = v as { eql?: (o: unknown) => boolean; constructor?: unknown };
  if (
    typeof node?.eql === "function" &&
    node.constructor === (existing as { constructor?: unknown })?.constructor
  ) {
    return node.eql(existing);
  }
  return v === existing;
}

export function foldMergeJoins(target: JoinFoldRelation, source: JoinFoldRelation): void {
  const clauses = source._joinClauses ?? [];
  if (clauses.length > 0) target._joinClauses.push(...clauses);

  const joinsValues = source.joinsValues ?? [];
  if (joinsValues.length === 0) return;
  if (source.model === target.model) {
    for (const v of joinsValues) {
      if (!source._isNamedJoinValue(v)) {
        if (!target._joinValues.some((existing) => rawJoinDup(v, existing)))
          target._joinsValues.push(v);
      } else if (!target._namedInnerJoins.some((seen) => structuralUnionEq(seen, v))) {
        target._joinsValues.push(v);
      }
    }
    return;
  }

  const associations: unknown[] = [];
  const others: unknown[] = [];
  for (const v of joinsValues) {
    if (!(v instanceof JoinDependency) && source._isNamedJoinValue(v)) {
      associations.push(v);
    } else {
      others.push(v);
    }
  }
  const joinDependency = constructJoinDependency.call(
    source as never,
    associations as AssociationSpec[],
    Nodes.InnerJoin,
  );
  for (const v of [joinDependency, ...others]) {
    if (!target._joinsValues.some((existing) => joinsUnionEq(v, existing)))
      target._joinsValues.push(v);
  }
}

export function foldMergeOuterJoins(target: JoinFoldRelation, source: JoinFoldRelation): void {
  const otherLeft = source.leftOuterJoinsValues ?? [];
  if (otherLeft.length === 0) return;
  if (source.model === target.model) {
    for (const v of otherLeft) {
      if (!target._leftOuterJoinsValues.some((seen) => structuralUnionEq(seen, v)))
        target._leftOuterJoinsValues.push(v);
    }
    return;
  }

  const associations: unknown[] = [];
  const others: unknown[] = [];
  for (const v of otherLeft) {
    if (!(v instanceof JoinDependency)) {
      associations.push(v);
    } else {
      others.push(v);
    }
  }
  const joinDependency = constructJoinDependency.call(
    source as never,
    associations as AssociationSpec[],
    Nodes.OuterJoin,
  );
  for (const v of [joinDependency, ...others]) {
    if (!target._leftOuterJoinsValues.some((seen) => joinsUnionEq(v, seen)))
      target._leftOuterJoinsValues.push(v as never);
  }
}
