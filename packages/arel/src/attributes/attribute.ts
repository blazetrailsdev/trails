import { include, rbEqual, rbHash } from "@blazetrails/activesupport";
import { _setAttribute } from "../node-slots.js";
import { Node } from "../nodes/node.js";
import { buildQuoted } from "../nodes/casted.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule, type RangeLike } from "../predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { Math as MathMixin, type MathModule } from "../math.js";

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
  typeCastForDatabase: (attrName: string | Node | null, value: unknown) => unknown;
  typeForAttribute: (name: string | Node | null) => unknown;
  isAbleToTypeCast: () => boolean;
  lower: (column: unknown) => NamedFunction;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attribute extends Node {
  readonly relation: RelationLike;
  // Rails stores whatever `Table#[]` was handed (table.rb:81-85), so
  // `table[Arel.star]` seats a `SqlLiteral` here and `quote_column_name`
  // passes it through unquoted (to_sql.rb:877-880) — and `table[nil]`, which
  // `Relation#delete_all` builds for a pkless model (relation.rb:1027-1031),
  // seats nil.
  readonly name: string | Node | null;

  // Rails' `Attribute.new(nil, nil)` is legal (attribute_test.rb:388); the
  // relation-dependent methods below simply raise NoMethodError if reached.
  constructor(relation: RelationLike | null, name: string | Node | null) {
    super();
    this.relation = relation as RelationLike;
    this.name = name;
  }

  get typeCaster(): unknown {
    return this.relation.typeForAttribute(this.name);
  }

  // Mirrors: Arel::Attributes::Attribute#lower — `relation.lower self`. The
  // LOWER() node is built by FactoryMethods#lower on the relation, not here.
  lower(): NamedFunction {
    return this.relation.lower(this);
  }

  typeCastForDatabase(value: unknown): unknown {
    return this.relation.typeCastForDatabase(this.name, value);
  }

  isAbleToTypeCast(): boolean {
    return this.relation.isAbleToTypeCast();
  }

  /**
   * `Arel::Attributes::Attribute < Struct.new :relation, :name`
   * (attribute.rb:5), so `==` / `eql?` / `hash` are `Struct`'s, over the two
   * members in order.
   *
   * @noRailsEquivalent PERMANENT: inherited from `Struct`, so no
   * `attribute.rb` method declares either; TypeScript has no `Struct` to
   * subclass, so the inherited pair has to be written out.
   */
  hash(): number {
    return rbHash([this.constructor, this.relation, this.name]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Attribute &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.name, other.name)
    );
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
}

// Mirrors the five `include`s at attribute.rb:6-10. Every predication —
// eq/notEq/in/notIn/matches/between/*_any/*_all and the private
// quoted_array / grouping_any / infinity? helpers — comes from the mixin and
// dispatches back through this class's `quotedNode`, which is the only piece
// Attribute supplies (the type-casting variant).
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Attribute
  extends
    Omit<
      PredicationsModule,
      "between" | "notBetween" | "isInfinity" | "isUnboundable" | "isOpenEnded"
    >,
    ExpressionsModule,
    AliasPredicationModule,
    OrderPredicationsModule,
    MathModule {
  // Restated (rather than inherited) so a subclass can `override` them with a
  // narrowed signature — the self-dispatch predications.rb:38-51 relies on.

  /** @internal */
  isInfinity(value: unknown): 1 | -1 | 0;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | 0;
  /** @internal */
  isOpenEnded(value: unknown): boolean;
  between(other: RangeLike): Node;
  notBetween(other: RangeLike): Node;
}

// Mirrors attribute.rb:6-10, in Rails' include order.
include(Attribute, Expressions);
include(Attribute, Predications);
include(Attribute, AliasPredication);
include(Attribute, OrderPredications);
include(Attribute, MathMixin);

_setAttribute(Attribute);
