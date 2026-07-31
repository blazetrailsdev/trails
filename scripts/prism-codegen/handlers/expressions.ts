/**
 * Expression handlers: calls (incl. operator-method calls), variable / ivar /
 * cvar / global / constant reads and writes, self, and the boolean/assignment
 * operators. The call handler is where the honesty bar bites: a Ruby operator
 * method with no JS operator image (`<<`, `<=>`) and a method whose mapped
 * name is not a valid JS identifier both DECLINE (→ passthrough) instead of
 * printing Ruby syntax into the output.
 */
import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent } from "../naming.js";

const f = ts.factory;

// Ruby operator-method → JS binary operator, only where the port's own
// conventions already equate them (Ruby `==` is written `===` in ported code).
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
    const lefts = ((n.lefts as PrismNode[]) ?? []).map((l) => e.expr(l));
    return f.createAssignment(f.createArrayLiteralExpression(lefts), e.expr(n.value as PrismNode));
  });

  // Or/And-write operators map cleanly onto JS logical-assignment.
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

  // Module-level `CONST = value` → a const declaration.
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
  const recv = n.receiver ? e.expr(n.receiver as PrismNode) : undefined;

  // Index read/write: a[b] / a[b] = c
  if (name === "[]" && recv) {
    return f.createElementAccessExpression(recv, e.expr(argNodes[0]));
  }
  if (name === "[]=" && recv && argNodes.length >= 2) {
    return f.createAssignment(
      f.createElementAccessExpression(recv, e.expr(argNodes[0])),
      e.expr(argNodes[argNodes.length - 1]),
    );
  }

  // Unary operators.
  if (name === "!" && recv) return f.createLogicalNot(recv);
  if (name === "-@" && recv) return f.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, recv);
  if (name === "+@" && recv) return f.createPrefixUnaryExpression(ts.SyntaxKind.PlusToken, recv);

  // Binary operator methods with a faithful JS operator image.
  if (recv && INFIX[name] && argNodes.length === 1) {
    return f.createBinaryExpression(recv, INFIX[name], e.expr(argNodes[0]));
  }

  // Established repo convention: `Klass.new(...)` → `new Klass(...)`.
  if (name === "new" && recv) {
    return f.createNewExpression(recv, undefined, argExprs(n.arguments_ as PrismNode, e));
  }

  const jsName = methodName(name);
  // Operator methods with no JS image (`<<`, `<=>`, `=~`, …) and names that
  // don't map to a valid identifier: decline — passthrough, not Ruby syntax.
  // Reserved words are fine as PROPERTY names (`x.delete()`) but not as bare
  // identifiers (`delete(...)`).
  if (recv ? !isJsIdentName(jsName) : !isBindableIdent(jsName)) return null;

  const block = n.block as PrismNode | undefined;
  const callArgs = argExprs(n.arguments_ as PrismNode, e);
  if (block) {
    if (block.constructor.name === "BlockArgumentNode") {
      // `&blk` in argument position: the block as a function value.
      callArgs.push(e.expr(block.expression as PrismNode));
    } else if (block.constructor.name === "BlockNode") {
      callArgs.push(blockToArrow(block, e));
    } else {
      return null;
    }
  }

  const target: ts.Expression = recv
    ? f.createPropertyAccessExpression(recv, jsName)
    : f.createIdentifier(jsName);
  // A bare identifier with no args, no receiver, no parens is a local/attr read.
  if (!recv && callArgs.length === 0 && !block && !hasParens(n)) return target;
  const call = f.createCallExpression(target, undefined, callArgs);
  // Await calls to methods the trails port declares async — but only inside an
  // async body, so we never emit a bare `await` in a sync function.
  return e.inAsyncMethod && e.asyncMethods.has(jsName) ? f.createAwaitExpression(call) : call;
}

function hasParens(n: PrismNode): boolean {
  return n.openingLoc != null;
}

function blockToArrow(block: PrismNode, e: Emitter): ts.ArrowFunction {
  const names = blockParamNames(block.parameters as PrismNode | undefined);
  const params = names.map((p) => f.createParameterDeclaration(undefined, undefined, p));
  const body = e.stmts((block.body as PrismNode) ?? null, true);
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

function blockParamNames(params: PrismNode | undefined): string[] {
  if (!params) return [];
  const inner = (params.parameters as PrismNode) ?? params;
  const reqs = (inner.requireds as PrismNode[]) ?? [];
  return reqs.map((p) => {
    const name = String(p.name ?? "_");
    return isBindableIdent(name) ? name : "_" + name.replace(/[^A-Za-z0-9_$]/g, "_");
  });
}
