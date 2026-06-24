/**
 * JoinPart — base class for nodes in the join dependency tree.
 *
 * Each JoinPart represents a table that participates in a JOIN query,
 * tracking its model class, table alias, and child associations.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinPart
 */

import type { Base } from "../../base.js";
import type { Table, Nodes } from "@blazetrails/arel";
import type { ThroughJoinGroup } from "../join-dependency.js";

export abstract class JoinPart {
  readonly baseKlass: typeof Base;
  readonly children: JoinPart[] = [];

  tableIndex = -1;
  tableAlias = "";
  tableName = "";
  /**
   * The Arel table this part selects from. Set at tree-construction time so the
   * `Aliases` value object can build column aliases (`node.table[col].as(...)`)
   * the way Rails' JoinPart#table does — no separate index-keyed table map.
   * @internal
   */
  arelTable: Table | null = null;
  columns: string[] = [];
  assocName = "";
  assocType: "hasMany" | "hasOne" | "belongsTo" = "hasMany";
  arelJoin: Nodes.Join | null = null;
  /**
   * Extra join sources from the association scope's own `joins(...)` (raw-string
   * joins). Emitted by `makeConstraints` right after this node's `arelJoin` so
   * aliases the scope introduces (and its WHERE references) are in scope.
   * @internal
   */
  scopeJoinSources: Nodes.Node[] = [];
  /** @internal */
  nodeReflection: any | null = null;
  isThroughNode = false;
  /**
   * Set on the tree nodes of a `has_many :through` chain (target + `_through_`
   * leaves) — the shared emit-time state that resolves the whole chain's aliases
   * against the AliasTracker and rebuilds the joins in one pass
   * (`JoinDependency#_resolveThroughGroup`). Null for non-through nodes.
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

  abstract get table(): Table | string;

  /**
   * Mirrors Rails' `delegate :column_names, :primary_key, :attribute_types,
   * to: :base_klass` (join_part.rb:20) — forward each to the node's base model
   * class so callers can read the joined table's schema off a JoinPart.
   */
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

  eachChildren(fn: (parent: JoinPart, child: JoinPart) => void): void {
    for (const child of this.children) {
      fn(this, child);
      child.eachChildren(fn);
    }
  }

  extractRecord(row: Record<string, unknown>, columnAlias: string): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    // Check for JoinDependency-style aliases (t{n}_r{n}) first, since
    // the prefix `t1_` would falsely match generic prefix matching
    const indexMatch = columnAlias.match(/^t(\d+)$/);
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

    // Generic prefix matching: keys in the form `${columnAlias}_<attr>`
    const prefix = `${columnAlias}_`;
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith(prefix)) {
        record[key.slice(prefix.length)] = value;
      }
    }

    return record;
  }

  instantiate(row: Record<string, unknown>, columnAlias: string): Base | null {
    const attrs = this.extractRecord(row, columnAlias);
    const hasData = Object.values(attrs).some((v) => v !== null && v !== undefined);
    if (!hasData) return null;
    return this.baseKlass._instantiate(attrs);
  }
}
