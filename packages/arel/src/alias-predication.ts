import type { As } from "./nodes/binary.js";
import type { ArelNode } from "./arel.js";
import type { SqlLiteral } from "./nodes/sql-literal.js";
import { Nodes } from "./namespaces.js";

export interface AliasPredicationModule {
  as(other: string | SqlLiteral): As;
}

export const AliasPredication: AliasPredicationModule = {
  as(this: ArelNode, other: string | SqlLiteral): As {
    return new Nodes.As(this, new Nodes.SqlLiteral(other, { retryable: true }));
  },
};
