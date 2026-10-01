import ts from "typescript-5";
import {
  parse,
  parseLocalsSignature,
  LocalsSignatureError,
  YIELD_EXPR_RE,
  type TseAst,
  type LocalEntry,
  type LineMapping,
} from "@blazetrails/tse-compiler";
import type { LineDelta, TscPlugin, VirtualizeOutput } from "../plugin.js";

export { parseLocalsSignature };
export { LocalsSignatureError as TseLocalsSignatureError };

export function localsParamType(ast: TseAst, locals: LocalEntry[]): string {
  if (ast.typesAnnotation !== null) return ast.typesAnnotation;
  if (ast.localsSignature === null) return "Record<string, unknown>";
  if (locals.length === 0) return "NoExtraKeys<Record<string, never>>";
  const fields = locals.map((l) => `${l.name}${l.defaultExpr ? "?" : ""}: unknown`);
  return `NoExtraKeys<{ ${fields.join("; ")} }>`;
}

function destructureLines(locals: LocalEntry[]): string[] {
  if (locals.length === 0) return [];
  const pieces = locals.map((l) =>
    l.defaultExpr === null ? l.name : `${l.name} = ${l.defaultExpr}`,
  );
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

type EmittedLine = [code: string, node: TseAst["nodes"][number]];

function emitNodes(nodes: TseAst["nodes"]): EmittedLine[] {
  const lines: EmittedLine[] = [];
  const innerDepths: number[] = [];
  for (const node of nodes) {
    if (node.kind === "blockExpr") {
      innerDepths.push(0);
      lines.push([`  _ob.append(${node.value.trim()}`, node]);
    } else if (node.kind === "code" && innerDepths.length > 0) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const t = node.value.trim();
        lines.push([`  ${t.endsWith(";") ? t.slice(0, -1) : t});`, node]);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        lines.push([emitNode(node), node]);
      }
    } else {
      lines.push([emitNode(node), node]);
    }
  }
  if (innerDepths.length > 0) {
    throw new Error(
      `TSE: ${innerDepths.length} block-expr tag(s) were never closed — missing <% } %> or <% }) %>`,
    );
  }
  return lines;
}

