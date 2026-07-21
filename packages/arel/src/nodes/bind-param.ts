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

  /**
   * Mirrors `Arel::Nodes::BindParam#nil?` (bind_param.rb:23-25), which
   * delegates to `value.nil?`. A bare raw `null` value is nil; a wrapped
   * attribute (e.g. a QueryAttribute that serializes an enum/normalized value
   * to nil) answers via its own `isNil()`. So a `BindParam` around a nil right
   * reports nil and the equality visitors emit `IS NULL`. A valueless
   * placeholder (`undefined`) is a trails positional-bind marker, not a Rails
   * value, so it stays a `?` bind rather than collapsing to `IS NULL`.
   */
  isNil(): boolean {
    if (this.value === null) return true;
    const v = this.value as { isNil?: () => boolean } | undefined;
    return typeof v?.isNil === "function" && v.isNil();
  }

  valueBeforeTypeCast(): unknown {
    const v = this.value as { valueBeforeTypeCast?: () => unknown } | null | undefined;
    return typeof v?.valueBeforeTypeCast === "function" ? v.valueBeforeTypeCast() : this.value;
  }

  /**
   * Mirrors: Arel::Nodes::BindParam#infinite? (bind_param.rb:33-35) —
   * `value.respond_to?(:infinite?) && value.infinite?`, which yields the *sign*
   * (Ruby's `Float#infinite?` returns `1 | -1 | nil`), not a boolean.
   *
   * A bare ±Infinity answers it too: `Float` responds to `infinite?`, so
   * `BindParam(Float::INFINITY).infinite?` is `1` in Rails and the bound is
   * open-ended. Checking only for a wrapped `isInfinite()` would miss that.
   */
  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    const v = this.value as { isInfinite?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isInfinite === "function" ? v.isInfinite() : false;
  }

  isUnboundable(): 1 | -1 | false {
    const v = this.value as { isUnboundable?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isUnboundable === "function" ? v.isUnboundable() : false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
