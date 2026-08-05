import ts from "typescript";
import { rubyStr, type Emitter, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName, isJsIdentName, isBindableIdent, FORWARDED_ARGS } from "../naming.js";
import { clearAsyncProvenance } from "../await-policy.js";
import { normalizeModuleName, OUTSIDE_CORPUS, type SuperResolution } from "../linearization.js";
const f = ts.factory;
const COMPOUND: Record<string, ts.BinaryOperator> = {
  "+": ts.SyntaxKind.PlusEqualsToken,
  "-": ts.SyntaxKind.MinusEqualsToken,
  "*": ts.SyntaxKind.AsteriskEqualsToken,
  "/": ts.SyntaxKind.SlashEqualsToken,
  "%": ts.SyntaxKind.PercentEqualsToken,
  "**": ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  "^": ts.SyntaxKind.CaretEqualsToken,
};
/** Compound operators with no JS assignment token — read through, write back. */
const COMPOUND_HELPER: Record<string, string> = {
  "|": "union",
  "&": "intersection",
};
export function registerMisc(r: Registry): void {
  r.on("SplatNode", (n, e) => f.createSpreadElement(e.expr((n.expression as PrismNode) ?? null)));
  r.on("ForwardingArgumentsNode", () => f.createSpreadElement(f.createIdentifier(FORWARDED_ARGS)));
  r.onManyStmt(["ForwardingSuperNode", "SuperNode"], (n, e, isLast) => {
    if (e.inClass || isLast) return null;
    if (resolveSuper(e)?.kind === "resolved") return null;
    return [];
  });
  r.onMany(["ForwardingSuperNode", "SuperNode"], (n, e) => {
    const args = superArgs(n, e);
    if (e.inClass) return f.createCallExpression(f.createSuper(), undefined, args);
    const resolution = resolveSuper(e);
    if (!resolution) return null;
    if (resolution.kind === "outside-corpus") {
      e.decline(n.constructor.name);
      return f.createCallExpression(f.createIdentifier(OUTSIDE_CORPUS), undefined, [
        f.createStringLiteral(`${normalizeModuleName(e.currentModule ?? "")}#${e.currentRubyDef}`),
      ]);
    }
    const target = f.createPropertyAccessExpression(
      f.createIdentifier(resolution.module.split("::").join("$")),
      methodName(resolution.method),
    );
    return f.createCallExpression(f.createPropertyAccessExpression(target, "call"), undefined, [
      f.createThis(),
      ...args,
    ]);
  });
  r.on("LocalVariableOperatorWriteNode", (n, e) => {
    if (!isBindableIdent(String(n.name)) || !hasCompoundImage(n)) return null;
    e.declared.add(String(n.name));
    clearAsyncProvenance(n, e.asyncBindings);
    return compoundWrite(f.createIdentifier(String(n.name)), n, e);
  });
  r.on("InstanceVariableOperatorWriteNode", (n, e) => {
    if (!hasCompoundImage(n)) return null;
    clearAsyncProvenance(n, e.asyncBindings);
    return compoundWrite(thisProp(n.name), n, e);
  });
  r.on("CallOperatorWriteNode", (n, e) => {
    const prop = methodName(String(n.readName));
    if (n.receiver ? !isJsIdentName(prop) : !isBindableIdent(prop)) return null;
    const target = n.receiver
      ? f.createPropertyAccessExpression(e.expr(n.receiver as PrismNode), prop)
      : f.createIdentifier(prop);
    return compoundWrite(target, n, e);
  });
  r.on("IndexOperatorWriteNode", (n, e) => {
    const target = indexTarget(n, e);
    if (!target) return null;
    return compoundWrite(target, n, e);
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
  r.on("SourceFileNode", (n) =>
    f.createStringLiteral(rubyStr((n.filepath as { value: string }).value)),
  );
  r.on("SourceLineNode", (n, e) => f.createNumericLiteral(lineOf(n, e)));
  r.onStmt("MatchWriteNode", (n, e) => {
    const call = n.call as PrismNode;
    const args = ((call.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
    if (args.length !== 1) return null;
    const names = ((n.targets as PrismNode[]) ?? []).map((t) => String(t.name));
    if (!names.every((name) => isJsIdentName(name))) return null;
    e.helpers.add("rubyMatch");
    for (const name of names) e.declared.add(name);
    return [
      f.createVariableStatement(
        undefined,
        f.createVariableDeclarationList(
          [
            f.createVariableDeclaration(
              f.createObjectBindingPattern(
                names.map((name) =>
                  f.createBindingElement(undefined, undefined, f.createIdentifier(name)),
                ),
              ),
              undefined,
              undefined,
              f.createCallExpression(f.createIdentifier("rubyMatch"), undefined, [
                e.expr(call.receiver as PrismNode),
                e.expr(args[0]),
              ]),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    ];
  });
  r.on("NumberedReferenceReadNode", (n, e) => {
    e.helpers.add("rubyLastMatch");
    return f.createElementAccessChain(
      f.createCallExpression(f.createIdentifier("rubyLastMatch"), undefined, []),
      f.createToken(ts.SyntaxKind.QuestionDotToken),
      f.createNumericLiteral(Number(n.number)),
    );
  });
  r.on("BackReferenceReadNode", (n, e) => {
    e.helpers.add("rubyBackRef");
    return f.createCallExpression(f.createIdentifier("rubyBackRef"), undefined, [
      f.createStringLiteral(String(n.name)),
    ]);
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
/**
 * Whether {@link compoundWrite} has an image for this operator. Checked before
 * the declare / clear-provenance side effects, which must not fire for a write
 * that goes on to decline.
 */
function hasCompoundImage(n: PrismNode): boolean {
  const rubyOp = String(n.binaryOperator);
  return COMPOUND[rubyOp] != null || rubyOp === "<<" || COMPOUND_HELPER[rubyOp] != null;
}
/** `target OP= value` — compound token, `push` for `<<=`, else a helper. */
function compoundWrite(target: ts.Expression, n: PrismNode, e: Emitter): ts.Expression | null {
  const rubyOp = String(n.binaryOperator);
  const value = e.expr(n.value as PrismNode);
  const op = COMPOUND[rubyOp];
  if (op) return f.createBinaryExpression(target, op, value);
  if (rubyOp === "<<") {
    return f.createCallExpression(f.createPropertyAccessExpression(target, "push"), undefined, [
      value,
    ]);
  }
  const helper = COMPOUND_HELPER[rubyOp];
  if (!helper) return null;
  e.helpers.add(helper);
  return f.createAssignment(
    target,
    f.createCallExpression(f.createIdentifier(helper), undefined, [target, value]),
  );
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
function resolveSuper(e: Emitter): SuperResolution | null {
  if (!e.linearization || !e.currentModule) return null;
  return e.linearization.resolve(e.currentModule, e.currentRubyDef);
}
function superArgs(n: PrismNode, e: Emitter): ts.Expression[] {
  if (n.constructor.name === "ForwardingSuperNode") {
    return [f.createSpreadElement(f.createIdentifier("arguments"))];
  }
  return (((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? []).map((x) =>
    e.expr(x),
  );
}

/**
 * The 1-based line a node starts on. Prism's JS location carries a byte offset
 * rather than a line, so the line is the newline count ahead of it.
 */
function lineOf(n: PrismNode, e: Emitter): number {
  const offset = (n.location as { startOffset: number } | undefined)?.startOffset ?? 0;
  let line = 1;
  for (let i = 0; i < offset && i < e.source.length; i++) if (e.source[i] === "\n") line++;
  return line;
}
