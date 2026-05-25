/** JS runtime emitter — TseAst → ES module. Mirrors actionview-flavored Erubi
 * (plan §2.6): static text → `safeAppend`; `<%= %>` → `append` (escapes unless
 * SafeString) or `safeExprAppend` when format is in `escape_ignore_list`;
 * `<%== %>` always `safeExprAppend`. */

import { parse, type TseAst, type TseNode } from "./parser.js";

export interface EmitJsOptions {
  escapeIgnore?: boolean;
  /** Injected immediately after `const _ob = …` — Rails `:preamble` analogue. */
  preamble?: string;
  /** Injected immediately before `return _ob` — Rails `:postamble` analogue. */
  postamble?: string;
}

export interface EmitResult {
  code: string;
  localsSignature: string | null;
  typesAnnotation: string | null;
}

/**
 * Compile a `.tse` template source to an ES module. The generated
 * `render(context, locals)` function requires `context` to implement
 * `TseRenderContext` from `@blazetrails/actionview` (provides `outputBuffer`
 * and `capture`).
 */
export function compileJs(source: string, options: EmitJsOptions = {}): EmitResult {
  const ast = parse(source);
  return {
    code: emit(ast, options),
    localsSignature: ast.localsSignature,
    typesAnnotation: ast.typesAnnotation,
  };
}

/** Matches `<% } %>` / `<% }) %>` / `<% })) %>` closers that can terminate an open blockExpr. */
const BLOCK_CLOSE_RE = /^\s*\}\)*\s*;?\s*$/;

/** Arrow-function blockExpr: `(x) => {` or `() => {`. Function form (`function(x) {`) does NOT match. */
const ARROW_BLOCK_RE = /=>\s*\{\s*$/;

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

/** Net unclosed `(` parens in `code`. Used to compute how many `)` the close
 * tag must supply beyond the two emitter-owned parens (`bufRef.append(` and
 * `context.capture(`). */
function netUnclosedParens(code: string): number {
  let depth = 0;
  for (const ch of code) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return Math.max(0, depth);
}

function emit(ast: TseAst, options: EmitJsOptions): string {
  const exprAppend = options.escapeIgnore === true ? "safeExprAppend" : "append";
  const lines = [
    "export default function render(context, locals) {",
    "  const _ob = context.outputBuffer;",
  ];
  if (options.preamble) lines.push("  " + options.preamble);
  // Stack: one entry per open blockExpr, tracking net unclosed `{` inside it.
  const innerDepths: number[] = [];
  // Parallel stack: unclosed `(` parens left open by each blockExpr's callExpr.
  const innerCallExprParens: number[] = [];
  for (const node of ast.nodes) {
    const insideBlock = innerDepths.length > 0;
    const bufRef = insideBlock ? "context.outputBuffer" : "_ob";
    if (node.kind === "blockExpr") {
      const trimmed = node.value.trim();
      if (!ARROW_BLOCK_RE.test(trimmed)) {
        // function(…) { and `do` forms cannot be capture-wrapped correctly — the
        // emitted closer only closes `context.capture(() => {`, leaving the
        // function body `{` unclosed and producing invalid JS. Arrow syntax is required.
        throw new Error(
          `TSE: block-expr tag must use arrow syntax (e.g. \`(x) => {\`); function/do forms are not supported. Got: \`${trimmed}\``,
        );
      }
      // Strip trailing `{` so the helper call ends with `=>` for the capture wrapper.
      const callExpr = trimmed.replace(/\s*\{\s*$/, "").trimEnd();
      innerDepths.push(0);
      innerCallExprParens.push(netUnclosedParens(callExpr));
      lines.push(`  ${bufRef}.${exprAppend}(${callExpr}`);
      lines.push("  context.capture(() => {");
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1]!;
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const callExprParens = innerCallExprParens.pop()!;
        const t = node.value.trim();
        const tClean = t.endsWith(";") ? t.slice(0, -1) : t;
        // 2 emitter-owned parens (bufRef.append + context.capture) plus whatever
        // the callExpr left open, minus any `)` already in the template's closer.
        const closingParensInT = (tClean.match(/\)/g) ?? []).length;
        const suffix = ")".repeat(Math.max(0, 2 + callExprParens - closingParensInT)) + ";";
        lines.push(`  ${tClean}${suffix}`);
      } else {
        innerDepths[innerDepths.length - 1]! += netBraceDepth(node.value);
        lines.push("  " + emitNode(node, exprAppend, "context.outputBuffer"));
      }
    } else {
      lines.push("  " + emitNode(node, exprAppend, bufRef));
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  if (options.postamble) lines.push("  " + options.postamble);
  lines.push("  return _ob;", "}");
  return lines.join("\n") + "\n";
}

function emitNode(node: TseNode, exprAppend: string, bufRef: string): string {
  switch (node.kind) {
    case "text":
      return `${bufRef}.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      return node.value + (t.endsWith(";") || t.endsWith("{") || t.endsWith("}") ? "" : ";");
    }
    case "expr":
      return `${bufRef}.${exprAppend}(${node.value});`;
    case "rawExpr":
      return `${bufRef}.safeExprAppend(${node.value});`;
    case "blockExpr":
      throw new Error(
        "unreachable: blockExpr nodes are handled in the emit() loop, not emitNode()",
      );
  }
}
