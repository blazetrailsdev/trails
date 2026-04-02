import { Node, NodeVisitor } from "./node.js";

/**
 * Represents a bind parameter placeholder in a prepared statement.
 *
 * Mirrors: Arel::Nodes::BindParam
 */
export class BindParam extends Node {
  readonly value: unknown;

  constructor(value?: unknown) {
    super();
    this.value = value;
  }

  valueBeforeTypeCast(): unknown {
    const v = this.value as { valueBeforeTypeCast?: () => unknown } | null | undefined;
    return typeof v?.valueBeforeTypeCast === "function" ? v.valueBeforeTypeCast() : this.value;
  }

  isInfinite(): number | null {
    const v = this.value as { isInfinite?: () => number | null } | null | undefined;
    return typeof v?.isInfinite === "function" ? v.isInfinite() : null;
  }

  isUnboundable(): boolean {
    const v = this.value as { isUnboundable?: () => boolean } | null | undefined;
    return typeof v?.isUnboundable === "function" ? v.isUnboundable() : false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
