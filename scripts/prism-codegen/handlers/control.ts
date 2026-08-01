import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { mergeAsyncArms, scopeAsyncArm } from "../await-policy.js";
const f = ts.factory;
export function registerControl(r: Registry): void {
  r.onStmt("IfNode", (n, e, isLast) => [ifStmt(n, e, isLast, false)]);
  r.onStmt("UnlessNode", (n, e, isLast) => [ifStmt(n, e, isLast, true)]);
  r.onMany(["IfNode", "UnlessNode"], (n, e) => {
    const neg = n.constructor.name === "UnlessNode";
    const consNode = singleStmtNode(n.statements as PrismNode | null);
    const altNode = elseSingleStmtNode(n);
    if (!consNode || !altNode) return null;
    let cond = e.expr(n.predicate as PrismNode);
    if (neg) cond = f.createLogicalNot(cond);
    const consArm = scopeAsyncArm(e.asyncBindings, () => e.expr(consNode));
    const altArm = scopeAsyncArm(e.asyncBindings, () => e.expr(altNode));
    mergeAsyncArms(e.asyncBindings, [consArm.after, altArm.after], true);
    const cons = consArm.value;
    const alt = altArm.value;
    return f.createConditionalExpression(
      cond,
      f.createToken(ts.SyntaxKind.QuestionToken),
      cons,
      f.createToken(ts.SyntaxKind.ColonToken),
      alt,
    );
  });
  r.onStmt("WhileNode", (n, e) => [loop(n, e, false)]);
  r.onStmt("UntilNode", (n, e) => [loop(n, e, true)]);
  r.onStmt("CaseNode", (n, e, isLast) => caseStmt(n, e, isLast));
  r.onStmt("ReturnNode", (n, e) => {
    const v = returnValue(n.arguments_ as PrismNode | undefined, e);
    return [f.createReturnStatement(v)];
  });
  r.onStmt("NextNode", (n, e) => {
    const argCount = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[])?.length ?? 0;
    if (e.inLoop) {
      if (argCount > 0) return null;
      return [f.createContinueStatement()];
    }
    const v = returnValue(n.arguments_ as PrismNode | undefined, e);
    return [f.createReturnStatement(v)];
  });
  r.on("YieldNode", (n, e) => {
    if (!e.blockParamName) return null;
    const args = (((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? []).map((x) =>
      e.expr(x),
    );
    return f.createCallExpression(f.createIdentifier(e.blockParamName), undefined, args);
  });
  r.onStmt("BreakNode", (n, e) => {
    const argCount = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[])?.length ?? 0;
    if (!e.inLoop || argCount > 0) return null;
    return [f.createBreakStatement()];
  });
  r.onStmt("BeginNode", (n, e, isLast) => {
    const rescue = n.rescueClause as PrismNode | undefined;
    if (rescue?.subsequent) return null;
    const tryBlock = f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true);
    let catchClause: ts.CatchClause | undefined;
    if (rescue) {
      const ref = rescue.reference ? String((rescue.reference as PrismNode).name) : "e";
      catchClause = f.createCatchClause(
        f.createVariableDeclaration(ref),
        f.createBlock(e.stmts((rescue.statements as PrismNode) ?? null, isLast), true),
      );
    }
    const ensure = n.ensureClause as PrismNode | undefined;
    const finallyBlock = ensure
      ? f.createBlock(e.stmts((ensure.statements as PrismNode) ?? null, false), true)
      : undefined;
    if (!catchClause && !finallyBlock) {
      return e.stmts((n.statements as PrismNode) ?? null, isLast);
    }
    return [f.createTryStatement(tryBlock, catchClause, finallyBlock)];
  });
  r.onStmt("CallNode", (n, e) => {
    if (String(n.name) !== "raise" || n.receiver || n.block) return null;
    const args = ((n.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
    if (args.length === 0) return null;
    if (args.length === 1) return [f.createThrowStatement(e.expr(args[0]))];
    const head = args[0];
    const headKind = head.constructor.name;
    if (headKind === "ConstantReadNode" || headKind === "ConstantPathNode") {
      return [
        f.createThrowStatement(
          f.createNewExpression(
            e.expr(head),
            undefined,
            args.slice(1).map((a) => e.expr(a)),
          ),
        ),
      ];
    }
    return null;
  });
}
function ifStmt(n: PrismNode, e: Emitter, isLast: boolean, negate: boolean): ts.Statement {
  let cond = e.expr(n.predicate as PrismNode);
  if (negate) cond = f.createLogicalNot(cond);
  const thenArm = scopeAsyncArm(e.asyncBindings, () =>
    f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true),
  );
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  let elseArm: { value: ts.Statement; after: Set<string> } | undefined;
  if (sub && sub.constructor.name === "ElseNode") {
    elseArm = scopeAsyncArm(e.asyncBindings, () =>
      f.createBlock(e.stmts((sub.statements as PrismNode) ?? null, isLast), true),
    );
  } else if (sub && sub.constructor.name === "IfNode") {
    elseArm = scopeAsyncArm(e.asyncBindings, () => ifStmt(sub, e, isLast, false));
  }
  mergeAsyncArms(
    e.asyncBindings,
    elseArm ? [thenArm.after, elseArm.after] : [thenArm.after],
    elseArm != null,
  );
  return f.createIfStatement(cond, thenArm.value, elseArm?.value);
}
function loop(n: PrismNode, e: Emitter, negate: boolean): ts.Statement {
  let cond = e.expr(n.predicate as PrismNode);
  if (negate) cond = f.createLogicalNot(cond);
  const prevLoop = e.inLoop;
  e.inLoop = true;
  const body = scopeAsyncArm(e.asyncBindings, () =>
    f.createBlock(e.stmts((n.statements as PrismNode) ?? null, false), true),
  );
  e.inLoop = prevLoop;
  mergeAsyncArms(e.asyncBindings, [body.after], false);
  return f.createWhileStatement(cond, body.value);
}
function caseStmt(n: PrismNode, e: Emitter, isLast: boolean): ts.Statement[] | null {
  const conds = (n.conditions as PrismNode[]) ?? [];
  if (conds.some((w) => w.constructor.name !== "WhenNode")) return null;
  const subject = n.predicate ? e.expr(n.predicate as PrismNode) : undefined;
  const arms: Set<string>[] = [];
  let out: ts.Statement | undefined;
  if (n.elseClause) {
    const elseArm = scopeAsyncArm(e.asyncBindings, () =>
      f.createBlock(e.stmts((n.elseClause as PrismNode).statements as PrismNode, isLast), true),
    );
    arms.push(elseArm.after);
    out = elseArm.value;
  }
  for (let i = conds.length - 1; i >= 0; i--) {
    const w = conds[i];
    const tests = ((w.conditions as PrismNode[]) ?? []).map((c) =>
      subject
        ? (e.helpers.add("caseEq"),
          f.createCallExpression(f.createIdentifier("caseEq"), undefined, [e.expr(c), subject]))
        : e.expr(c),
    );
    const cond = tests.reduce((a, b) => f.createLogicalOr(a, b));
    const arm = scopeAsyncArm(e.asyncBindings, () =>
      f.createBlock(e.stmts((w.statements as PrismNode) ?? null, isLast), true),
    );
    arms.push(arm.after);
    out = f.createIfStatement(cond, arm.value, out);
  }
  mergeAsyncArms(e.asyncBindings, arms, n.elseClause != null);
  return out ? [out] : [];
}
function returnValue(node: PrismNode | undefined, e: Emitter): ts.Expression | undefined {
  const a = (node?.arguments_ as PrismNode[]) ?? [];
  if (a.length === 0) return undefined;
  if (a.length === 1) return e.expr(a[0]);
  return f.createArrayLiteralExpression(a.map((x) => e.expr(x)));
}
function singleStmtNode(statements: PrismNode | null): PrismNode | null {
  if (!statements) return null;
  const kids = statements.compactChildNodes();
  return kids.length === 1 ? kids[0] : null;
}
function elseSingleStmtNode(n: PrismNode): PrismNode | null {
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  if (!sub || sub.constructor.name !== "ElseNode") return null;
  return singleStmtNode(sub.statements as PrismNode | null);
}
