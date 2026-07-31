/**
 * The emitter: walks a Prism AST through the {@link Registry}, building a
 * TypeScript AST and tracking per-kind + per-def coverage. Handled kinds run
 * their handler; unhandled kinds (or handlers that decline with `null`)
 * become a `__PRISM_TODO("<Kind>")` marker call, with the ENTIRE unhandled
 * subtree counted as passthrough — the conservative direction, since inline
 * sub-shapes a handler would have absorbed (hash pairs, params) count against
 * an unhandled parent but are simply not dispatched under a handled one.
 *
 * Because every emitted node comes from `ts.factory`, the printed output is
 * parseable by construction: there is no code path that can splice raw text
 * into expression position.
 */
import ts from "typescript";
import { Registry } from "./registry.js";
import type { Coverage, Emitter, PrismNode } from "./types.js";

const f = ts.factory;

class CoverageTally implements Coverage {
  readonly counts = new Map<string, { handled: number; passthrough: number }>();
  record(kind: string, handled: boolean): void {
    const c = this.counts.get(kind) ?? { handled: 0, passthrough: 0 };
    if (handled) c.handled++;
    else c.passthrough++;
    this.counts.set(kind, c);
  }
}

/** Name of the def-level bucket for nodes outside any method body. */
export const TOPLEVEL = "(toplevel)";

export class Codegen implements Emitter {
  readonly coverage = new CoverageTally();
  readonly perDef = new Map<string, { total: number; passthrough: number }>();
  currentDef = TOPLEVEL;
  inClass = false;
  inSingleton = false;
  inAsyncMethod = false;
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
    // Fall back to expression position; Ruby's implicit return applies to the
    // last statement of a method body (never a constructor's).
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

  /**
   * Unhandled node: a marker call, never raw text. The whole subtree is
   * recorded as passthrough — nothing under an unhandled parent is emitted,
   * so nothing under it may count as handled.
   */
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
