import { include } from "@blazetrails/activesupport";
import { rbModConstSet, Struct } from "@blazetrails/ruby-compat";
import { Arel, Attributes } from "../namespaces.js";
import type { Node } from "../nodes/node.js";
import { SqlLiteral } from "../nodes/sql-literal.js";
import { NamedFunction } from "../nodes/named-function.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule, type RangeLike } from "../predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { Math as MathMixin, type MathModule } from "../math.js";
import type { ArelNode } from "../arel.js";

export interface RelationLike {
  name: string | ArelNode;
  tableAlias?: string | SqlLiteral | null;
  typeCastForDatabase: (attrName: string | ArelNode | null, value: unknown) => unknown;
  typeForAttribute: (name: string | ArelNode | null) => unknown;
  isAbleToTypeCast: () => boolean;
  lower: (column: unknown) => NamedFunction;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attribute extends Struct.new("relation", "name") {
  declare readonly relation: RelationLike;
  declare readonly name: string | ArelNode | null;

  constructor(relation: RelationLike | null, name: string | ArelNode | null) {
    super(relation, name);
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
    MathModule {
  /** @internal */
  isInfinity(value: unknown): 1 | -1 | null | false;
  /** @internal */
  isUnboundable(value: unknown): 1 | -1 | false;
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

rbModConstSet(Attributes, "Attribute", Attribute);
Arel.Attribute = Attributes.Attribute;
