export interface LocalEntry {
  name: string;
  defaultExpr: string | null;
  rest?: boolean;
  bound?: boolean;
}

export class LocalsSignatureError extends Error {}

// prettier-ignore
const RESERVED_NAMES = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "implements",
  "interface", "let", "package", "private", "protected", "public",
  "static", "await",
  "eval", "arguments",
]);

// prettier-ignore
const EMITTER_RESERVED = new Set([
  "context", "locals", "localAssigns", "_ob", "__view", "__lookup", "__block",
  "__allowedKeys", "__extraKeys", "__missingKeys",
]);

function isBindableLocalName(name: string): boolean {
  return !RESERVED_NAMES.has(name) && !EMITTER_RESERVED.has(name);
}

export function parseLocalsSignature(sig: string): LocalEntry[] {
  if (sig === "**nil" || sig.trim() === "") return [];
  const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const parts: string[] = [];
  const stack: string[] = [];
  let quote: '"' | "'" | "`" | null = null;
  let buf = "";
  for (let i = 0; i < sig.length; i++) {
    const ch = sig[i];
    if (quote !== null) {
      buf += ch;
      if (ch === "\\" && i + 1 < sig.length) {
        buf += sig[i + 1];
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
    if (ch === "(" || ch === "[" || ch === "{") stack.push(CLOSERS[ch]);
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
    const rest = /^\*\*([A-Za-z_$][\w$]*)$/u.exec(trimmed);
    if (rest) {
      entries.push({
        name: rest[1],
        defaultExpr: null,
        rest: true,
        bound: isBindableLocalName(rest[1]),
      });
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon === -1 || /^[&*]|^[\w$]+\s*=/u.test(trimmed)) continue;
    const name = trimmed.slice(0, colon).trim();
    if (!/^[A-Za-z_$][\w$]*$/u.test(name)) {
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
    entries.push({
      name,
      defaultExpr: tail === "" ? null : tail,
      bound: isBindableLocalName(name),
    });
  }
  return entries;
}
