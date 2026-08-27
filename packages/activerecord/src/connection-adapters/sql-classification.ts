const READ_ONLY_STATEMENTS =
  /^(SELECT|EXPLAIN|PRAGMA|SHOW|SET|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|DESCRIBE|DESC|USE|KILL|CLOSE|DECLARE|FETCH|MOVE)$/;

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

export function isWriteQuerySql(sql: string): boolean {
  const stripped = stripSqlComments(sql).replace(/^\s*\(+\s*/, "");

  const match = stripped.match(/^\s*([A-Z]+)\b/i);
  if (!match) return true;
  const stmt = match[1].toUpperCase();

  if (READ_ONLY_STATEMENTS.test(stmt)) return false;
  if (stmt !== "WITH") return true;

  const afterWith = stripped.replace(/^\s*WITH\b/i, "").replace(/\([^)]*\)/g, "");
  const innerMatch = afterWith.match(/\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i);
  return !innerMatch || innerMatch[1].toUpperCase() !== "SELECT";
}
