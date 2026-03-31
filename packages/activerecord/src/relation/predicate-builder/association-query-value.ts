/**
 * Converts association-based where conditions into foreign key queries.
 * When you write `where({ author: authorRecord })`, this extracts
 * the foreign key and converts it to `where({ author_id: authorRecord.id })`.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::AssociationQueryValue
 *
 * Examples:
 *   where({ author: author })  → { author_id: author.id }
 *   where({ author: [a1, a2] }) → { author_id: [a1.id, a2.id] }
 */
export class AssociationQueryValue {
  private foreignKey: string;
  private value: unknown;

  constructor(foreignKey: string, value: unknown) {
    this.foreignKey = foreignKey;
    this.value = value;
  }

  queries(): Record<string, unknown>[] {
    return [{ [this.foreignKey]: this.ids() }];
  }

  private ids(): unknown {
    const value = this.value;
    if (Array.isArray(value)) {
      return value.map((v) => this.convertToId(v));
    }
    return this.convertToId(value);
  }

  private convertToId(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "object" && value !== null && "id" in value) {
      return (value as any).id;
    }
    return value;
  }
}
