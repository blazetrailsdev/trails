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

function emit(ast: TseAst, options: EmitJsOptions): string {
  const exprAppend = options.escapeIgnore === true ? "safeExprAppend" : "append";
  const lines = [
    "export default function render(context, locals) {",
    "  const _ob = context.outputBuffer;",
  ];
  for (const node of ast.nodes) lines.push("  " + emitNode(node, exprAppend));
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
  }
}
