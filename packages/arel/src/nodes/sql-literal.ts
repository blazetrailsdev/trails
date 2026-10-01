import { Nodes } from "../namespaces.js";
import { ArgumentError, include } from "@blazetrails/activesupport";
import {
  stringSuperclass,
  type StringInstance,
  rbSetClassPathString,
} from "@blazetrails/ruby-compat";
import { arelNode } from "../arel.js";
import { Node } from "./node.js";
import { Fragments } from "./fragments.js";
import type { PredicationsModule } from "../predications.js";
import type { AliasPredicationModule } from "../alias-predication.js";
import type { OrderPredicationsModule } from "../order-predications.js";
import type { ExpressionsModule } from "../expressions.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SqlLiteral extends Node {
  readonly value: string;
  readonly retryable: boolean;

  constructor(string: string | SqlLiteral, options?: { retryable?: boolean }) {
    super();
    this.value = string instanceof SqlLiteral ? string.value : string;
    this.retryable = options?.retryable ?? false;
  }

  fetchAttribute(_block?: (attr: Node) => boolean): boolean | undefined {
    return undefined;
  }

  encodeWith(coder: { scalar: string }): void {
    coder.scalar = this.toString();
  }

  toString(): string {
    return this.value;
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([this, other as Node]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SqlLiteral
  extends
    Pick<StringInstance, "eql" | "hash" | "isBlank">,
    PredicationsModule,
    ExpressionsModule,
    AliasPredicationModule,
    OrderPredicationsModule {}

include(SqlLiteral, stringSuperclass("eql", "hash", "isBlank"));

rbSetClassPathString(SqlLiteral, Nodes, "SqlLiteral");
Nodes.SqlLiteral = SqlLiteral;
