/**
 * Finder methods: find, findBy, first, last, take, exists?, sole.
 * Relation delegates to these static methods.
 *
 * Mirrors: ActiveRecord::FinderMethods
 */
export class FinderMethods {
  static readonly ONE_AS_ONE = "1 AS one" as const;

  static async find(relation: any, ...ids: unknown[]): Promise<any> {
    return relation._performFind(...ids);
  }

  static async findBy(relation: any, conditions: Record<string, unknown>): Promise<any> {
    return relation._performFindBy(conditions);
  }

  static async first(relation: any, n?: number): Promise<any> {
    return relation._performFirst(n);
  }

  static async last(relation: any, n?: number): Promise<any> {
    return relation._performLast(n);
  }

  static async take(relation: any, limit?: number): Promise<any> {
    return relation._performTake(limit);
  }

  static async sole(relation: any): Promise<any> {
    return relation._performSole();
  }

  static async exists(relation: any, conditions?: Record<string, unknown>): Promise<boolean> {
    return relation._performExists(conditions);
  }
}
