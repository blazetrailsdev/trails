import { ArelEngine, Node, _engine } from "./nodes/node.js";
import { PlainString } from "./collectors/plain-string.js";
import { Dot } from "./visitors/dot.js";
import { Limit, Offset } from "./nodes/unary.js";
import { buildQuoted } from "./nodes/casted.js";

/**
 * Methods from Arel::TreeManager::StatementMethods — mixed into
 * DeleteManager and UpdateManager in Rails (NOT SelectManager or
 * InsertManager). Apply with `include(Cls, StatementMethods)` from
 * @blazetrails/activesupport.
 */
type StatementMethodsHost = {
  ast: {
    key?: unknown;
    wheres?: Node[];
    orders?: Node[];
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

  order(this: StatementMethodsHost, ...expr: Node[]): unknown {
    this.ast.orders = expr;
    return this;
  }

  set key(key: unknown) {
    this.ast.key = Array.isArray(key) ? key.map((k) => buildQuoted(k)) : buildQuoted(key);
  }

  get key(): unknown {
    return this.ast.key;
  }

  set wheres(exprs: Node[]) {
    this.ast.wheres = exprs;
  }

  get wheres(): Node[] {
    return this.ast.wheres ?? [];
  }

  where(this: StatementMethodsHost, expr: Node): unknown {
    (this.ast.wheres ??= []).push(expr);
    return this;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class TreeManager {
  abstract readonly ast: Node;

  toDot(): string {
    const collector = new PlainString();
    const dot = new Dot();
    dot.accept(this.ast, collector);
    return collector.value;
  }

  /** Mirrors: Arel::TreeManager#to_sql (arel/tree_manager.rb:53). */
  toSql(engine: ArelEngine | null = _engine.current): string {
    return this.ast.toSql(engine);
  }
}

// Methods supplied by the FactoryMethods mixin (runtime wiring in ./index.ts).
// See node.ts for why this uses the explicit `FactoryMethodsModule` interface
// rather than `Included<typeof FactoryMethods>`.
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface TreeManager extends _FactoryMethodsModule {}
