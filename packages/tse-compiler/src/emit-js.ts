import { parse, type TseAst, type TseNode } from "./parser.js";
import { generateSourceMap, type RawSourceMap, type LineMapping } from "./source-map.js";

export interface EmitJsOptions {
  escapeIgnore?: boolean;
  preamble?: string;
  postamble?: string;
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

function emit(ast: TseAst, options: EmitJsOptions): { code: string; mappings: LineMapping[] } {
  const exprAppend = options.escapeIgnore === true ? "safeExprAppend" : "append";
  let code = "";
  const lineMappings: LineMapping[] = [];
  let genLine = 0;
  let lineStart = true;
  const push = (line: string, srcLine?: number): void => {
    if (srcLine !== undefined) {
      while (genLine < srcLine) {
        code += "\n";
        genLine += 1;
        lineStart = true;
      }
    }
    const newlines = line.match(/\n/g)?.length ?? 0;
    if (srcLine !== undefined) {
      for (let i = 0; i <= newlines; i++) {
        lineMappings.push({ genLine: genLine + i, srcLine: srcLine + i });
      }
    }
    code += (lineStart ? "" : " ") + line;
    genLine += newlines;
    lineStart = false;
  };

  push("export default function render(context, locals) {");
  push("const _ob = context.outputBuffer;");
  if (options.preamble) push(options.preamble);
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
      push(`${bufRef}.${exprAppend}(${callExpr}`, node.srcLine);
      push("context.capture(() => {");
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const callExprParens = innerCallExprParens.pop()!;
        const t = node.value.trim();
        const tClean = t.endsWith(";") ? t.slice(0, -1) : t;
        const closingParensInT = (tClean.match(/\)/g) ?? []).length;
        const suffix = ")".repeat(Math.max(0, 2 + callExprParens - closingParensInT)) + ";";
        push(`${tClean}${suffix}`, node.srcLine);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        push(emitNode(node, exprAppend, "context.outputBuffer"), node.srcLine);
      }
    } else {
      push(emitNode(node, exprAppend, bufRef), node.srcLine);
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  code += "\n";
  if (options.postamble) code += options.postamble + " ";
  code += "return _ob;\n}\n";
  return { code, mappings: lineMappings };
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
