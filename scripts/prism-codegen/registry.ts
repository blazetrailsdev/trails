/**
 * Extensible handler registry keyed by Prism node kind.
 *
 * This is the architectural centerpiece of the spike: dispatch is a Map
 * lookup, NOT a switch/if-chain. A new node kind is supported by calling
 * `registry.on("SomeNode", handler)` — no central dispatch block to edit.
 * Kinds carry an expression handler, a statement handler, or both (an
 * `IfNode` is an if-statement at statement position but a conditional
 * expression at expression position). Unhandled kinds degrade gracefully to
 * a counted passthrough marker (see `Codegen`), so a file always produces
 * parseable output.
 */
import type { ExprHandler, StmtHandler } from "./types.js";

export class Registry {
  private readonly exprHandlers = new Map<string, ExprHandler>();
  private readonly stmtHandlers = new Map<string, StmtHandler>();

  /** Register (or override) the expression handler for a Prism node kind. */
  on(kind: string, handler: ExprHandler): this {
    this.exprHandlers.set(kind, handler);
    return this;
  }

  /** Register many kinds that share one expression handler. */
  onMany(kinds: string[], handler: ExprHandler): this {
    for (const k of kinds) this.on(k, handler);
    return this;
  }

  /** Register (or override) the statement handler for a Prism node kind. */
  onStmt(kind: string, handler: StmtHandler): this {
    this.stmtHandlers.set(kind, handler);
    return this;
  }

  get(kind: string): ExprHandler | undefined {
    return this.exprHandlers.get(kind);
  }

  getStmt(kind: string): StmtHandler | undefined {
    return this.stmtHandlers.get(kind);
  }

  has(kind: string): boolean {
    return this.exprHandlers.has(kind) || this.stmtHandlers.has(kind);
  }

  get size(): number {
    return new Set([...this.exprHandlers.keys(), ...this.stmtHandlers.keys()]).size;
  }
}
