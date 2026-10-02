import { Nodes } from "../namespaces.js";
import { SQLString } from "../collectors/sql-string.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
import { FactoryMethods, type FactoryMethodsModule } from "../factory-methods.js";
import type { And } from "./nary.js";
import type { Not } from "./unary.js";
import type { Grouping } from "./grouping.js";
import type { Attribute } from "../attributes/attribute.js";
import type { ArelNode } from "../arel.js";

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

  or(right: ArelNode): Grouping {
    return new Nodes.Grouping(new Nodes.Or([this, right]));
  }

  and(right: ArelNode): And {
    return new Nodes.And([this, right]);
  }

  invert(): Node {
    return new Nodes.Not(this);
  }

  toSql(engine: ArelEngine | null = _engine.current): string {
    const collector = new SQLString();
    return engine!.withConnection((connection) => connection.visitor.accept(this, collector).value);
  }

  fetchAttribute(_block?: (attr: Attribute) => boolean): boolean | undefined {
    return undefined;
  }

  isEquality(): boolean {
    return false;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Node extends FactoryMethodsModule {}

include(Node, FactoryMethods);

rbModConstSet(Nodes, "Node", Node);
