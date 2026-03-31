/**
 * Handles polymorphic association queries by grouping values by type
 * and building separate queries for each type.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::PolymorphicArrayValue
 *
 * Examples:
 *   where({ commentable: [post, image] })
 *     → (commentable_type = 'Post' AND commentable_id = 1)
 *        OR (commentable_type = 'Image' AND commentable_id = 2)
 */
export class PolymorphicArrayValue {
  private foreignKey: string;
  private foreignType: string;
  private values: unknown[];

  constructor(foreignKey: string, foreignType: string, values: unknown[]) {
    this.foreignKey = foreignKey;
    this.foreignType = foreignType;
    this.values = values;
  }

  queries(): Record<string, unknown>[] {
    if (this.values.length === 0) {
      return [{ [this.foreignKey]: this.values }];
    }

    const typeToIds = new Map<string | null, unknown[]>();

    for (const value of this.values) {
      const typeName = this.klassName(value);
      const id = this.convertToId(value);
      if (!typeToIds.has(typeName)) {
        typeToIds.set(typeName, []);
      }
      typeToIds.get(typeName)!.push(id);
    }

    const result: Record<string, unknown>[] = [];
    for (const [type, ids] of typeToIds) {
      const query: Record<string, unknown> = {};
      query[this.foreignType] = type;
      query[this.foreignKey] = ids.length === 1 ? ids[0] : ids;
      result.push(query);
    }
    return result;
  }

  private klassName(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value !== null) {
      const ctor = (value as any).constructor;
      if (!ctor) return null;
      // For STI, use baseClass name (Rails stores the base class in the type column)
      const baseClass = (ctor as any).baseClass;
      if (baseClass?.name) return baseClass.name;
      if (ctor.name) return ctor.name;
    }
    return null;
  }

  private convertToId(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value !== null && "id" in value) {
      return (value as any).id;
    }
    return value;
  }
}
