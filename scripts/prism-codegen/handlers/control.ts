import ts from "typescript";
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import type { AsyncArm } from "../await-policy.js";
import { isRaiseThrow, mergeAsyncArms, raiseArguments, scopeAsyncArm } from "../await-policy.js";
import { eachToForOf } from "./stdlib.js";
import { containsAwait } from "./expressions.js";
const f = ts.factory;
export function registerControl(r: Registry): void {
  r.onStmt("IfNode", (n, e, isLast) => [ifStmt(n, e, isLast, false)]);
  r.onStmt("UnlessNode", (n, e, isLast) => [ifStmt(n, e, isLast, true)]);
  r.onMany(["IfNode", "UnlessNode"], (n, e) => {
    const neg = n.constructor.name === "UnlessNode";
    const consNode = singleStmtNode(n.statements as PrismNode | null);
    const altNode = elseSingleStmtNode(n);
    // A branch that is more than one statement has no conditional-expression
    // spelling; wrap the statement form in an immediately-invoked arrow so the
    // whole `if` still yields a value.
    if (!consNode || !altNode) return conditionalIife(n, e, neg);
    let cond = e.expr(n.predicate as PrismNode);
    if (neg) cond = f.createLogicalNot(cond);
    const consArm = scopeAsyncArm(e.asyncBindings, () => e.expr(consNode), consNode, e.inLoop);
    const altArm = scopeAsyncArm(e.asyncBindings, () => e.expr(altNode), altNode, e.inLoop);
    mergeAsyncArms(e.asyncBindings, [consArm, altArm], true);
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
    const ensure = n.ensureClause as PrismNode | undefined;
    if (!rescue && !ensure) return e.stmts((n.statements as PrismNode) ?? null, isLast);
    const tryArm = scopeAsyncArm(
      e.asyncBindings,
      () => f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true),
      (n.statements as PrismNode) ?? null,
      e.inLoop,
    );
    let catchClause: ts.CatchClause | undefined;
    let catchArms: AsyncArm<ts.Block>[] = [];
    if (rescue) {
      const built = rescueToCatch(rescue, e, isLast);
      if (!built) return null;
      catchClause = built.clause;
      catchArms = built.arms;
    }
    mergeAsyncArms(e.asyncBindings, [tryArm, ...catchArms], true);
    const finallyBlock = ensure
      ? f.createBlock(e.stmts((ensure.statements as PrismNode) ?? null, false), true)
      : undefined;
    return [f.createTryStatement(tryArm.value, catchClause, finallyBlock)];
  });
  r.onStmt("CallNode", (n, e) => {
    if (!isRaiseThrow(n)) return eachToForOf(n, e);
    const args = raiseArguments(n);
    if (args.length === 1) return [f.createThrowStatement(e.expr(args[0]))];
    return [
      f.createThrowStatement(
        f.createNewExpression(
          e.expr(args[0]),
          undefined,
          args.slice(1).map((a) => e.expr(a)),
        ),
      ),
    ];
  });
}
function ifStmt(n: PrismNode, e: Emitter, isLast: boolean, negate: boolean): ts.Statement {
  let cond = e.expr(n.predicate as PrismNode);
  if (negate) cond = f.createLogicalNot(cond);
  const thenArm = scopeAsyncArm(
    e.asyncBindings,
    () => f.createBlock(e.stmts((n.statements as PrismNode) ?? null, isLast), true),
    (n.statements as PrismNode) ?? null,
    e.inLoop,
  );
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  let elseArm: AsyncArm<ts.Statement> | undefined;
  if (sub && sub.constructor.name === "ElseNode") {
    elseArm = scopeAsyncArm(
      e.asyncBindings,
      () => f.createBlock(e.stmts((sub.statements as PrismNode) ?? null, isLast), true),
      (sub.statements as PrismNode) ?? null,
      e.inLoop,
    );
  } else if (sub && sub.constructor.name === "IfNode") {
    elseArm = scopeAsyncArm(e.asyncBindings, () => ifStmt(sub, e, isLast, false), sub, e.inLoop);
  }
  mergeAsyncArms(e.asyncBindings, elseArm ? [thenArm, elseArm] : [thenArm], elseArm != null);
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
  mergeAsyncArms(e.asyncBindings, [body], false);
  return f.createWhileStatement(cond, body.value);
}
function caseStmt(n: PrismNode, e: Emitter, isLast: boolean): ts.Statement[] | null {
  const conds = (n.conditions as PrismNode[]) ?? [];
  if (conds.some((w) => w.constructor.name !== "WhenNode")) return null;
  const subject = n.predicate ? e.expr(n.predicate as PrismNode) : undefined;
  const arms: AsyncArm<ts.Block>[] = [];
  let out: ts.Statement | undefined;
  if (n.elseClause) {
    const elseArm = scopeAsyncArm(
      e.asyncBindings,
      () =>
        f.createBlock(e.stmts((n.elseClause as PrismNode).statements as PrismNode, isLast), true),
      (n.elseClause as PrismNode).statements as PrismNode,
      e.inLoop,
    );
    arms.push(elseArm);
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
    const arm = scopeAsyncArm(
      e.asyncBindings,
      () => f.createBlock(e.stmts((w.statements as PrismNode) ?? null, isLast), true),
      (w.statements as PrismNode) ?? null,
      e.inLoop,
    );
    arms.push(arm);
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

/**
 * Ruby's chained `rescue A; …; rescue B; …` narrows on the exception class,
 * which JS has no syntax for: one `catch` binds every exception. Dispatch the
 * clauses inside the catch with the same `caseEq` test `case/when` uses, and
 * rethrow when none matches so an unhandled class still propagates. A bare
 * `rescue` (no exception list) is the catch-all and closes the chain.
 */
function rescueToCatch(
  rescue: PrismNode,
  e: Emitter,
  isLast: boolean,
): { clause: ts.CatchClause; arms: AsyncArm<ts.Block>[] } | null {
  const clauses: PrismNode[] = [];
  for (let r: PrismNode | undefined = rescue; r; r = r.subsequent as PrismNode | undefined) {
    clauses.push(r);
  }
  const caught = "e";
  const arms: AsyncArm<ts.Block>[] = [];
  const blocks: ts.Block[] = [];
  for (const clause of clauses) {
    const ref = clause.reference ? String((clause.reference as PrismNode).name) : undefined;
    const arm = scopeAsyncArm(
      e.asyncBindings,
      () => {
        const body = e.stmts((clause.statements as PrismNode) ?? null, isLast);
        // Each clause names its own exception variable; alias it to the single
        // catch binding rather than renaming reads inside the body.
        const alias =
          ref && ref !== caught
            ? [
                f.createVariableStatement(
                  undefined,
                  f.createVariableDeclarationList(
                    [f.createVariableDeclaration(ref, undefined, undefined, catchRead(caught))],
                    ts.NodeFlags.Const,
                  ),
                ),
              ]
            : [];
        return f.createBlock([...alias, ...body], true);
      },
      (clause.statements as PrismNode) ?? null,
      e.inLoop,
    );
    arms.push(arm);
    blocks.push(arm.value);
  }
  // A lone `rescue` keeps the plain `catch (e)` shape it has always emitted —
  // the caseEq dispatch below exists for the chain, and adding a class test to
  // the single-clause form would be a separate behaviour change.
  if (clauses.length === 1) {
    const ref = clauses[0].reference ? String((clauses[0].reference as PrismNode).name) : caught;
    return {
      clause: f.createCatchClause(f.createVariableDeclaration(ref), arms[0].value),
      arms,
    };
  }
  let out: ts.Statement = f.createThrowStatement(catchRead(caught));
  for (let i = clauses.length - 1; i >= 0; i--) {
    const exceptions = (clauses[i].exceptions as PrismNode[]) ?? [];
    if (exceptions.length === 0) {
      out = blocks[i];
      continue;
    }
    e.helpers.add("caseEq");
    const tests: ts.Expression[] = exceptions.map((x) =>
      f.createCallExpression(f.createIdentifier("caseEq"), undefined, [
        e.expr(x),
        catchRead(caught),
      ]),
    );
    out = f.createIfStatement(
      tests.reduce((a, b) => f.createLogicalOr(a, b)),
      blocks[i],
      out,
    );
  }
  return {
    clause: f.createCatchClause(f.createVariableDeclaration(caught), f.createBlock([out], true)),
    arms,
  };
}
function catchRead(name: string): ts.Expression {
  return f.createIdentifier(name);
}
/**
 * `(() => { … })()` around the statement form of an `if`/`unless` whose
 * branches are too big for a conditional expression. `e.stmts(…, true)`
 * returns the branch's last value, so the arrow yields what Ruby's expression
 * would have.
 */
function conditionalIife(n: PrismNode, e: Emitter, negate: boolean): ts.Expression | null {
  const sub = (n.subsequent ?? n.elseClause) as PrismNode | null;
  if (sub && sub.constructor.name !== "ElseNode" && sub.constructor.name !== "IfNode") return null;
  const prevLoop = e.inLoop;
  e.inLoop = false;
  const arm = scopeAsyncArm(e.asyncBindings, () => ifStmt(n, e, true, negate));
  e.inLoop = prevLoop;
  mergeAsyncArms(e.asyncBindings, [arm], false);
  const body = f.createBlock([arm.value], true);
  const call = f.createCallExpression(
    f.createParenthesizedExpression(
      f.createArrowFunction(
        containsAwait(body) ? [f.createToken(ts.SyntaxKind.AsyncKeyword)] : undefined,
        undefined,
        [],
        undefined,
        undefined,
        body,
      ),
    ),
    undefined,
    [],
  );
  return containsAwait(body) ? f.createAwaitExpression(call) : call;
}
