import type { Node } from "./nodes/node.js";
import type { Table } from "./table.js";
import { And } from "./nodes/nary.js";
import { buildQuoted } from "./nodes/casted.js";
import type { Join, NodeOrValue } from "./nodes/binary.js";
import { False } from "./nodes/false.js";
import { Grouping } from "./nodes/grouping.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { NamedFunction } from "./nodes/named-function.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { StringJoin } from "./nodes/string-join.js";
import { TableAlias } from "./nodes/table-alias.js";
import { True } from "./nodes/true.js";
import { On } from "./nodes/unary.js";

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
  cast(expr: Node & { as: (type: string) => Node }, type: string): NamedFunction;
}

export const FactoryMethods: FactoryMethodsModule = {
  createTrue(): True {
    return new True();
  },

  createFalse(): False {
    return new False();
  },

  createTableAlias(relation: Node | Table, name: string | SqlLiteral): TableAlias {
    return new TableAlias(relation, name);
  },

  createJoin(
    to: Node | Table | string,
    constraint?: Node | string | null,
    klass?: new (left: Node | Table, right: Node | null) => Join,
  ): Join {
    const JoinKlass = klass ?? InnerJoin;
    return new JoinKlass(to as Node, (constraint ?? null) as Node | null);
  },

  createStringJoin(to: string | Node): StringJoin {
    return this.createJoin(to, null, StringJoin) as StringJoin;
  },

  createAnd(clauses: (Node | string)[]): And {
    return new And(clauses as Node[]);
  },

  createOn(expr: Node): On {
    return new On(expr);
  },

  grouping(expr: Node): Grouping {
    return new Grouping(expr);
  },

  lower(column: unknown): NamedFunction {
    return new NamedFunction("LOWER", [buildQuoted(column)]);
  },

  coalesce(...exprs: NodeOrValue[]): NamedFunction {
    return new NamedFunction("COALESCE", exprs);
  },

  cast(name: Node & { as: (type: string) => Node }, type: string): NamedFunction {
    return new NamedFunction("CAST", [name.as(type)]);
  },
};
