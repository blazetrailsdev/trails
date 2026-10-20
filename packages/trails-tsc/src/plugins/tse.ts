import ts from "typescript-5";
import {
  awaitFlowReads,
  FUNCTION_BLOCK_RE,
  parse,
  parseLocalsSignature,
  LocalsSignatureError,
  YIELD_EXPR_RE,
  type TseAst,
  type LocalEntry,
  type LineMapping,
} from "@blazetrails/tse-compiler";
import type { LineDelta } from "../plugin.js";

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
  const innerAwaits: boolean[] = [];
  let braceDepth = 0;
  const functionDepths: number[] = [];
  for (const node of nodes) {
    const insideBlock = innerDepths.length > 0;
    const bufRef = insideBlock ? "context.outputBuffer" : "_ob";
    const awaits = !insideBlock && functionDepths.length === 0;
    if (node.kind === "blockExpr") {
      innerDepths.push(0);
      innerAwaits.push(awaits);
      lines.push([`  ${bufRef}.append(${awaits ? "await (" : ""}${node.value.trim()}`, node]);
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const close = innerAwaits.pop() ? "))" : ")";
        const t = node.value.trim();
        lines.push([`  ${t.endsWith(";") ? t.slice(0, -1) : t}${close};`, node]);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        lines.push([emitNode(node, bufRef, false), node]);
      }
    } else {
      if (node.kind === "code") {
        braceDepth += netBraceDepth(node.value);
        while (
          functionDepths.length > 0 &&
          braceDepth < functionDepths[functionDepths.length - 1]
        ) {
          functionDepths.pop();
        }
        if (FUNCTION_BLOCK_RE.test(node.value.trimEnd())) functionDepths.push(braceDepth);
      }
      lines.push([emitNode(node, bufRef, awaits), node]);
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
  const emitted =
    /^\s*(?:(?:_ob|context\.outputBuffer)\.\w+\((?:await \()?)?/u.exec(pieces[0])?.[0].length ?? 0;
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

function emitNode(node: TseAst["nodes"][number], bufRef: string, awaits: boolean): string {
  if (node.kind !== "text") node = { ...node, value: node.value.trim() };
  const value = (expr: string): string => (awaits ? `await (${awaitFlowReads(expr)})` : expr);
  switch (node.kind) {
    case "text":
      return `  ${bufRef}.safeAppend(${JSON.stringify(node.value)});`;
    case "code": {
      const t = node.value.trimEnd();
      const needsSemi = !(t.endsWith(";") || t.endsWith("{") || t.endsWith("}"));
      return `  ${awaits ? awaitFlowReads(node.value) : node.value}${needsSemi ? ";" : ""}`;
    }
    case "expr":
      return `  ${bufRef}.append(${value(contextYield(node.value))});`;
    case "rawExpr":
      return `  ${bufRef}.safeExprAppend(${value(contextYield(node.value))});`;
    case "blockExpr":
      return `  ${bufRef}.append(${node.value}`;
    default:
      throw new Error(`unreachable: unknown node kind`);
  }
}

function buildPreamble(needsNoExtraKeys: boolean, withTopLevel: boolean): string {
  const actionviewImports = needsNoExtraKeys
    ? "TemplateRegistry, TemplateLocals, NoExtraKeys"
    : "TemplateRegistry, TemplateLocals";
  return [
    "/* virtualized from .tse — phase 2b trails-tsc plugin */",
    `import type { ${actionviewImports} } from "@blazetrails/actionview";`,
    ...(withTopLevel ? ['import { TopLevel } from "@blazetrails/actionview";'] : []),
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

  const header: string[] = [buildPreamble(needsNoExtraKeys, scope !== undefined)];
  if (scope !== undefined) {
    header.push(...scopeTypes(scope, ast.localsSignature !== null || scope.resolved === true));
  }
  header.push(
    "export default async function render(",
    ...(scope === undefined ? [] : ["  this: View,"]),
    "  context: RenderContext,",
    `  locals: ${localsType},`,
    "  _?: (...name: [] | [string]) => unknown,",
    "): Promise<SafeString> {",
    "  void context; void locals;",
    "  const __view = context;",
    '  context = Object.create(__view, { yield: { value: (...name: [] | [string]) => (name.length > 0 ? _!(...name) : _ !== undefined ? _() : Reflect.get(__view, "yield")) } });',
    "  const _ob = context.outputBuffer;",
  );
  for (const line of destructureLines(locals)) header.push(line);
  if (scope !== undefined) {
    const declared = new Set(locals.map((l) => l.name));
    const free = freeIdentifiers(body).filter((name) => !declared.has(name));
    if (free.length > 0) {
      const scopes = ast.localsSignature === null ? "[locals, this, TopLevel]" : "[this, TopLevel]";
      header.push(
        `  const __lookup = (name: string): any => { for (const scope of ${scopes} as object[]) if (name in scope) { const value: unknown = Reflect.get(scope, name); return scope === this && typeof value === "function" ? value.bind(this) : value; } return Reflect.get(globalThis, name); };`,
      );
    }
    for (const name of free) {
      const key = JSON.stringify(name);
      header.push(`  let ${name} = __lookup(${key}) as Scope<${key}>;`);
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
    "type Bare<F, Seen = unknown> = unknown extends ThisParameterType<F>",
    "  ? F",
    "  : F extends (this: infer T, ...args: infer A) => infer R",
    "    ? Seen extends F",
    "      ? unknown",
    "      : Bare<Seen & F, Seen & ((this: T, ...args: A) => R)> & ((...args: A) => R)",
    "    : F;",
    "type Scope<K extends string> = K extends keyof ObjectLocals",
    "  ? ObjectLocals[K]",
    "  : K extends keyof View",
    "    ? Bare<View[K]>",
    "    : K extends keyof typeof TopLevel",
    "      ? (typeof TopLevel)[K]",
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
  "_",
  "__view",
  "__lookup",
]);

function freeIdentifiers(body: readonly string[]): string[] {
  const sf = ts.createSourceFile(
    "body.ts",
    `async function __tse() {\n${body.join("\n")}\n}`,
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
