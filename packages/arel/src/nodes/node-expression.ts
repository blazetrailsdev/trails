import { Nodes } from "../namespaces.js";
import { include } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule } from "../predications.js";
import { AliasPredication } from "../alias-predication.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { Math as MathMixin, type MathModule } from "../math.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class NodeExpression extends Node {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NodeExpression
  extends PredicationsModule, MathModule, ExpressionsModule, OrderPredicationsModule {}

include(NodeExpression, Expressions);
include(NodeExpression, Predications);
include(NodeExpression, AliasPredication);
include(NodeExpression, OrderPredications);
include(NodeExpression, MathMixin);

rbModConstSet(Nodes, "NodeExpression", NodeExpression);
