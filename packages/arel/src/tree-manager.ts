import { Node } from "./nodes/node.js";
import { PlainString } from "./collectors/plain-string.js";
import { Dot } from "./visitors/dot.js";
import { ToSql } from "./visitors/to-sql.js";

export interface StatementMethods {
  take(limit: unknown): unknown;
  offset(offset: unknown): unknown;
  order(...expr: Node[]): unknown;
  where(expr: Node): unknown;
}

export abstract class TreeManager {
  abstract readonly ast: Node;

  toDot(): string {
    const collector = new PlainString();
    const dot = new Dot();
    dot.accept(this.ast, collector);
    return collector.value;
  }

  toSql(): string {
    const visitor = new ToSql();
    return visitor.compile(this.ast);
  }

  set key(key: unknown) {
    (this.ast as unknown as { key: unknown }).key = key;
  }

  get key(): unknown {
    return (this.ast as unknown as { key: unknown }).key;
  }

  set wheres(exprs: Node[]) {
    (this.ast as unknown as { wheres: Node[] }).wheres = exprs;
  }

  get wheres(): Node[] {
    return (this.ast as unknown as { wheres?: Node[] }).wheres ?? [];
  }
}
