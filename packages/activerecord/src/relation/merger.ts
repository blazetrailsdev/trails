import { Nodes } from "@blazetrails/arel";

import { arelColumns, constructJoinDependency } from "./query-methods.js";

/**
 * Merges two Relations together, combining their conditions,
 * joins, and other clauses.
 *
 * Mirrors: ActiveRecord::Relation::Merger
 */
export class Merger {
  readonly relation: any;
  readonly values: Record<string, unknown>;
  readonly other: any;

  constructor(relation: any, other: any) {
    this.relation = relation;
    this.other = other;
    this.values = typeof other.values === "function" ? other.values() : {};
  }

  merge(): any {
    const rel = this.relation._clone();
    this.mergeUnscope(rel);
    this.mergeWhereClause(rel);
    this.mergeSelectValues(rel);
    this.mergeMultiValues(rel);
    this.mergeSingleValues(rel);
    this.mergeClauses(rel);
    this.mergePreloads(rel);
    this.mergeJoins(rel);
    this.mergeOuterJoins(rel);
    if (this.other._isNone) rel._isNone = true;
    return rel;
  }

  // Rails merger.rb processes :unscope as a NORMAL_VALUE: before the clauses are
  // merged it calls `relation.unscope!(*value)`, re-applying the other relation's
  // resets to the merged relation. This is what lets
  // `where(...).merge(unscope(:where))` clear the accumulated where clause.
  private mergeUnscope(rel: any): void {
    const unscopeValues = this.other._unscopeValues ?? [];
    if (unscopeValues.length > 0) rel.unscopeBang(...unscopeValues);
  }

  private mergeWhereClause(rel: any): void {
    if (!this.other._whereClause.isEmpty()) {
      rel._whereClause = rel._whereClause.merge(this.other._whereClause);
    }
  }

  private mergeSelectValues(rel: any): void {
    // Mirrors Rails' Merger#merge_select_values: union (`|=`) the other
    // relation's select_values into ours rather than replacing. When the two
    // relations target different models, the other side's bare columns are
    // first resolved against *its own* table via arel_columns so a symbol like
    // `:body` qualifies to `comments.body` instead of the receiver's table.
    const otherSelect = this.other._selectColumns;
    if (otherSelect == null || otherSelect.length === 0) return;
    const columns =
      this.other._modelClass === rel._modelClass
        ? otherSelect
        : arelColumns.call(this.other, otherSelect);
    rel._selectBang(...columns);
  }

  private mergePreloads(rel: any): void {
    if (this.other._preloadAssociations && this.other._preloadAssociations.length > 0) {
      rel._preloadAssociations = [
        ...(rel._preloadAssociations ?? []),
        ...this.other._preloadAssociations,
      ];
    }
    if (this.other._includesAssociations && this.other._includesAssociations.length > 0) {
      rel._includesAssociations = [
        ...(rel._includesAssociations ?? []),
        ...this.other._includesAssociations,
      ];
    }
    if (this.other._eagerLoadAssociations && this.other._eagerLoadAssociations.length > 0) {
      rel._eagerLoadAssociations = [
        ...(rel._eagerLoadAssociations ?? []),
        ...this.other._eagerLoadAssociations,
      ];
    }
  }

  private mergeJoins(rel: any): void {
    // Rails: joins_values and left_outer_joins_values are separate arrays, so each
    // merge helper unions its own array independently (no interleaving in Rails).
    // Our codebase mirrors that split: explicit SQL joins go into _joinClauses,
    // Arel/string join nodes into _joinValues, and named left-outer-join associations
    // into _leftOuterJoinsValues. Each is merged independently below.
    // Arel::Nodes::InnerJoin is the type used for same-model inner joins in Rails'
    // cross-model merge path.
    const clauses: Array<{ type: string; table: string; on: string; quoted?: boolean }> =
      this.other._joinClauses ?? [];
    if (clauses.length > 0) rel._joinClauses.push(...clauses);
    if (this.other._joinValues?.length > 0) rel._joinValues.push(...this.other._joinValues);
    // Rails merge_joins (merger.rb): when other.klass == relation.klass the
    // association names union directly into joins_values; otherwise Merger builds
    // a single InnerJoin JoinDependency against other.klass and stashes it. We
    // mirror both: same-klass names fold into _namedInnerJoins (resolved on the
    // receiver); cross-klass names (Hash | Symbol/String | Array — every shape
    // Rails treats as an association) build a JoinDependency on `other` whose
    // AliasTracker handles nested-through / HABTM correctly.
    const sameKlass = this.other._modelClass === rel._modelClass;
    const otherNamed: unknown[] = this.other._namedInnerJoins ?? [];
    if (sameKlass) {
      for (const v of otherNamed) {
        if (!rel._namedInnerJoins.includes(v)) rel._namedInnerJoins.push(v);
      }
    } else if (otherNamed.length > 0) {
      rel._namedInnerJoinDeps.push(
        constructJoinDependency.call(this.other, otherNamed as any, Nodes.InnerJoin),
      );
    }
    // Carry forward any cross-klass dependencies the source already accumulated.
    rel._namedInnerJoinDeps.push(...(this.other._namedInnerJoinDeps ?? []));
  }

