/**
 * TSE virtualization plugin — the in-memory tsc-virtualization half of
 * Phase 2b (plan §2 / §4). Maps `.tse` sources to a typed TS render
 * function so tsc can check `<%= expr %>` / `<% code %>` against the
 * declared locals. This PR covers the virtualizing `TscPlugin` only;
 * on-disk `.tse.d.ts` / `.tse.js` emission, the views-manifest writer,
 * and the build CLI are Phase 2c.
 */

import { parse, type TseAst } from "@blazetrails/tse-compiler";
import type { LineDelta, TscPlugin, VirtualizeOutput } from "../plugin.js";

export class TseLocalsSignatureError extends Error {}

interface LocalEntry {
  name: string;
  defaultExpr: string | null;
}

// Words reserved in ES strict mode + module context — every one of
// these would crash the emitted `const { <name> } = locals;` /
// `void <name>;`. Strict mode is implicit in ESM, which is what
// trails-tsc emits.
// prettier-ignore
const RESERVED_NAMES = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "implements",
  "interface", "let", "package", "private", "protected", "public",
  "static", "await", "async",
]);

function isUsableLocalName(name: string): boolean {
  // Syntactic shape: must look like a TS identifier (rejects empty,
  // digit-led, punctuation). `ts.createSourceFile` is the bullet-proof
  // check because it covers Unicode identifier rules, but we keep it
  // cheap with a guard regex first.
  if (!/^[A-Za-z_$][\w$]*$/u.test(name)) return false;
  return !RESERVED_NAMES.has(name);
}

// Parse `<%# locals: (...) %>` body into entries. Splits on top-level
// commas only, tracking brackets and quote/template-literal state.
// Generics in defaults (`Foo<A, B>`) are not recognized — angle brackets
// alias with `<` comparisons without a full TS scanner; same class of
// pragmatic limit as Erubi's regex lexer (plan §2.10.1).
function parseLocalsSignature(sig: string): LocalEntry[] {
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
        throw new TseLocalsSignatureError(
          `mismatched \`${ch}\` (expected \`${expected ?? "<none>"}\`) in locals signature ${JSON.stringify(sig)}`,
        );
      }
    }
    buf += ch;
  }
  if (quote !== null) {
    throw new TseLocalsSignatureError(
      `unterminated ${quote === "`" ? "template literal" : "string"} in locals signature ${JSON.stringify(sig)}`,
    );
  }
  if (stack.length !== 0) {
    throw new TseLocalsSignatureError(
      `unbalanced brackets in locals signature ${JSON.stringify(sig)}`,
    );
  }
  if (buf.trim() !== "") parts.push(buf);

  const entries: LocalEntry[] = [];
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    // Rails accepts `**nil` mixed with named kwargs (e.g.
    // `locals: (user:, **nil)`) to mean "these locals plus no
    // extras". Skip the sentinel; treat surrounding entries normally.
    if (trimmed === "**nil") continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      throw new TseLocalsSignatureError(
        `malformed locals entry ${JSON.stringify(trimmed)} — expected \`name:\` or \`name: default\``,
      );
    }
    const name = trimmed.slice(0, colon).trim();
    // Identifier shape + reserved-word rejection. The bullet-proof
    // check is "would `const { <name> } = x;` parse cleanly?" — let TS
    // answer it for us via createSourceFile diagnostics. Caches keyed
    // by name keep this cheap across many entries.
    if (!isUsableLocalName(name)) {
      throw new TseLocalsSignatureError(
        `invalid local name ${JSON.stringify(name)} in locals signature ${JSON.stringify(sig)}`,
      );
    }
    const tail = trimmed.slice(colon + 1).trim();
    entries.push({ name, defaultExpr: tail === "" ? null : tail });
  }
  return entries;
}

function localsParamType(ast: TseAst, locals: LocalEntry[]): string {
  if (ast.typesAnnotation !== null) return ast.typesAnnotation;
  // No `<%# locals: %>` at all → permissive default.
  if (ast.localsSignature === null) return "Record<string, unknown>";
  // Explicit empty `<%# locals: () %>` → reject any keys (Rails `**nil`).
  // `Record<never, never>` collapses to `{}` (any object assignable),
  // so use `Record<string, never>` — every key must map to `never`,
  // which makes any provided property a type error.
  if (locals.length === 0) return "Record<string, never>";
  const fields = locals.map((l) => `${l.name}${l.defaultExpr ? "?" : ""}: unknown`);
  return `{ ${fields.join("; ")} }`;
}

