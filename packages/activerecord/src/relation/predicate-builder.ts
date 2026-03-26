import { Table, Nodes } from "@rails-ts/arel";
import { Range } from "../connection-adapters/postgresql/oid/range.js";

/**
 * Converts hash conditions ({ name: "dean", age: 30 }) into
 * Arel predicate nodes. Used by Relation to build WHERE clauses.
 *
 * Mirrors: ActiveRecord::PredicateBuilder
 */
export class PredicateBuilder {
  readonly table: Table;

  constructor(table: Table) {
    this.table = table;
  }

  buildFromHash(conditions: Record<string, unknown>): Nodes.Node[] {
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      const attr = this.resolveColumn(key);
      if (value === null) {
        nodes.push(attr.isNull());
      } else if (value instanceof Range) {
        if (value.excludeEnd) {
          nodes.push(attr.gteq(value.begin));
          nodes.push(attr.lt(value.end));
        } else {
          nodes.push(attr.between(value.begin, value.end));
        }
      } else if (Array.isArray(value)) {
        nodes.push(attr.in(value));
      } else {
        nodes.push(attr.eq(value));
      }
    }
    return nodes;
  }

  buildNegatedFromHash(conditions: Record<string, unknown>): Nodes.Node[] {
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      const attr = this.resolveColumn(key);
      if (value === null) {
        nodes.push(attr.isNotNull());
      } else if (value instanceof Range) {
        nodes.push(attr.notBetween(value.begin, value.end));
      } else if (Array.isArray(value)) {
        nodes.push(attr.notIn(value));
      } else {
        nodes.push(attr.notEq(value));
      }
    }
    return nodes;
  }

  resolveColumn(key: string): Nodes.Attribute {
    return PredicateBuilder.resolveColumn(this.table, key);
  }

  static resolveColumn(table: Table, key: string): Nodes.Attribute {
    if (key.includes('"')) return table.get(key);
    const firstDot = key.indexOf(".");
    if (firstDot === -1) return table.get(key);
    const secondDot = key.indexOf(".", firstDot + 1);
    if (secondDot !== -1) return table.get(key);
    return new Table(key.slice(0, firstDot)).get(key.slice(firstDot + 1));
  }
}
