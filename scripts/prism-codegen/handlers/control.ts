import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
const f = ts.factory;
export function registerControl(r: Registry): void {
  r.onStmt("IfNode", (n, e, isLast) => [ifStmt(n, e, isLast, false)]);
  r.onStmt("UnlessNode", (n, e, isLast) => [ifStmt(n, e, isLast, true)]);
  r.onMany(["IfNode", "UnlessNode"], (n, e) => {
    const neg = n.constructor.name === "UnlessNode";
    const cons = singleExprOf(n.statements as PrismNode | null, e);
    const alt = elseSingleExpr(n, e);
    if (!cons || !alt) return null;
    let cond = e.expr(n.predicate as PrismNode);
    if (neg) cond = f.createLogicalNot(cond);
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
    const v = returnValue(n.arguments_ as PrismNode | undefined, e);
    return [v ? f.createReturnStatement(v) : f.createContinueStatement()];
  });
  r.onStmt("BreakNode", () => [f.createBreakStatement()]);
  r.onStmt("BeginNode", (n, e, isLast) => {
    const tryBlock = f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true);
    const rescue = n.rescueClause as PrismNode | undefined;
    let catchClause: ts.CatchClause | undefined;
    if (rescue) {
      if (rescue.subsequent) return null;
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
  const thenB = f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true);
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  let elseB: ts.Statement | undefined;
  if (sub && sub.constructor.name === "ElseNode") {
    elseB = f.createBlock(e.stmts((sub.statements as PrismNode) ?? null, isLast), true);
  } else if (sub && sub.constructor.name === "IfNode") {
    elseB = ifStmt(sub, e, isLast, false);
  }
  return f.createIfStatement(cond, thenB, elseB);
}
function loop(n: PrismNode, e: Emitter, negate: boolean): ts.Statement {
  let cond = e.expr(n.predicate as PrismNode);
  if (negate) cond = f.createLogicalNot(cond);
  return f.createWhileStatement(
    cond,
    f.createBlock(e.stmts((n.statements as PrismNode) ?? null, false), true),
  );
}
function caseStmt(n: PrismNode, e: Emitter, isLast: boolean): ts.Statement[] | null {
  const subject = n.predicate ? e.expr(n.predicate as PrismNode) : undefined;
  const conds = (n.conditions as PrismNode[]) ?? [];
  if (conds.some((w) => w.constructor.name !== "WhenNode")) return null;
  let out: ts.Statement | undefined = n.elseClause
    ? f.createBlock(e.stmts((n.elseClause as PrismNode).statements as PrismNode, isLast), true)
    : undefined;
  for (let i = conds.length - 1; i >= 0; i--) {
    const w = conds[i];
    const tests = ((w.conditions as PrismNode[]) ?? []).map((c) =>
      subject
        ? f.createCallExpression(f.createIdentifier("caseEq"), undefined, [e.expr(c), subject])
        : e.expr(c),
    );
    const cond = tests.reduce((a, b) => f.createLogicalOr(a, b));
    out = f.createIfStatement(
      cond,
      f.createBlock(e.stmts((w.statements as PrismNode) ?? null, isLast), true),
      out,
    );
  }
  return out ? [out] : [];
}
function returnValue(node: PrismNode | undefined, e: Emitter): ts.Expression | undefined {
  const a = (node?.arguments_ as PrismNode[]) ?? [];
  if (a.length === 0) return undefined;
  if (a.length === 1) return e.expr(a[0]);
  return f.createArrayLiteralExpression(a.map((x) => e.expr(x)));
}
function singleExprOf(statements: PrismNode | null, e: Emitter): ts.Expression | null {
  if (!statements) return null;
  const kids = statements.compactChildNodes();
  if (kids.length !== 1) return null;
  return e.expr(kids[0]);
}
function elseSingleExpr(n: PrismNode, e: Emitter): ts.Expression | null {
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  if (!sub || sub.constructor.name !== "ElseNode") return null;
  return singleExprOf(sub.statements as PrismNode | null, e);
}
