import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent } from "../naming.js";
const f = ts.factory;
export function registerStructure(r: Registry): void {
  r.onStmt("ProgramNode", (n, e) => {
    const body = topLevel((n.statements as PrismNode) ?? null, e);
    return hoistLocals(body, e);
  });
  r.onStmt("ModuleNode", (n, e) => {
    const name = constName(n.constantPath as PrismNode, n.name);
    const body = topLevel((n.body as PrismNode) ?? null, e);
    if (body.length) {
      ts.addSyntheticLeadingComment(
        body[0],
        ts.SyntaxKind.SingleLineCommentTrivia,
        ` module ${name}`,
        true,
      );
    }
    return body;
  });
  r.onStmt("ClassNode", (n, e) => {
    const name = constName(n.constantPath as PrismNode, n.name);
    if (!isJsIdentName(name)) return null;
    const heritage = n.superclass
      ? [
          f.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
            f.createExpressionWithTypeArguments(e.expr(n.superclass as PrismNode), undefined),
          ]),
        ]
      : undefined;
    const prev = e.inClass;
    e.inClass = true;
    const members = classMembers((n.body as PrismNode) ?? null, e);
    e.inClass = prev;
    return [
      f.createClassDeclaration(
        [f.createToken(ts.SyntaxKind.ExportKeyword)],
        name,
        undefined,
        heritage,
        members,
      ),
    ];
  });
  r.onStmt("DefNode", (n, e) => emitDef(n, e));
}
function topLevel(body: PrismNode | null, e: Emitter): ts.Statement[] {
  return e.stmts(body, false);
}
function classMembers(body: PrismNode | null, e: Emitter): ts.ClassElement[] {
  if (!body) return [];
  const kids = body.constructor?.name === "StatementsNode" ? body.compactChildNodes() : [body];
  if (body.constructor?.name === "StatementsNode") e.coverage.record("StatementsNode", true);
  const out: ts.ClassElement[] = [];
  for (const k of kids) {
    const kind = k.constructor.name;
    if (kind === "DefNode") {
      const m = defAsMember(k, e);
      if (m) out.push(m);
      else recordSubtreePassthrough(k, e);
    } else if (
      kind === "SingletonClassNode" &&
      (k.expression as PrismNode | null)?.constructor.name === "SelfNode"
    ) {
      e.coverage.record("SingletonClassNode", true);
      const prev = e.inSingleton;
      e.inSingleton = true;
      out.push(...classMembers((k.body as PrismNode) ?? null, e));
      e.inSingleton = prev;
    } else {
      recordSubtreePassthrough(k, e);
    }
  }
  return out;
}
function recordSubtreePassthrough(n: PrismNode, e: Emitter): void {
  e.coverage.record(n.constructor.name, false);
  for (const c of n.compactChildNodes()) recordSubtreePassthrough(c, e);
}
function emitDef(n: PrismNode, e: Emitter): ts.Statement[] | null {
  if (e.inClass) {
    return null;
  }
  const name = methodName(String(n.name));
  if (!isBindableIdent(name)) return null;
  const { params, body, isAsync } = defParts(n, e, name);
  if (!params) return null;
  return [
    f.createFunctionDeclaration(
      [
        f.createToken(ts.SyntaxKind.ExportKeyword),
        ...(isAsync ? [f.createToken(ts.SyntaxKind.AsyncKeyword)] : []),
      ],
      undefined,
      name,
      undefined,
      params,
      undefined,
      body,
    ),
  ];
}
function defAsMember(n: PrismNode, e: Emitter): ts.ClassElement | null {
  const isCtor = String(n.name) === "initialize";
  const name = isCtor ? "constructor" : methodName(String(n.name));
  if (!isJsIdentName(name)) return null;
  const isStatic =
    e.inSingleton ||
    (n.receiver != null && (n.receiver as PrismNode).constructor.name === "SelfNode");
  const { params, body, isAsync } = defParts(n, e, isCtor ? "constructor" : name);
  if (!params) return null;
  e.coverage.record("DefNode", true);
  if (isCtor && !isStatic) {
    return f.createConstructorDeclaration(undefined, params, body);
  }
  return f.createMethodDeclaration(
    [
      ...(isStatic ? [f.createToken(ts.SyntaxKind.StaticKeyword)] : []),
      ...(isAsync ? [f.createToken(ts.SyntaxKind.AsyncKeyword)] : []),
    ],
    undefined,
    name,
    undefined,
    undefined,
    params,
    undefined,
    body,
  );
}
function defParts(
  n: PrismNode,
  e: Emitter,
  defName: string,
): {
  params: ts.ParameterDeclaration[] | null;
  body: ts.Block;
  isAsync: boolean;
} {
  const isAsync = defName !== "constructor" && e.asyncMethods.has(defName);
  const prevDef = e.currentDef;
  const prevDeclared = e.declared;
  const prevAsync = e.inAsyncMethod;
  const prevLoop = e.inLoop;
  const prevBlockName = e.blockParamName;
  e.currentDef = defName;
  (
    e as {
      declared: Set<string>;
    }
  ).declared = new Set();
  e.inAsyncMethod = isAsync;
  e.inLoop = false;
  const params = emitParams(n.parameters as PrismNode | undefined, e);
  const explicitBlock = (n.parameters as PrismNode | null)?.block as PrismNode | null;
  if (explicitBlock) {
    e.blockParamName = explicitBlock.name ? String(explicitBlock.name) : "block";
  } else if (params !== null && usesImplicitBlock(n.body as PrismNode | null)) {
    params.push(f.createParameterDeclaration(undefined, undefined, "block"));
    e.declared.add("block");
    e.blockParamName = "block";
  } else {
    e.blockParamName = null;
  }
  const paramNames = new Set(e.declared);
  const bodyStmts =
    params === null ? [] : e.stmts((n.body as PrismNode) ?? null, defName !== "constructor");
  const locals = [...e.declared].filter((d) => !paramNames.has(d));
  const body = f.createBlock([...hoistDecl(locals), ...bodyStmts], true);
  e.currentDef = prevDef;
  (
    e as {
      declared: Set<string>;
    }
  ).declared = prevDeclared;
  e.inAsyncMethod = prevAsync;
  e.inLoop = prevLoop;
  e.blockParamName = prevBlockName;
  return { params, body, isAsync };
}
function emitParams(params: PrismNode | undefined, e: Emitter): ts.ParameterDeclaration[] | null {
  if (!params) return [];
  const out: ts.ParameterDeclaration[] = [];
  const declare = (name: string) => e.declared.add(name);
  for (const p of (params.requireds as PrismNode[]) ?? []) {
    if (!p.name || !isBindableIdent(String(p.name))) return null;
    out.push(f.createParameterDeclaration(undefined, undefined, String(p.name)));
    declare(String(p.name));
  }
  for (const p of (params.optionals as PrismNode[]) ?? []) {
    if (!isBindableIdent(String(p.name))) return null;
    out.push(
      f.createParameterDeclaration(
        undefined,
        undefined,
        String(p.name),
        undefined,
        undefined,
        e.expr((p.value as PrismNode) ?? null),
      ),
    );
    declare(String(p.name));
  }
  const rest = params.rest as PrismNode | null;
  if (rest) {
    if (rest.constructor.name !== "RestParameterNode") return null;
    const rn = rest.name ? String(rest.name) : "rest";
    if (!isBindableIdent(rn)) return null;
    out.push(
      f.createParameterDeclaration(undefined, f.createToken(ts.SyntaxKind.DotDotDotToken), rn),
    );
    declare(rn);
  }
  const kw = (params.keywords as PrismNode[]) ?? [];
  if (kw.length || params.keywordRest) {
    const elements: ts.BindingElement[] = [];
    for (const k of kw) {
      const kn = String(k.name).replace(/:$/, "");
      if (!isBindableIdent(kn)) return null;
      elements.push(
        f.createBindingElement(
          undefined,
          undefined,
          kn,
          k.value ? e.expr(k.value as PrismNode) : undefined,
        ),
      );
      declare(kn);
    }
    if (params.keywordRest) {
      const krest = params.keywordRest as PrismNode;
      if (krest.constructor.name !== "KeywordRestParameterNode") return null;
      const krn = krest.name ? String(krest.name) : "opts";
      elements.push(
        f.createBindingElement(f.createToken(ts.SyntaxKind.DotDotDotToken), undefined, krn),
      );
      declare(krn);
    }
    out.push(
      f.createParameterDeclaration(
        undefined,
        undefined,
        f.createObjectBindingPattern(elements),
        undefined,
        undefined,
        f.createObjectLiteralExpression([], false),
      ),
    );
  }
  const block = params.block as PrismNode | null;
  if (block) {
    const bn = block.name ? String(block.name) : "block";
    if (!isBindableIdent(bn)) return null;
    out.push(f.createParameterDeclaration(undefined, undefined, bn));
    declare(bn);
  }
  return out;
}
function usesImplicitBlock(n: PrismNode | null): boolean {
  if (!n) return false;
  const kind = n.constructor.name;
  if (kind === "DefNode") return false;
  if (kind === "YieldNode") return true;
  if (kind === "CallNode" && String(n.name) === "block_given?" && !n.receiver) return true;
  return n.compactChildNodes().some((c) => usesImplicitBlock(c));
}
function hoistDecl(locals: string[]): ts.Statement[] {
  if (!locals.length) return [];
  return [
    f.createVariableStatement(
      undefined,
      f.createVariableDeclarationList(
        locals.map((l) => f.createVariableDeclaration(l)),
        ts.NodeFlags.Let,
      ),
    ),
  ];
}
function hoistLocals(body: ts.Statement[], e: Emitter): ts.Statement[] {
  return [...hoistDecl([...e.declared]), ...body];
}
function constName(path: PrismNode | undefined, name: unknown): string {
  if (path && path.constructor.name === "ConstantPathNode") {
    const parts: string[] = [];
    let cur: PrismNode | undefined = path;
    while (cur && cur.constructor.name === "ConstantPathNode") {
      parts.unshift(String(cur.name));
      cur = cur.parent as PrismNode | undefined;
    }
    if (cur) parts.unshift(String(cur.name));
    return parts.join(".");
  }
  return String(name ?? "Anon");
}
