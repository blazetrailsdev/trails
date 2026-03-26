/**
 * Tracks table aliases during join construction to avoid conflicts.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker
 */
export class AliasTracker {
  readonly aliases: Map<string, number>;

  constructor(initialCounts?: Map<string, number>) {
    this.aliases = initialCounts ?? new Map();
  }

  aliasFor(tableName: string): string {
    const count = this.aliases.get(tableName) ?? 0;
    if (count === 0) {
      this.aliases.set(tableName, 1);
      return tableName;
    }
    this.aliases.set(tableName, count + 1);
    return `${tableName}_${count}`;
  }
}
