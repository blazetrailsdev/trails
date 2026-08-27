import { ArgumentError, isBlank, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
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
  // Mirrors `attr_reader :retryable` (sql_literal.rb:11).
  readonly retryable: boolean;

  /**
   * Ruby's SqlLiteral IS a String, so `SqlLiteral.new(other)` is `String.new`
   * (sql_literal.rb:6): handed a SqlLiteral it yields a String with the same
   * content, never a nested literal. `as(Arel.sql("foo"))` relies on that
   * (alias_predication.rb:6).
   */
  constructor(value: string | SqlLiteral, options?: { retryable?: boolean }) {
    super();
    this.value = value instanceof SqlLiteral ? value.value : value;
    this.retryable = options?.retryable ?? false;
  }

  fetchAttribute(_block?: (attr: Node) => unknown): unknown {
    return undefined;
  }

  /**
   * `Arel::Nodes::SqlLiteral < String` (sql_literal.rb:5), so equality is
   * `String#==` on the SQL text: `retryable` (sql_literal.rb:11) plays no part,
   * and a literal is `==` to a bare String carrying the same text. `Node#eql`
   * would compare serialized fields and match neither.
   *
   * @noRailsEquivalent PERMANENT: the same shortcoming `isBlank` below records —
   * `==` / `eql?` arrive by inheritance from String, so no `sql_literal.rb`
   * method declares them, and TypeScript cannot subclass the string primitive.
   * No amount of porting removes this name.
   */
  eql(other: unknown): boolean {
    if (typeof other === "string") return this.value === other;
    return other instanceof SqlLiteral && this.value === other.value;
  }

  /**
   * The `hash` half of the pair above, and inherited from String for the same
   * reason: `String#hash` is over the text alone.
   *
   * @noRailsEquivalent PERMANENT: `SqlLiteral < String` (sql_literal.rb:5), so
   * `hash` arrives by inheritance and no `sql_literal.rb` method declares it;
   * TypeScript cannot subclass the string primitive.
   */
  hash(): number {
    return rbHash(this.value);
  }

  /** Mirrors: `encode_with(coder)` (sql_literal.rb:18-20). */
  encodeWith(coder: { scalar: string }): void {
    coder.scalar = this.toString();
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
    return buildQuoted(other, this);
  }

  // Mirrors Arel::Nodes::SqlLiteral#+ (sql_literal.rb:25-29), including the
  // `Arel.arel_node?` guard. `unknown` keeps that guard reachable from typed
  // callers, as on BoundSqlLiteral#plus.
  /** @internal */
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
