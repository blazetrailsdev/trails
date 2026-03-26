/**
 * Merges two Relations together, combining their conditions,
 * joins, and other clauses.
 *
 * Mirrors: ActiveRecord::Relation::Merger
 */
export class Merger {
  readonly relation: any;
  readonly other: any;

  constructor(relation: any, other: any) {
    this.relation = relation;
    this.other = other;
  }

  merge(): any {
    const rel = this.relation._clone();
    rel._whereClauses.push(...this.other._whereClauses);
    rel._whereNotClauses.push(...this.other._whereNotClauses);
    rel._whereRawClauses.push(...this.other._whereRawClauses);
    rel._whereArelNodes.push(...this.other._whereArelNodes);
    if (this.other._orderClauses.length > 0) {
      rel._orderClauses = [...this.other._orderClauses];
    }
    if (this.other._limitValue !== null) {
      rel._limitValue = this.other._limitValue;
    }
    if (this.other._offsetValue !== null) {
      rel._offsetValue = this.other._offsetValue;
    }
    if (this.other._selectColumns) {
      rel._selectColumns = [...this.other._selectColumns];
    }
    if (this.other._isDistinct) rel._isDistinct = true;
    if (this.other._groupColumns.length > 0) {
      rel._groupColumns.push(...this.other._groupColumns);
    }
    if (this.other._havingClauses.length > 0) {
      rel._havingClauses.push(...this.other._havingClauses);
    }
    if (this.other._lockValue) rel._lockValue = this.other._lockValue;
    if (this.other._isReadonly) rel._isReadonly = true;
    if (this.other._isStrictLoading) rel._isStrictLoading = true;
    rel._joinClauses.push(...this.other._joinClauses);
    rel._rawJoins.push(...this.other._rawJoins);
    rel._annotations.push(...this.other._annotations);
    return rel;
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