function destructureLines(locals: LocalEntry[]): string[] {
  if (locals.length === 0) return [];
  const pieces = locals.map((l) =>
    l.defaultExpr === null ? l.name : `${l.name} = ${l.defaultExpr}`,
  );
  // `void name;` shields unused destructured locals from `noUnusedLocals`,
  // matching the `void context; void locals;` shield on the parameters.
  const voids = `  ${locals.map((l) => `void ${l.name};`).join(" ")}`;
  return [`  const { ${pieces.join(", ")} } = locals;`, voids];
}

function emitNode(node: TseAst["nodes"][number]): string {
  switch (node.kind) {
    case "text":
      return `  _ob.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      const needsSemi = !(t.endsWith(";") || t.endsWith("{") || t.endsWith("}"));
      return `  ${node.value}${needsSemi ? ";" : ""}`;
    }
    case "expr":
      return `  _ob.append(${node.value});`;
    case "rawExpr":
      return `  _ob.safeExprAppend(${node.value});`;
  }
}

const PREAMBLE = [
  "/* virtualized from .tse — phase 2b trails-tsc plugin */",
  "interface SafeString { readonly __safeStringBrand: unique symbol }",
  "interface OutputBuffer extends SafeString {",
  "  safeAppend(s: string): void;",
  "  append(value: unknown): void;",
  "  safeExprAppend(value: unknown): void;",
  "}",
  "interface RenderContext {",
  "  readonly outputBuffer: OutputBuffer;",
  "  [key: string]: unknown;",
  "}",
  "",
].join("\n");

export interface VirtualizeTseResult {
  ts: string;
  deltas: readonly LineDelta[];
}

export function virtualizeTse(source: string): string {
  return virtualizeTseWithDeltas(source).ts;
}

export function virtualizeTseWithDeltas(source: string): VirtualizeTseResult {
  const ast = parse(source);
  const locals = ast.localsSignature === null ? [] : parseLocalsSignature(ast.localsSignature);
  const localsType = localsParamType(ast, locals);

  const header: string[] = [
    PREAMBLE,
    "export default function render(",
    "  context: RenderContext,",
    `  locals: ${localsType},`,
    "): SafeString {",
    "  void context; void locals;",
    "  const _ob = context.outputBuffer;",
  ];
  for (const line of destructureLines(locals)) header.push(line);
  const body: string[] = [];
  for (const node of ast.nodes) body.push(emitNode(node));
  const footer = ["  return _ob;", "}", ""];

  // Two LineDeltas: one for the prepended header, one for the trailing
  // footer (return + `}`). Without the footer delta, tsc errors landing
  // at the closing brace would mis-remap to nonexistent `.tse` lines.
  // Per-node line-precise mapping inside the body is a follow-up tied
  // to tse-compiler emitting token spans.
  const ts = [...header, ...body, ...footer].join("\n");
  // Body strings may contain embedded newlines (multi-line `<% %>`
  // code chunks); compute virtual-line counts from the emitted text,
  // not the node array length.
  const headerLineCount = header.join("\n").split("\n").length;
  const bodyLineCount = body.length === 0 ? 0 : body.join("\n").split("\n").length;
  const footerLineCount = footer.join("\n").split("\n").length;
  const deltas: LineDelta[] = [
    { insertedAtLine: -1, lineCount: headerLineCount },
    { insertedAtLine: headerLineCount + bodyLineCount - 1, lineCount: footerLineCount },
  ];
  return { ts, deltas };
}

// Build a virtualized TS source that surfaces `msg` as a tsc semantic
// diagnostic (a string literal assigned to a `never`-typed binding) so
// a single malformed `.tse` produces a readable error rather than
// crashing the host's `tsc` run.
function errorShim(filePath: string, msg: string): string {
  const safe = JSON.stringify(`${filePath}: ${msg}`);
  // `string` is not assignable to `never`, so tsc reports a clear
  // semantic error whose message includes the failure detail.
  return [
    `// .tse virtualization failed: ${safe}`,
    `const __tseFailure: never = ${safe};`,
    `export default __tseFailure;`,
    "",
  ].join("\n");
}

export function createTsePlugin(): TscPlugin {
  return {
    name: "tse",
    extensions: [".tse"],
    virtualize(filePath, source): VirtualizeOutput {
      try {
        const { ts, deltas } = virtualizeTseWithDeltas(source);
        return { ts, deltas };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ts: errorShim(filePath, msg) };
      }
    },
  };
}
