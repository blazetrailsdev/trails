import { Nodes } from "@blazetrails/arel";

import type { AssociationSpec } from "./query-methods.js";
import { constructJoinDependency, structuralUnionEq } from "./query-methods.js";

// Join-folding passes for the single merge path (Merger#merge). Both `merge` and
// `merge!` now funnel through Merger — `merge` is `spawn.merge!` and `merge!`
// runs Merger#merge in place (spawn-methods.ts) — so there is one caller. Kept as
// dedicated functions here (rather than inlined) so the dedup/branching logic
// stays isolated and reviewable; Merger keeps thin mergeJoins/mergeOuterJoins
// wrappers so api:compare still maps merger.rb's merge_joins/merge_outer_joins.

// Minimal structural view of the join-related fields these helpers touch on a
// Relation. Kept local (rather than `any`) so the shared module stays off the
// no-explicit-any burndown allowlist (RFC 0037).
interface JoinFoldRelation {
  _modelClass: unknown;
  _joinClauses: unknown[];
  _joinValues: unknown[];
  _joinsValues: unknown[];
  _namedInnerJoins: unknown[];
  _namedInnerJoinDeps: unknown[];
  _leftOuterJoinsValues: unknown[];
  _leftOuterJoinDeps: unknown[];
  joinsValues?: unknown[];
  leftOuterJoinsValues?: unknown[];
  _isNamedJoinValue(v: unknown): boolean;
}

// Structural dedup for raw joins: an Arel node exposes `eql` and dedups by value
// when same-constructor; everything else falls back to reference identity.
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

// Rails merge_joins (merger.rb): joins_values and left_outer_joins_values are
// separate arrays, so each merge helper unions its own array independently (no
// interleaving in Rails). trails keeps explicit SQL joins in _joinClauses and
// every `.joins` argument in the unified _joinsValues store; the source's
// `joinsValues` is partitioned into raw join values vs named association joins
// (the same split `build_joins` derives) and each is merged independently below,
// writing back into _joinsValues.
//
// Rails `relation.joins_values |= other.joins_values` (merger.rb) is a single
// ordered array union preserving `other`'s exact insertion order across the
// named/raw boundary, so a source whose joins interleave (e.g.
// `joins(:a, "RAW", :b)`) folds in as `[a, RAW, b]`, not `[RAW, a, b]`. We walk
// `source.joinsValues` once, unioning each entry per its category:
//   - raw joins union structurally (Arel node `eql`, else reference);
//   - same-klass named specs dedup by `structuralUnionEq`.
// Cross-klass named (Hash | Symbol/String | Array — every shape Rails treats as
// an association) can't resolve on the receiver, so they're collected and built
// into a single InnerJoin JoinDependency on `source` (whose AliasTracker handles
// nested-through / HABTM) rather than folded into _joinsValues; this mirrors
// Rails' `else` branch where `others` (the raw joins) still append in order via
// `joins!(join_dependency, *others)`. Arel::Nodes::InnerJoin is the type used for
// same-model inner joins in Rails' cross-model merge path.
export function foldMergeJoins(target: JoinFoldRelation, source: JoinFoldRelation): void {
  const clauses = source._joinClauses ?? [];
  if (clauses.length > 0) target._joinClauses.push(...clauses);

  const sameKlass = source._modelClass === target._modelClass;
  const crossKlassNamed: unknown[] = [];
  for (const v of source.joinsValues ?? []) {
    if (!source._isNamedJoinValue(v)) {
      if (!target._joinValues.some((existing) => rawJoinDup(v, existing)))
        target._joinsValues.push(v);
    } else if (sameKlass) {
      // joins_values |= dedups structurally-equal Hash specs (eql?/hash), so a
      // same-klass merge folds an equal spec — not by JS reference identity.
      if (!target._namedInnerJoins.some((seen) => structuralUnionEq(seen, v)))
        target._joinsValues.push(v);
    } else {
      crossKlassNamed.push(v);
    }
  }
  if (crossKlassNamed.length > 0) {
    target._namedInnerJoinDeps.push(
      constructJoinDependency.call(
        source as never,
        crossKlassNamed as AssociationSpec[],
        Nodes.InnerJoin,
      ),
    );
  }
  // Carry forward any cross-klass dependencies the source already accumulated.
  target._namedInnerJoinDeps.push(...(source._namedInnerJoinDeps ?? []));
}

// Rails merge_outer_joins (merger.rb): when other.klass == relation.klass the
// left_outer_joins association names union directly; otherwise Merger builds a
// single OuterJoin JoinDependency against other.klass (the names can't resolve on
// the receiver's model) and stashes it via left_outer_joins!.
export function foldMergeOuterJoins(target: JoinFoldRelation, source: JoinFoldRelation): void {
  // Read via the public leftOuterJoinsValues accessor (PR #4675 convergence),
  // symmetric with foldMergeJoins reading source.joinsValues.
  const otherLeft = source.leftOuterJoinsValues ?? [];
  const sameKlass = source._modelClass === target._modelClass;
  if (sameKlass) {
    for (const v of otherLeft) {
      if (!target._leftOuterJoinsValues.some((seen) => structuralUnionEq(seen, v)))
        target._leftOuterJoinsValues.push(v);
    }
  } else if (otherLeft.length > 0) {
    target._leftOuterJoinDeps.push(
      constructJoinDependency.call(
        source as never,
        otherLeft as AssociationSpec[],
        Nodes.OuterJoin,
      ),
    );
  }
  // Carry forward any cross-klass dependencies the source already accumulated.
  target._leftOuterJoinDeps.push(...(source._leftOuterJoinDeps ?? []));
}
