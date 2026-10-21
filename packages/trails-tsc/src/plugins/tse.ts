import ts from "typescript-5";
import { rbEqual } from "@blazetrails/ruby-compat";
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
  trim?: boolean;
  preamble?: string;
  postamble?: string;
}

export interface HandlerTemplate {
  handler: object;
  type?: unknown;
  format?: string | null;
  shortIdentifier?: string | null;
}

export function tseHandlerScope(
  template: HandlerTemplate,
  annotateRenderedViewWithFilenames: boolean,
): Pick<TseScope, "escapeIgnore" | "trim" | "preamble" | "postamble"> {
  const ctor = template.handler.constructor as unknown as {
    escapeIgnoreList: string[];
    tseTrimMode: string;
  };
  const options: Pick<TseScope, "escapeIgnore" | "trim" | "preamble" | "postamble"> = {
    escapeIgnore:
      template.format != null && ctor.escapeIgnoreList.some((type) => rbEqual(type, template.type)),
    trim: ctor.tseTrimMode === "-",
  };
  if (
    annotateRenderedViewWithFilenames &&
    template.format === ":html" &&
    template.shortIdentifier
  ) {
    const id = template.shortIdentifier;
    options.preamble = `_ob.safeAppend(${JSON.stringify(`<!-- BEGIN ${id} -->`)});`;
    options.postamble = `_ob.safeAppend(${JSON.stringify(`<!-- END ${id} -->`)});`;
  }
  return options;
}

export function virtualizeTse(source: string, scope?: TseScope): string {
  return virtualizeTseWithDeltas(source, scope).ts;
}

export function virtualizeTseWithDeltas(source: string, scope?: TseScope): VirtualizeTseResult {
  const ast = parse(source, scope?.trim !== false);
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
    const scopes = ast.localsSignature === null ? "[locals, this, TopLevel]" : "[this, TopLevel]";
    header.push(...scopeLines(body, declared, scopes, (key) => `Scope<${key}>`, header));
  }
  if (scope?.preamble !== undefined) header.push(`  ${scope.preamble}`);
  const footer = [
    ...(scope?.postamble === undefined ? [] : [`  ${scope.postamble}`]),
    "  return _ob;",
    "}",
    "",
  ];

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

function scopeLines(
  body: readonly string[],
  declared: ReadonlySet<string>,
  scopes: string,
  type: (key: string) => string,
  imports: string[],
): string[] {
  const free = freeIdentifiers(body).filter((name) => !declared.has(name));
  for (const [name, line] of Object.entries(INJECTED)) {
    if (!free.includes(name)) continue;
    free.splice(free.indexOf(name), 1);
    imports.unshift(line);
  }
  if (free.length === 0) return [];
  return [
    "  const __own: Record<string, unknown> = Object.create(null);",
    `  const __lookup = (name: string, guarded = false): any => { for (const scope of [...${scopes}, __own, globalThis] as object[]) if (name in scope) { const value: unknown = Reflect.get(scope, name); return scope === this && typeof value === "function" ? value.bind(this) : value; } if (guarded) return undefined; throw new ReferenceError(name + " is not defined"); };`,
    `  const __assign = (name: string, value: unknown): any => { for (const scope of ${scopes} as object[]) if (name in scope) { Reflect.set(scope, name, value); return value; } __own[name] = value; return value; }; void __assign;`,
    "  const __sink: any = new Proxy({}, { set: (_target, name, value) => (__assign(name as string, value), true) }); void __sink;",
    ...free.map((name) => {
      const key = JSON.stringify(name);
      return `  let ${name} = __lookup(${key}, true) as ${type(key)};`;
    }),
  ];
}

export function virtualizeHandler(code: string, source: string): VirtualizeTseResult {
  const body = code.split("\n").map((line) => `  ${line}`);
  const header = [
    "/* virtualized from a template handler's call output */",
    'import { OutputBuffer, TopLevel } from "@blazetrails/actionview";',
    "export default async function render(",
    "  this: any,",
    "  context: any,",
    "  localAssigns: Record<string, unknown>,",
    "  _?: unknown,",
    "): Promise<any> {",
    "  const outputBuffer = context.outputBuffer; void outputBuffer; void OutputBuffer;",
  ];
  const declared = new Set(["outputBuffer", "OutputBuffer", "_"]);
  header.push(...scopeLines(body, declared, "[localAssigns, this, TopLevel]", () => "any", header));
  const ts = [...header, ...body, "}", ""].join("\n");
  const lastLine = Math.max(0, source.split("\n").length - 1);
  const mappings = body.map((_, i) => ({
    genLine: header.length + i,
    srcLine: Math.min(i, lastLine),
    genCol: 0,
    srcCol: 0,
  }));
  return { ts, deltas: [{ insertedAtLine: -1, lineCount: header.length }], mappings };
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
  "__assign",
  "__own",
  "__sink",
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
  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && isReference(node) && !UNDECLARABLE.has(node.text)) {
      if (!bound.has(node.text)) {
        names.add(node.text);
      }
    }
    const inner = scopeBindings(node);
    const next = inner.size === 0 ? bound : new Set([...bound, ...inner]);
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(fn, new Set());
  return [...names].sort();
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

