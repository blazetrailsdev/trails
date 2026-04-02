import { Node, NodeVisitor } from "./node.js";
import { Fragments } from "./fragments.js";

/**
 * SqlLiteral — a raw SQL string passed through unescaped.
 *
 * Mirrors: Arel::Nodes::SqlLiteral
 */
export class SqlLiteral extends Node {
  readonly value: string;
  retryableFlag = false;

  constructor(value: string, options?: { retryable?: boolean }) {
    super();
    this.value = value;
    if (options?.retryable) {
      this.retryableFlag = true;
    }
  }

  get retryable(): boolean {
    return this.retryableFlag;
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  join(other: Node): Fragments {
    return new Fragments([this, other]);
  }

  toYAML(): string {
    // Minimal YAML-ish representation for test parity (no external deps).
    const escaped = this.value.replace(/\n/g, "\\n");
    return `---\n!sql_literal\nvalue: ${JSON.stringify(escaped)}`;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
