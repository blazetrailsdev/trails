import type { Node } from "./nodes/node.js";

export interface FactoryMethods {
  createStringJoin(to: string | Node): Node;
  createTableAlias(relation: Node, name: string): Node;
  createJoin(to: Node, constraint?: Node): Node;
  grouping(expr: Node): Node;
}
