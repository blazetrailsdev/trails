/** @noRailsEquivalent PERMANENT */

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function statementIsReader(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    /^(SELECT|WITH|EXPLAIN|VALUES|TABLE)\b/.test(upper) ||
    (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(upper) && /\bRETURNING\b/.test(upper)) ||
    (/^PRAGMA\b/.test(upper) && !upper.includes("="))
  );
}
