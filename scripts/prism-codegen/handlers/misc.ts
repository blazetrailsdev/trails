/**
 * Handlers for the long tail: splats, `super`, compound-assignment operators,
 * multi-assign targets, `defined?`, regexes, and `alias`. Each is a small,
 * self-contained registration — the point of the registry is that adding
 * these needed no change to any dispatch site.
 *
 * `super` is only handled inside a `class` body: the old string emitter
 * printed `super(...arguments)` into module-level free functions, where it is
 * a grammar error. Outside a class it declines (→ passthrough) — the mixin
 * runtime shape has no super chain to call.
 */
import ts from "typescript";
import { rubyStr, type Emitter, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent } from "../naming.js";

const f = ts.factory;

// Ruby compound-assignment operator → JS compound-assignment token, only where
// the operator itself has a faithful JS image (see INFIX in expressions.ts).
const COMPOUND: Record<string, ts.BinaryOperator> = {
  "+": ts.SyntaxKind.PlusEqualsToken,
  "-": ts.SyntaxKind.MinusEqualsToken,
  "*": ts.SyntaxKind.AsteriskEqualsToken,
  "/": ts.SyntaxKind.SlashEqualsToken,
  "%": ts.SyntaxKind.PercentEqualsToken,
};

export function registerMisc(r: Registry): void {
  r.on("SplatNode", (n, e) => f.createSpreadElement(e.expr((n.expression as PrismNode) ?? null)));

  r.onMany(["ForwardingSuperNode", "SuperNode"], (n, e) => {
    if (!e.inClass) return null; // no super chain in exported mixin functions
    const args =
      n.constructor.name === "ForwardingSuperNode"
        ? [f.createSpreadElement(f.createIdentifier("arguments"))]
        : (((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? []).map((x) =>
            e.expr(x),
          );
    return f.createCallExpression(f.createSuper(), undefined, args);
  });

  // Compound assignment: `x += 1`, `a.b -= 2`, `arr[i] *= 3`.
  r.on("LocalVariableOperatorWriteNode", (n, e) => {
    const op = COMPOUND[String(n.binaryOperator)];
    if (!op || !isBindableIdent(String(n.name))) return null;
    e.declared.add(String(n.name));
    return f.createBinaryExpression(
      f.createIdentifier(String(n.name)),
      op,
      e.expr(n.value as PrismNode),
    );
  });
  r.on("InstanceVariableOperatorWriteNode", (n, e) => {
    const op = COMPOUND[String(n.binaryOperator)];
    if (!op) return null;
    return f.createBinaryExpression(thisProp(n.name), op, e.expr(n.value as PrismNode));
  });
  r.on("CallOperatorWriteNode", (n, e) => {
    const op = COMPOUND[String(n.binaryOperator)];
    if (!op) return null;
    const prop = methodName(String(n.readName));
    if (n.receiver ? !isJsIdentName(prop) : !isBindableIdent(prop)) return null;
    const target = n.receiver
      ? f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), prop)
      : f.createIdentifier(prop);
    return f.createBinaryExpression(target, op, e.expr(n.value as PrismNode));
  });
  r.on("IndexOperatorWriteNode", (n, e) => {
    const op = COMPOUND[String(n.binaryOperator)];
    if (!op) return null;
    return f.createBinaryExpression(indexTarget(n, e), op, e.expr(n.value as PrismNode));
  });
  r.on("IndexOrWriteNode", (n, e) =>
    f.createBinaryExpression(
      indexTarget(n, e),
      ts.SyntaxKind.BarBarEqualsToken,
      e.expr(n.value as PrismNode),
    ),
  );

  // Multi-assign targets: `a, b = ...` (elements of the destructuring array).
  r.onMany(["LocalVariableTargetNode", "ConstantTargetNode"], (n, e) => {
    if (!isBindableIdent(String(n.name))) return null;
    e.declared.add(String(n.name));
    return f.createIdentifier(String(n.name));
  });
  r.on("InstanceVariableTargetNode", (n) => thisProp(n.name));
  r.on("CallTargetNode", (n, e) => {
    const prop = methodName(String(n.name));
    if (!isJsIdentName(prop)) return null;
    return f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), prop);
  });
  r.on("IndexTargetNode", (n, e) => indexTarget(n, e));
  r.on("MultiTargetNode", (n, e) =>
    f.createArrayLiteralExpression(((n.lefts as PrismNode[]) ?? []).map((l) => e.expr(l))),
  );

  r.on("DefinedNode", (n, e) =>
    f.createBinaryExpression(
      f.createTypeOfExpression(f.createParenthesizedExpression(e.expr(n.value as PrismNode))),
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      f.createStringLiteral("undefined"),
    ),
  );

  r.on("RegularExpressionNode", (n) => {
    const body = rubyStr(n.unescaped).replace(/(?<!\\)\//g, "\\/");
    if (body.includes("\n") || body.length === 0) return null; // Ruby /x/ or empty
    return f.createRegularExpressionLiteral(`/${body}/`);
  });

  // `alias new old` / `alias_method` — no direct JS statement; a const
  // aliasing assignment the mixin layer would realize.
  r.onStmt("AliasMethodNode", (n) => {
    const nn = symName(n.newName as PrismNode);
    const on = symName(n.oldName as PrismNode);
    if (!nn || !on) return null;
    return [
      f.createVariableStatement(
        undefined,
        f.createVariableDeclarationList(
          [f.createVariableDeclaration(nn, undefined, undefined, f.createIdentifier(on))],
          ts.NodeFlags.Const,
        ),
      ),
    ];
  });
}

function thisProp(name: unknown): ts.PropertyAccessExpression {
  return f.createPropertyAccessExpression(f.createThis(), String(name).replace(/^@+/, ""));
}

function indexTarget(n: PrismNode, e: Emitter): ts.ElementAccessExpression {
  const idx = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  return f.createElementAccessExpression(e.expr(n.receiver as PrismNode), e.expr(idx[0]));
}

function symName(node: PrismNode): string | null {
  if (!node || node.constructor.name !== "SymbolNode") return null;
  const s = methodName(rubyStr(node.unescaped));
  return isBindableIdent(s) ? s : null;
}
