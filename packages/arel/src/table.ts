import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Attribute } from "./attributes/attribute.js";
import { EmptyJoinError } from "./errors.js";
import { _engine, ArelEngine, Node } from "./nodes/node.js";
import { _setTable } from "./node-slots.js";
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
  readonly attributeAliases?: Record<string, string>;
  /**
   * Rails' `klass&.type_caster` default for `type_caster:` (table.rb:14).
   *
   * @internal
   */
  typeCaster?(): unknown;
}

/** Delegation target of `Table`'s type-cast methods (Rails' `TypeCaster::Map` /
 *  `TypeCaster::Connection`). Rails' `type_caster` is duck-typed and the
 *  delegators are bare, so the constructor still accepts anything and a caster
 *  missing a member throws on call, as `NoMethodError` does in Ruby.
 *
 * @noRailsEquivalent PERMANENT — Ruby's `ActiveRecord::TypeCaster` is an
 * empty namespace module holding `Map` / `Connection`; arel never names it
 * (`type_caster` is duck-typed) and cannot import activerecord, so the
 * contract has to be spelled here. Porting `TypeCaster::Map` — which trails
 * already has at `activerecord/src/type-caster/` — does not remove it.
 */
export interface TypeCaster {
  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown;
  typeForAttribute(name: string | Node | null): unknown;
}

/**
 * Table — represents a database table.
 *
 * Mirrors: Arel::Table
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Table {
  /** Mirrors: `Arel::Table.engine` (table.rb:8-9, `class << self; attr_accessor
   *  :engine`). Rails assigns `ActiveRecord::Base` from
   *  `active_record.rb:562-564`; trails assigns it at the bottom of
   *  activerecord's `base.ts` — see the comment there for why it rides the
   *  load-hook run, and why it is not bare `Base`. */
  static get engine(): ArelEngine | null {
    return _engine.current;
  }

  static set engine(value: ArelEngine | null) {
    _engine.current = value;
  }

  // Rails stores whatever `name` it was handed (table.rb:16) — a String, an
  // `Arel.sql` SqlLiteral, or a node such as a NamedFunction
  // (test/cases/arel/table_test.rb:118-130).
  // `attr_accessor :name` (table.rb:11).
  name: string | Node;
  readonly tableAlias: string | null;
  readonly klass?: TableKlass;

  constructor(
    name: string | Node,
    options?: { as?: string; klass?: TableKlass; typeCaster?: unknown },
  ) {
    this.name = name;
    const as = options?.as ?? null;
    this.tableAlias = as === name ? null : as;
    this.klass = options?.klass;
    this.typeCaster = options?.typeCaster ?? options?.klass?.typeCaster?.() ?? null;
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
    relation: Node | Table | string | null | undefined,
    klass: new (left: Node | Table, right: Node | null) => Join = InnerJoin,
  ): SelectManager {
    if (relation == null) return this.from();

    // Rails: `case relation when String, Nodes::SqlLiteral` (table.rb:41-45).
    // SqlLiteral subclasses String in Ruby, so both arms share the emptiness
    // check and the StringJoin promotion.
    if (typeof relation === "string" || relation instanceof SqlLiteral) {
      const text = typeof relation === "string" ? relation : relation.value;
      if (text.length === 0) throw new EmptyJoinError();
      klass = StringJoin as unknown as new (left: Node | Table, right: Node | null) => Join;
    }

    return this.from().join(relation, klass);
  }

  /**
   * Convenience: creates a SelectManager with a LEFT OUTER JOIN.
   *
   * Mirrors: Arel::Table#outer_join
   */
  outerJoin(relation: Node | Table | string): SelectManager {
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
  order(...expr: (Node | string)[]): SelectManager {
    return this.from().order(...expr);
  }

  /**
   * Convenience: creates a SelectManager with a WHERE condition.
   *
   * Mirrors: Arel::Table#where
   */
  where(condition: Node): SelectManager {
    return this.from().where(condition);
  }

  project(...things: (Node | string)[]): SelectManager {
    return this.from().project(...things);
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

  get(name: Node | string | null, table?: Attribute["relation"]): Attribute {
    // Rails' `Table#[]` accepts a nil name (`table[nil]` for a pkless model in
    // `Relation#delete_all`, relation.rb:1027-1031) and builds an Attribute
    // whose name is nil; only a subquery-shaped statement ever renders it. It
    // also takes a node name — `@table[Arel.star]`
    // (test/cases/arel/visitors/to_sql_test.rb:50) — which the alias lookup
    // skips and the visitor renders as-is (table.rb:81-85).
    const resolved =
      name === null || name instanceof Node ? name : (this.klass?.attributeAliases?.[name] ?? name);
    return new Attribute(table ?? this, resolved);
  }

  // Mirrors Arel::Table#hash / #eql? / #== (table.rb:88-100). The perf note
  // there is why `aliases` and `table_alias` stay out of the hash: an alias can
  // loop back to this table.
  hash(): number {
    return rbHash(this.name);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Table &&
      this.constructor === other.constructor &&
      rbEqual(this.name, other.name) &&
      rbEqual(this.tableAlias, other.tableAlias)
    );
  }

  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown {
    return (this.typeCaster as TypeCaster).typeCastForDatabase(attrName, value);
  }

  /** Rails: `private attr_reader :type_caster` (table.rb:115). An aliased table
   *  is a `TableAlias` wrapping this one and delegates its caster back here
   *  (table_alias.rb:22-24), so no external reader is needed. */
  private readonly typeCaster: unknown;

  typeForAttribute(name: string | Node | null): unknown {
    return (this.typeCaster as TypeCaster).typeForAttribute(name);
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
  }
}

// Surface the inherited FactoryMethods on table.ts so parity:api
// matches them against table.rb (Rails Arel's `Table` includes
// FactoryMethods directly, expecting the methods to belong here).
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;
type _AliasPredication = import("./alias-predication.js").AliasPredicationModule;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Table extends _FactoryMethodsModule, _AliasPredication {}

_setTable(Table);
