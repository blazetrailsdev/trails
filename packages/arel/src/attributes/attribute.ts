import { include, type Included } from "@blazetrails/activesupport";
import { Node, NodeVisitor } from "../nodes/node.js";
import { As, ATTRIBUTE_BRAND } from "../nodes/binary.js";
import { Addition, Subtraction, Multiplication, Division } from "../nodes/infix-operation.js";
import { Count } from "../nodes/count.js";
import { Sum, Max, Min, Avg } from "../nodes/function.js";
import { Ascending } from "../nodes/ascending.js";
import { Descending } from "../nodes/descending.js";
import { buildQuoted } from "../nodes/casted.js";
import { Grouping } from "../nodes/grouping.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Extract } from "../nodes/extract.js";
import {
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseShiftLeft,
  BitwiseShiftRight,
} from "../nodes/infix-operation.js";
import { BitwiseNot } from "../nodes/unary-operation.js";
import type { NodeOrValue } from "../nodes/binary.js";
import { Over } from "../nodes/over.js";
import { NamedWindow, Window } from "../nodes/window.js";
import { Predications } from "../predications.js";

/**
 * Attribute — represents a column on a table.
 *
 * Mirrors: Arel::Attributes::Attribute
 */
export interface RelationLike {
  // A `SqlLiteral` name (e.g. a `SelectManager#as` / set-op `from()` derived
  // table) renders bare; `quoteTableName` returns its value unchanged.
  name: string | SqlLiteral;
  // `TableAlias#table_alias` aliases `:name`, which may be a `SqlLiteral`
  // (Arel::Nodes::TableAlias `alias :table_alias :name`, table_alias.rb); a
  // `Table#tableAlias` is a plain string-or-nil. Both flow through here as
  // `o.relation.table_alias`.
  tableAlias?: string | SqlLiteral | null;
  typeCastForDatabase: (attrName: string, value: unknown) => unknown;
  typeForAttribute: (name: string) => unknown;
  isAbleToTypeCast: () => boolean;
}

/**
 * Coerce a relation / table-alias `name` to a plain string, unwrapping a
 * `SqlLiteral`. In Rails `Arel::Nodes::SqlLiteral < String`, so a SqlLiteral
 * name is already a usable string; here `SqlLiteral` is a standalone `Node`, so
 * every string consumer of `RelationLike.name` / `TableAlias.name` must unwrap
 * via this helper rather than letting the object flow into a `String` slot.
 */
