import { Nodes } from "../namespaces.js";
import { ArgumentError, include } from "@blazetrails/activesupport";
import { stringSuperclass, rbModConstSet } from "@blazetrails/ruby-compat";
import { arelNode } from "../arel.js";
import { Fragments } from "./fragments.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule } from "../predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import type { Attribute } from "../attributes/attribute.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SqlLiteral extends stringSuperclass("eql", "hash", "isBlank", "isEmpty") {
  readonly retryable: boolean;

  constructor(string: string | SqlLiteral, { retryable = false }: { retryable?: boolean } = {}) {
    super(string);
    this.retryable = retryable;
  }

  fetchAttribute(_block?: (attr: Attribute) => boolean): boolean | undefined {
    return undefined;
  }

  encodeWith(coder: { scalar: string }): void {
    coder.scalar = this.toString();
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([this, other]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SqlLiteral
  extends PredicationsModule, ExpressionsModule, AliasPredicationModule, OrderPredicationsModule {}

include(SqlLiteral, Expressions);
include(SqlLiteral, Predications);
include(SqlLiteral, AliasPredication);
include(SqlLiteral, OrderPredications);

rbModConstSet(Nodes, "SqlLiteral", SqlLiteral);
