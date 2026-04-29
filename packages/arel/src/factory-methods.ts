import type { Node } from "./nodes/node.js";
import { And } from "./nodes/and.js";
import { As } from "./nodes/binary.js";
import type { Join } from "./nodes/binary.js";
import { False } from "./nodes/false.js";
import { Grouping } from "./nodes/grouping.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { NamedFunction } from "./nodes/named-function.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { StringJoin } from "./nodes/string-join.js";
import { TableAlias } from "./nodes/table-alias.js";
import { True } from "./nodes/true.js";
import { On } from "./nodes/unary.js";

/**
 * Mirrors: Arel::FactoryMethods (Ruby module mixed into Node and TreeManager).
 *
 * Apply the runtime mixin with `include(Klass, FactoryMethods)` from
 * @blazetrails/activesupport. Model the added methods in TypeScript by
 * interface-merging `FactoryMethodsModule` (declared below) into the
 * relevant class types — see Node, TreeManager, Table, and SelectManager.
 *
 * Why an explicit `FactoryMethodsModule` interface (vs. deriving from
 * `typeof FactoryMethods` via `Included<>`): the Node↔FactoryMethods
 * type cycle (Node interface-merges this module; FactoryMethods values
 * reference Node) forces tsc into a structural fallback when emitting
 * composite .d.ts, widening `typeof FactoryMethods` to
 * `Record<string, ...>` and reintroducing a string index signature into
 * Node. Pinning the module type to a hand-written interface gives tsc
 * a fixed point and avoids the fallback.
 */
export interface FactoryMethodsModule {
  createTrue(): True;
  createFalse(): False;
  createTableAlias(relation: Node, name: string): TableAlias;
  createJoin(
    to: Node,
    constraint?: Node | null,
    klass?: new (left: Node, right: Node | null) => Join,
  ): Join;
  createStringJoin(to: string | Node): StringJoin;
  createAnd(clauses: Node[]): And;
  createOn(expr: Node): On;
  grouping(expr: Node): Grouping;
  lower(column: Node): NamedFunction;
  coalesce(...exprs: Node[]): NamedFunction;
  cast(expr: Node, type: string): NamedFunction;
}

export const FactoryMethods: FactoryMethodsModule = {
  createTrue(): True {
    return new True();
  },

  createFalse(): False {
    return new False();
  },

  createTableAlias(relation: Node, name: string): TableAlias {
    return new TableAlias(relation, name);
  },

  createJoin(
    to: Node,
    constraint?: Node | null,
    klass?: new (left: Node, right: Node | null) => Join,
  ): Join {
    const JoinKlass = klass ?? InnerJoin;
    return new JoinKlass(to, constraint ?? null);
  },

  createStringJoin(to: string | Node): StringJoin {
    const node = typeof to === "string" ? new SqlLiteral(to) : to;
    return new StringJoin(node, null);
  },

  createAnd(clauses: Node[]): And {
    return new And(clauses);
  },

  createOn(expr: Node): On {
    return new On(expr);
  },

  grouping(expr: Node): Grouping {
    return new Grouping(expr);
  },

  lower(column: Node): NamedFunction {
    return new NamedFunction("LOWER", [column]);
  },

  coalesce(...exprs: Node[]): NamedFunction {
    return new NamedFunction("COALESCE", exprs);
  },

  // Mirrors: Arel::FactoryMethods#cast — `Nodes::NamedFunction.new "CAST",
  // [name.as(type)]`. Builds an `As` AST node so the visitor compiles it
  // correctly (`CAST(expr AS type)`); the previous string-interpolation
  // form stringified Node instances as `"[object Object]"`.
  cast(expr: Node, type: string): NamedFunction {
    return new NamedFunction("CAST", [new As(expr, new SqlLiteral(type))]);
  },
};
