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
  // Match runs of `_` followed by any letter or digit so Ruby names with
  // capitalized segments (e.g. `visit_Arel_Nodes_SelectStatement`) OR
  // doubled underscores (Ruby's private-alias-target convention, e.g.
  // `visit__regexp`, `visit__no_edges`) collapse to the same camelCase
  // shape — `visit_Arel_Nodes_X → visitArelNodesX`,
  // `visit__regexp → visitRegexp`, `visit__no_edges → visitNoEdges`.
  return prefix + rest.replace(/_+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Ruby file path → expected TS file path (kebab-case, .ts extension).
 *
 * Uses `path.posix.*` so the mapping stays cross-platform stable —
 * Ruby source paths are POSIX, the rest of api-compare keys files by
 * POSIX paths, and the default `path.join` would return backslashes
 * on Windows.
 */
export function rubyFileToTs(rubyFile: string): string {
  const dir = path.posix.dirname(rubyFile);
  const base = path.posix.basename(rubyFile, ".rb");
  const kebab = base.replace(/_/g, "-");
  const tsFile = kebab.replace(/\berb\b/g, "ejs") + ".ts";
  if (dir === ".") return tsFile;
  const tsDir = dir
    .split("/")
    .map((d) => d.replace(/_/g, "-").replace(/\berb\b/g, "ejs"))
    .join("/");
  return path.posix.join(tsDir, tsFile);
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
 *
 * Returns null if the method should be skipped entirely. Otherwise
 * returns one or more candidate TS names; compare.ts matches the first
 * candidate found in the target file's symbol set.
 *
 * Predicate naming policy:
 *   - `is_*?` returns ONLY the camel form (`is_number?` → ["isNumber"]).
 *     The doubled `isIsNumber` form is always redundant — Ruby already
 *     conveys the predicate via the `is_` prefix.
 *   - Other already-predicate prefixes (`has_*?`, `supports_*?`,
 *     `can_*?`, …) keep BOTH the camel form and the isPrefixed form
 *     (`has_attribute?` → ["hasAttribute", "isHasAttribute"]). The
 *     isPrefixed fallback exists because trails sometimes needs the
 *     disambiguating alias when the bare name collides with a Rails
 *     macro — e.g. Reflection exposes `isHasOne()` alongside the
 *     `Model.hasOne` association declaration.
 *   - Bare predicates (`valid?`, `blank?`) return both forms with the
 *     isPrefixed form first (`valid?` → ["isValid", "valid"]).
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
    // Names already starting with `is_` collapse to one candidate so
    // `is_number?` → ["isNumber"] (not ["isIsNumber", "isNumber"]).
    // The `isPrefixed` form is intentionally NOT offered as a fallback
    // here — Ruby already conveys the predicate via the `is_` prefix,
    // and offering `isIsNumber` would let a trails author land that
    // doubled form and still get api:compare credit. Test on the Ruby
    // base name (with the underscore) so e.g. `isolation_level?` —
    // which camelizes to `isolationLevel` — is NOT swept into this
    // branch.
    if (base.startsWith("is_")) {
      return [camel];
    }
    // Other already-predicate Ruby prefixes (has_one?, supports_x?,
    // can_y?, …) keep both candidates: the canonical camel form
    // (`hasOne`) and the isPrefixed fallback (`isHasOne`). The
    // fallback exists because trails sometimes needs the disambiguating
    // alias when the bare name collides with a macro (e.g. Reflection
    // exposes `isHasOne()` as a predicate alongside the `Model.hasOne`
    // association declaration).
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