function isReference(node: ts.Identifier, parent: ts.Node = node.parent): boolean {
  const p = parent as ts.Node & {
    name?: ts.Node;
    propertyName?: ts.Node;
    label?: ts.Node;
  };
  if (ts.isShorthandPropertyAssignment(p)) return true;
  return p.name !== node && p.propertyName !== node && p.label !== node;
}

const COMPOUND: Partial<Record<ts.SyntaxKind, ts.BinaryOperator>> = {
  [ts.SyntaxKind.PlusEqualsToken]: ts.SyntaxKind.PlusToken,
  [ts.SyntaxKind.MinusEqualsToken]: ts.SyntaxKind.MinusToken,
  [ts.SyntaxKind.AsteriskEqualsToken]: ts.SyntaxKind.AsteriskToken,
  [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: ts.SyntaxKind.AsteriskAsteriskToken,
  [ts.SyntaxKind.SlashEqualsToken]: ts.SyntaxKind.SlashToken,
  [ts.SyntaxKind.PercentEqualsToken]: ts.SyntaxKind.PercentToken,
  [ts.SyntaxKind.LessThanLessThanEqualsToken]: ts.SyntaxKind.LessThanLessThanToken,
  [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: ts.SyntaxKind.GreaterThanGreaterThanToken,
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]:
    ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  [ts.SyntaxKind.AmpersandEqualsToken]: ts.SyntaxKind.AmpersandToken,
  [ts.SyntaxKind.BarEqualsToken]: ts.SyntaxKind.BarToken,
  [ts.SyntaxKind.CaretEqualsToken]: ts.SyntaxKind.CaretToken,
  [ts.SyntaxKind.AmpersandAmpersandEqualsToken]: ts.SyntaxKind.AmpersandAmpersandToken,
  [ts.SyntaxKind.BarBarEqualsToken]: ts.SyntaxKind.BarBarToken,
  [ts.SyntaxKind.QuestionQuestionEqualsToken]: ts.SyntaxKind.QuestionQuestionToken,
};

const SHORT_CIRCUIT = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

export const tseLookupTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
  const f = context.factory;
  const lookup = (name: string, guarded = false): ts.Expression =>
    f.createCallExpression(f.createIdentifier("__lookup"), undefined, [
      f.createStringLiteral(name),
      ...(guarded ? [f.createTrue()] : []),
    ]);
  const sink = (name: string): ts.Expression =>
    f.createPropertyAccessExpression(f.createIdentifier("__sink"), name);
  const assign = (name: string, value: ts.Expression): ts.Expression =>
    f.createCallExpression(f.createIdentifier("__assign"), undefined, [
      f.createStringLiteral(name),
      value,
    ]);
  return (sf) => {
    const rewrite = (fn: ts.FunctionLikeDeclaration & { body: ts.Block }): ts.Block => {
      const names = new Set<string>();
      const statements = fn.body.statements.filter((stmt) => {
        if (!ts.isVariableStatement(stmt)) return true;
        for (const decl of stmt.declarationList.declarations) {
          let init = decl.initializer;
          while (init && ts.isAsExpression(init)) init = init.expression;
          if (
            init &&
            ts.isCallExpression(init) &&
            ts.isIdentifier(init.expression) &&
            init.expression.text === "__lookup" &&
            ts.isIdentifier(decl.name)
          ) {
            names.add(decl.name.text);
            return false;
          }
        }
        return true;
      });
      const visit = (node: ts.Node, parent: ts.Node, bound: ReadonlySet<string>): ts.Node => {
        const free = (name: ts.Node): name is ts.Identifier =>
          ts.isIdentifier(name) && names.has(name.text) && !bound.has(name.text);
        const child = (n: ts.Expression): ts.Expression => visit(n, node, bound) as ts.Expression;
        if (ts.isTypeOfExpression(node) && free(unparenthesized(node.expression))) {
          const name = (unparenthesized(node.expression) as ts.Identifier).text;
          return f.updateTypeOfExpression(node, lookup(name, true));
        }
        if (ts.isShorthandPropertyAssignment(node) && free(node.name)) {
          return f.createPropertyAssignment(node.name.text, lookup(node.name.text));
        }
        const pattern = (target: ts.Expression): ts.Expression => {
          if (free(target)) return sink(target.text);
          if (ts.isArrayLiteralExpression(target)) {
            return f.updateArrayLiteralExpression(
              target,
              target.elements.map((el) =>
                ts.isSpreadElement(el)
                  ? f.updateSpreadElement(el, pattern(el.expression))
                  : pattern(el),
              ),
            );
          }
          if (ts.isObjectLiteralExpression(target)) {
            return f.updateObjectLiteralExpression(
              target,
              target.properties.map((p) => {
                if (ts.isShorthandPropertyAssignment(p) && free(p.name)) {
                  const value = p.objectAssignmentInitializer
                    ? f.createAssignment(sink(p.name.text), child(p.objectAssignmentInitializer))
                    : sink(p.name.text);
                  return f.createPropertyAssignment(p.name.text, value);
                }
                if (ts.isPropertyAssignment(p)) {
                  return f.updatePropertyAssignment(p, p.name, pattern(p.initializer));
                }
                if (ts.isSpreadAssignment(p)) {
                  return f.updateSpreadAssignment(p, pattern(p.expression));
                }
                return visit(p, target, bound) as ts.ObjectLiteralElementLike;
              }),
            );
          }
          if (
            ts.isBinaryExpression(target) &&
            target.operatorToken.kind === ts.SyntaxKind.EqualsToken
          ) {
            return f.updateBinaryExpression(
              target,
              pattern(target.left),
              target.operatorToken,
              child(target.right),
            );
          }
          return child(target);
        };
        if (
          (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
          !ts.isVariableDeclarationList(node.initializer)
        ) {
          const initializer = pattern(node.initializer);
          const expression = child(node.expression);
          const statement = visit(node.statement, node, bound) as ts.Statement;
          return ts.isForOfStatement(node)
            ? f.updateForOfStatement(node, node.awaitModifier, initializer, expression, statement)
            : f.updateForInStatement(node, initializer, expression, statement);
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          (ts.isArrayLiteralExpression(node.left) || ts.isObjectLiteralExpression(node.left))
        ) {
          return f.updateBinaryExpression(
            node,
            pattern(node.left),
            node.operatorToken,
            child(node.right),
          );
        }
        if (ts.isBinaryExpression(node) && free(node.left)) {
          const name = node.left.text;
          const kind = node.operatorToken.kind;
          if (kind === ts.SyntaxKind.EqualsToken) {
            return ts.setTextRange(assign(name, child(node.right)), node);
          }
          const op = COMPOUND[kind];
          if (op !== undefined) {
            const value = SHORT_CIRCUIT.has(op)
              ? f.createBinaryExpression(lookup(name), op, assign(name, child(node.right)))
              : assign(name, f.createBinaryExpression(lookup(name), op, child(node.right)));
            return ts.setTextRange(f.createParenthesizedExpression(value), node);
          }
        }
        if (
          (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) &&
          free(node.operand)
        ) {
          const name = node.operand.text;
          const plus = node.operator === ts.SyntaxKind.PlusPlusToken;
          const step = (value: ts.Expression, up: boolean): ts.Expression =>
            f.createBinaryExpression(
              value,
              up ? ts.SyntaxKind.PlusToken : ts.SyntaxKind.MinusToken,
              f.createNumericLiteral(1),
            );
          const updated = assign(name, step(f.createPrefixPlus(lookup(name)), plus));
          return f.createParenthesizedExpression(
            ts.isPrefixUnaryExpression(node) ? updated : step(updated, !plus),
          );
        }
        if (free(node) && isReference(node, parent)) {
          return ts.setTextRange(lookup(node.text), node);
        }
        if (ts.isTypeNode(node)) return node;
        const inner = scopeBindings(node);
        const next = inner.size === 0 ? bound : new Set([...bound, ...inner]);
        return ts.visitEachChild(node, (c) => visit(c, node, next), context);
      };
      const top = new Set(
        [...scopeBindings(fn), ...scopeBindings(fn.body)].filter((n) => !names.has(n)),
      );
      return f.updateBlock(
        fn.body,
        statements.map((stmt) => visit(stmt, fn.body, top) as ts.Statement),
      );
    };
    const visitTop = (node: ts.Node): ts.Node => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "render" && node.body) {
        return f.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          rewrite(node as ts.FunctionDeclaration & { body: ts.Block }),
        );
      }
      return node;
    };
    return ts.visitEachChild(sf, visitTop, context);
  };
};

function unparenthesized(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

export function transpileTse(source: string): { outputText: string; sourceMapText: string } {
  const { outputText, sourceMapText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      isolatedModules: true,
      sourceMap: true,
    },
    transformers: { before: [tseLookupTransformer] },
  });
  return { outputText, sourceMapText: sourceMapText! };
}
