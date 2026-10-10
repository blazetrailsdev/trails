import { rbScanArgs } from "@blazetrails/ruby-compat";
import { Arel } from "./namespaces.js";
import { Node } from "./nodes/node.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { BoundSqlLiteral } from "./nodes/bound-sql-literal.js";
import type { Attribute } from "./attributes/attribute.js";

export type ArelNode = Node | Attribute | SqlLiteral;

export function sql(sqlString: string, options?: { retryable: boolean }): SqlLiteral;
export function sql(sqlString: string, ...positionalBinds: unknown[]): SqlLiteral | BoundSqlLiteral;
/** @inventedArm rbScanArgs — PERMANENT */
export function sql(
  sqlString: string,
  ...positionalBinds: unknown[]
): SqlLiteral | BoundSqlLiteral {
  let retryable: boolean, namedBinds: Record<string, unknown>;
  [positionalBinds, { retryable = false, ...namedBinds }] = rbScanArgs<{
    retryable?: boolean;
    [key: string]: unknown;
  }>(positionalBinds);
  if (positionalBinds.length === 0 && Object.keys(namedBinds).length === 0) {
    return new SqlLiteral(sqlString, { retryable });
  } else {
    return new BoundSqlLiteral(sqlString, positionalBinds, namedBinds);
  }
}

export function star(): SqlLiteral {
  return sql("*", { retryable: true });
}

export function arelNode(value: unknown): value is ArelNode {
  return value instanceof Node || value instanceof Arel.Attribute || value instanceof SqlLiteral;
}

export function fetchAttribute(
  value: unknown,
  block: (attr: Attribute) => boolean,
): boolean | undefined {
  if (typeof value !== "string") {
    return (value as Node).fetchAttribute(block);
  }
  return undefined;
}
