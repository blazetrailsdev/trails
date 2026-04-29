import { As } from "./nodes/binary.js";
import type { Node } from "./nodes/node.js";
import { SqlLiteral } from "./nodes/sql-literal.js";

/**
 * AliasPredication — `as` mixin.
 *
 * Mirrors: Arel::AliasPredication (activerecord/lib/arel/alias_predication.rb).
 */
export interface AliasPredicationModule {
  // Return type is `Node` (rather than `As`) because some classes override
  // `as` with self-returning behavior that mutates an internal alias slot:
  // Rails' Function.as / Table.as / SelectManager.as all return `this` after
  // setting an internal alias, while AliasPredication's own implementation
  // returns an `As` wrapper. The widened return type accommodates both.
  as(other: string): Node;
}

export const AliasPredication: AliasPredicationModule = {
  as(this: Node, other: string): As {
    return new As(this, new SqlLiteral(other, { retryable: true }));
  },
};
