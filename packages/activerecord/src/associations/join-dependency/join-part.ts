import type { Base } from "../../base.js";
import type { Table, Nodes } from "@blazetrails/arel";

export abstract class JoinPart {
  readonly baseKlass: typeof Base;
  readonly children: JoinPart[] = [];

  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  tableIndex = -1;
  tableAlias = "";
  columns: string[] = [];
  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  assocName = "";
  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  assocType: "hasMany" | "hasOne" | "belongsTo" = "hasMany";
  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  immediateAssocName = "";
  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  parentPath: string | null = null;
  /** @noRailsEquivalent CONVERGEABLE converge-join-part-onto-rails-join-part-surface */
  effectiveSqlName = "";

  constructor(baseKlass: typeof Base, children?: JoinPart[]) {
    this.baseKlass = baseKlass;
    if (children) this.children.push(...children);
  }

  abstract get table(): Table | Nodes.TableAlias | null;

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

  isReadonly(): boolean {
    return false;
  }

  isStrictLoading(): boolean {
    return false;
  }

  each(fn: (part: JoinPart) => void): void {
    fn(this);
    for (const child of this.children) {
      child.each(fn);
    }
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<JoinPart> {
    yield this;
    for (const child of this.children) {
      yield* child;
    }
  }

  drop(n: number): JoinPart[] {
    return [...this].slice(n);
  }

  eachChildren(fn: (parent: JoinPart, child: JoinPart) => void): void {
    for (const child of this.children) {
      fn(this, child);
      child.eachChildren(fn);
    }
  }

  extractRecord(
    row: Record<string, unknown>,
    columnNamesWithAlias: readonly { name: string; alias: string }[],
  ): Record<string, unknown> {
    const hash: Record<string, unknown> = {};

    let index = 0;
    const length = columnNamesWithAlias.length;

    while (index < length) {
      const column = columnNamesWithAlias[index];
      hash[column.name] = row[column.alias];
      index += 1;
    }

    return hash;
  }

  instantiate(
    row: Record<string, unknown>,
    aliases: readonly { name: string; alias: string }[],
    columnTypes: Record<string, { deserialize(value: unknown): unknown }> = {},
    block?: (record: any) => void,
  ): Base {
    return (this.baseKlass as any)._instantiate(
      this.extractRecord(row, aliases),
      block,
      columnTypes,
    );
  }
}
