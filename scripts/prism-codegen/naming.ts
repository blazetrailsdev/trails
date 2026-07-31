/**
 * Ruby → JS naming, delegated to the repo's existing api-compare conventions
 * (the source of truth per the spike brief). We reuse `rubyMethodToTs`,
 * `snakeToCamel`, and `rubyFileToTs` rather than inventing a parallel scheme —
 * the only local decision is picking the first candidate from the ambiguous
 * predicate lists api-compare returns.
 */
import { rubyMethodToTs, snakeToCamel, rubyFileToTs } from "../api-compare/conventions.js";

export { snakeToCamel, rubyFileToTs };

/** Method-name identifier for a definition/call site (first candidate wins). */
export function methodName(rubyName: string): string {
  const candidates = rubyMethodToTs(rubyName);
  if (candidates && candidates.length) return candidates[0];
  // Operators / skipped names have no JS surface; keep something legible.
  return snakeToCamel(rubyName.replace(/[?!=]/g, ""));
}

/**
 * JS reserved words (incl. strict-mode, which ES modules always are). A Ruby
 * method named `delete` maps to a perfectly legal *property* name (`x.delete()`,
 * class method `delete() {}`) but NOT to a binding name (`function delete`,
 * `let default`) — the two predicates below keep that distinction.
 */
const RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "await",
]);

/** Syntactically a JS identifier (usable as a property/method name). */
export function isJsIdentName(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}

/** Usable as a BINDING: function/variable/parameter name (not reserved). */
export function isBindableIdent(s: string): boolean {
  return isJsIdentName(s) && !RESERVED.has(s);
}

/**
 * Invert `rubyFileToTs`: given a trails `.ts` path, find the Rails `.rb` file
 * that maps to it. We reuse the forward map rather than build a new one — map
 * each candidate `.rb` and match. The trails path may carry the full
 * `active_record/…` prefix or (as real trails files do) drop it, so we compare
 * against both the full and the `active_record/`-stripped mapping and accept a
 * suffix match. The caller supplies the candidate Rails files.
 */
export function tsToRubyFile(tsPath: string, rubyCandidates: string[]): string | undefined {
  const tail = tsPath
    .replace(/\\/g, "/")
    .replace(/^.*?\/src\//, "")
    .replace(/^activerecord\//, "");
  return rubyCandidates.find((rb) => {
    const full = rubyFileToTs(rb); // active-record/relation/query-methods.ts
    const short = rubyFileToTs(rb.replace(/^active_record\//, "")); // relation/query-methods.ts
    return full === tail || short === tail || full.endsWith(tail) || short.endsWith(tail);
  });
}