  // Mirrors Rails merge_outer_joins (merger.rb): when other.klass == relation.klass
  // the left_outer_joins association names union directly; otherwise Merger builds a
  // single OuterJoin JoinDependency against other.klass (the names can't resolve on
  // the receiver's model) and stashes it via left_outer_joins!. We mirror both:
  // same-klass names fold into _leftOuterJoinsValues; cross-klass names build a
  // JoinDependency on `other` stashed in _leftOuterJoinDeps.
  private mergeOuterJoins(rel: any): void {
    const otherLeft: unknown[] = this.other._leftOuterJoinsValues ?? [];
    const sameKlass = this.other._modelClass === rel._modelClass;
    if (sameKlass) {
      for (const v of otherLeft) {
        if (!rel._leftOuterJoinsValues.includes(v)) rel._leftOuterJoinsValues.push(v);
      }
    } else if (otherLeft.length > 0) {
      rel._leftOuterJoinDeps.push(
        constructJoinDependency.call(this.other, otherLeft as any, Nodes.OuterJoin),
      );
    }
    // Carry forward any cross-klass dependencies the source already accumulated.
    rel._leftOuterJoinDeps.push(...(this.other._leftOuterJoinDeps ?? []));
  }

  private mergeMultiValues(rel: any): void {
    if (this.other._orderClauses && this.other._orderClauses.length > 0) {
      rel._orderClauses = [...this.other._orderClauses];
    }
    if (this.other._groupColumns && this.other._groupColumns.length > 0) {
      rel._groupColumns.push(...this.other._groupColumns);
    }
    if (this.other._annotations && this.other._annotations.length > 0) {
      rel._annotations.push(...this.other._annotations);
    }
    if (this.other._referencesValues) {
      for (const ref of this.other._referencesValues) {
        if (!rel._referencesValues.includes(ref)) rel._referencesValues.push(ref);
      }
    }
    if (this.other._manualReferences) {
      for (const ref of this.other._manualReferences) {
        if (!rel._manualReferences.includes(ref)) rel._manualReferences.push(ref);
      }
    }
  }

  private mergeSingleValues(rel: any): void {
    if (this.other._limitValue !== null && this.other._limitValue !== undefined) {
      rel._limitValue = this.other._limitValue;
    }
    if (this.other._offsetValue !== null && this.other._offsetValue !== undefined) {
      rel._offsetValue = this.other._offsetValue;
    }
    if (this.other._isDistinct) rel._isDistinct = true;
    if (this.other._lockValue) rel._lockValue = this.other._lockValue;
    if (this.other._isReadonly) rel._isReadonly = true;
    if (this.other._isStrictLoading !== undefined)
      rel._isStrictLoading = this.other._isStrictLoading;
    // Mirrors merge_single_values (merger.rb): create_with merges hash-wise with
    // the other relation's values winning (last-wins precedence).
    if (this.other._createWithAttrs && Object.keys(this.other._createWithAttrs).length > 0) {
      rel._createWithAttrs = { ...(rel._createWithAttrs ?? {}), ...this.other._createWithAttrs };
    }
  }

  private mergeClauses(rel: any): void {
    if (!this.other._havingClause.isEmpty()) {
      rel._havingClause = rel._havingClause.merge(this.other._havingClause);
    }
    if (this.isReplaceFromClause() && this.other._fromClause) {
      rel._fromClause = this.other._fromClause;
    }
  }

  private isReplaceFromClause(): boolean {
    const relationFrom = this.relation._fromClause;
    const otherFrom = this.other._fromClause;
    return (!relationFrom || relationFrom.isEmpty()) && !!otherFrom && !otherFrom.isEmpty();
  }
}

/**
 * Merges a hash of conditions into a Relation by converting
 * the hash into where/having/etc. clauses first.
 *
 * Mirrors: ActiveRecord::Relation::HashMerger
 */
export class HashMerger {
  readonly relation: any;
  readonly hash: Record<string, unknown>;

  constructor(relation: any, hash: Record<string, unknown>) {
    this.relation = relation;
    this.hash = hash;
  }

  merge(): any {
    return this.relation.where(this.hash);
  }
}
