import type { Node } from "./nodes/node.js";

export interface Math {
  add(other: unknown): Node;
  subtract(other: unknown): Node;
  multiply(other: unknown): Node;
  divide(other: unknown): Node;
}
