/**
 * Calculation methods: count, sum, average, minimum, maximum, pluck, pick, ids.
 * These are mixed into Relation in Rails. Here, Relation delegates to these
 * static methods, passing itself as the first argument.
 *
 * Mirrors: ActiveRecord::Calculations
 */
export class Calculations {
  static async count(relation: any, column?: string): Promise<number | Record<string, number>> {
    return relation._performCount(column);
  }

  static async sum(relation: any, column?: string): Promise<number | Record<string, number>> {
    return relation._performSum(column);
  }

  static async average(
    relation: any,
    column: string,
  ): Promise<number | null | Record<string, number>> {
    return relation._performAverage(column);
  }

  static async minimum(
    relation: any,
    column: string,
  ): Promise<unknown | null | Record<string, unknown>> {
    return relation._performMinimum(column);
  }

  static async maximum(
    relation: any,
    column: string,
  ): Promise<unknown | null | Record<string, unknown>> {
    return relation._performMaximum(column);
  }
}

/**
 * Tracks column aliases during calculation queries to avoid
 * conflicts when multiple aggregates are computed.
 *
 * Mirrors: ActiveRecord::Calculations::ColumnAliasTracker
 */
export class ColumnAliasTracker {
  private _aliases: Map<string, number> = new Map();

  aliasFor(column: string): string {
    const count = this._aliases.get(column) ?? 0;
    this._aliases.set(column, count + 1);
    if (count === 0) return column;
    return `${column}_${count}`;
  }
}
