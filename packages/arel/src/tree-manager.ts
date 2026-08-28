import { ArelEngine, Node, _engine } from "./nodes/node.js";
import { _Dot } from "./node-slots.js";
import { cloneSlot, objectClone } from "./clone-support.js";
import { PlainString } from "./collectors/plain-string.js";
import { Limit, Offset } from "./nodes/unary.js";
import { buildQuoted } from "./nodes/casted.js";

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
  abstract ast: Node;

  toDot(): string {
    const collector = new PlainString();
    const dot = new _Dot!();
    dot.accept(this.ast, collector);
    return collector.value;
  }

  toSql(engine: ArelEngine | null = _engine.current): string {
    return this.ast.toSql(engine);
  }

  clone(): this {
    const copy = objectClone(this);
    copy.ast = cloneSlot(this.ast);
    return copy;
  }
}

/**
 * Methods supplied by the FactoryMethods mixin (runtime wiring in ./index.ts).
 * See node.ts for why this uses the explicit `FactoryMethodsModule` interface
 * rather than `Included<typeof FactoryMethods>`.
 *
 * @noRailsEquivalent TypeScript-only mixin typing; Ruby `include` needs no type surface.
 */
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface TreeManager extends _FactoryMethodsModule {}
