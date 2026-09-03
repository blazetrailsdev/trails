import { parse, type TseAst, type TseNode } from "./parser.js";
import { parseLocalsSignature, type LocalEntry } from "./parse-locals.js";
import { generateSourceMap, type RawSourceMap, type LineMapping } from "./source-map.js";

export interface EmitJsOptions {
  escapeIgnore?: boolean;
  preamble?: string;
  postamble?: string;
  raiseOnStrictLocalsMismatch?: boolean;
  fileName?: string;
  sourceFileName?: string;
}

export interface EmitResult {
  code: string;
  sourceMap: RawSourceMap | null;
  localsSignature: string | null;
  typesAnnotation: string | null;
}

export function compileJs(source: string, options: EmitJsOptions = {}): EmitResult {
  const ast = parse(source);
  const { code, mappings } = emit(ast, options);
  const sourceMap =
    options.fileName && options.sourceFileName
      ? generateSourceMap(options.fileName, options.sourceFileName, source, mappings)
      : null;
  return {
    code,
    sourceMap,
    localsSignature: ast.localsSignature,
    typesAnnotation: ast.typesAnnotation,
  };
}

const BLOCK_CLOSE_RE = /^\s*\}\)*\s*;?\s*$/;

const ARROW_BLOCK_RE = /=>\s*\{\s*$/;

function netBraceDepth(code: string): number {
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

function netUnclosedParens(code: string): number {
  let depth = 0;
  for (const ch of code) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return Math.max(0, depth);
}

function emitLocalsBlock(
  ast: TseAst,
  raiseOnMismatch: boolean,
): { entries: LocalEntry[]; lines: string[] } {
  if (ast.localsSignature === null) return { entries: [], lines: [] };
  const entries = parseLocalsSignature(ast.localsSignature);
  const lines: string[] = [];

  if (raiseOnMismatch) {
    const allowedKeys =
      entries.length === 0 ? "[]" : `[${entries.map((e) => JSON.stringify(e.name)).join(", ")}]`;
    lines.push(
      `  const __allowedKeys = ${allowedKeys};`,
      "  const __extraKeys = Object.keys(locals).filter((k) => !__allowedKeys.includes(k));",
      "  if (__extraKeys.length > 0) {",
      "    throw new StrictLocalsMismatch(__extraKeys, __allowedKeys);",
      "  }",
    );
  }

  if (entries.length > 0) {
    const pieces = entries.map((e) =>
      e.defaultExpr === null ? e.name : `${e.name} = ${e.defaultExpr}`,
    );
    lines.push(`  const { ${pieces.join(", ")} } = locals;`);
  }

  return { entries, lines };
}

function emit(ast: TseAst, options: EmitJsOptions): { code: string; mappings: LineMapping[] } {
  const exprAppend = options.escapeIgnore === true ? "safeExprAppend" : "append";
  const raiseOnMismatch = options.raiseOnStrictLocalsMismatch ?? ast.localsSignature !== null;
  const { lines: localsLines } = emitLocalsBlock(ast, raiseOnMismatch);

  const lines: string[] = [];
  const lineMappings: LineMapping[] = [];
  let nextGenLine = 0;
  const push = (line: string, srcLine?: number): void => {
    const newlines = line.match(/\n/g)?.length ?? 0;
    if (srcLine !== undefined) {
      for (let i = 0; i <= newlines; i++) {
        lineMappings.push({ genLine: nextGenLine + i, srcLine: srcLine + i });
      }
    }
    nextGenLine += 1 + newlines;
    lines.push(line);
  };

  if (raiseOnMismatch && ast.localsSignature !== null) {
    push('import { StrictLocalsMismatch } from "@blazetrails/actionview/strict-locals";');
  }
  push("export default function render(context, locals) {");
  push("  const _ob = context.outputBuffer;");
  if (options.preamble) push("  " + options.preamble);
  for (const l of localsLines) push(l);
  const innerDepths: number[] = [];
  const innerCallExprParens: number[] = [];
  for (const node of ast.nodes) {
    const insideBlock = innerDepths.length > 0;
    const bufRef = insideBlock ? "context.outputBuffer" : "_ob";
    if (node.kind === "blockExpr") {
      const trimmed = node.value.trim();
      if (!ARROW_BLOCK_RE.test(trimmed)) {
        throw new Error(
          `TSE: block-expr tag must use arrow syntax (e.g. \`(x) => {\`); function/do forms are not supported. Got: \`${trimmed}\``,
        );
      }
      const callExpr = trimmed.replace(/\s*\{\s*$/, "").trimEnd();
      innerDepths.push(0);
      innerCallExprParens.push(netUnclosedParens(callExpr));
      push(`  ${bufRef}.${exprAppend}(${callExpr}`, node.srcLine);
      push("  context.capture(() => {");
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const callExprParens = innerCallExprParens.pop()!;
        const t = node.value.trim();
        const tClean = t.endsWith(";") ? t.slice(0, -1) : t;
        const closingParensInT = (tClean.match(/\)/g) ?? []).length;
        const suffix = ")".repeat(Math.max(0, 2 + callExprParens - closingParensInT)) + ";";
        push(`  ${tClean}${suffix}`, node.srcLine);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        push("  " + emitNode(node, exprAppend, "context.outputBuffer"), node.srcLine);
      }
    } else {
      push("  " + emitNode(node, exprAppend, bufRef), node.srcLine);
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  if (options.postamble) push("  " + options.postamble);
  push("  return _ob;");
  push("}");
  return { code: lines.join("\n") + "\n", mappings: lineMappings };
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
