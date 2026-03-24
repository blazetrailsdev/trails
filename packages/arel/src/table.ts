import { Attribute } from "./nodes/attribute.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Node, NodeVisitor } from "./nodes/node.js";
import { SelectManager } from "./managers/select-manager.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { StringJoin } from "./nodes/string-join.js";
import type { Join } from "./nodes/join.js";
import { On } from "./nodes/unary.js";
import { TableAlias } from "./nodes/table-alias.js";
import { True, False } from "./nodes/true-false.js";
import { And } from "./nodes/and.js";
import { Grouping } from "./nodes/grouping.js";
import { NamedFunction } from "./nodes/named-function.js";

/**
 * Table — represents a database table.
 *
 * Mirrors: Arel::Table
 */
export class Table extends Node {
  readonly name: string;
  readonly tableAlias: string | null;

  constructor(name: string, options?: { as?: string }) {
    super();
    this.name = name;
    this.tableAlias = options?.as ?? null;
  }

  get(name: string): Attribute {
    return new Attribute(this, name);
  }

  attr(name: string): Attribute {
    return this.get(name);
  }

  project(...projections: (Node | string)[]): SelectManager {
    const manager = new SelectManager(this);
    if (projections.length > 0) {
      manager.project(...projections);
    }
    return manager;
  }

  from(): SelectManager {
    return new SelectManager(this);
  }

  get star(): SqlLiteral {
    return new SqlLiteral(`"${this.name}".*`);
  }

  /**
   * Create an alias for this table.
   *
   * Mirrors: Arel::Table#alias
   */
  alias(name?: string): TableAlias {
    return new TableAlias(this, name ?? `${this.name}_2`);
  }

  /**
   * Factory: create a Join node (defaults to InnerJoin).
   * Arguments are passed directly to the join constructor, matching
   * Ruby's Arel::FactoryMethods#create_join.
   *
   * Mirrors: Arel::Table#create_join
   */
  createJoin(to: Node | string, constraint?: Node | string | null, klass?: typeof InnerJoin): Join {
    const JoinClass = klass && typeof klass === "function" ? klass : InnerJoin;
    return new JoinClass(to as Node, (constraint ?? null) as Node | null);
  }

  /**
   * Factory: create a StringJoin node.
   *
   * Mirrors: Arel::Table#create_string_join
   */
  createStringJoin(to: string | Node): StringJoin {
    const node = typeof to === "string" ? new SqlLiteral(to) : to;
    return new StringJoin(node, null);
  }

  /**
   * Factory: create an On node.
   *
   * Mirrors: Arel::Table#create_on
   */
  createOn(expr: Node): On {
    return new On(expr);
  }

  /**
   * Factory: create a TableAlias node.
   *
   * Mirrors: Arel::Table#create_table_alias
   */
  createTableAlias(relation: Node, name: string): TableAlias {
    return new TableAlias(relation, name);
  }

  /**
   * Convenience: creates a SelectManager, adds a join, and returns it.
   *
   * Mirrors: Arel::Table#join
   */
  join(
    relation: Node | string | null,
    klass?: new (left: Node, right: Node | null) => Join,
  ): SelectManager {
    const manager = new SelectManager(this);
    if (relation === null) return manager;
    if (typeof relation === "string" && relation.trim() === "") {
      throw new Error("EmptyJoinError");
    }
    manager.join(relation, klass);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with a LEFT OUTER JOIN.
   *
   * Mirrors: Arel::Table#outer_join
   */
  outerJoin(relation: Node | string): SelectManager {
    const manager = new SelectManager(this);
    manager.outerJoin(relation);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with GROUP BY.
   *
   * Mirrors: Arel::Table#group
   */
  group(...columns: (Node | string)[]): SelectManager {
    const manager = new SelectManager(this);
    manager.group(...columns);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with ORDER BY.
   *
   * Mirrors: Arel::Table#order
   */
  order(...exprs: Node[]): SelectManager {
    const manager = new SelectManager(this);
    manager.order(...exprs);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with a WHERE condition.
   *
   * Mirrors: Arel::Table#where
   */
  where(condition: Node): SelectManager {
    const manager = new SelectManager(this);
    manager.where(condition);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with LIMIT.
   *
   * Mirrors: Arel::Table#take
   */
  take(amount: number): SelectManager {
    const manager = new SelectManager(this);
    manager.take(amount);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with OFFSET.
   *
   * Mirrors: Arel::Table#skip
   */
  skip(amount: number): SelectManager {
    const manager = new SelectManager(this);
    manager.skip(amount);
    return manager;
  }

  /**
   * Convenience: creates a SelectManager with HAVING.
   *
   * Mirrors: Arel::Table#having
   */
  having(expr: Node): SelectManager {
    const manager = new SelectManager(this);
    manager.having(expr);
    return manager;
  }

  /**
   * Alias as a subquery — wraps in a TableAlias.
   *
   * Mirrors: Arel::FactoryMethods#as (Table delegation)
   */
  as(aliasName: string): TableAlias {
    return new TableAlias(this, aliasName);
  }

  /**
   * Factory: create a TRUE node.
   *
   * Mirrors: Arel::FactoryMethods#create_true
   */
  createTrue(): True {
    return new True();
  }

  /**
   * Factory: create a FALSE node.
   *
   * Mirrors: Arel::FactoryMethods#create_false
   */
  createFalse(): False {
    return new False();
  }

  /**
   * Factory: create an AND node.
   *
   * Mirrors: Arel::FactoryMethods#create_and
   */
  createAnd(nodes: Node[]): And {
    return new And(nodes);
  }

  /**
   * Factory: create a Grouping node.
   *
   * Mirrors: Arel::FactoryMethods#grouping
   */
  grouping(expr: Node): Grouping {
    return new Grouping(expr);
  }

  /**
   * Factory: LOWER function.
   *
   * Mirrors: Arel::FactoryMethods#lower
   */
  lower(column: Node): NamedFunction {
    return new NamedFunction("LOWER", [column]);
  }

  /**
   * Factory: COALESCE function.
   *
   * Mirrors: Arel::FactoryMethods#coalesce
   */
  coalesce(...args: Node[]): NamedFunction {
    return new NamedFunction("COALESCE", args);
  }

  /**
   * Factory: CAST function.
   *
   * Mirrors: Arel::FactoryMethods#cast
   */
  cast(expr: Node, type: string): NamedFunction {
    return new NamedFunction("CAST", [new SqlLiteral(`${expr} AS ${type}`)]);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
