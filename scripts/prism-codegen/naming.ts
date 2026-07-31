import { rubyMethodToTs, snakeToCamel, rubyFileToTs } from "../api-compare/conventions.js";
export { snakeToCamel, rubyFileToTs };
export function methodName(rubyName: string): string {
  const candidates = rubyMethodToTs(rubyName);
  if (candidates && candidates.length) return candidates[0];
  return snakeToCamel(rubyName.replace(/[?!=]/g, ""));
}
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
export function isJsIdentName(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
}
export function isBindableIdent(s: string): boolean {
  return isJsIdentName(s) && !RESERVED.has(s);
}
export function tsToRubyFile(tsPath: string, rubyCandidates: string[]): string | undefined {
  const tail = tsPath
    .replace(/\\/g, "/")
    .replace(/^.*?\/src\//, "")
    .replace(/^activerecord\//, "");
  return rubyCandidates.find((rb) => {
    const full = rubyFileToTs(rb);
    const short = rubyFileToTs(rb.replace(/^active_record\//, ""));
    return full === tail || short === tail || full.endsWith(tail) || short.endsWith(tail);
  });
}
