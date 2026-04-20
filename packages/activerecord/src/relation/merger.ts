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
    rel._whereClause = rel._whereClause.merge(this.other._whereClause);
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
    if (!this.other._havingClause.isEmpty()) {
      rel._havingClause = rel._havingClause.merge(this.other._havingClause);
    }
    if (this.other._lockValue) rel._lockValue = this.other._lockValue;
    if (this.other._isReadonly) rel._isReadonly = true;
    if (this.other._isStrictLoading) rel._isStrictLoading = true;
    // `.none()` is sticky — a merged-in relation that was already
    // empty stays empty so callers don't accidentally broaden the
    // result by composing additional state on top. Mirrors Rails'
    // `Relation::Merger#merge` implicitly propagating the null
    // relation's short-circuit; we have to copy it explicitly
    // because our none-check lives on a boolean field.
    if (this.other._isNone) rel._isNone = true;
    rel._joinClauses.push(...this.other._joinClauses);
    rel._rawJoins.push(...this.other._rawJoins);
    rel._annotations.push(...this.other._annotations);
    for (const ref of this.other._referencesValues) {
      if (!rel._referencesValues.includes(ref)) rel._referencesValues.push(ref);
    }
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
