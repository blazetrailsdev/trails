import { parse, type TseAst, type TseNode } from "./parser.js";
import { generateSourceMap, type RawSourceMap, type LineMapping } from "./source-map.js";

export interface EmitJsOptions {
  escapeIgnore?: boolean;
  preamble?: string;
  postamble?: string;
  async?: boolean;
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

const FUNCTION_BLOCK_RE = /(?:=>|\bfunction\b[^{]*)\s*\{\s*$/;

const REGEX_PRECEDING_KEYWORD_RE =
  /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

function codeMask(code: string): boolean[] {
  const mask = new Array<boolean>(code.length).fill(false);
  const templateDepths: number[] = [];
  let inTemplate = false;
  let depth = 0;
  let prev = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (inTemplate) {
      if (ch === "\\") {
        i += 2;
      } else if (ch === "`") {
        inTemplate = false;
        prev = "`";
        i++;
      } else if (ch === "$" && next === "{") {
        templateDepths.push(depth);
        inTemplate = false;
        prev = "{";
        i += 2;
      } else {
        i++;
      }
    } else if (ch === "`") {
      inTemplate = true;
      i++;
    } else if (ch === "}" && templateDepths[templateDepths.length - 1] === depth) {
      templateDepths.pop();
      inTemplate = true;
      i++;
    } else if (ch === '"' || ch === "'") {
      i++;
      while (i < code.length && code[i] !== ch) i += code[i] === "\\" ? 2 : 1;
      i++;
      prev = ch;
    } else if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 2;
    } else if (ch === "/" && isRegexStart(code, i, prev)) {
      let inClass = false;
      i++;
      while (i < code.length && (code[i] !== "/" || inClass)) {
        if (code[i] === "\\") i++;
        else if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        i++;
      }
      i++;
      while (i < code.length && /[a-z]/.test(code[i])) i++;
      prev = "/";
    } else {
      mask[i] = true;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
  }
  return mask;
}

function isRegexStart(code: string, i: number, prev: string): boolean {
  if (prev === "") return true;
  if (prev === "+" || prev === "-") {
    const before = code.slice(0, i).trimEnd();
    return before[before.length - 2] !== prev;
  }
  if (/[(,=:[!&|?{;*%<>~^]/.test(prev)) return true;
  return REGEX_PRECEDING_KEYWORD_RE.test(code.slice(0, i).trimEnd());
}

function netBraceDepth(code: string): number {
  const mask = codeMask(code);
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    if (!mask[i]) continue;
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
  }
  return depth;
}

const FLOW_READ_RE =
  /(?<![\w$.])(?:(_layoutFor|contentFor|isContentFor|_|yield)\s*\(|yield(?![\w$]))/y;

function awaitFlowReads(
  code: string,
  mask: boolean[] = codeMask(code),
  start = 0,
  end = code.length,
): string {
  let out = "";
  let depth = 0;
  let functionDepth: number | null = null;
  let i = start;
  while (i < end) {
    const ch = code[i];
    if (!mask[i]) {
      out += ch;
      i++;
      continue;
    }
    if (functionDepth === null) {
      if (code.startsWith("=>", i) || /^function(?![\w$])/.test(code.slice(i))) {
        if (!/[\w$]/.test(code[i - 1] ?? "")) functionDepth = depth;
      }
    }
    FLOW_READ_RE.lastIndex = i;
    const m = functionDepth === null ? FLOW_READ_RE.exec(code) : null;
    if (m !== null && m[1] === undefined) {
      out += "(await yield)";
      i += m[0].length;
      continue;
    }
    if (m !== null) {
      let close = i + m[0].length;
      for (let d = 1; close < end; close++) {
        if (!mask[close]) continue;
        if (code[close] === "(") d++;
        else if (code[close] === ")" && --d === 0) break;
      }
      if (close < end) {
        const args = awaitFlowReads(code, mask, i + m[0].length, close);
        out += `(await ${m[1] === "yield" ? "_(" : m[0]}${args}))`;
        i = close + 1;
        continue;
      }
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (
      functionDepth !== null &&
      (depth < functionDepth || (depth === functionDepth && (ch === "," || ch === ";")))
    ) {
      functionDepth = null;
    }
    out += ch;
    i++;
  }
  return out;
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

  push(`export default ${options.async ? "async " : ""}function render(context, locals) {`);
  push("const _ob = context.outputBuffer;");
  if (options.preamble) push(options.preamble);
  const innerDepths: number[] = [];
  const innerCallExprParens: number[] = [];
  let braceDepth = 0;
  const functionDepths: number[] = [];
  for (const node of ast.nodes) {
    const insideBlock = innerDepths.length > 0;
    const bufRef = insideBlock ? "context.outputBuffer" : "_ob";
    const awaits = options.async === true && !insideBlock && functionDepths.length === 0;
    if (node.kind === "blockExpr") {
      const trimmed = node.value.trim();
      if (!ARROW_BLOCK_RE.test(trimmed)) {
        throw new Error(
          `TSE: block-expr tag must use arrow syntax (e.g. \`(x) => {\`); function/do forms are not supported. Got: \`${trimmed}\``,
        );
      }
      innerDepths.push(0);
      innerCallExprParens.push(netUnclosedParens(node.value));
      push(`${bufRef}.${exprAppend}(${node.value}`, node.srcLine);
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const callExprParens = innerCallExprParens.pop()!;
        const closer = node.value.replace(/;\s*$/, "");
        const closingParens = (closer.match(/\)/g) ?? []).length;
        const suffix = ")".repeat(Math.max(0, 1 + callExprParens - closingParens)) + ";";
        push(`${closer}${suffix}`, node.srcLine);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        push(emitNode(node, exprAppend, "context.outputBuffer"), node.srcLine);
      }
    } else {
      if (node.kind === "code" && options.async === true) {
        braceDepth += netBraceDepth(node.value);
        while (
          functionDepths.length > 0 &&
          braceDepth < functionDepths[functionDepths.length - 1]
        ) {
          functionDepths.pop();
        }
        if (FUNCTION_BLOCK_RE.test(node.value.trimEnd())) functionDepths.push(braceDepth);
      }
      push(emitNode(node, exprAppend, bufRef, awaits), node.srcLine);
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

export const YIELD_EXPR_RE = /^\s*yield(?:\s*\(([\s\S]*)\)|\s+([\s\S]*?))?\s*;?\s*$/;

function blockCall(value: string): string {
  const m = YIELD_EXPR_RE.exec(value);
  if (m === null || (m[1] === undefined && !m[2])) return value;
  return `_(${(m[1] ?? m[2]).trim()})`;
}

function emitNode(node: TseNode, exprAppend: string, bufRef: string, awaits = false): string {
  const expr = node.kind === "expr" || node.kind === "rawExpr" ? blockCall(node.value) : node.value;
  const value = awaits ? `await (${awaitFlowReads(expr)})` : expr;
  switch (node.kind) {
    case "text":
      return `${bufRef}.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      return (
        (awaits ? awaitFlowReads(node.value) : node.value) +
        (t.endsWith(";") || t.endsWith("{") || t.endsWith("}") ? "" : ";")
      );
    }
    case "expr":
      return `${bufRef}.${exprAppend}(${value});`;
    case "rawExpr":
      return `${bufRef}.safeExprAppend(${value});`;
    case "blockExpr":
      throw new Error(
        "unreachable: blockExpr nodes are handled in the emit() loop, not emitNode()",
      );
  }
}
