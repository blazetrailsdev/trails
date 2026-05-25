/** Parse the body of a `<%# locals: (...) %>` magic comment into named entries. */

export interface LocalEntry {
  name: string;
  defaultExpr: string | null;
}

export class LocalsSignatureError extends Error {}

// Words reserved in ES strict mode + module context — would crash
// `const { <name> } = locals;` at parse or runtime.
// prettier-ignore
const RESERVED_NAMES = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "implements",
  "interface", "let", "package", "private", "protected", "public",
  "static", "await",
  // async is a contextual keyword, not reserved — `const { async } = x;` is valid.
  // Restricted identifiers in strict mode — `const { eval } = x;` is a syntax error in ESM.
  "eval", "arguments",
]);

// Names used as parameters or internal bindings in the generated render function.
// Declaring a local with any of these names would produce a duplicate-declaration
// SyntaxError or shadow the binding in a way that breaks the emitted code.
// prettier-ignore
const EMITTER_RESERVED = new Set([
  "context", "locals", "_ob",       // render() parameters / output-buffer binding
  "__allowedKeys", "__extraKeys",    // strict-locals check bindings
]);

function isUsableLocalName(name: string): boolean {
  if (!/^[A-Za-z_$][\w$]*$/u.test(name)) return false;
  if (RESERVED_NAMES.has(name)) return false;
  return !EMITTER_RESERVED.has(name);
}

export function parseLocalsSignature(sig: string): LocalEntry[] {
  if (sig === "**nil" || sig.trim() === "") return [];
  const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const parts: string[] = [];
  const stack: string[] = [];
  let quote: '"' | "'" | "`" | null = null;
  let buf = "";
  for (let i = 0; i < sig.length; i++) {
    const ch = sig[i]!;
    if (quote !== null) {
      buf += ch;
      if (ch === "\\" && i + 1 < sig.length) {
        buf += sig[i + 1]!;
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "," && stack.length === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") stack.push(CLOSERS[ch]!);
    else if (ch === ")" || ch === "]" || ch === "}") {
      const expected = stack.pop();
      if (expected !== ch) {
        throw new LocalsSignatureError(
          `mismatched \`${ch}\` (expected \`${expected ?? "<none>"}\`) in locals signature ${JSON.stringify(sig)}`,
        );
      }
    }
    buf += ch;
  }
  if (quote !== null) {
    throw new LocalsSignatureError(
      `unterminated ${quote === "`" ? "template literal" : "string"} in locals signature ${JSON.stringify(sig)}`,
    );
  }
  if (stack.length !== 0) {
    throw new LocalsSignatureError(
      `unbalanced brackets in locals signature ${JSON.stringify(sig)}`,
    );
  }
  if (buf.trim() !== "") parts.push(buf);

  const entries: LocalEntry[] = [];
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "**nil") continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      throw new LocalsSignatureError(
        `malformed locals entry ${JSON.stringify(trimmed)} — expected \`name:\` or \`name: default\``,
      );
    }
    const name = trimmed.slice(0, colon).trim();
    if (!isUsableLocalName(name)) {
      throw new LocalsSignatureError(
        `invalid local name ${JSON.stringify(name)} in locals signature ${JSON.stringify(sig)}`,
      );
    }
    if (entries.some((e) => e.name === name)) {
      throw new LocalsSignatureError(
        `duplicate local name ${JSON.stringify(name)} in locals signature ${JSON.stringify(sig)}`,
      );
    }
    const tail = trimmed.slice(colon + 1).trim();
    entries.push({ name, defaultExpr: tail === "" ? null : tail });
  }
  return entries;
}
