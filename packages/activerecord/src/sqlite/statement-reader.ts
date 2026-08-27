/**
 * @noRailsEquivalent PERMANENT Rails branches on stmt.column_count (sqlite3/database_statements.rb:38), which the drivers without column metadata do not expose, so the classification is approximated here.
 */

/**
 * Row-returning classification for drivers that cannot report a prepared
 * statement's real column count.
 *
 * Rails branches `.all()` vs `.run()` on `stmt.column_count.zero?`
 * (sqlite3/database_statements.rb). Drivers that expose column metadata
 * (better-sqlite3, libsql, node:sqlite) should use that directly; this
 * keyword approximation exists only for drivers that expose nothing
 * (expo-sqlite). A write with a RETURNING clause has a nonzero column count
 * in SQLite, so it must classify as a reader too.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE approximates `stmt.column_count.zero?` (sqlite3/database_statements.rb:38) for drivers that expose no column metadata.
 */
export function statementIsReader(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    /^(SELECT|WITH|EXPLAIN|VALUES|TABLE)\b/.test(upper) ||
    (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(upper) && /\bRETURNING\b/.test(upper)) ||
    (/^PRAGMA\b/.test(upper) && !upper.includes("="))
  );
}
