import { Table, Nodes } from "@blazetrails/arel";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { RangeHandler } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";

/**
 * Converts hash conditions ({ name: "dean", age: 30 }) into
 * Arel predicate nodes. Used by Relation to build WHERE clauses.
 *
 * Mirrors: ActiveRecord::PredicateBuilder
 */
export interface AssociationMapping {
  foreignKey: string;
  foreignType?: string;
}

export class PredicateBuilder {
  readonly table: Table;
  private arrayHandler: ArrayHandler;
  private rangeHandler: RangeHandler;
  private basicObjectHandler: BasicObjectHandler;
  private relationHandler: RelationHandler;
  private associationMap: Map<string, AssociationMapping> = new Map();
  private handlers: Array<[any, { call(attr: Nodes.Attribute, value: any): Nodes.Node }]> = [];

  constructor(table: Table) {
    this.table = table;
    this.arrayHandler = new ArrayHandler(this);
    this.rangeHandler = new RangeHandler();
    this.basicObjectHandler = new BasicObjectHandler();
    this.relationHandler = new RelationHandler();
  }

  /**
   * Register association mappings so that where({ author: record }) can
   * be expanded to where({ author_id: record.id }).
   */
  setAssociationMap(map: Map<string, AssociationMapping>): void {
    this.associationMap = map;
  }

  buildFromHash(conditions: Record<string, unknown>): Nodes.Node[] {
    return this.buildFromHashInternal(conditions, false);
  }

  buildNegatedFromHash(conditions: Record<string, unknown>): Nodes.Node[] {
    return this.buildFromHashInternal(conditions, true);
  }

