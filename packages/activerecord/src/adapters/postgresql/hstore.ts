/**
 * PostgreSQL hstore parsing and serialization.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Hstore
 */

/**
 * Parse a PG hstore string into a JS object.
 * Format: "key1"=>"val1", "key2"=>"val2"
 * NULL values (unquoted) become null.
 */
export function parseHstore(input: string): Record<string, string | null> {
  if (!input || input.trim() === "") return {};

  const result: Record<string, string | null> = {};
  let i = 0;

  while (i < input.length) {
    // Skip whitespace and commas
    while (i < input.length && (input[i] === " " || input[i] === ",")) i++;
    if (i >= input.length) break;

    // Parse key (always quoted)
    const key = parseQuotedString();
    if (key === null) break;

    // Skip =>
    while (i < input.length && input[i] === " ") i++;
    if (input[i] === "=" && input[i + 1] === ">") i += 2;
    while (i < input.length && input[i] === " ") i++;

    // Parse value (quoted or NULL)
    if (input.substring(i, i + 4) === "NULL") {
      result[key] = null;
      i += 4;
    } else {
      const value = parseQuotedString();
      result[key] = value;
    }
  }

  return result;

  function parseQuotedString(): string | null {
    if (i >= input.length || input[i] !== '"') return null;
    i++; // skip opening quote
    let s = "";
    while (i < input.length && input[i] !== '"') {
      if (input[i] === "\\") {
        i++;
        if (i < input.length) {
          if (input[i] === "n") {
            s += "\n";
          } else if (input[i] === "r") {
            s += "\r";
          } else if (input[i] === "t") {
            s += "\t";
          } else {
            s += input[i];
          }
        }
      } else {
        s += input[i];
      }
      i++;
    }
    i++; // skip closing quote
    return s;
  }
}

/**
 * Serialize a JS object to PG hstore string literal.
 */
export function serializeHstore(obj: Record<string, string | null>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const quotedKey = `"${escapeHstore(key)}"`;
    if (value === null) {
      pairs.push(`${quotedKey}=>NULL`);
    } else {
      pairs.push(`${quotedKey}=>"${escapeHstore(value)}"`);
    }
  }
  return pairs.join(", ");
}

function escapeHstore(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
