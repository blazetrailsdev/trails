import { Attribute } from "./attributes/attribute.js";
import { EmptyJoinError } from "./errors.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { Node, NodeVisitor } from "./nodes/node.js";
import { SelectManager } from "./select-manager.js";
import { InnerJoin } from "./nodes/inner-join.js";
import type { Join } from "./nodes/binary.js";
import { TableAlias } from "./nodes/table-alias.js";

/**
 * Table — represents a database table.
 *
 * Mirrors: Arel::Table
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Table extends Node {
  static engine: unknown = null;

  readonly name: string;
  readonly tableAlias: string | null;
  private typeCaster: unknown;

  constructor(name: string, options?: { as?: string; klass?: unknown; typeCaster?: unknown }) {
    super();
    this.name = name;
    const as = options?.as ?? null;
    this.tableAlias = as === name ? null : as;
    this.typeCaster = options?.typeCaster ?? null;
  }

  get engine(): unknown {
    return Table.engine;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    if (
      this.typeCaster &&
      typeof (this.typeCaster as Record<string, unknown>).typeCastForDatabase === "function"
    ) {
      return (
        this.typeCaster as { typeCastForDatabase: (n: string, v: unknown) => unknown }
      ).typeCastForDatabase(attrName, value);
    }
    return value;
  }

  typeForAttribute(name: string): unknown {
    if (
      this.typeCaster &&
      typeof (this.typeCaster as Record<string, unknown>).typeForAttribute === "function"
    ) {
      return (this.typeCaster as { typeForAttribute: (n: string) => unknown }).typeForAttribute(
        name,
      );
    }
    return undefined;
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
  }

  get(name: string, table?: Attribute["relation"]): Attribute {
    return new Attribute(table ?? this, name);
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
      throw new EmptyJoinError("EmptyJoinError");
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

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

// Surface the inherited FactoryMethods on table.ts so api:compare
// matches them against table.rb (Rails Arel's `Table` includes
// FactoryMethods directly, expecting the methods to belong here).
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Table extends _FactoryMethodsModule {}
