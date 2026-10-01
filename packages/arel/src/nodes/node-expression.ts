import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import type { PredicationsModule } from "../predications.js";
import type { MathModule } from "../math.js";
import type { OrderPredicationsModule } from "../order-predications.js";
import type { ExpressionsModule } from "../expressions.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class NodeExpression extends Node {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NodeExpression
  extends PredicationsModule, MathModule, ExpressionsModule, OrderPredicationsModule {}

rbSetClassPathString(NodeExpression, Nodes, "NodeExpression");
Nodes.NodeExpression = NodeExpression;
