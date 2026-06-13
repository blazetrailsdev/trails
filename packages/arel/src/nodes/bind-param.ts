import { Node, NodeVisitor } from "./node.js";

/**
 * Represents a bind parameter placeholder in a prepared statement.
 *
 * Mirrors: Arel::Nodes::BindParam
 *
 * Deliberate deviation — `toSql()` inlining vs. Rails' `?` placeholder:
 * Rails' `Arel::Nodes::BindParam.new(v).to_sql` emits the bind marker `?`
 * (the default ToSql collector records a placeholder and leaves bind
 * substitution to the connection). trails' `Node#toSql()` instead routes
 * through `ToSql#compile`, which post-processes the collected binds and
 * inlines their quoted values — so `new BindParam(1).toSql()` is `"1"` and
 * `new BindParam(null).toSql()` is `"NULL"`. This is intentional: `toSql()`
 * is our human-readable / parity "display SQL" surface, and the parity
 * tooling re-inlines non-datetime binds anyway (see
 * docs/activerecord/parity-verification.md). The `?`-placeholder form is
 * still available via `ToSql#compileWithBinds`, which returns the SQL with
 * markers and the bind values separately. A *valueless* BindParam
 * (`new BindParam()`) has nothing to inline and renders as `?`.
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
