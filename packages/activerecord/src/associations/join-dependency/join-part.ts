import { Enumerable, type Hash } from "@blazetrails/ruby-compat";
import { include } from "@blazetrails/activesupport";
import type { Base } from "../../base.js";
import type { Table, Nodes } from "@blazetrails/arel";
import type { JoinAssociation } from "./join-association.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class JoinPart {
  readonly baseKlass: typeof Base;
  readonly children: JoinAssociation[] = [];

  constructor(baseKlass: typeof Base, children?: JoinAssociation[]) {
    this.baseKlass = baseKlass;
    if (children) this.children.push(...children);
  }

  abstract get table(): Table | Nodes.TableAlias | null;

  get tableName(): string | null {
    return this.baseKlass.tableName;
  }

  columnNames(): string[] {
    return this.baseKlass.columnNames();
  }

  get primaryKey(): string {
    return this.baseKlass.primaryKey as string;
  }

  attributeTypes(): Record<string, unknown> | Hash<string, unknown> {
    return (
      this.baseKlass as { attributeTypes(): Record<string, unknown> | Hash<string, unknown> }
    ).attributeTypes();
  }

  isMatch(other: JoinPart): boolean {
    return this.constructor === other.constructor;
  }

  each(block: (part: JoinPart) => void): void {
    block(this);
    for (const child of this.children) child.each(block);
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
    return this.baseKlass.instantiate(this.extractRecord(row, aliases), columnTypes, block);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface JoinPart {
  [Symbol.iterator](): IterableIterator<JoinPart>;
}

include(JoinPart, Enumerable);
