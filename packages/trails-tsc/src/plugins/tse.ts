/**
 * TSE virtualization plugin — the in-memory tsc-virtualization half of
 * Phase 2b (plan §2 / §4). Maps `.tse` sources to a typed TS render
 * function so tsc can check `<%= expr %>` / `<% code %>` against the
 * declared locals. This PR covers the virtualizing `TscPlugin` only;
 * on-disk `.tse.d.ts` / `.tse.js` emission, the views-manifest writer,
 * and the build CLI are Phase 2c.
 */

import {
  parse,
  parseLocalsSignature,
  LocalsSignatureError,
  type TseAst,
  type LocalEntry,
} from "@blazetrails/tse-compiler";
import type { LineDelta, TscPlugin, VirtualizeOutput } from "../plugin.js";

export { parseLocalsSignature };
// TseLocalsSignatureError is the name this module previously used.
export { LocalsSignatureError as TseLocalsSignatureError };

export function localsParamType(ast: TseAst, locals: LocalEntry[]): string {
  if (ast.typesAnnotation !== null) return ast.typesAnnotation;
  // No `<%# locals: %>` at all → permissive default (no strict check).
  if (ast.localsSignature === null) return "Record<string, unknown>";
  // Explicit empty `<%# locals: () %>` → reject any keys (Rails `**nil`).
  // `Record<string, never>` makes every key map to `never` — any property is
  // a type error. Wrap in NoExtraKeys for variable-arg rejection too.
  if (locals.length === 0) return "NoExtraKeys<Record<string, never>>";
  const fields = locals.map((l) => `${l.name}${l.defaultExpr ? "?" : ""}: unknown`);
  return `NoExtraKeys<{ ${fields.join("; ")} }>`;
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

const BLOCK_CLOSE_RE = /^\s*\}\s*\)?\s*;?\s*$/;

function netBraceDepth(code: string): number {
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

function emitNodes(nodes: TseAst["nodes"]): string[] {
  const lines: string[] = [];
  // Stack: one entry per open blockExpr, tracking net unclosed `{` inside it.
  const innerDepths: number[] = [];
  for (const node of nodes) {
    if (node.kind === "blockExpr") {
      innerDepths.push(0);
      lines.push(`  _ob.append(${node.value.trim()}`);
    } else if (node.kind === "code" && innerDepths.length > 0) {
      const innerDepth = innerDepths[innerDepths.length - 1]!;
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const t = node.value.trim();
        lines.push(`  ${t.endsWith(";") ? t.slice(0, -1) : t});`);
      } else {
        innerDepths[innerDepths.length - 1]! += netBraceDepth(node.value);
        lines.push(emitNode(node));
      }
    } else {
      lines.push(emitNode(node));
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  return lines;
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
    case "blockExpr":
      return `  _ob.append(${node.value}`;
    default:
      throw new Error(`unreachable: unknown node kind`);
  }
}

function buildPreamble(needsNoExtraKeys: boolean): string {
  const actionviewImports = needsNoExtraKeys
    ? "TemplateRegistry, TemplateLocals, NoExtraKeys"
    : "TemplateRegistry, TemplateLocals";
  return [
    "/* virtualized from .tse — phase 2b trails-tsc plugin */",
    `import type { ${actionviewImports} } from "@blazetrails/actionview";`,
    "interface SafeString { readonly __safeStringBrand: unique symbol }",
    "interface OutputBuffer extends SafeString {",
    "  safeAppend(s: string): void;",
    "  append(value: unknown): void;",
    "  safeExprAppend(value: unknown): void;",
    "}",
    "interface RenderContext {",
    "  readonly outputBuffer: OutputBuffer;",
    "  capture(callback: () => void): SafeString;",
    "  concat(value: unknown): void;",
    "  raw(value: unknown): SafeString;",
    "  yield(section?: string): SafeString;",
    "  contentFor(name: string, callback: () => void): void;",
    "  render<P extends string>(options: { partial: P } & (",
    "    P extends keyof TemplateRegistry",
    "      ? {} extends TemplateLocals<TemplateRegistry[P]>",
    "        ? { locals?: TemplateLocals<TemplateRegistry[P]> }",
    "        : { locals: TemplateLocals<TemplateRegistry[P]> }",
    "      : { locals?: Record<string, unknown> }",
    "  )): SafeString;",
    "  [key: string]: unknown;",
    "}",
    "",
  ].join("\n");
}

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
  const needsNoExtraKeys = localsType.includes("NoExtraKeys");

  const header: string[] = [
    buildPreamble(needsNoExtraKeys),
    "export default function render(",
    "  context: RenderContext,",
    `  locals: ${localsType},`,
    "): SafeString {",
    "  void context; void locals;",
    "  const _ob = context.outputBuffer;",
  ];
  for (const line of destructureLines(locals)) header.push(line);
  const body: string[] = [];
  for (const line of emitNodes(ast.nodes)) body.push(line);
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
