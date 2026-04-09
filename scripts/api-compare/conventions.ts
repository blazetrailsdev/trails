/**
 * Shared naming conventions for Ruby → TypeScript mapping.
 * Used by compare.ts and lint-deps.ts.
 */

import * as path from "path";

export function snakeToCamel(name: string): string {
  // Preserve leading underscores (e.g., _load_from → _loadFrom)
  const match = name.match(/^(_+)/);
  const prefix = match ? match[1] : "";
  const rest = name.slice(prefix.length);
  return prefix + rest.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/** Ruby file path → expected TS file path (kebab-case, .ts extension) */
export function rubyFileToTs(rubyFile: string): string {
  const dir = path.dirname(rubyFile);
  const base = path.basename(rubyFile, ".rb");
  const kebab = base.replace(/_/g, "-");
  const tsFile = kebab.replace(/\berb\b/g, "ejs") + ".ts";
  if (dir === ".") return tsFile;
  const tsDir = dir
    .split("/")
    .map((d) => d.replace(/_/g, "-").replace(/\berb\b/g, "ejs"))
    .join("/");
  return path.join(tsDir, tsFile);
}

export const OPERATORS = new Set([
  "[]",
  "[]=",
  "==",
  "===",
  "!=",
  "<=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "~",
  "!",
  "!~",
  "=~",
  ">>",
  "<<",
  "~@",
]);

export const SKIP = new Set([
  "dup",
  "clone",
  "freeze",
  "hash",
  "inspect",
  "pretty_print",
  "object_id",
  "class",
  "send",
  "public_send",
  "tap",
  "then",
  "yield_self",
  "respond_to?",
  "respond_to_missing?",
  "method_missing",
  "is_a?",
  "kind_of?",
  "instance_of?",
  "nil?",
  "equal?",
  "eql?",
  "instance_variable_get",
  "instance_variable_set",
  "instance_variables",
  "initialize_copy",
  "initialize_dup",
  "initialize_clone",
  "encode_with",
  "init_with",
  "to_ary",
  "to_a",
  "to_i",
  "to_f",
  "to_h",
  "to_hash",
  "to_r",
  "to_c",
  // Ruby module lifecycle hooks — no TypeScript equivalent
  "extended",
  "included",
  "inherited",
]);

/**
 * Convert Ruby method name → candidate TS names to try matching.
 * Returns null if the method should be skipped entirely.
 * Returns multiple candidates for predicates where both forms are common:
 *   has_attribute? → ["hasAttribute", "isHasAttribute"]
 *   supports_savepoints? → ["supportsSavepoints", "isSupportsSavepoints"]
 *   valid? → ["isValid", "valid"]
 */
export function rubyMethodToTs(name: string): string[] | null {
  if (OPERATORS.has(name)) return null;
  if (SKIP.has(name)) return null;
  if (name === "initialize" || name === "new") return ["constructor"];
  if (name === "to_s" || name === "to_str") return ["toString"];
  if (name === "to_json") return ["toJSON"];
  if (name === "to_sql") return ["toSql"];

  if (name.endsWith("?")) {
    const base = name.slice(0, -1);
    const camel = snakeToCamel(base);
    const isPrefixed = "is" + camel.replace(/^./, (c) => c.toUpperCase());
    // If base already starts with a predicate word, try without "is" prefix first
    if (/^(has|supports|can|should|needs|includes|responds|allows|uses)/.test(camel)) {
      return [camel, isPrefixed];
    }
    return [isPrefixed, camel];
  }

  if (name.endsWith("!")) {
    const base = name.slice(0, -1);
    return [snakeToCamel(base) + "Bang"];
  }

  if (name.endsWith("=")) {
    const base = name.slice(0, -1);
    return [snakeToCamel(base)];
  }

  return [snakeToCamel(name)];
}
