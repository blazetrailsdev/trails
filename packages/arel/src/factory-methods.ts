import type { Node } from "./nodes/node.js";
import type { Table } from "./table.js";
import type { And } from "./nodes/nary.js";
import type { Join, NodeOrValue } from "./nodes/binary.js";
import type { False } from "./nodes/false.js";
import type { Grouping } from "./nodes/grouping.js";
import type { NamedFunction } from "./nodes/named-function.js";
import type { SqlLiteral } from "./nodes/sql-literal.js";
import type { StringJoin } from "./nodes/string-join.js";
import type { TableAlias } from "./nodes/table-alias.js";
import type { True } from "./nodes/true.js";
import type { On } from "./nodes/unary.js";
import { Nodes } from "./namespaces.js";
import type { ArelNode } from "./arel.js";

export interface FactoryMethodsModule {
  createTrue(): True;
  createFalse(): False;
  createTableAlias(relation: ArelNode | Table, name: string | SqlLiteral): TableAlias;
  createJoin(
    to: ArelNode | Table | string,
    constraint?: ArelNode | string | null,
    klass?: new (left: ArelNode | Table, right: ArelNode | null) => Join,
  ): Join;
  createStringJoin(to: string | ArelNode): StringJoin;
  createAnd(clauses: (ArelNode | string)[]): And;
  createOn(expr: ArelNode): On;
  grouping(expr: ArelNode): Grouping;
  lower(column: unknown): NamedFunction;
  coalesce(...exprs: NodeOrValue[]): NamedFunction;
  cast(name: ArelNode & { as: (type: string) => Node }, type: string): NamedFunction;
}

export const FactoryMethods: FactoryMethodsModule = {
  createTrue(): True {
    return new Nodes.True();
  },

  createFalse(): False {
    return new Nodes.False();
  },

  createTableAlias(relation: ArelNode | Table, name: string | SqlLiteral): TableAlias {
    return new Nodes.TableAlias(relation, name);
  },

  createJoin(
    to: ArelNode | Table | string,
    constraint?: ArelNode | string | null,
    klass?: new (left: ArelNode | Table, right: ArelNode | null) => Join,
  ): Join {
    const JoinKlass = klass ?? Nodes.InnerJoin;
    return new JoinKlass(to as Node, (constraint ?? null) as Node | null);
  },

  createStringJoin(to: string | ArelNode): StringJoin {
    return this.createJoin(to, null, Nodes.StringJoin) as StringJoin;
  },

  createAnd(clauses: (ArelNode | string)[]): And {
    return new Nodes.And(clauses as Node[]);
  },

  createOn(expr: ArelNode): On {
    return new Nodes.On(expr);
  },

  grouping(expr: ArelNode): Grouping {
    return new Nodes.Grouping(expr);
  },

  lower(column: unknown): NamedFunction {
    return new Nodes.NamedFunction("LOWER", [Nodes.buildQuoted(column)]);
  },

  coalesce(...exprs: NodeOrValue[]): NamedFunction {
    return new Nodes.NamedFunction("COALESCE", exprs);
  },

  cast(name: ArelNode & { as: (type: string) => Node }, type: string): NamedFunction {
    return new Nodes.NamedFunction("CAST", [name.as(type)]);
  },
};
