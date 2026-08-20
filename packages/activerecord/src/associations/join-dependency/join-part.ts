/**
 * JoinPart — base class for nodes in the join dependency tree.
 *
 * Each JoinPart represents a table that participates in a JOIN query,
 * tracking its model class, table alias, and child associations.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinPart
 */

import type { Base } from "../../base.js";
import type { TableRef, Nodes } from "@blazetrails/arel";
import type { ThroughJoinGroup } from "../join-dependency.js";

export abstract class JoinPart {
  readonly baseKlass: typeof Base;
  readonly children: JoinPart[] = [];

  tableIndex = -1;
  tableAlias = "";
  /**
   * The Arel table this part selects from. Set at tree-construction time so the
   * `Aliases` value object can build column aliases (`node.table[col].as(...)`)
   * the way Rails' JoinPart#table does — no separate index-keyed table map.
   * @internal
   */
  arelTable: TableRef | null = null;
  columns: string[] = [];
  assocName = "";
  assocType: "hasMany" | "hasOne" | "belongsTo" = "hasMany";
  arelJoin: Nodes.Join | null = null;
  /** @internal */
  nodeReflection: any | null = null;
  isThroughNode = false;
  /**
   * Set on the tree nodes of a `has_many :through` chain (target + `_through_`
   * leaves). Rails keeps the whole chain inside the one JoinAssociation, whose
   * `joinConstraints` resolves and joins every link in one call; the group is
   * how `JoinDependency#makeConstraints` finds the tree nodes those joins and
   * tables belong to. Null for non-through nodes.
   * @internal
   */
  throughGroup: ThroughJoinGroup | null = null;
  immediateAssocName = "";
  parentPath: string | null = null;
  effectiveSqlName = "";

  constructor(baseKlass: typeof Base, children?: JoinPart[]) {
    this.baseKlass = baseKlass;
    if (children) this.children.push(...children);
  }

  abstract get table(): TableRef | string;

  /**
   * Mirrors Rails' `delegate :table_name, :column_names, :primary_key,
   * :attribute_types, to: :base_klass` (join_part.rb:20) — forward each to the
   * node's base model class so callers can read the joined table's schema off a
   * JoinPart. `table_name` always returns the base model's real (un-aliased)
   * table name; the resolved/aliased SQL name lives separately on
   * `effectiveSqlName` / `tableAlias` / the Arel table.
   */
  get tableName(): string {
    return this.baseKlass.tableName;
  }

  columnNames(): string[] {
    return this.baseKlass.columnNames();
  }

  get primaryKey(): string {
    return this.baseKlass.primaryKey as string;
  }

  attributeTypes(): Record<string, unknown> {
    return (this.baseKlass as { attributeTypes(): Record<string, unknown> }).attributeTypes();
  }

  isMatch(other: JoinPart): boolean {
    return this.constructor === other.constructor;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#readonly?
   * Base nodes (JoinBase / no-reflection leaves) are never readonly.
   */
  isReadonly(): boolean {
    return false;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#strict_loading?
   * Base nodes (JoinBase / no-reflection leaves) never force strict loading.
   */
  isStrictLoading(): boolean {
    return false;
  }

  each(fn: (part: JoinPart) => void): void {
    fn(this);
    for (const child of this.children) {
      child.each(fn);
    }
  }

  /**
   * Mirrors `include Enumerable` (join_part.rb:13) over `each`
   * (join_part.rb:31-34): Ruby derives every Enumerable method — `drop`, `map!`,
   * … — from `each`, and JS derives them from `Symbol.iterator` the same way, so
   * `[...node]` is the depth-first, self-first node list `join_root.drop(1)`
   * reads.
   *
   * @noRailsEquivalent PERMANENT — JS has no module to `include`, so the
   * Enumerable contract Ruby gets from `each` (join_part.rb:13, 31-34) is
   * spelled `Symbol.iterator`. No port can remove the spelling difference.
   */
  *[Symbol.iterator](): IterableIterator<JoinPart> {
    yield this;
    for (const child of this.children) {
      yield* child;
    }
  }

  /**
   * `Enumerable#drop` (join_part.rb:13 `include Enumerable`), the walk
   * `JoinDependency#reflections` reads. JS has no Enumerable module to mix in,
   * so the one method Rails actually calls on a JoinPart-as-Enumerable is
   * spelled out over the same `each`/iterator.
   */
  drop(n: number): JoinPart[] {
    return [...this].slice(n);
  }

  eachChildren(fn: (parent: JoinPart, child: JoinPart) => void): void {
    for (const child of this.children) {
      fn(this, child);
      child.eachChildren(fn);
    }
  }

  extractRecord(row: Record<string, unknown>, aliases: string): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    // Check for JoinDependency-style aliases (t{n}_r{n}) first, since
    // the prefix `t1_` would falsely match generic prefix matching
    const indexMatch = aliases.match(/^t(\d+)$/);
    if (indexMatch) {
      const pattern = new RegExp(`^t${indexMatch[1]}_r(\\d+)$`);
      const baseColumns = this.baseKlass.columnNames();
      const pk = this.baseKlass.primaryKey as string;
      const columns = pk && !baseColumns.includes(pk) ? [pk, ...baseColumns] : baseColumns;
      let matched = false;
      for (const [key, value] of Object.entries(row)) {
        const m = key.match(pattern);
        if (m) {
          const colIndex = Number(m[1]);
          const colName = columns[colIndex] ?? `r${m[1]}`;
          record[colName] = value;
          matched = true;
        }
      }
      if (matched) return record;
    }

    // Generic prefix matching: keys in the form `${aliases}_<attr>`
    const prefix = `${aliases}_`;
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith(prefix)) {
        record[key.slice(prefix.length)] = value;
      }
    }

    return record;
  }

  instantiate(row: Record<string, unknown>, aliases: string): Base | null {
    const attrs = this.extractRecord(row, aliases);
    const hasData = Object.values(attrs).some((v) => v !== null && v !== undefined);
    if (!hasData) return null;
    return this.baseKlass._instantiate(attrs);
  }
}
