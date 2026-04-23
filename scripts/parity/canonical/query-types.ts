export interface CanonicalQuery {
  version: 1;
  /** Fixture identifier, e.g. "arel-01" */
  fixture: string;
  /** ISO 8601 UTC — the time both sides were frozen to */
  frozenAt: string;
  /** SQL produced by to_sql / toSql() on the query expression */
  sql: string;
  /** Ordered bind values, all stringified. Empty when no binds. */
  binds: string[];
}
