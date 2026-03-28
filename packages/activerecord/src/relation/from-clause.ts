/**
 * FromClause — tracks the FROM source override on a Relation.
 *
 * When `relation.from("subquery")` is called, the FromClause replaces
 * the default table in the generated SQL.
 *
 * Mirrors: ActiveRecord::Relation::FromClause
 */

export class FromClause {
  readonly value: string | null;

  constructor(value: string | null = null) {
    this.value = value;
  }

  static empty(): FromClause {
    return EMPTY;
  }

  isEmpty(): boolean {
    return this.value === null;
  }

  merge(other: FromClause): FromClause {
    if (!other.isEmpty()) return other;
    return this;
  }

  equals(other: FromClause): boolean {
    return this.value === other.value;
  }
}

const EMPTY = new FromClause();
