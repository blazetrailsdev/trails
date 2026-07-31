import type { ExprHandler, StmtHandler } from "./types.js";
export class Registry {
  private readonly exprHandlers = new Map<string, ExprHandler>();
  private readonly stmtHandlers = new Map<string, StmtHandler>();
  on(kind: string, handler: ExprHandler): this {
    this.exprHandlers.set(kind, handler);
    return this;
  }
  onMany(kinds: string[], handler: ExprHandler): this {
    for (const k of kinds) this.on(k, handler);
    return this;
  }
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
