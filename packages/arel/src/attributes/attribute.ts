import { include } from "@blazetrails/activesupport";
import { rbSetClassPathString, Struct, type StructInstance } from "@blazetrails/ruby-compat";
import { Arel, Attributes } from "../namespaces.js";
import { Node } from "../nodes/node.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule, type RangeLike } from "../predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { Math as MathMixin, type MathModule } from "../math.js";

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
    MathModule,
    StructInstance {
  /** @internal */
  isInfinity(value: unknown): 1 | -1 | 0;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | 0;
  /** @internal */
  isOpenEnded(value: unknown): boolean;
  between(other: RangeLike): Node;
  notBetween(other: RangeLike): Node;
}

include(Attribute, Struct.new("relation", "name"));
include(Attribute, Expressions);
include(Attribute, Predications);
include(Attribute, AliasPredication);
include(Attribute, OrderPredications);
include(Attribute, MathMixin);

rbSetClassPathString(Attribute, Attributes, "Attribute");
Attributes.Attribute = Attribute;
Arel.Attribute = Attributes.Attribute;
