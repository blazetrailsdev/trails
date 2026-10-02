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

export interface FactoryMethodsModule {
  createTrue(): True;
  createFalse(): False;
  createTableAlias(relation: Node | Table, name: string | SqlLiteral): TableAlias;
  createJoin(
    to: Node | Table | string,
    constraint?: Node | string | null,
    klass?: new (left: Node | Table, right: Node | null) => Join,
  ): Join;
  createStringJoin(to: string | Node): StringJoin;
  createAnd(clauses: (Node | string)[]): And;
  createOn(expr: Node): On;
  grouping(expr: Node): Grouping;
  lower(column: unknown): NamedFunction;
  coalesce(...exprs: NodeOrValue[]): NamedFunction;
  cast(name: Node & { as: (type: string) => Node }, type: string): NamedFunction;
}

export const FactoryMethods: FactoryMethodsModule = {
  createTrue(): True {
    return new Nodes.True();
  },

  createFalse(): False {
    return new Nodes.False();
  },

  createTableAlias(relation: Node | Table, name: string | SqlLiteral): TableAlias {
    return new Nodes.TableAlias(relation, name);
  },

  createJoin(
    to: Node | Table | string,
    constraint?: Node | string | null,
    klass?: new (left: Node | Table, right: Node | null) => Join,
  ): Join {
    const JoinKlass = klass ?? Nodes.InnerJoin;
    return new JoinKlass(to as Node, (constraint ?? null) as Node | null);
  },

  createStringJoin(to: string | Node): StringJoin {
    return this.createJoin(to, null, Nodes.StringJoin) as StringJoin;
  },

  createAnd(clauses: (Node | string)[]): And {
    return new Nodes.And(clauses as Node[]);
  },

  createOn(expr: Node): On {
    return new Nodes.On(expr);
  },

  grouping(expr: Node): Grouping {
    return new Nodes.Grouping(expr);
  },

  lower(column: unknown): NamedFunction {
    return new Nodes.NamedFunction("LOWER", [Nodes.buildQuoted(column)]);
  },

  coalesce(...exprs: NodeOrValue[]): NamedFunction {
    return new Nodes.NamedFunction("COALESCE", exprs);
  },

  cast(name: Node & { as: (type: string) => Node }, type: string): NamedFunction {
    return new Nodes.NamedFunction("CAST", [name.as(type)]);
  },
};
