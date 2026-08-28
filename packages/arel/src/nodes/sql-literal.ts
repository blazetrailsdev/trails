import { ArgumentError, isBlank, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
import { Node } from "./node.js";
import { Fragments } from "./fragments.js";
import { buildQuoted } from "./casted.js";

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

  /** @noRailsEquivalent PERMANENT */
  eql(other: unknown): boolean {
    if (typeof other === "string") return this.value === other;
    return other instanceof SqlLiteral && this.value === other.value;
  }

  /** @noRailsEquivalent PERMANENT */
  hash(): number {
    return rbHash(this.value);
  }

  encodeWith(coder: { scalar: string }): void {
    coder.scalar = this.toString();
  }

  toString(): string {
    return this.value;
  }

  /** @noRailsEquivalent PERMANENT */
  isBlank(): boolean {
    return isBlank(this.value);
  }

  /** @internal */
  quotedNode(other: unknown): Node {
    return buildQuoted(other, this);
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([this, other as Node]);
  }
}

type _Predications = import("../predications.js").PredicationsModule;
type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SqlLiteral
  extends _Predications, _Expressions, _AliasPredication, _OrderPredications {}
