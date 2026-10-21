import ts from "typescript-5";
import {
  ARROW_BLOCK_RE,
  awaitFlowReads,
  BLOCK_CLOSE_RE,
  FUNCTION_BLOCK_RE,
  netBraceDepth,
  netUnclosedParens,
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
  const keyrest = locals.some((l) => l.rest);
  const keywords = locals.filter((l) => !l.rest);
  if (keywords.length === 0) {
    return keyrest ? "Record<string, unknown>" : "NoExtraKeys<Record<string, never>>";
  }
  const fields = keywords.map((l) => `${l.name}${l.defaultExpr ? "?" : ""}: unknown`);
  if (keyrest) return `{ ${fields.join("; ")}; [key: string]: unknown }`;
  return `NoExtraKeys<{ ${fields.join("; ")} }>`;
}

function destructureLines(locals: LocalEntry[]): string[] {
  const bound = locals.filter((l) => l.bound !== false);
  if (bound.length === 0) return [];
  const keywords = locals.filter((l) => !l.rest);
  const rest = bound.find((l) => l.rest);
  const pieces = keywords
    .filter((l) => l.bound !== false || rest)
    .map((l) => {
      const target = l.bound === false ? `${JSON.stringify(l.name)}: __${l.name}` : l.name;
      return l.defaultExpr === null ? target : `${target} = ${l.defaultExpr}`;
    });
  if (rest) pieces.push(`...${rest.name}`);
  const voids = `  ${bound.map((l) => `void ${l.name};`).join(" ")}`;
  return [`  const { ${pieces.join(", ")} } = locals;`, voids];
}

type EmittedLine = [code: string, node: TseAst["nodes"][number]];

