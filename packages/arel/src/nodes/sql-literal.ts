import { isBlank, type Included } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Fragments } from "./fragments.js";
import { buildQuoted } from "./casted.js";

/**
 * SqlLiteral — a raw SQL string passed through unescaped.
 *
 * Mirrors: Arel::Nodes::SqlLiteral. Rails extends `String` and includes
 * Expressions, Predications, AliasPredication, OrderPredications. The
 * runtime mixin wiring lives in ../index.ts to avoid module-load cycles.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SqlLiteral extends Node {
  readonly value: string;
  retryableFlag = false;

  get retryable(): boolean {
    return this.retryableFlag;
  }

  constructor(value: string, options?: { retryable?: boolean }) {
    super();
    this.value = value;
    if (options?.retryable) {
      this.retryableFlag = true;
    }
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  // Rails' SqlLiteral IS a String subclass, so `to_s` returns the SQL text
  // itself — which `resolve_attribute_name` (attribute_registration.rb:102) and
  // `in_order_of`'s `column.to_s` (query_methods.rb:724) both rely on.
  toString(): string {
    return this.value;
  }

  /**
   * Ruby gets this for free: `SqlLiteral < String`, so `blank?` is
   * `String#blank?` and a whitespace-only literal is blank —
   * `build_order`'s `order_values.compact_blank` (query_methods.rb:2056)
   * drops one. A TS class cannot subclass the string primitive, so the
   * predicate is spelled out and `Object#blank?` dispatches to it.
   * @noRailsEquivalent PERMANENT: `SqlLiteral < String` in Ruby, so `blank?`
   * arrives by inheritance. TypeScript cannot subclass the string primitive,
   * so the inherited predicate has to be written out for `Object#blank?` to
   * dispatch to it; no amount of porting removes this name.
   */
  isBlank(): boolean {
    return isBlank(this.value);
  }

  // Required by the Predications mixin (mirrors Rails' private
  // Predications#quoted_node, which calls `Nodes.build_quoted(other, self)`).
  /** @internal */
  quotedNode(other: unknown): Node {
    return other instanceof Node ? other : buildQuoted(other, this);
  }

  join(other: Node): Fragments {
    return new Fragments([this, other]);
  }

  /** @internal */
  plus(other: Node): Fragments {
    return this.join(other);
  }

  toYAML(): string {
    const escaped = this.value.replace(/\n/g, "\\n");
    return `---\n!sql_literal\nvalue: ${JSON.stringify(escaped)}`;
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SqlLiteral
  extends
    Included<typeof import("../predications.js").Predications>,
    _Expressions,
    _AliasPredication,
    _OrderPredications {}
