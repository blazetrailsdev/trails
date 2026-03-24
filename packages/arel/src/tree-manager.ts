import { Node } from "./nodes/node.js";

export interface StatementMethods {
  take(limit: unknown): unknown;
  offset(offset: unknown): unknown;
  order(...expr: Node[]): unknown;
  where(expr: Node): unknown;
}

export abstract class TreeManager {
  abstract readonly ast: Node;
}
