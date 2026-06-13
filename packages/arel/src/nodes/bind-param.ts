import { Node, NodeVisitor } from "./node.js";

/**
 * Represents a bind parameter placeholder in a prepared statement.
 *
 * Mirrors: Arel::Nodes::BindParam
 *
 * `toSql()` always emits the bind marker `?`, regardless of the wrapped
 * value — matching Rails' `visit_Arel_Nodes_BindParam`, which does
 * `collector.add_bind(o.value, &bind_block)` where `BIND_BLOCK = proc { "?" }`.
 * So `new BindParam(1).toSql()`, `new BindParam(null).toSql()`, and the
 * valueless `new BindParam().toSql()` are all `"?"`. The value is recorded
 * separately, not inlined; `ToSql#compileWithBinds` returns the SQL with `?`
 * markers alongside the extracted bind values. (Casted/Quoted literals do
 * inline via `quote` — only BindParam/Attribute collect a placeholder.)
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

  isUnboundable(): 1 | -1 | false {
    const v = this.value as { isUnboundable?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isUnboundable === "function" ? v.isUnboundable() : false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
