/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite3-retire-the-sqlite-driver-interfaces
 */
export function bindParameterIndex(sql: string, name: string): number {
  const code = sql.replace(
    /'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\n]*|\/\*[^]*?(?:\*\/|$)/g,
    " ",
  );
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = /^\d+$/.test(name) ? "\\?" : "[:@$]";
  return new RegExp(`${prefix}${escaped}(?![\\w$])`).test(code) ? 1 : 0;
}
