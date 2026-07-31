/**
 * Structural handlers: program, module, class, singleton-class, and method
 * definitions. Modules flatten to a `// module X` comment plus their unwrapped
 * body (the file is the namespace); module-level `def`s become exported
 * functions (the repo's mixin-as-function runtime shape, TS types dropped),
 * while `def`s inside a `class` become method syntax (`class << self` members
 * become static). Locals assigned in a def body are hoisted into one `let`
 * declaration at the top — Ruby has no declaration statement to translate.
 */
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

/** Module/program level: defs become exported functions, the rest statements. */
function topLevel(body: PrismNode | null, e: Emitter): ts.Statement[] {
  return e.stmts(body, false);
}

/**
 * A class body: every def becomes a member; `class << self` bodies re-enter
 * with the static flag. Other constructs (macros, class-level statements)
 * have no JS class-member image, so they are SKIPPED from the emitted class
 * — but their whole subtree is counted passthrough, so the coverage number
 * stays honest about what the output omits.
 */
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

/** Count an omitted subtree as passthrough (mirrors Codegen's accounting). */
function recordSubtreePassthrough(n: PrismNode, e: Emitter): void {
  e.coverage.record(n.constructor.name, false);
  for (const c of n.compactChildNodes()) recordSubtreePassthrough(c, e);
}

function emitDef(n: PrismNode, e: Emitter): ts.Statement[] | null {
  if (e.inClass) {
    // Statement-position def inside a class body is handled via classMembers;
    // reaching here means a def in an unexpected position.
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
): { params: ts.ParameterDeclaration[] | null; body: ts.Block; isAsync: boolean } {
  // Async comes from the trails port (source of truth), never a constructor.
  const isAsync = defName !== "constructor" && e.asyncMethods.has(defName);

  const prevDef = e.currentDef;
  const prevDeclared = e.declared;
  const prevAsync = e.inAsyncMethod;
  e.currentDef = defName;
  (e as { declared: Set<string> }).declared = new Set();
  e.inAsyncMethod = isAsync;

  const params = emitParams(n.parameters as PrismNode | undefined, e);
  const paramNames = new Set(e.declared);
  const bodyStmts =
    params === null ? [] : e.stmts((n.body as PrismNode) ?? null, defName !== "constructor");
  const locals = [...e.declared].filter((d) => !paramNames.has(d));
  const body = f.createBlock([...hoistDecl(locals), ...bodyStmts], true);

  e.currentDef = prevDef;
  (e as { declared: Set<string> }).declared = prevDeclared;
  e.inAsyncMethod = prevAsync;
  return { params, body, isAsync };
}

/**
 * Render a Ruby parameter list: positionals, optionals-with-defaults,
 * `*rest` → `...rest`, keyword args collapsed to a destructured `{ ... }`
 * object param, and a trailing `&block` kept as a plain `block` param.
 * Forwarding (`...`) and other exotic shapes decline.
 */
function emitParams(params: PrismNode | undefined, e: Emitter): ts.ParameterDeclaration[] | null {
  if (!params) return [];
  const out: ts.ParameterDeclaration[] = [];
  const declare = (name: string) => e.declared.add(name);

  for (const p of (params.requireds as PrismNode[]) ?? []) {
    if (!p.name || !isBindableIdent(String(p.name))) return null; // destructured / reserved
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
    if (rest.constructor.name !== "RestParameterNode") return null; // `...` forwarding
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
        // Ruby keyword args are omittable as a group; default the object.
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
