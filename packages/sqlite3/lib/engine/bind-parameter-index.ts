/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export function bindParameterIndex(sql: string, name: string): number {
  const code = stripLiterals(sql);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = name.startsWith("?") ? "" : "[:@$]";
  return new RegExp(`${prefix}${escaped}(?![\\w$])`).test(code) ? 1 : 0;
}

/** @internal */
function stripLiterals(sql: string): string {
  return sql.replace(
    /'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\n]*|\/\*[^]*?(?:\*\/|$)/g,
    " ",
  );
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export function bindParameterNames(sql: string): (string | null)[] {
  const names: (string | null)[] = [];
  for (const [token] of stripLiterals(sql).matchAll(/\?\d*|[:@$][\w$]+/g)) {
    if (token === "?") names.push(null);
    else if (token.startsWith("?")) {
      const i = Number(token.slice(1));
      while (names.length < i) names.push(null);
    } else if (!names.includes(token)) names.push(token);
  }
  return names;
}
