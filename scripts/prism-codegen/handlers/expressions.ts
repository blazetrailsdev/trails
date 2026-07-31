import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent } from "../naming.js";
import { rubyStr } from "../types.js";
import { TOPLEVEL } from "../codegen.js";
const f = ts.factory;
const INFIX: Record<string, ts.BinaryOperator> = {
  "==": ts.SyntaxKind.EqualsEqualsEqualsToken,
  "!=": ts.SyntaxKind.ExclamationEqualsEqualsToken,
  "<": ts.SyntaxKind.LessThanToken,
  ">": ts.SyntaxKind.GreaterThanToken,
  "<=": ts.SyntaxKind.LessThanEqualsToken,
  ">=": ts.SyntaxKind.GreaterThanEqualsToken,
  "+": ts.SyntaxKind.PlusToken,
  "-": ts.SyntaxKind.MinusToken,
  "*": ts.SyntaxKind.AsteriskToken,
  "/": ts.SyntaxKind.SlashToken,
  "%": ts.SyntaxKind.PercentToken,
};
export function registerExpressions(r: Registry): void {
  r.on("CallNode", (n, e) => emitCall(n, e));
  r.on("SelfNode", () => f.createThis());
  r.on("LocalVariableReadNode", (n) =>
    isBindableIdent(String(n.name)) ? f.createIdentifier(String(n.name)) : null,
  );
  r.on("ConstantReadNode", (n) => f.createIdentifier(String(n.name)));
  r.on("InstanceVariableReadNode", (n) => thisProp(n.name));
  r.on("ClassVariableReadNode", (n) =>
    f.createPropertyAccessExpression(
      f.createPropertyAccessExpression(f.createThis(), "constructor"),
      ivar(n.name),
    ),
  );
  r.on("GlobalVariableReadNode", (n) =>
    f.createPropertyAccessExpression(f.createIdentifier("globalThis"), ivar(n.name)),
  );
  r.on("ConstantPathNode", (n, e) => {
    if (!n.parent) return f.createIdentifier(String(n.name));
    return f.createPropertyAccessExpression(e.expr(n.parent as PrismNode), String(n.name));
  });
  r.on("LocalVariableWriteNode", (n, e) => {
    if (!isBindableIdent(String(n.name))) return null;
    e.declared.add(String(n.name));
    return f.createAssignment(f.createIdentifier(String(n.name)), e.expr(n.value as PrismNode));
  });
  r.on("InstanceVariableWriteNode", (n, e) =>
    f.createAssignment(thisProp(n.name), e.expr(n.value as PrismNode)),
  );
  r.on("ClassVariableWriteNode", (n, e) =>
    f.createAssignment(
      f.createPropertyAccessExpression(
        f.createPropertyAccessExpression(f.createThis(), "constructor"),
        ivar(n.name),
      ),
      e.expr(n.value as PrismNode),
    ),
  );
  r.on("GlobalVariableWriteNode", (n, e) =>
    f.createAssignment(
      f.createPropertyAccessExpression(f.createIdentifier("globalThis"), ivar(n.name)),
      e.expr(n.value as PrismNode),
    ),
  );
  r.on("MultiWriteNode", (n, e) => {
    if (n.rest || !((n.lefts as PrismNode[]) ?? []).every(isEmittableTarget)) return null;
    const lefts = ((n.lefts as PrismNode[]) ?? []).map((l) => e.expr(l));
    return f.createAssignment(f.createArrayLiteralExpression(lefts), e.expr(n.value as PrismNode));
  });
  r.on("LocalVariableOrWriteNode", (n, e) => {
    if (!isBindableIdent(String(n.name))) return null;
    e.declared.add(String(n.name));
    return logicalWrite(f.createIdentifier(String(n.name)), ts.SyntaxKind.BarBarEqualsToken, n, e);
  });
  r.on("LocalVariableAndWriteNode", (n, e) => {
    if (!isBindableIdent(String(n.name))) return null;
    e.declared.add(String(n.name));
    return logicalWrite(
      f.createIdentifier(String(n.name)),
      ts.SyntaxKind.AmpersandAmpersandEqualsToken,
      n,
      e,
    );
  });
  r.on("InstanceVariableOrWriteNode", (n, e) =>
    logicalWrite(thisProp(n.name), ts.SyntaxKind.BarBarEqualsToken, n, e),
  );
  r.on("InstanceVariableAndWriteNode", (n, e) =>
    logicalWrite(thisProp(n.name), ts.SyntaxKind.AmpersandAmpersandEqualsToken, n, e),
  );
  r.on("AndNode", (n, e) =>
    f.createLogicalAnd(e.expr(n.left as PrismNode), e.expr(n.right as PrismNode)),
  );
  r.on("OrNode", (n, e) =>
    f.createLogicalOr(e.expr(n.left as PrismNode), e.expr(n.right as PrismNode)),
  );
  r.on("ParenthesesNode", (n, e) => {
    const body = (n.body as PrismNode | null)?.compactChildNodes?.() ?? [];
    if (body.length !== 1) return null;
    return f.createParenthesizedExpression(e.expr(body[0]));
  });
  r.onStmt("ConstantWriteNode", (n, e) => [
    f.createVariableStatement(
      undefined,
      f.createVariableDeclarationList(
        [
          f.createVariableDeclaration(
            String(n.name),
            undefined,
            undefined,
            e.expr(n.value as PrismNode),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ]);
}
function ivar(name: unknown): string {
  return String(name).replace(/^@+/, "").replace(/^\$/, "");
}
function thisProp(name: unknown): ts.PropertyAccessExpression {
  return f.createPropertyAccessExpression(f.createThis(), ivar(name));
}
function logicalWrite(
  target: ts.Expression,
  op:
    | ts.LogicalOperatorOrHigher
    | ts.SyntaxKind.BarBarEqualsToken
    | ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  n: PrismNode,
  e: Emitter,
): ts.Expression {
  return f.createBinaryExpression(target, op as ts.BinaryOperator, e.expr(n.value as PrismNode));
}
function argExprs(node: PrismNode | undefined | null, e: Emitter): ts.Expression[] {
  const list = (node?.arguments_ as PrismNode[]) ?? [];
  return list.map((a) => e.expr(a));
}
function emitCall(n: PrismNode, e: Emitter): ts.Expression | null {
  const name = String(n.name);
  const argNodes = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  const hasRecv = n.receiver != null;
  const block = n.block as PrismNode | undefined;

  if (name === "[]" && hasRecv) {
    if (argNodes.length !== 1) return null;
    return f.createElementAccessExpression(e.expr(n.receiver as PrismNode), e.expr(argNodes[0]));
  }
  if (name === "[]=" && hasRecv) {
    if (argNodes.length !== 2) return null;
    return f.createAssignment(
      f.createElementAccessExpression(e.expr(n.receiver as PrismNode), e.expr(argNodes[0])),
      e.expr(argNodes[1]),
    );
  }
  if (name === "!" && hasRecv) return f.createLogicalNot(e.expr(n.receiver as PrismNode));
  if (name === "-@" && hasRecv) {
    return f.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, e.expr(n.receiver as PrismNode));
  }
  if (name === "+@" && hasRecv) {
    return f.createPrefixUnaryExpression(ts.SyntaxKind.PlusToken, e.expr(n.receiver as PrismNode));
  }
  if (name === "<<" && hasRecv && argNodes.length === 1) {
    return f.createCallExpression(
      f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), "push"),
      undefined,
      [e.expr(argNodes[0])],
    );
  }
  if (hasRecv && INFIX[name] && argNodes.length === 1) {
    return f.createBinaryExpression(
      e.expr(n.receiver as PrismNode),
      INFIX[name],
      e.expr(argNodes[0]),
    );
  }
  if (name === "new" && hasRecv) {
    return f.createNewExpression(
      e.expr(n.receiver as PrismNode),
      undefined,
      argExprs(n.arguments_ as PrismNode, e),
    );
  }

  if (name === "block_given?" && !hasRecv && argNodes.length === 0 && !n.block) {
    if (!e.blockParamName) return null;
    return f.createBinaryExpression(
      f.createIdentifier(e.blockParamName),
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      f.createIdentifier("undefined"),
    );
  }
  if (name.endsWith("=") && !INFIX[name] && name !== "[]=" && hasRecv && argNodes.length === 1) {
    const prop = methodName(name.slice(0, -1));
    if (!isJsIdentName(prop)) return null;
    return f.createAssignment(
      f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), prop),
      e.expr(argNodes[0]),
    );
  }
  if (name === "raise" && !hasRecv && argNodes.length > 0 && !n.block) {
    const headKind = argNodes[0].constructor.name;
    if (argNodes.length > 1 && headKind !== "ConstantReadNode" && headKind !== "ConstantPathNode") {
      return null;
    }
    const thrown =
      argNodes.length === 1
        ? e.expr(argNodes[0])
        : f.createNewExpression(
            e.expr(argNodes[0]),
            undefined,
            argNodes.slice(1).map((a) => e.expr(a)),
          );
    return f.createCallExpression(
      f.createParenthesizedExpression(
        f.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          f.createBlock([f.createThrowStatement(thrown)], false),
        ),
      ),
      undefined,
      [],
    );
  }
  const jsName = methodName(name);
  const selfCall = !hasRecv && e.currentDef !== TOPLEVEL;
  if (hasRecv || selfCall ? !isJsIdentName(jsName) : !isBindableIdent(jsName)) return null;
  let blockParams: string[] | null = null;
  let symToProc: string | null = null;
  if (block) {
    const blockKind = block.constructor.name;
    if (blockKind === "BlockArgumentNode") {
      const inner = block.expression as PrismNode | null;
      if (inner?.constructor.name === "SymbolNode") {
        const sym = methodName(rubyStr(inner.unescaped));
        if (!isJsIdentName(sym)) return null;
        symToProc = sym;
      }
    } else if (blockKind === "BlockNode") {
      blockParams = blockParamNames(block.parameters as PrismNode | undefined);
      if (!blockParams) return null;
    } else {
      return null;
    }
  }

  const recv = hasRecv ? e.expr(n.receiver as PrismNode) : undefined;
  const callArgs = argExprs(n.arguments_ as PrismNode, e);
  if (block) {
    if (symToProc) {
      callArgs.push(symToProcArrow(symToProc));
    } else if (block.constructor.name === "BlockArgumentNode") {
      callArgs.push(e.expr(block.expression as PrismNode));
    } else {
      callArgs.push(blockToArrow(block, blockParams ?? [], e));
    }
  }
  const target: ts.Expression = recv
    ? f.createPropertyAccessExpression(recv, jsName)
    : selfCall
      ? f.createPropertyAccessExpression(f.createThis(), jsName)
      : f.createIdentifier(jsName);
  if (!recv && callArgs.length === 0 && !block && !hasParens(n)) return target;
  const call = f.createCallExpression(target, undefined, callArgs);
  return e.inAsyncMethod && e.asyncMethods.has(jsName) ? f.createAwaitExpression(call) : call;
}
function symToProcArrow(prop: string): ts.ArrowFunction {
  return f.createArrowFunction(
    undefined,
    undefined,
    [f.createParameterDeclaration(undefined, undefined, "x")],
    undefined,
    undefined,
    f.createCallExpression(
      f.createPropertyAccessExpression(f.createIdentifier("x"), prop),
      undefined,
      [],
    ),
  );
}
function hasParens(n: PrismNode): boolean {
  return n.openingLoc != null;
}
function blockToArrow(block: PrismNode, names: string[], e: Emitter): ts.ArrowFunction {
  const params = names.map((p) => f.createParameterDeclaration(undefined, undefined, p));
  const prevLoop = e.inLoop;
  e.inLoop = false;
  const body = e.stmts((block.body as PrismNode) ?? null, true);
  e.inLoop = prevLoop;
  if (body.length === 1 && ts.isReturnStatement(body[0]) && body[0].expression) {
    return f.createArrowFunction(
      undefined,
      undefined,
      params,
      undefined,
      undefined,
      body[0].expression,
    );
  }
  return f.createArrowFunction(
    undefined,
    undefined,
    params,
    undefined,
    undefined,
    f.createBlock(body, true),
  );
}
function blockParamNames(params: PrismNode | undefined): string[] | null {
  if (!params) return [];
  const inner = (params.parameters as PrismNode) ?? params;
  const reqs = (inner.requireds as PrismNode[]) ?? [];
  const names: string[] = [];
  for (const p of reqs) {
    const name = String(p.name ?? "");
    if (!isBindableIdent(name)) return null;
    names.push(name);
  }
  return names;
}

function isEmittableTarget(t: PrismNode): boolean {
  switch (t.constructor.name) {
    case "LocalVariableTargetNode":
    case "ConstantTargetNode":
      return isBindableIdent(String(t.name));
    case "InstanceVariableTargetNode":
      return true;
    case "CallTargetNode":
      return isJsIdentName(methodName(String(t.name)));
    case "IndexTargetNode":
      return (((t.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? []).length === 1;
    case "MultiTargetNode":
      return !t.rest && ((t.lefts as PrismNode[]) ?? []).every(isEmittableTarget);
    default:
      return false;
  }
}
