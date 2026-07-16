/**
 * Control-flow handlers: if/unless (statement and modifier forms), while/until,
 * case/when, return/next/break, yield, and begin/rescue → try/catch.
 */
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";

export function registerControl(r: Registry): void {
  r.on("IfNode", (n, e) => emitIf(n, e));

  r.on("UnlessNode", (n, e) => {
    const cond = e.emit(n.predicate as PrismNode);
    const body = e.emitBody((n.statements as PrismNode) ?? null);
    const elseB = n.elseClause ? emitElse(n.elseClause as PrismNode, e) : "";
    return `if (!(${cond})) {\n${e.indent(body)}\n}${elseB}`;
  });

  r.onMany(["WhileNode", "UntilNode"], (n, e) => {
    const neg = n.constructor.name === "UntilNode";
    const cond = e.emit(n.predicate as PrismNode);
    const body = e.emitBody((n.statements as PrismNode) ?? null);
    return `while (${neg ? "!(" + cond + ")" : cond}) {\n${e.indent(body)}\n}`;
  });

  r.on("CaseNode", (n, e) => emitCase(n, e));

  r.on("ReturnNode", (n, e) => {
    const v = firstArg(n.arguments_ as PrismNode | undefined, e);
    return v ? `return ${v}` : "return";
  });
  r.on("NextNode", (n, e) => {
    const v = firstArg(n.arguments_ as PrismNode | undefined, e);
    return v ? `return ${v}` : "continue";
  });
  r.on("BreakNode", () => "break");
  r.on("YieldNode", (n, e) => {
    const a = ((n.arguments_ as PrismNode)?.arguments_ as PrismNode[]) ?? [];
    return `yield(${a.map((x) => e.emit(x)).join(", ")})`;
  });

  r.on("BeginNode", (n, e) => {
    const body = e.emitBody((n.statements as PrismNode) ?? null);
    let out = `try {\n${e.indent(body)}\n}`;
    const rescue = n.rescueClause as PrismNode | undefined;
    if (rescue) {
      const rbody = e.emitBody((rescue.statements as PrismNode) ?? null);
      const ref = rescue.reference ? String((rescue.reference as PrismNode).name) : "e";
      out += ` catch (${ref}) {\n${e.indent(rbody)}\n}`;
    }
    const ensure = n.ensureClause as PrismNode | undefined;
    if (ensure) {
      const ebody = e.emitBody((ensure.statements as PrismNode) ?? null);
      out += ` finally {\n${e.indent(ebody)}\n}`;
    }
    return out;
  });
}

function emitIf(n: PrismNode, e: Emitter): string {
  const cond = e.emit(n.predicate as PrismNode);
  const body = e.emitBody((n.statements as PrismNode) ?? null);
  const sub = n.subsequent ? subsequent(n.subsequent as PrismNode, e) : "";
  return `if (${cond}) {\n${e.indent(body)}\n}${sub}`;
}

function subsequent(node: PrismNode, e: Emitter): string {
  if (node.constructor.name === "IfNode") {
    // elsif
    return " else " + emitIf(node, e);
  }
  return emitElse(node, e);
}

function emitElse(node: PrismNode, e: Emitter): string {
  const body = e.emitBody((node.statements as PrismNode) ?? null);
  return ` else {\n${e.indent(body)}\n}`;
}

function emitCase(n: PrismNode, e: Emitter): string {
  const subject = n.predicate ? e.emit(n.predicate as PrismNode) : "";
  const conds = (n.conditions as PrismNode[]) ?? [];
  const branches: string[] = [];
  for (let i = 0; i < conds.length; i++) {
    const w = conds[i];
    // Ruby `case s; when M` evaluates `M === s` (case-equality on the matcher:
    // class membership, range include, regex match, ==), NOT `s === M`. A plain
    // JS `===` reverses that for class/range/regex matchers (`when Symbol`,
    // `when Array, Hash`), so emit a `caseEq(matcher, subject)` runtime helper
    // that mirrors Ruby's `#===`. A subject-less `case; when cond` keeps the
    // bare boolean condition.
    const tests = ((w.conditions as PrismNode[]) ?? []).map((c) =>
      subject ? `caseEq(${e.emit(c)}, ${subject})` : e.emit(c),
    );
    const body = e.emitBody((w.statements as PrismNode) ?? null);
    const kw = i === 0 ? "if" : "else if";
    branches.push(`${kw} (${tests.join(" || ")}) {\n${e.indent(body)}\n}`);
  }
  if (n.elseClause) {
    const body = e.emitBody((n.elseClause as PrismNode).statements as PrismNode);
    branches.push(`else {\n${e.indent(body)}\n}`);
  }
  return branches.join(" ");
}

function firstArg(node: PrismNode | undefined, e: Emitter): string {
  const a = (node?.arguments_ as PrismNode[]) ?? [];
  if (a.length === 0) return "";
  if (a.length === 1) return e.emit(a[0]);
  return "[" + a.map((x) => e.emit(x)).join(", ") + "]";
}
