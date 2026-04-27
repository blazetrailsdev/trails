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
  private _associatedTable: {
    joinForeignKey: string;
    joinPrimaryKey?: string;
    joinPrimaryType?: string;
    polymorphicNameAssociation?: string;
  } | null = null;

  constructor(foreignKey: string, value: unknown) {
    this.foreignKey = foreignKey;
    this.value = value;
  }

  private get associatedTable() {
    return this._associatedTable;
  }

  private primaryKey(): string {
    return this._associatedTable?.joinPrimaryKey ?? "id";
  }

  private primaryType(): string | null {
    return this._associatedTable?.joinPrimaryType ?? null;
  }

  private polymorphicName(): string | null {
    return this._associatedTable?.polymorphicNameAssociation ?? null;
  }

  private isSelectClause(): boolean {
    if (!this.value) return false;
    const sv = (this.value as any).selectValues;
    if (typeof sv === "function") return sv.call(this.value).length === 0;
    if (Array.isArray(sv)) return sv.length === 0;
    return false;
  }

  private isPolymorphicClause(): boolean {
    const type = this.primaryType();
    if (!type) return false;
    if (this.value && typeof (this.value as any).whereValuesHash === "function") {
      return !Object.prototype.hasOwnProperty.call((this.value as any).whereValuesHash(), type);
    }
    return false;
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
