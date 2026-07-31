import ts from "typescript";
import { rubyStr, type Emitter, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent } from "../naming.js";
const f = ts.factory;
const COMPOUND: Record<string, ts.BinaryOperator> = {
  "+": ts.SyntaxKind.PlusEqualsToken,
  "-": ts.SyntaxKind.MinusEqualsToken,
  "*": ts.SyntaxKind.AsteriskEqualsToken,
  "/": ts.SyntaxKind.SlashEqualsToken,
  "%": ts.SyntaxKind.PercentEqualsToken,
};
export function registerMisc(r: Registry): void {
  r.on("SplatNode", (n, e) => f.createSpreadElement(e.expr((n.expression as PrismNode) ?? null)));
  r.onManyStmt(["ForwardingSuperNode", "SuperNode"], (n, e, isLast) => {
    if (e.inClass || isLast) return null;
    return [];
  });
  r.onMany(["ForwardingSuperNode", "SuperNode"], (n, e) => {
    if (!e.inClass) return null;
    const args =
      n.constructor.name === "ForwardingSuperNode"
        ? [f.createSpreadElement(f.createIdentifier("arguments"))]
        : (((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? []).map((x) =>
            e.expr(x),
          );
    return f.createCallExpression(f.createSuper(), undefined, args);
  });
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
    const target = indexTarget(n, e);
    if (!target) return null;
    return f.createBinaryExpression(target, op, e.expr(n.value as PrismNode));
  });
  r.on("IndexOrWriteNode", (n, e) => {
    const target = indexTarget(n, e);
    if (!target) return null;
    return f.createBinaryExpression(
      target,
      ts.SyntaxKind.BarBarEqualsToken,
      e.expr(n.value as PrismNode),
    );
  });
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
    if (body.includes("\n") || body.length === 0) return null;
    return f.createRegularExpressionLiteral(`/${body}/`);
  });
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
function indexTarget(n: PrismNode, e: Emitter): ts.ElementAccessExpression | null {
  const idx = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  if (idx.length !== 1) return null;
  return f.createElementAccessExpression(e.expr(n.receiver as PrismNode), e.expr(idx[0]));
}
function symName(node: PrismNode): string | null {
  if (!node || node.constructor.name !== "SymbolNode") return null;
  const s = methodName(rubyStr(node.unescaped));
  return isBindableIdent(s) ? s : null;
}