function emitNodes(nodes: TseAst["nodes"], escapeIgnore = false): EmittedLine[] {
  const lines: EmittedLine[] = [];
  const innerDepths: number[] = [];
  const innerCallExprParens: number[] = [];
  let braceDepth = 0;
  const functionDepths: number[] = [];
  for (const node of nodes) {
    const insideBlock = innerDepths.length > 0;
    const bufRef = insideBlock ? "context.outputBuffer" : "_ob";
    const awaits = !insideBlock && functionDepths.length === 0;
    if (node.kind === "blockExpr") {
      const trimmed = node.value.trim();
      if (!ARROW_BLOCK_RE.test(trimmed)) {
        throw new Error(
          `TSE: block-expr tag must use arrow syntax (e.g. \`(x) => {\`); function/do forms are not supported. Got: \`${trimmed}\``,
        );
      }
      innerDepths.push(0);
      innerCallExprParens.push(netUnclosedParens(node.value) + (awaits ? 1 : 0));
      lines.push([`  ${bufRef}.append(${awaits ? "await (" : ""}${node.value.trim()}`, node]);
    } else if (node.kind === "code" && insideBlock) {
      const innerDepth = innerDepths[innerDepths.length - 1];
      if (BLOCK_CLOSE_RE.test(node.value) && innerDepth === 0) {
        innerDepths.pop();
        const callExprParens = innerCallExprParens.pop()!;
        const closer = node.value.trim().replace(/;\s*$/, "");
        const closingParens = (closer.match(/\)/g) ?? []).length;
        const suffix = ")".repeat(Math.max(0, 1 + callExprParens - closingParens)) + ";";
        lines.push([`  ${closer}${suffix}`, node]);
      } else {
        innerDepths[innerDepths.length - 1] += netBraceDepth(node.value);
        lines.push([emitNode(node, bufRef, false, escapeIgnore), node]);
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
      lines.push([emitNode(node, bufRef, awaits, escapeIgnore), node]);
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
  if (m === null) return embeddedYields(value);
  const section = m[1] ?? m[2] ?? "";
  return `context.yield(${section.trim()})`;
}

function embeddedYields(value: string): string {
  const sf = ts.createSourceFile("expr.ts", `(${value})`, ts.ScriptTarget.ESNext, true);
  const sites: [start: number, end: number, called: boolean][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "yield" && isReference(node)) {
      const called = ts.isCallExpression(node.parent) && node.parent.expression === node;
      sites.push([node.getStart(sf) - 1, node.getEnd() - 1, called]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = value;
  for (const [start, end, called] of sites.reverse()) {
    out = `${out.slice(0, start)}${called ? "context.yield" : "context.yield()"}${out.slice(end)}`;
  }
  return out;
}

function emitNode(
  node: TseAst["nodes"][number],
  bufRef: string,
  awaits: boolean,
  escapeIgnore: boolean,
): string {
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
      return `  ${bufRef}.${escapeIgnore ? "safeExprAppend" : "append"}(${value(contextYield(node.value))});`;
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
  escapeIgnore?: boolean;
  localsSignature?: string | null;
}

export function virtualizeTse(source: string, scope?: TseScope): string {
  return virtualizeTseWithDeltas(source, scope).ts;
}

export function virtualizeTseWithDeltas(source: string, scope?: TseScope): VirtualizeTseResult {
  const ast = parse(source);
  ast.localsSignature ??= scope?.localsSignature ?? null;
  const locals = ast.localsSignature === null ? [] : parseLocalsSignature(ast.localsSignature);
  const localsType = localsParamType(ast, locals);
  const needsNoExtraKeys = localsType.includes("NoExtraKeys");
  const emitted = emitNodes(ast.nodes, scope?.escapeIgnore === true);
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
    "  __block?: (...name: [] | [string]) => unknown,",
    "): Promise<SafeString> {",
    "  void context; void locals;",
    "  const localAssigns = locals; void localAssigns;",
    "  const __view = context;",
    '  context = Object.create(__view, { yield: { value: (...name: [] | [string]) => (name.length > 0 ? __block!(...name) : __block !== undefined ? __block() : Reflect.get(__view, "yield")) } });',
    "  const _ob = context.outputBuffer;",
  );
  for (const line of destructureLines(locals)) header.push(line);
  if (scope !== undefined) {
    const declared = new Set(locals.map((l) => l.name));
    const { names, guarded } = freeIdentifiers(body);
    const free = names.filter((name) => !declared.has(name));
    for (const [name, line] of Object.entries(INJECTED)) {
      if (!free.includes(name)) continue;
      free.splice(free.indexOf(name), 1);
      header.unshift(line);
    }
    if (free.length > 0) {
      const scopes = ast.localsSignature === null ? "[locals, this, TopLevel]" : "[this, TopLevel]";
      header.push(
        `  const __lookup = (name: string, guarded = false): any => { for (const scope of ${scopes} as object[]) if (name in scope) { const value: unknown = Reflect.get(scope, name); return scope === this && typeof value === "function" ? value.bind(this) : value; } if (guarded || name in globalThis) return Reflect.get(globalThis, name); const raise = (): never => { throw new ReferenceError(name + " is not defined"); }; return new Proxy(raise, { get: raise, has: raise, apply: raise, construct: raise, set: raise }); };`,
      );
    }
    for (const name of free) {
      const key = JSON.stringify(name);
      header.push(
        `  let ${name} = __lookup(${key}${guarded.has(name) ? ", true" : ""}) as Scope<${key}>;`,
      );
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

const INJECTED: Record<string, string> = {
  htmlSafe: 'import { htmlSafe } from "@blazetrails/activesupport";',
  RubyCompat: 'import * as RubyCompat from "@blazetrails/ruby-compat";',
  ArgumentError: 'import { ArgumentError } from "@blazetrails/ruby-compat";',
};

const UNDECLARABLE = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "globalThis",
  "Object",
  "Reflect",
  "TopLevel",
  "arguments",
  "eval",
  "context",
  "locals",
  "_ob",
  "__block",
  "localAssigns",
  "__view",
  "__lookup",
]);

function freeIdentifiers(body: readonly string[]): { names: string[]; guarded: Set<string> } {
  const sf = ts.createSourceFile(
    "body.ts",
    `async function __tse() {\n${body.join("\n")}\n}`,
    ts.ScriptTarget.ESNext,
    true,
  );
  const fn = sf.statements[0] as ts.FunctionDeclaration;
  const names = new Set<string>();
  const guarded = new Set<string>();
  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && isReference(node) && !UNDECLARABLE.has(node.text)) {
      if (!bound.has(node.text)) {
        names.add(node.text);
        if (ts.isTypeOfExpression(node.parent)) guarded.add(node.text);
      }
    }
    const inner = scopeBindings(node);
    const next = inner.size === 0 ? bound : new Set([...bound, ...inner]);
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(fn, new Set());
  return { names: [...names].sort(), guarded };
}

function scopeBindings(node: ts.Node): Set<string> {
  const bound = new Set<string>();
  const add = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) bound.add(name.text);
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) add(el.name);
  };
  if (ts.isFunctionLike(node)) {
    for (const param of node.parameters) add(param.name);
    if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
      bound.add(node.name.text);
    }
    const body = (node as { body?: ts.Node }).body;
    if (body !== undefined) for (const name of hoistedVars(body)) bound.add(name);
  }
  if (ts.isClassExpression(node) && node.name) bound.add(node.name.text);
  if (ts.isCatchClause(node) && node.variableDeclaration) add(node.variableDeclaration.name);
  if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    const init = node.initializer;
    if (init && ts.isVariableDeclarationList(init))
      for (const decl of init.declarations) add(decl.name);
  }
  if (ts.isBlock(node) || ts.isCaseBlock(node)) {
    const statements = ts.isCaseBlock(node)
      ? node.clauses.flatMap((clause) => [...clause.statements])
      : node.statements;
    for (const stmt of statements) {
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) add(decl.name);
      } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
        bound.add(stmt.name.text);
      }
    }
  }
  return bound;
}

function hoistedVars(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const add = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) add(el.name);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (
      ts.isVariableDeclarationList(node) &&
      (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using)) === 0
    ) {
      for (const decl of node.declarations) add(decl.name);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return names;
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