  private buildFromHashInternal(
    conditions: Record<string, unknown>,
    negated: boolean,
  ): Nodes.Node[] {
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      const assoc = this.associationMap.get(key);
      if (assoc) {
        const expandedConditions = this.expandAssociationCondition(assoc, value);
        if (expandedConditions.length === 0) continue;

        // Always build association groups positively; apply negation at group level
        const groups: Nodes.Node[] = [];
        for (const cond of expandedConditions) {
          const groupNodes = this.buildFromHashInternal(cond, false);
          if (groupNodes.length === 0) continue;
          groups.push(groupNodes.length === 1 ? groupNodes[0] : new Nodes.And(groupNodes));
        }
        if (groups.length === 0) continue;

        if (!negated) {
          if (groups.length === 1) {
            nodes.push(groups[0]);
          } else {
            let combined: Nodes.Node = groups[0];
            for (let i = 1; i < groups.length; i++) {
              combined = new Nodes.Grouping(new Nodes.Or(combined, groups[i]));
            }
            nodes.push(combined);
          }
        } else {
          // NOT(g1 OR g2 OR ...) == NOT g1 AND NOT g2 AND ...
          for (const g of groups) {
            nodes.push(new Nodes.Not(new Nodes.Grouping(g)));
          }
        }
      } else {
        const attr = this.resolveColumn(key);
        nodes.push(negated ? this.buildNegated(attr, value) : this.build(attr, value));
      }
    }
    return nodes;
  }

  private expandAssociationCondition(
    assoc: AssociationMapping,
    value: unknown,
  ): Record<string, unknown>[] {
    if (assoc.foreignType) {
      const arrayValue = Array.isArray(value) ? value : [value];
      return new PolymorphicArrayValue(assoc.foreignKey, assoc.foreignType, arrayValue).queries();
    }
    return new AssociationQueryValue(assoc.foreignKey, value).queries();
  }

  buildNegated(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    if (value === null || value === undefined) {
      return attribute.isNotNull();
    }
    if (value instanceof Range) {
      const beginVal = value.begin;
      const endVal = value.end;
      if (beginVal === null || beginVal === undefined) {
        if (endVal === null || endVal === undefined) return attribute.isNull();
        return value.excludeEnd ? attribute.gteq(endVal) : attribute.gt(endVal);
      }
      if (endVal === null || endVal === undefined) {
        return attribute.lt(beginVal);
      }
      if (value.excludeEnd) {
        // Negation of (>= begin AND < end) is (< begin OR >= end)
        return new Nodes.Grouping(new Nodes.Or(attribute.lt(beginVal), attribute.gteq(endVal)));
      }
      return attribute.notBetween(beginVal, endVal);
    }
    if (Array.isArray(value)) {
      return this.buildNegatedArray(attribute, value);
    }
    if (this.isRelation(value)) {
      return this.relationHandler.callNegated(attribute, value);
    }
    return attribute.notEq(value);
  }

  private buildNegatedArray(attribute: Nodes.Attribute, value: unknown[]): Nodes.Node {
    if (value.length === 0) return attribute.notIn([]);

    const scalarValues: unknown[] = [];
    let hasNull = false;
    const ranges: Range[] = [];
    const nonScalarValues: unknown[] = [];

    for (const item of value) {
      if (item === null || item === undefined) {
        hasNull = true;
      } else if (item instanceof Range) {
        ranges.push(item);
      } else if (typeof item === "object" && item !== null && "id" in item) {
        scalarValues.push((item as any).id);
      } else if (typeof item === "object" || typeof item === "function") {
        nonScalarValues.push(item);
      } else {
        scalarValues.push(item);
      }
    }

    const parts: Nodes.Node[] = [];

    if (scalarValues.length > 0) {
      parts.push(attribute.notIn(scalarValues));
    }

    if (hasNull) {
      parts.push(attribute.isNotNull());
    }

    for (const range of ranges) {
      parts.push(this.buildNegated(attribute, range));
    }

    for (const v of nonScalarValues) {
      parts.push(this.buildNegated(attribute, v));
    }

    if (parts.length === 0) return attribute.notIn([]);
    if (parts.length === 1) return parts[0];
    return new Nodes.And(parts);
  }

  build(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    if (value === null || value === undefined) {
      return attribute.isNull();
    }
    for (const [klass, handler] of this.handlers) {
      if (value instanceof klass) {
        return handler.call(attribute, value);
      }
    }
    if (value instanceof Range) {
      return this.rangeHandler.call(attribute, value);
    }
    if (Array.isArray(value)) {
      return this.arrayHandler.call(attribute, value);
    }
    if (this.isRelation(value)) {
      return this.relationHandler.call(attribute, value);
    }
    return this.basicObjectHandler.call(attribute, value);
  }

  buildRangePredicate(attribute: Nodes.Attribute, range: Range): Nodes.Node {
    return this.rangeHandler.call(attribute, range);
  }

  resolveColumn(key: string): Nodes.Attribute {
    return PredicateBuilder.resolveColumn(this.table, key);
  }

  registerHandler(
    klass: any,
    handler: { call(attr: Nodes.Attribute, value: any): Nodes.Node },
  ): void {
    if (
      typeof klass !== "function" ||
      typeof klass.prototype !== "object" ||
      klass.prototype === null
    ) {
      throw new TypeError("registerHandler requires a constructor function as the first argument");
    }
    this.handlers.push([klass, handler]);
  }

  buildBindAttribute(columnName: string, value: unknown): Nodes.Node {
    const attr = this.resolveColumn(columnName);
    return this.build(attr, value);
  }

  resolveArelAttribute(tableName: string, columnName: string): Nodes.Attribute {
    return new Table(tableName).get(columnName);
  }

  with(context: any): PredicateBuilder {
    const builder = new PredicateBuilder(this.table);
    builder.setAssociationMap(this.associationMap);
    builder.handlers = [...this.handlers];
    (builder as any)._context = context;
    return builder;
  }

  static references(conditions: Record<string, unknown>): string[] {
    const refs: string[] = [];
    for (const key of Object.keys(conditions)) {
      const dot = key.indexOf(".");
      if (dot !== -1) {
        refs.push(key.slice(0, dot));
      }
    }
    return refs;
  }

  references(): string[] {
    return [];
  }

  static resolveColumn(table: Table, key: string): Nodes.Attribute {
    if (key.includes('"')) return table.get(key);
    const firstDot = key.indexOf(".");
    if (firstDot === -1) return table.get(key);
    const secondDot = key.indexOf(".", firstDot + 1);
    if (secondDot !== -1) return table.get(key);
    return new Table(key.slice(0, firstDot)).get(key.slice(firstDot + 1));
  }

  private isRelation(value: unknown): boolean {
    return (
      typeof value === "object" && value !== null && "_modelClass" in value && "toArel" in value
    );
  }
}
