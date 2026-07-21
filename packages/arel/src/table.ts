import { Attribute } from "./attributes/attribute.js";
import { EmptyJoinError } from "./errors.js";
import { Node, NodeVisitor } from "./nodes/node.js";
import { SelectManager } from "./select-manager.js";
import { InnerJoin } from "./nodes/inner-join.js";
import { OuterJoin } from "./nodes/outer-join.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { StringJoin } from "./nodes/string-join.js";
import type { Join } from "./nodes/binary.js";
import { TableAlias } from "./nodes/table-alias.js";

/** Structural duck-type for Rails' `@klass.attribute_aliases`.
 *  Kept minimal so arel does not import activerecord. */
export interface TableKlass {
  readonly _attributeAliases?: Record<string, string>;
}

/** Delegation target of `Table`'s type-cast methods (Rails' `TypeCaster::Map` /
 *  `TypeCaster::Connection`). Rails' `type_caster` is duck-typed and the
 *  delegators are bare, so the constructor still accepts anything and a caster
 *  missing a member throws on call, as `NoMethodError` does in Ruby. */
export interface TypeCaster {
  typeCastForDatabase(attrName: string, value: unknown): unknown;
  typeForAttribute(name: string): unknown;
}

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
  readonly klass?: TableKlass;
  /** Rails: `private attr_reader :type_caster` (table.rb:115). An aliased table
   *  is a `TableAlias` wrapping this one and delegates its caster back here
   *  (table_alias.rb:22-24), so no external reader is needed. */
  private readonly typeCaster: unknown;

  constructor(name: string, options?: { as?: string; klass?: TableKlass; typeCaster?: unknown }) {
    super();
    this.name = name;
    const as = options?.as ?? null;
    this.tableAlias = as === name ? null : as;
    this.klass = options?.klass;
    this.typeCaster = options?.typeCaster ?? null;
  }

  /**
   * Create an alias for this table.
   *
   * Mirrors: Arel::Table#alias
   */
  alias(name?: string): TableAlias {
    return new TableAlias(this, name ?? `${this.name}_2`);
  }

  from(): SelectManager {
    return new SelectManager(this);
  }

  /**
   * Convenience: creates a SelectManager, adds a join, and returns it.
   *
   * Mirrors: Arel::Table#join
   */
  join(
    relation: Node | string | null | undefined,
    klass: new (left: Node, right: Node | null) => Join = InnerJoin,
  ): SelectManager {
    if (relation == null) return this.from();

    // Rails: `case relation when String, Nodes::SqlLiteral` (table.rb:41-45).
    // SqlLiteral subclasses String in Ruby, so both arms share the emptiness
    // check and the StringJoin promotion.
    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      const text = typeof relation === "string" ? relation : relation.value;
      if (text.length === 0) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: Node, right: Node | null) => Join;
    }

    return this.from().join(relation, klass);
  }

  /**
   * Convenience: creates a SelectManager with a LEFT OUTER JOIN.
   *
   * Mirrors: Arel::Table#outer_join
   */
  outerJoin(relation: Node | string): SelectManager {
    return this.join(relation, OuterJoin);
  }

  /**
   * Convenience: creates a SelectManager with GROUP BY.
   *
   * Mirrors: Arel::Table#group
   */
  group(...columns: (Node | string)[]): SelectManager {
    return this.from().group(...columns);
  }

  /**
   * Convenience: creates a SelectManager with ORDER BY.
   *
   * Mirrors: Arel::Table#order
   */
  order(...exprs: Node[]): SelectManager {
    return this.from().order(...exprs);
  }

  /**
   * Convenience: creates a SelectManager with a WHERE condition.
   *
   * Mirrors: Arel::Table#where
   */
  where(condition: Node): SelectManager {
    return this.from().where(condition);
  }

  project(...projections: (Node | string)[]): SelectManager {
    return this.from().project(...projections);
  }

  /**
   * Convenience: creates a SelectManager with LIMIT.
   *
   * Mirrors: Arel::Table#take
   */
  take(amount: number): SelectManager {
    return this.from().take(amount);
  }

  /**
   * Convenience: creates a SelectManager with OFFSET.
   *
   * Mirrors: Arel::Table#skip
   */
  skip(amount: number): SelectManager {
    return this.from().skip(amount);
  }

  /**
   * Convenience: creates a SelectManager with HAVING.
   *
   * Mirrors: Arel::Table#having
   */
  having(expr: Node): SelectManager {
    return this.from().having(expr);
  }

  /**
   * Mirrors: Arel::Table#hash — only name (Rails excludes aliases to avoid loops).
   */
  override hash(): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.name.length; i++) {
      h ^= this.name.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Mirrors: Arel::Table#eql? — compares name and tableAlias (not klass).
   * Rails excludes aliases array and engine from the hash to avoid loops.
   */
  eql(other: unknown): boolean {
    if (!(other instanceof Table)) return false;
    return this.name === other.name && this.tableAlias === other.tableAlias;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    return (this.typeCaster as TypeCaster).typeCastForDatabase(attrName, value);
  }

  typeForAttribute(name: string): unknown {
    return (this.typeCaster as TypeCaster).typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
  }

  get engine(): unknown {
    return Table.engine;
  }

  get(name: string, table?: Attribute["relation"]): Attribute {
    const resolved = this.klass?._attributeAliases?.[name] ?? name;
    return new Attribute(table ?? this, resolved);
  }

  attr(name: string): Attribute {
    return this.get(name);
  }

  /**
   * The `*` projection for this table — `table.*` after visitor compilation.
   *
   * Mirrors Rails' `Arel::Table#[Arel.star]`: returns an `Attribute` rather
   * than a pre-baked SQL literal, so the table identifier is quoted by the
   * adapter visitor (ANSI for SQLite/PG, backticks for MySQL). The `"*"`
   * sentinel is handled by `visit_Arel_Attributes_Attribute` and skips
   * column-name quoting (matches Rails' `quote_column_name(Arel.star)`,
   * which passes the `SqlLiteral` through unchanged).
   */
  get star(): Attribute {
    return new Attribute(this, "*");
  }

  /**
   * Factory: create a Join node (defaults to InnerJoin).
   * Arguments are passed directly to the join constructor, matching
   * Ruby's Arel::FactoryMethods#create_join.
   *
   * Mirrors: Arel::Table#create_join
   */
  createJoin(
    to: Node | string,
    constraint?: Node | string | null,
    klass?: new (left: Node, right: Node | null) => Join,
  ): Join {
    const JoinClass = klass ?? InnerJoin;
    return new JoinClass(to as Node, (constraint ?? null) as Node | null);
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
