import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import { isBindableIdent } from "../naming.js";
import { mergeAsyncArms, scopeAsyncArm } from "../await-policy.js";
const f = ts.factory;

const TYPEOF_IMAGE: Record<string, string> = {
  String: "string",
  Symbol: "string",
  Integer: "number",
  Float: "number",
  Numeric: "number",
  Proc: "function",
};

const STDLIB_RENAME: Record<string, string> = {
  collect: "map",
  collect_concat: "flatMap",
  flat_map: "flatMap",
  detect: "find",
  inject: "reduce",
  to_a: "toArray",
  "include?": "includes",
};

const BLOCK_RENAME: Record<string, string> = {
  "any?": "some",
  "all?": "every",
  each: "forEach",
};

const SIMPLE_READS: ReadonlySet<string> = new Set([
  "LocalVariableReadNode",
  "InstanceVariableReadNode",
]);

/**
 * The JS array-method spelling for a Ruby enumerable call, or undefined to
 * keep the conventional name mapping. Some renames only hold when a block is
 * present — blockless `any?` on a relation is the port's `isAny` query
 * method, not `Array#some`.
 */
export function stdlibRename(name: string, hasBlock: boolean): string | undefined {
  if (Object.hasOwn(STDLIB_RENAME, name)) return STDLIB_RENAME[name];
  if (hasBlock && Object.hasOwn(BLOCK_RENAME, name)) return BLOCK_RENAME[name];
  return undefined;
}

/**
 * Ruby stdlib idioms with a decided whole-expression JS image. Returns
 * undefined when the call is not one of them so `emitCall` continues with the
 * generic path. Symbols map to strings in trails, so `is_a?(Symbol)` shares
 * String's typeof image. `Kernel#Array` maps to the wrap ternary
 * (`v == null ? [] : Array.isArray(v) ? v : [v]`), which reads its argument
 * three times — only side-effect-free simple reads take that image.
 */
export function stdlibImage(n: PrismNode, e: Emitter): ts.Expression | undefined {
  const name = String(n.name);
  const argNodes = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  const hasRecv = n.receiver != null;
  if (n.block) return undefined;

  if (
    (name === "is_a?" || name === "kind_of?" || name === "instance_of?") &&
    hasRecv &&
    argNodes.length === 1 &&
    argNodes[0].constructor.name === "ConstantReadNode"
  ) {
    const klass = String(argNodes[0].name);
    const recv = e.expr(n.receiver as PrismNode);
    if (klass === "Array") {
      return f.createCallExpression(
        f.createPropertyAccessExpression(f.createIdentifier("Array"), "isArray"),
        undefined,
        [recv],
      );
    }
    if (Object.hasOwn(TYPEOF_IMAGE, klass)) {
      return f.createBinaryExpression(
        f.createTypeOfExpression(recv),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        f.createStringLiteral(TYPEOF_IMAGE[klass]),
      );
    }
    return f.createBinaryExpression(
      recv,
      ts.SyntaxKind.InstanceOfKeyword,
      f.createIdentifier(klass),
    );
  }

  if (hasRecv && argNodes.length === 0) {
    if (name === "class") {
      return f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), "constructor");
    }
    if (name === "to_s") {
      return f.createCallExpression(f.createIdentifier("String"), undefined, [
        e.expr(n.receiver as PrismNode),
      ]);
    }
    if (name === "nil?") {
      return f.createBinaryExpression(
        e.expr(n.receiver as PrismNode),
        ts.SyntaxKind.EqualsEqualsToken,
        f.createNull(),
      );
    }
    if (name === "empty?") {
      return f.createBinaryExpression(
        f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), "length"),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        f.createNumericLiteral(0),
      );
    }
  }

  if (
    name === "Array" &&
    !hasRecv &&
    argNodes.length === 1 &&
    SIMPLE_READS.has(argNodes[0].constructor.name)
  ) {
    const arg = e.expr(argNodes[0]);
    return f.createConditionalExpression(
      f.createBinaryExpression(arg, ts.SyntaxKind.EqualsEqualsToken, f.createNull()),
      f.createToken(ts.SyntaxKind.QuestionToken),
      f.createArrayLiteralExpression([]),
      f.createToken(ts.SyntaxKind.ColonToken),
      f.createConditionalExpression(
        f.createCallExpression(
          f.createPropertyAccessExpression(f.createIdentifier("Array"), "isArray"),
          undefined,
          [cloneSimpleRead(arg)],
        ),
        f.createToken(ts.SyntaxKind.QuestionToken),
        cloneSimpleRead(arg),
        f.createToken(ts.SyntaxKind.ColonToken),
        f.createArrayLiteralExpression([cloneSimpleRead(arg)]),
      ),
    );
  }

  return undefined;
}

/**
 * Statement-position `recv.each { |x| ... }` — the port writes these as
 * `for (const x of recv)`, so the emitted image follows.
 */
function cloneSimpleRead(expr: ts.Expression): ts.Expression {
  if (ts.isIdentifier(expr)) return f.createIdentifier(expr.text);
  const prop = expr as ts.PropertyAccessExpression;
  return f.createPropertyAccessExpression(f.createThis(), prop.name.text);
}

export function eachToForOf(n: PrismNode, e: Emitter): ts.Statement[] | null {
  if (String(n.name) !== "each" || n.receiver == null) return null;
  const block = n.block as PrismNode | undefined;
  if (block?.constructor.name !== "BlockNode") return null;
  const args = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  if (args.length > 0) return null;
  const params = blockParamNames(block.parameters as PrismNode | undefined);
  if (!params || params.length === 0 || params.length > 2) return null;

  const iterable = e.expr(n.receiver as PrismNode);
  const binding =
    params.length === 1
      ? f.createVariableDeclaration(params[0])
      : f.createVariableDeclaration(
          f.createArrayBindingPattern(
            params.map((p) => f.createBindingElement(undefined, undefined, p)),
          ),
        );
  const prevLoop = e.inLoop;
  e.inLoop = true;
  const body = scopeAsyncArm(e.asyncBindings, () =>
    f.createBlock(e.stmts((block.body as PrismNode) ?? null, false), true),
  );
  e.inLoop = prevLoop;
  mergeAsyncArms(e.asyncBindings, [body], false);
  return [
    f.createForOfStatement(
      undefined,
      f.createVariableDeclarationList([binding], ts.NodeFlags.Const),
      iterable,
      body.value,
    ),
  ];
}

export function blockParamNames(params: PrismNode | undefined): string[] | null {
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
