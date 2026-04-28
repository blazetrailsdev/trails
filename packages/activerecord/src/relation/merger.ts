import { Nodes } from "@blazetrails/arel";

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

  private mergeWhereClause(rel: any): void {
    if (!this.other._whereClause.isEmpty()) {
      rel._whereClause = rel._whereClause.merge(this.other._whereClause);
    }
  }

  private mergeSelectValues(rel: any): void {
    if (this.other._selectColumns != null) {
      rel._selectColumns = [...this.other._selectColumns];
    }
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
    for (const v of this.other._leftOuterJoinsValues ?? []) {
      if (!rel._leftOuterJoinsValues.includes(v)) rel._leftOuterJoinsValues.push(v);
    }
    void Nodes.InnerJoin;
  }

  private mergeOuterJoins(_rel: any): void {
    // Same-model left outer join associations are merged in mergeJoins above via
    // _leftOuterJoinsValues. Rails' merge_outer_joins also handles a cross-model
    // path (partitions associations, calls left_outer_joins! on a new JoinDependency)
    // which is not yet implemented here — Arel::Nodes::OuterJoin is the join type
    // used in that cross-model path.
    void Nodes.OuterJoin;
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
    if (this.other._isStrictLoading) rel._isStrictLoading = true;
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
