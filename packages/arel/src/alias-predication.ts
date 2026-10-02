import type { As } from "./nodes/binary.js";
import type { Node } from "./nodes/node.js";
import type { SqlLiteral } from "./nodes/sql-literal.js";
import { Nodes } from "./namespaces.js";

export interface AliasPredicationModule {
  as(other: string | SqlLiteral): As;
}

export const AliasPredication: AliasPredicationModule = {
  as(this: Node, other: string | SqlLiteral): As {
    return new Nodes.As(this, new Nodes.SqlLiteral(other, { retryable: true }));
  },
};
