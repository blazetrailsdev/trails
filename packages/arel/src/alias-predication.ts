import { As } from "./nodes/binary.js";
import type { Node } from "./nodes/node.js";
import { SqlLiteral } from "./nodes/sql-literal.js";

export interface AliasPredicationModule {
  as(other: string | SqlLiteral): As;
}

export const AliasPredication: AliasPredicationModule = {
  as(this: Node, other: string | SqlLiteral): As {
    return new As(this, new SqlLiteral(other, { retryable: true }));
  },
};
