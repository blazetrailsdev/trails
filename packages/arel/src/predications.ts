import type { Node } from "./nodes/node.js";

export interface Predications {
  eq(other: unknown): Node;
  notEq(other: unknown): Node;
  gt(other: unknown): Node;
  gteq(other: unknown): Node;
  lt(other: unknown): Node;
  lteq(other: unknown): Node;
  matches(other: unknown, escape?: string | null, caseSensitive?: boolean): Node;
  doesNotMatch(other: unknown, escape?: string | null, caseSensitive?: boolean): Node;
  in(values: unknown): Node;
  notIn(values: unknown): Node;
  between(begin: unknown, end: unknown): Node;
  isNotNull(): Node;
  isNull(): Node;
  isDistinctFrom(other: unknown): Node;
  isNotDistinctFrom(other: unknown): Node;
  concat(other: unknown): Node;
}
