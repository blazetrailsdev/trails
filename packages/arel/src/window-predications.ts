import type { Node } from "./nodes/node.js";
import { Over } from "./nodes/over.js";
import { SqlLiteral } from "./nodes/sql-literal.js";

/**
 * WindowPredications — `over` mixin.
 *
 * Mirrors: Arel::WindowPredications (activerecord/lib/arel/window_predications.rb).
 */
export interface WindowPredicationsModule {
  // Rails accepts any expr (`def over(expr = nil)`) and renders it
  // through the Over-node visitor unchanged. We accept Node, a trusted
  // raw SQL string fragment, or null. NamedFunction#over widens further
  // to handle NamedWindow specifically (rendering it as a quoted name
  // reference); the base mixin defers to whatever the Over visitor does
  // with whatever Node it's given — passing a NamedWindow here renders
  // an inline window definition (`OVER "name" AS (...)`), matching Rails.
  over(expr?: Node | string | null): Over;
}

export const WindowPredications: WindowPredicationsModule = {
  over(this: Node, expr: Node | string | null = null): Over {
    // String arguments are wrapped in SqlLiteral and emitted verbatim
    // (trusted raw SQL fragment) in the OVER clause — they are not
    // escaped as identifiers. Without this wrapping the visitor would
    // treat the string as a value and emit `OVER 'w'` instead of `OVER w`.
    const right = typeof expr === "string" ? new SqlLiteral(expr) : (expr as Node | null);
    return new Over(this, right);
  },
};
