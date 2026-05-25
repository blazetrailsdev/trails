/** JS runtime emitter — TseAst → ES module. Mirrors actionview-flavored Erubi
 * (plan §2.6): static text → `safeAppend`; `<%= %>` → `append` (escapes unless
 * SafeString) or `safeExprAppend` when format is in `escape_ignore_list`;
 * `<%== %>` always `safeExprAppend`. */

import { parse, type TseAst, type TseNode } from "./parser.js";

export interface EmitJsOptions {
  escapeIgnore?: boolean;
}

export interface EmitResult {
  code: string;
  localsSignature: string | null;
  typesAnnotation: string | null;
}

export function compileJs(source: string, options: EmitJsOptions = {}): EmitResult {
  const ast = parse(source);
  return {
    code: emit(ast, options),
    localsSignature: ast.localsSignature,
    typesAnnotation: ast.typesAnnotation,
  };
}

/** Matches `<% } %>` / `<% }) %>` closers that can terminate an open blockExpr. */
const BLOCK_CLOSE_RE = /^\s*\}\s*\)?\s*;?\s*$/;

/** Net change in `{}`-brace depth for a code tag value. Counts `{` as +1 and
 * `}` as -1 so that `} else {` correctly resolves to 0, not +1. */
function netBraceDepth(code: string): number {
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

function emit(ast: TseAst, options: EmitJsOptions): string {
  const exprAppend = options.escapeIgnore === true ? "safeExprAppend" : "append";
  const lines = [
    "export default function render(context, locals) {",
    "  const _ob = context.outputBuffer;",
  ];
  // Stack: one entry per open blockExpr, tracking net unclosed `{` inside it.
  const innerDepths: number[] = [];
  for (const node of ast.nodes) {
    if (node.kind === "blockExpr") {
      innerDepths.push(0);
      lines.push(`  _ob.${exprAppend}(${node.value.trim()}`);
    } else if (node.kind === "code" && innerDepths.length > 0) {
      const innerDepth = innerDepths[innerDepths.length - 1]!;
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const t = node.value.trim();
        lines.push(`  ${t.endsWith(";") ? t.slice(0, -1) : t});`);
      } else {
        innerDepths[innerDepths.length - 1]! += netBraceDepth(node.value);
        lines.push("  " + emitNode(node, exprAppend));
      }
    } else {
      lines.push("  " + emitNode(node, exprAppend));
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  lines.push("  return _ob;", "}");
  return lines.join("\n") + "\n";
}

function emitNode(node: TseNode, exprAppend: string): string {
  switch (node.kind) {
    case "text":
      return `_ob.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      return node.value + (t.endsWith(";") || t.endsWith("{") || t.endsWith("}") ? "" : ";");
    }
    case "expr":
      return `_ob.${exprAppend}(${node.value});`;
    case "rawExpr":
      return `_ob.safeExprAppend(${node.value});`;
    case "blockExpr":
      return `_ob.${exprAppend}(${node.value}`;
  }
}
