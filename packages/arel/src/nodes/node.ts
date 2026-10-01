import { Nodes } from "../namespaces.js";
import { SQLString } from "../collectors/sql-string.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import type { FactoryMethodsModule } from "../factory-methods.js";
import type { And } from "./nary.js";
import type { Not } from "./unary.js";
import type { Grouping } from "./grouping.js";

export interface ArelEngine {
  withConnection<T>(
    block: (connection: { visitor: { accept(node: Node, collector: SQLString): SQLString } }) => T,
  ): T;
}

export const _engine: { current: ArelEngine | null } = { current: null };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Node {
  not(): Not {
    return new Nodes.Not(this);
  }

  or(right: Node): Grouping {
    return new Nodes.Grouping(new Nodes.Or([this, right]));
  }

  and(right: Node): And {
    return new Nodes.And([this, right]);
  }

  invert(): Node {
    return new Nodes.Not(this);
  }

  toSql(engine: ArelEngine | null = _engine.current): string {
    if (!engine) {
      // eslint-disable-next-line blazetrails/rails-error-parity -- Ruby raises NoMethodError/TypeError here; TypeError is its JS analogue, not a missing ported class.
      throw new TypeError(
        "undefined method `with_connection' for nil — Arel::Table.engine is unset. " +
          "Set it to your ActiveRecord base class, or pass an engine to toSql().",
      );
    }
    const collector = new SQLString();
    return engine.withConnection((connection) => connection.visitor.accept(this, collector).value);
  }

  fetchAttribute(_block?: (attr: Node) => boolean): boolean | undefined {
    return undefined;
  }

  isEquality(): boolean {
    return false;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Node extends FactoryMethodsModule {}
rbSetClassPathString(Node, Nodes, "Node");

Nodes.Node = Node;
