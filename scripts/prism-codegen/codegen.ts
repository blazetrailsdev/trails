import ts from "typescript";
import { Registry } from "./registry.js";
import type { Coverage, Emitter, PrismNode } from "./types.js";
const f = ts.factory;
class CoverageTally implements Coverage {
  readonly counts = new Map<
    string,
    {
      handled: number;
      passthrough: number;
    }
  >();
  record(kind: string, handled: boolean): void {
    const c = this.counts.get(kind) ?? { handled: 0, passthrough: 0 };
    if (handled) c.handled++;
    else c.passthrough++;
    this.counts.set(kind, c);
  }
}
export const TOPLEVEL = "(toplevel)";
export class Codegen implements Emitter {
  readonly coverage = new CoverageTally();
  readonly perDef = new Map<
    string,
    {
      total: number;
      passthrough: number;
    }
  >();
  currentDef = TOPLEVEL;
  inClass = false;
  inSingleton = false;
  inAsyncMethod = false;
  inLoop = false;
  readonly helpers = new Set<string>();
  blockParamName: string | null = null;
  declared = new Set<string>();
  constructor(
    private readonly registry: Registry,
    readonly asyncMethods: ReadonlySet<string> = new Set(),
  ) {}
  private record(kind: string, handled: boolean): void {
    this.coverage.record(kind, handled);
    const d = this.perDef.get(this.currentDef) ?? { total: 0, passthrough: 0 };
    d.total++;
    if (!handled) d.passthrough++;
    this.perDef.set(this.currentDef, d);
  }
  expr(node: PrismNode | null | undefined): ts.Expression {
    if (!node || !node.constructor) return f.createNull();
    const kind = node.constructor.name;
    const handler = this.registry.get(kind);
    if (handler) {
      const built = handler(node, this);
      if (built) {
        this.record(kind, true);
        return built;
      }
    }
    return this.passthrough(node, kind);
  }
  stmt(node: PrismNode, isLast: boolean): ts.Statement[] {
    const kind = node.constructor.name;
    const handler = this.registry.getStmt(kind);
    if (handler) {
      const built = handler(node, this, isLast);
      if (built) {
        this.record(kind, true);
        return built;
      }
    }
    const e = this.expr(node);
    if (isLast && this.currentDef !== TOPLEVEL && this.currentDef !== "constructor") {
      return [f.createReturnStatement(e)];
    }
    return [f.createExpressionStatement(e)];
  }
  stmts(node: PrismNode | null | undefined, implicitReturn: boolean): ts.Statement[] {
    if (!node) return [];
    let kids: PrismNode[];
    if (node.constructor?.name === "StatementsNode") {
      this.record("StatementsNode", true);
      kids = node.compactChildNodes();
    } else {
      kids = [node];
    }
    return kids.flatMap((s, i) => this.stmt(s, implicitReturn && i === kids.length - 1));
  }
  private passthrough(node: PrismNode, kind: string): ts.Expression {
    const countSubtree = (n: PrismNode) => {
      this.record(n.constructor.name, false);
      for (const c of n.compactChildNodes()) countSubtree(c);
    };
    countSubtree(node);
    return f.createCallExpression(f.createIdentifier("__PRISM_TODO"), undefined, [
      f.createStringLiteral(kind),
    ]);
  }
}
