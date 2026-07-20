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
 */
export function statementIsReader(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    /^(SELECT|WITH|EXPLAIN|VALUES|TABLE)\b/.test(upper) ||
    (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(upper) && /\bRETURNING\b/.test(upper)) ||
    (/^PRAGMA\b/.test(upper) && !upper.includes("="))
  );
}
