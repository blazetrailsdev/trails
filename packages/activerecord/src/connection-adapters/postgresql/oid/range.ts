/**
 * Range — represents a BETWEEN range for where clauses.
 *
 * Usage: User.where({ age: new Range(18, 30) })
 * Generates: WHERE age BETWEEN 18 AND 30
 */
export class Range {
  readonly begin: unknown;
  readonly end: unknown;
  readonly excludeEnd: boolean;

  constructor(begin: unknown, end: unknown, excludeEnd: boolean = false) {
    this.begin = begin;
    this.end = end;
    this.excludeEnd = excludeEnd;
  }
}
