import type { Node } from "./nodes/node.js";
import { Over } from "./nodes/over.js";

/**
 * WindowPredications — `over` mixin.
 *
 * Mirrors: Arel::WindowPredications (activerecord/lib/arel/window_predications.rb).
 */
export interface WindowPredicationsModule {
  // Rails accepts any expr (`def over(expr = nil)`) and hands it to the
  // Over node unchanged — the visitor, not this mixin, decides how it
  // renders. A bare string is quoted as a window-name identifier
  // (`OVER "w"`); wrap it in SqlLiteral for a raw fragment (`OVER w`).
  over(expr?: Node | string | null): Over;
}

export const WindowPredications: WindowPredicationsModule = {
  over(this: Node, expr: Node | string | null = null): Over {
    return new Over(this, expr);
  },
};
