import { include, type Included } from "@blazetrails/activesupport";
import { _setAttribute } from "../node-slots.js";
import { Node } from "../nodes/node.js";
import { As } from "../nodes/binary.js";
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
import { Predications } from "../predications.js";

/**
 * Attribute — represents a column on a table.
 *
 * Mirrors: Arel::Attributes::Attribute
 */
export interface RelationLike {
  // `Arel::Table#name` is whatever the table was constructed with — a String,
  // a SqlLiteral, or a node (table.rb:16, table_test.rb:118-130).
  name: string | Node;
  // `TableAlias#table_alias` aliases `:name`, which may be a `SqlLiteral`
  // (Arel::Nodes::TableAlias `alias :table_alias :name`, table_alias.rb); a
  // `Table#tableAlias` is a plain string-or-nil. Both flow through here as
  // `o.relation.table_alias`.
  tableAlias?: string | SqlLiteral | null;
  typeCastForDatabase: (attrName: string, value: unknown) => unknown;
  typeForAttribute: (name: string) => unknown;
  isAbleToTypeCast: () => boolean;
  lower: (column: unknown) => NamedFunction;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attribute extends Node {
  readonly relation: RelationLike;
  // Rails stores whatever `Table#[]` was handed (table.rb:81-85), so
  // `table[Arel.star]` seats a `SqlLiteral` here and `quote_column_name`
  // passes it through unquoted (to_sql.rb:877-880).
  readonly name: string | Node;

  // Rails' `Attribute.new(nil, nil)` is legal (attribute_test.rb:388); the
  // relation-dependent methods below simply raise NoMethodError if reached.
  constructor(relation: RelationLike | null, name: string | Node | null) {
    super();
    this.relation = relation as RelationLike;
    this.name = name as string | Node;
  }

  get typeCaster(): unknown {
    // Ruby passes `name` along untyped; only a String name ever reaches a
    // type caster, since `table[Arel.star]` is never type-cast.
    return this.relation.typeForAttribute(this.name as string);
  }

  // Mirrors: Arel::Attributes::Attribute#lower — `relation.lower self`. The
  // LOWER() node is built by FactoryMethods#lower on the relation, not here.
  lower(): NamedFunction {
    return this.relation.lower(this);
  }

  typeCastForDatabase(value: unknown): unknown {
    return this.relation.typeCastForDatabase(this.name as string, value);
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
  quotedNode(other: unknown): Node {
    return buildQuoted(other, this);
  }

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
  }

  // -- Math --
  //
  // Mirrors Arel::Math: operands pass through unwrapped. The visitor
  // renders primitive values via `visit` class dispatch. The operand is
  // typed `NodeOrValue` (not `unknown` + cast) so the union that encodes
  // what a Rails node slot admits is enforced at the call site.

  add(other: NodeOrValue): Grouping {
    return new Grouping(new Addition(this, other));
  }

  subtract(other: NodeOrValue): Grouping {
    return new Grouping(new Subtraction(this, other));
  }

  multiply(other: NodeOrValue): Multiplication {
    return new Multiplication(this, other);
  }

  divide(other: NodeOrValue): Division {
    return new Division(this, other);
  }

  bitwiseAnd(other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseAnd(this, other));
  }

  bitwiseOr(other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseOr(this, other));
  }

  bitwiseXor(other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseXor(this, other));
  }

  bitwiseShiftLeft(other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, other));
  }

  bitwiseShiftRight(other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseShiftRight(this, other));
  }

  bitwiseNot(): BitwiseNot {
    return new BitwiseNot(this);
  }

  as(other: string | SqlLiteral): As {
    return new As(this, new SqlLiteral(other, { retryable: true }));
  }

  // -- Aggregate functions --
  //
  // Mirrors: Arel::Expressions (mixed into Attribute in Rails). Returns
  // the typed Function subclasses Rails uses (Count/Sum/Max/Min/Avg) so
  // `instanceof` checks line up across the codebase. The visitor
  // (visitAggregate in to-sql.ts) renders them identically to a
  // NamedFunction with the same name.

  count(distinct: boolean | null = false): Count {
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

  extract(field: string): Extract {
    // Mirrors Rails: `Nodes::Extract.new [self], field` (expressions.rb).
    return new Extract([this], field);
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

_setAttribute(Attribute);
