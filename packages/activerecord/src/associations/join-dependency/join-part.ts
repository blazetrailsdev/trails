import type { Base } from "../../base.js";
import type { Table, Nodes } from "@blazetrails/arel";

export abstract class JoinPart {
  readonly baseKlass: typeof Base;
  readonly children: JoinPart[] = [];

  tableIndex = -1;
  tableAlias = "";
  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
   */
  arelTable: Table | Nodes.TableAlias | null = null;
  columns: string[] = [];
  assocName = "";
  assocType: "hasMany" | "hasOne" | "belongsTo" = "hasMany";
  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
   */
  nodeReflection: any | null = null;
  immediateAssocName = "";
  parentPath: string | null = null;
  effectiveSqlName = "";

  constructor(baseKlass: typeof Base, children?: JoinPart[]) {
    this.baseKlass = baseKlass;
    if (children) this.children.push(...children);
  }

  abstract get table(): Table | Nodes.TableAlias | string;

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
    columnNamesWithAlias: string,
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    const indexMatch = columnNamesWithAlias.match(/^t(\d+)$/);
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

    const prefix = `${columnNamesWithAlias}_`;
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
