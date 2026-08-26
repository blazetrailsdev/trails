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
  readonly name: string | Node;
  readonly tableAlias: string | null;
  readonly klass?: TableKlass;

  constructor(
    name: string | Node,
    options?: { as?: string; klass?: TableKlass; typeCaster?: unknown },
  ) {
    super();
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
  order(...exprs: (Node | string)[]): SelectManager {
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

  /**
   * Mirrors: Arel::Table#hash — only name (Rails excludes aliases to avoid loops).
   */
  override hash(): number {
    // Rails hashes `@name` whatever it is (table.rb:88-93); a node name hashes
    // by its own `hash`.
    if (typeof this.name !== "string") return this.name.hash();
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
    // Ruby's `self.name == other.name` is value equality, so a SqlLiteral or
    // node name compares by content, not identity.
    const sameName =
      this.name instanceof Node ? this.name.eql(other.name) : this.name === other.name;
    return sameName && this.tableAlias === other.tableAlias;
  }

  typeCastForDatabase(attrName: string | Node | null, value: unknown): unknown {
    // Rails' `name` is untyped all the way down (table.rb:100-107 hands it to a
    // duck-typed caster). `TypeCaster` is where the string boundary lives: only
    // a String name ever reaches a caster, since `table[Arel.star]` — the one
    // Node-named attribute — is never type-cast.
    return (this.typeCaster as TypeCaster).typeCastForDatabase(attrName as string, value);
  }

  /** Rails: `private attr_reader :type_caster` (table.rb:115). An aliased table
   *  is a `TableAlias` wrapping this one and delegates its caster back here
   *  (table_alias.rb:22-24), so no external reader is needed. */
  private readonly typeCaster: unknown;

  typeForAttribute(name: string | Node | null): unknown {
    return (this.typeCaster as TypeCaster).typeForAttribute(name as string);
  }

  isAbleToTypeCast(): boolean {
    return this.typeCaster != null;
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
}

// Surface the inherited FactoryMethods on table.ts so parity:api
// matches them against table.rb (Rails Arel's `Table` includes
// FactoryMethods directly, expecting the methods to belong here).
type _FactoryMethodsModule = import("./factory-methods.js").FactoryMethodsModule;
type _AliasPredication = import("./alias-predication.js").AliasPredicationModule;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Table extends _FactoryMethodsModule, _AliasPredication {}

_setTable(Table);