export function relationName(name: string | SqlLiteral): string {
  return name instanceof SqlLiteral ? name.value : name;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attribute extends Node {
  readonly [ATTRIBUTE_BRAND] = true;
  readonly relation: RelationLike;
  readonly name: string;

  constructor(relation: RelationLike, name: string) {
    super();
    this.relation = relation;
    this.name = name;
  }

  get typeCaster(): unknown {
    return this.relation.typeForAttribute(this.name);
  }

  // -- String functions --

  lower(): NamedFunction {
    return new NamedFunction("LOWER", [this]);
  }

  typeCastForDatabase(value: unknown): unknown {
    return this.relation.typeCastForDatabase(this.name, value);
  }

  isAbleToTypeCast(): boolean {
    return this.relation.isAbleToTypeCast();
  }

  /**
   * Mirrors: Arel::Predications#quoted_node — `Nodes.build_quoted(other, self)`
   * (arel/predications.rb). Passing `self` as the attribute means every
   * non-pass-through raw value — nil included — becomes `Casted(value, this)`
   * (casted.rb:48-58), so the visitor can apply column-level type-casting.
   *
   * @internal
   */
  quotedNode(value: unknown): Node {
    return buildQuoted(value, this);
  }

  // -- Ordering --

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
  }

  // -- Math --
  //
  // Mirrors Arel::Math: operands pass through unwrapped. The visitor
  // renders primitive values via `visit` class dispatch.

  add(other: unknown): Grouping {
    return new Grouping(new Addition(this, other as NodeOrValue));
  }

  subtract(other: unknown): Grouping {
    return new Grouping(new Subtraction(this, other as NodeOrValue));
  }

  multiply(other: unknown): Multiplication {
    return new Multiplication(this, other as NodeOrValue);
  }

  divide(other: unknown): Division {
    return new Division(this, other as NodeOrValue);
  }

  bitwiseAnd(other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, other as NodeOrValue));
  }

  bitwiseOr(other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, other as NodeOrValue));
  }

  bitwiseXor(other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, other as NodeOrValue));
  }

  bitwiseShiftLeft(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, other as NodeOrValue));
  }

  bitwiseShiftRight(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, other as NodeOrValue));
  }

  bitwiseNot(): BitwiseNot {
    return new BitwiseNot(this);
  }

  // -- Aliasing --

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }

  // -- Aggregate functions --
  //
  // Mirrors: Arel::Expressions (mixed into Attribute in Rails). Returns
  // the typed Function subclasses Rails uses (Count/Sum/Max/Min/Avg) so
  // `instanceof` checks line up across the codebase. The visitor
  // (visitAggregate in to-sql.ts) renders them identically to a
  // NamedFunction with the same name.

  count(distinct = false): Count {
    return new Count([this], distinct);
  }

  sum(): Sum {
    return new Sum([this]);
  }

  maximum(): Max {
    return new Max([this]);
  }

  minimum(): Min {
    return new Min([this]);
  }

  average(): Avg {
    return new Avg([this]);
  }

  upper(): NamedFunction {
    return new NamedFunction("UPPER", [this]);
  }

  length(): NamedFunction {
    return new NamedFunction("LENGTH", [this]);
  }

  trim(): NamedFunction {
    return new NamedFunction("TRIM", [this]);
  }

  ltrim(): NamedFunction {
    return new NamedFunction("LTRIM", [this]);
  }

  rtrim(): NamedFunction {
    return new NamedFunction("RTRIM", [this]);
  }

  substring(start: number, length?: number): NamedFunction {
    const args: Node[] = [this, buildQuoted(start)];
    if (length !== undefined) args.push(buildQuoted(length));
    return new NamedFunction("SUBSTRING", args);
  }

  replace(from: string, to: string): NamedFunction {
    return new NamedFunction("REPLACE", [this, buildQuoted(from), buildQuoted(to)]);
  }

  // -- Math functions --

  abs(): NamedFunction {
    return new NamedFunction("ABS", [this]);
  }

  round(precision?: number): NamedFunction {
    const args: Node[] = [this];
    if (precision !== undefined) args.push(buildQuoted(precision));
    return new NamedFunction("ROUND", args);
  }

  ceil(): NamedFunction {
    return new NamedFunction("CEIL", [this]);
  }

  floor(): NamedFunction {
    return new NamedFunction("FLOOR", [this]);
  }

  // -- Extract --

  extract(field: string): Extract {
    // Mirrors Rails: `Nodes::Extract.new [self], field` (expressions.rb).
    return new Extract([this], field);
  }

  /**
   * Apply a window to this expression.
   *
   * Mirrors: `OVER` support on Arel expressions.
   */
  over(window?: Window | NamedWindow | string | null): Over {
    if (!window) return new Over(this, null);
    if (typeof window === "string") return new Over(this, new SqlLiteral(window));
    if (window instanceof NamedWindow) return new Over(this, new SqlLiteral(`"${window.name}"`));
    return new Over(this, window);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

// Mirrors `include Arel::Predications` (attribute.rb:7). Every predication —
// eq/notEq/in/notIn/matches/between/*_any/*_all and the private
// quoted_array / grouping_any / infinity? helpers — comes from the mixin and
// dispatches back through this class's `quotedNode`, which is the only piece
// Attribute supplies (the type-casting variant).
//
// `between` / `notBetween` are re-declared rather than inherited from
// `Included<>`: the mixin types them with an overload set, and `Included<>`'s
// signature inference keeps only the last overload.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Attribute extends Omit<
  Included<typeof Predications>,
  "between" | "notBetween" | "isInfinity" | "isUnboundable" | "isOpenEnded"
> {
  // Declared as methods (not the property signatures `Included<>` produces) so
  // a subclass can `override` them — the self-dispatch predications.rb:38-51
  // relies on.

  /** @internal */
  isInfinity(value: unknown): 1 | -1 | 0;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | 0;
  /** @internal */
  isOpenEnded(value: unknown): boolean;
  between(range: readonly [unknown, unknown]): Node;
  between(rangeObj: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
  between(begin: unknown, end: unknown, excludeEnd?: boolean): Node;
  notBetween(range: readonly [unknown, unknown]): Node;
  notBetween(rangeObj: { begin: unknown; end: unknown; excludeEnd?: boolean }): Node;
  notBetween(begin: unknown, end: unknown, excludeEnd?: boolean): Node;
}

include(Attribute, Predications);
