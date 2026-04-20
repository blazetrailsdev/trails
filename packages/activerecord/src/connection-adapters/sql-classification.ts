/**
 * SQL statement classification — shared utilities for determining
 * whether a SQL statement is a read or write query.
 *
 * Used by both AbstractAdapter and DatabaseStatements module to avoid
 * duplicating the logic.
 */

const READ_ONLY_STATEMENTS =
  /^(SELECT|EXPLAIN|PRAGMA|SHOW|SET|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|DESCRIBE|DESC|USE|KILL)$/;

/**
 * Strip SQL block comments and line comments.
 */
export function stripSqlComments(sql: string): string {
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result
    .split("\n")
    .map((line) => {
      const match = line.match(/(^|[\s])--.*/);
      if (!match || match.index === undefined) return line;
      return line.slice(0, match.index + match[1].length);
    })
    .join("\n");
  return result;
}

/**
 * Determine whether a SQL statement is a write query.
 * Handles comments, leading parentheses, and WITH/CTE clauses.
 *
 * Mirrors the logic in AbstractAdapter#isWriteQuery.
 */
export function isWriteQuerySql(sql: string): boolean {
  const stripped = stripSqlComments(sql).replace(/^\s*\(+\s*/, "");

  const match = stripped.match(/^\s*([A-Z]+)\b/i);
  if (!match) return true;
  const stmt = match[1].toUpperCase();

  if (READ_ONLY_STATEMENTS.test(stmt)) return false;
  if (stmt !== "WITH") return true;

  // CTE: check the statement after the WITH clause
  const afterWith = stripped.replace(/^\s*WITH\b/i, "").replace(/\([^)]*\)/g, "");
  const innerMatch = afterWith.match(/\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i);
  return !innerMatch || innerMatch[1].toUpperCase() !== "SELECT";
}
