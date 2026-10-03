import { include } from "@blazetrails/activesupport";
import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { ArelEngine, Node, _engine } from "./nodes/node.js";
import { Visitors, Arel } from "./namespaces.js";
import { PlainString } from "./collectors/plain-string.js";
import { Limit, Offset } from "./nodes/unary.js";
import { buildQuoted } from "./nodes/casted.js";
import { FactoryMethods, type FactoryMethodsModule } from "./factory-methods.js";
import type { ArelNode } from "./arel.js";

type StatementMethodsHost = {
  ast: {
    key?: unknown;
    wheres: ArelNode[];
    orders?: ArelNode[];
    limit?: Node | null;
    offset?: Node | null;
  };
};

export class StatementMethods {
  declare protected ast: StatementMethodsHost["ast"];

  take(this: StatementMethodsHost, limit: unknown): unknown {
    if (limit != null) this.ast.limit = new Limit(buildQuoted(limit));
    return this;
  }

  offset(this: StatementMethodsHost, offset: unknown): unknown {
    if (offset != null) this.ast.offset = new Offset(buildQuoted(offset));
    return this;
  }

  order(this: StatementMethodsHost, ...expr: ArelNode[]): unknown {
    this.ast.orders = expr;
    return this;
  }

  set key(key: unknown) {
    this.ast.key = Array.isArray(key) ? key.map((k) => buildQuoted(k)) : buildQuoted(key);
  }

  get key(): unknown {
    return this.ast.key;
  }

  set wheres(exprs: ArelNode[]) {
    this.ast.wheres = exprs;
  }

  get wheres(): ArelNode[] {
    return this.ast.wheres;
  }

  where(this: StatementMethodsHost, expr: ArelNode): unknown {
    this.ast.wheres.push(expr);
    return this;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class TreeManager<T extends Node = Node> {
  toDot(): string {
    let collector = new PlainString();
    collector = new Visitors.Dot().accept(this.ast, collector);
    return collector.value;
  }

  toSql(engine: ArelEngine | null = _engine.current): string {
    return this.ast.toSql(engine);
  }

  initializeCopy(_other: TreeManager<T>): void {
    this.ast = rbObjClone(this.ast);
  }
}

export interface TreeManager<T extends Node = Node> extends FactoryMethodsModule {
  ast: T;
}

include(TreeManager, FactoryMethods);

rbModConstSet(Arel, "TreeManager", TreeManager);