function lineMappings(genLine: number, code: string, node: TseAst["nodes"][number]): LineMapping[] {
  const pieces = code.split("\n");
  const tagCol = node.kind === "text" ? 0 : (node.srcCol ?? 0);
  const lead = node.kind === "text" ? [""] : (/^\s*/.exec(node.value)?.[0] ?? "").split("\n");
  const srcLine = node.srcLine + lead.length - 1;
  const valueCol = lead.length === 1 ? tagCol + lead[0].length : lead[lead.length - 1].length;
  const value = node.kind === "text" ? "" : node.value.trim();
  const yielded =
    node.kind === "expr" || node.kind === "rawExpr" ? YIELD_EXPR_RE.exec(value) : null;
  const arg = (yielded?.[1] ?? yielded?.[2] ?? "").trim();
  const anchor = yielded === null ? value.split("\n")[0] : arg || "context.yield";
  const emitted = /^\s*(?:_ob\.\w+\()?/u.exec(pieces[0])?.[0].length ?? 0;
  const at = node.kind === "text" ? 0 : pieces[0].indexOf(anchor, emitted);
  const srcCol = valueCol + (yielded !== null && arg !== "" ? value.indexOf(arg) : 0);
  const valueLines = value.split("\n");
  const srcEnd =
    yielded !== null && arg === "" ? valueCol + valueLines[0].length : srcCol + anchor.length;
  return pieces.flatMap((piece, i) => {
    if (i > 0) {
      const end = (valueLines[i] ?? piece).length;
      return [
        { genLine: genLine + i, srcLine: srcLine + i, genCol: 0, srcCol: 0 },
        { genLine: genLine + i, srcLine: srcLine + i, genCol: end, srcCol: end },
      ];
    }
    if (at === -1) return [{ genLine, srcLine, genCol: piece.length, srcCol }];
    if (node.kind === "text") return [{ genLine, srcLine, genCol: at, srcCol }];
    return [
      { genLine, srcLine, genCol: at, srcCol },
      { genLine, srcLine, genCol: at + anchor.length, srcCol: srcEnd },
    ];
  });
}

function contextYield(value: string): string {
  const m = YIELD_EXPR_RE.exec(value);
  if (m === null) return value;
  const section = m[1] ?? m[2] ?? "";
  return `context.yield(${section.trim()})`;
}

function emitNode(node: TseAst["nodes"][number]): string {
  if (node.kind !== "text") node = { ...node, value: node.value.trim() };
  switch (node.kind) {
    case "text":
      return `  _ob.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      const needsSemi = !(t.endsWith(";") || t.endsWith("{") || t.endsWith("}"));
      return `  ${node.value}${needsSemi ? ";" : ""}`;
    }
    case "expr":
      return `  _ob.append(${contextYield(node.value)});`;
    case "rawExpr":
      return `  _ob.safeExprAppend(${contextYield(node.value)});`;
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
  mappings: readonly LineMapping[];
}

export interface TseScope {
  view: string;
  locals?: string;
  resolved?: boolean;
}

export function virtualizeTse(source: string, scope?: TseScope): string {
  return virtualizeTseWithDeltas(source, scope).ts;
}

export function virtualizeTseWithDeltas(source: string, scope?: TseScope): VirtualizeTseResult {
  const ast = parse(source);
  const locals = ast.localsSignature === null ? [] : parseLocalsSignature(ast.localsSignature);
  const localsType = localsParamType(ast, locals);
  const needsNoExtraKeys = localsType.includes("NoExtraKeys");
  const emitted = emitNodes(ast.nodes);
  const body = emitted.map(([code]) => code);

  const header: string[] = [buildPreamble(needsNoExtraKeys)];
  if (scope !== undefined) {
    header.push(...scopeTypes(scope, ast.localsSignature !== null || scope.resolved === true));
  }
  header.push(
    "export default function render(",
    ...(scope === undefined ? [] : ["  this: View,"]),
    "  context: RenderContext,",
    `  locals: ${localsType},`,
    "): SafeString {",
    "  void context; void locals;",
    "  const _ob = context.outputBuffer;",
  );
  for (const line of destructureLines(locals)) header.push(line);
  if (scope !== undefined) {
    const declared = new Set(locals.map((l) => l.name));
    for (const name of freeIdentifiers(body)) {
      if (!declared.has(name)) header.push(`  let ${name}!: Scope<${JSON.stringify(name)}>;`);
    }
  }
  const footer = ["  return _ob;", "}", ""];

  const ts = [...header, ...body, ...footer].join("\n");
  const headerLineCount = header.join("\n").split("\n").length;
  const bodyLineCount = body.length === 0 ? 0 : body.join("\n").split("\n").length;
  const footerLineCount = footer.join("\n").split("\n").length;
  const deltas: LineDelta[] = [
    { insertedAtLine: -1, lineCount: headerLineCount },
    { insertedAtLine: headerLineCount + bodyLineCount - 1, lineCount: footerLineCount },
  ];
  const mappings: LineMapping[] = [];
  let genLine = headerLineCount;
  for (const [code, node] of emitted) {
    mappings.push(...lineMappings(genLine, code, node));
    genLine += code.split("\n").length;
  }
  return { ts, deltas, mappings };
}

function scopeTypes(scope: TseScope, localsKnown: boolean): string[] {
  return [
    `type View = ${scope.view};`,
    `type ObjectLocals = ${scope.locals ?? "{}"};`,
    "type Scope<K extends string> = K extends keyof ObjectLocals",
    "  ? ObjectLocals[K]",
    "  : K extends keyof View",
    "    ? OmitThisParameter<View[K]>",
    "    : K extends keyof typeof globalThis",
    "      ? (typeof globalThis)[K]",
    `      : ${localsKnown ? "never" : "any"};`,
  ];
}

export function shimScope(shim: string): TseScope | undefined {
  const view = /^type View = (.*);$/mu.exec(shim)?.[1];
  if (view === undefined) return undefined;
  return {
    view,
    locals: /^type ObjectLocals = (.*);$/mu.exec(shim)?.[1],
    resolved: /^ {6}: never;$/mu.test(shim),
  };
}

const UNDECLARABLE = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "globalThis",
  "arguments",
  "eval",
  "context",
  "locals",
  "_ob",
]);

function freeIdentifiers(body: readonly string[]): string[] {
  const sf = ts.createSourceFile(
    "body.ts",
    `function __tse() {\n${body.join("\n")}\n}`,
    ts.ScriptTarget.ESNext,
    true,
  );
  const fn = sf.statements[0] as ts.FunctionDeclaration;
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && isReference(node) && !UNDECLARABLE.has(node.text)) {
      names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body!, visit);
  for (const stmt of fn.body!.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) deleteBound(decl.name, names);
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      names.delete(stmt.name.text);
    }
  }
  return [...names].sort();
}

function deleteBound(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) names.delete(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) deleteBound(el.name, names);
}

function isReference(node: ts.Identifier): boolean {
  const parent = node.parent as ts.Node & {
    name?: ts.Node;
    propertyName?: ts.Node;
    label?: ts.Node;
  };
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  return parent.name !== node && parent.propertyName !== node && parent.label !== node;
}

function errorShim(filePath: string, msg: string): string {
  const safe = JSON.stringify(`${filePath}: ${msg}`);
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
