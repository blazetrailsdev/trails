/**
 * PostgreSQL explain pretty printer — formats EXPLAIN output.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::ExplainPrettyPrinter
 */

import type { Result } from "../../result.js";

export class ExplainPrettyPrinter {
  /**
   * Pretty prints the result of an EXPLAIN in a way that resembles the output of the
   * PostgreSQL shell:
   *
   *                                     QUERY PLAN
   *   ------------------------------------------------------------------------------
   *    Nested Loop Left Join  (cost=0.00..37.24 rows=8 width=0)
   *      Join Filter: (posts.user_id = users.id)
   *      ->  Index Scan using users_pkey on users  (cost=0.00..8.27 rows=1 width=4)
   *            Index Cond: (id = 1)
   *      ->  Seq Scan on posts  (cost=0.00..28.88 rows=8 width=4)
   *            Filter: (posts.user_id = 1)
   *   (6 rows)
   */
  pp(result: Result): string {
    const header = result.columns[0];
    const lines = result.rows.map((row) => String(row[0]));

    // We add 2 because there's one char of padding at both sides, note
    // the extra hyphens in the example above.
    const width = Math.max(...[header, ...lines].map((line) => line.length)) + 2;

    const pp: string[] = [];

    // Ruby's `center` splits the padding floor-left / ceil-right and `rstrip`
    // then drops the right half, so only the left padding survives.
    pp.push(" ".repeat(Math.floor((width - header.length) / 2)) + header);
    pp.push("-".repeat(width));

    pp.push(...lines.map((line) => ` ${line}`));

    const nrows = result.rows.length;
    const rowsLabel = nrows === 1 ? "row" : "rows";
    pp.push(`(${nrows} ${rowsLabel})`);

    return pp.join("\n") + "\n";
  }
}
