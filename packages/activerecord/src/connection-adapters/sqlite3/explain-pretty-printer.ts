/**
 * SQLite3 explain pretty printer — formats EXPLAIN QUERY PLAN output.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::ExplainPrettyPrinter
 */

export interface ExplainResult {
  rows: Array<Array<unknown>>;
}

export class ExplainPrettyPrinter {
  /**
   * Pretty prints the result of an EXPLAIN QUERY PLAN in a way that resembles
   * the output of the SQLite shell:
   *
   *     0|0|0|SEARCH TABLE users USING INTEGER PRIMARY KEY (rowid=?) (~1 rows)
   *     0|1|1|SCAN TABLE posts (~100000 rows)
   */
  pp(result: ExplainResult): string {
    return result.rows.map((row) => row.join("|")).join("\n") + "\n";
  }
}
