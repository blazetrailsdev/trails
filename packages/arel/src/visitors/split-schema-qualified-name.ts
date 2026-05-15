/**
 * Split a schema-qualified table name on unquoted dots, preserving
 * double-quoted segments (which may themselves contain dots).
 *
 * @internal
 */
export function splitSchemaQualifiedName(name: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && i + 1 < name.length && name[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "." && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Quote each part of a schema-qualified name with ANSI double-quotes,
 * stripping any existing outer quotes before re-quoting.
 *
 * @internal
 */
export function quoteSchemaQualifiedName(name: string): string {
  return splitSchemaQualifiedName(name)
    .map((part) => {
      const unquoted =
        part.startsWith('"') && part.endsWith('"') && part.length >= 2
          ? part.slice(1, -1).replace(/""/g, '"')
          : part;
      return `"${unquoted.replace(/"/g, '""')}"`;
    })
    .join(".");
}
