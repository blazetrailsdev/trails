/**
 * Regex-based TypeScript → JavaScript transpiler for the service worker.
 * Strips type annotations, interfaces, and type-only imports so that
 * .ts files can be served as executable JS without a full compiler.
 */
export function stripTypes(code: string): string {
  // Remove import/export type statements
  code = code.replace(/^\s*(import|export)\s+type\s+[^;]*;?\s*$/gm, "");

  // Remove type keyword from mixed imports: import { type Foo, Bar } → import { Bar }
  code = code.replace(/,?\s*type\s+\w+/g, (match, offset, str) => {
    const before = str.lastIndexOf("{", offset);
    const after = str.indexOf("}", offset);
    if (before !== -1 && after !== -1 && before < offset && after > offset) return "";
    return match;
  });

  // Remove type annotations `: Type` before , ) = ; { newline
  // A single type atom: primitive, generic class, or generic built-in
  const primitives = "string|number|boolean|any|void|unknown|never|null|undefined";
  const atom = `(?:${primitives}|Record<[^>]*>|Array<[^>]*>|Promise<[^>]*>|Map<[^>]*>|Set<[^>]*>|[A-Z]\\w*(?:<[^>]*>)?(?:\\[\\])?)`;
  const typePattern = new RegExp(`:\\s*${atom}(?:\\s*\\|\\s*${atom})*\\s*(?=[,)=;\\n{])`, "g");
  code = code.replace(typePattern, " ");

  // Remove `as Type` casts
  code = code.replace(
    /\s+as\s+(?:const|string|number|boolean|any|unknown|[A-Z]\w*(?:<[^>]*>)?)/g,
    "",
  );

  // Remove interface/type alias declarations (single-line and multi-line)
  code = code.replace(/^\s*(?:export\s+)?(?:interface|type)\s+\w+[^{]*\{[^}]*\}\s*;?\s*$/gm, "");

  // Remove generic type params from function/class: foo<T>( → foo(
  code = code.replace(/<\w+(?:\s*,\s*\w+)*(?:\s+extends\s+[^>]+)?>\s*\(/g, "(");

  // Remove `!` non-null assertions
  code = code.replace(/(\w)!/g, "$1");

  // Remove empty import/export clauses left after stripping type specifiers
  code = code.replace(/^\s*import\s*\{\s*\}\s*from\s*["'][^"']+["']\s*;?\s*$/gm, "");
  code = code.replace(/^\s*export\s*\{\s*\}\s*(?:from\s*["'][^"']+["'])?\s*;?\s*$/gm, "");

  return code;
}
