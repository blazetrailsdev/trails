import { include, rbEqual, rbHash } from "@blazetrails/activesupport";
import { _setAttribute } from "../node-slots.js";
import { Node } from "../nodes/node.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule, type RangeLike } from "../predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { Math as MathMixin, type MathModule } from "../math.js";
import { setRubyNamespace } from "../visitors/ruby-class.js";

export interface RelationLike {
  name: string | Node;
  tableAlias?: string | SqlLiteral | null;
  typeCastForDatabase: (attrName: string | Node | null, value: unknown) => unknown;
  typeForAttribute: (name: string | Node | null) => unknown;
  isAbleToTypeCast: () => boolean;
  lower: (column: unknown) => NamedFunction;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attribute extends Node {
  readonly relation: RelationLike;
  readonly name: string | Node | null;

  constructor(relation: RelationLike | null, name: string | Node | null) {
    super();
    this.relation = relation as RelationLike;
    this.name = name;
  }

  get typeCaster(): unknown {
    return this.relation.typeForAttribute(this.name);
  }

  lower(): NamedFunction {
    return this.relation.lower(this);
  }

  typeCastForDatabase(value: unknown): unknown {
    return this.relation.typeCastForDatabase(this.name, value);
  }

  isAbleToTypeCast(): boolean {
    return this.relation.isAbleToTypeCast();
  }

  /** @noRailsEquivalent PERMANENT */
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
}

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
  /** @internal */
  isInfinity(value: unknown): 1 | -1 | 0;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | 0;
  /** @internal */
  isOpenEnded(value: unknown): boolean;
  between(other: RangeLike): Node;
  notBetween(other: RangeLike): Node;
}

include(Attribute, Expressions);
include(Attribute, Predications);
include(Attribute, AliasPredication);
include(Attribute, OrderPredications);
include(Attribute, MathMixin);

_setAttribute(Attribute);
setRubyNamespace(Attribute, "Arel::Attributes");
