import { Table, Nodes, sql as arelSql } from "@blazetrails/arel";
import { Range } from "../connection-adapters/postgresql/oid/range.js";
import { QueryAttribute } from "./query-attribute.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { RangeHandler } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";
import { argumentError } from "./query-methods.js";

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
    this.basicObjectHandler = new BasicObjectHandler(this);
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

  /**
   * Build a composite-key predicate. For `cols.length > 1`:
   *
   *   (c1 = v11 AND c2 = v12) OR (c1 = v21 AND c2 = v22) OR ...
   *
   * For `cols.length === 1` (degenerate composite): a single
   * `c IN (v1, v2, ...)` predicate via `Attribute#in` — more compact
   * and often planner-friendlier than an OR chain.
   *
   * The Rails analog is `where({[col1, col2] => [[v1, v2], ...]})`,
   * which Rails routes through `Arel::Nodes::HomogeneousIn` and the
   * predicate builder. JS object keys can't be arrays, so we expose
   * the composite shape as a separate method (and a matching
   * `Relation#where(cols, tuples)` overload).
   *
   * Tuples containing `null` / `undefined` are filtered out: SQL
   * tuple-equality semantics treat any null component as a non-match
   * (Arel's `Attribute#eq(null)` would emit `IS NULL`, which is
   * different). After filtering, an empty tuple list returns `null`
   * — caller short-circuits via `Relation#none()`.
   *
   * Throws on caller bugs: empty `cols`, non-array tuple, or tuple
   * arity mismatch (silent filtering would mask real issues by
   * collapsing them into `null` → `none()`).
   *
   * Mirrors: ActiveRecord predicate-builder composite-key handling
   * (relation/predicate_builder/array_handler.rb's homogeneous-in
   * path for tuple values).
   */
  buildComposite(cols: string[], tuples: unknown[][]): Nodes.Node | null {
    if (cols.length === 0) {
      throw argumentError("PredicateBuilder.buildComposite: empty column list");
    }
    if (!Array.isArray(tuples)) {
      // Surface as ArgumentError instead of letting the for-of /
      // .filter() below throw a bare TypeError on null / object /
      // non-iterable inputs.
      throw argumentError(
        `PredicateBuilder.buildComposite: tuples must be an array, got ${tuples === null ? "null" : typeof tuples}`,
      );
    }
    // Validate shape/arity loudly — silently dropping malformed
    // tuples would turn caller bugs into `null` (→ `none()`), which
    // is hard to debug. Tagged as ArgumentError so callers can catch
    // consistently with other query-method validation throws.
    for (const t of tuples) {
      if (!Array.isArray(t)) {
        throw argumentError(
          `PredicateBuilder.buildComposite: tuple must be an array, got ${typeof t}`,
        );
      }
      if (t.length !== cols.length) {
        throw argumentError(
          `PredicateBuilder.buildComposite: tuple arity ${t.length} does not match column count ${cols.length} (cols=[${cols.join(", ")}])`,
        );
      }
    }
    // Filter null/undefined-bearing tuples (SQL tuple-equality
    // semantics — see method docstring).
    const validTuples = tuples.filter((t) => t.every((v) => v !== null && v !== undefined));
    if (validTuples.length === 0) return null;
    // Single-column degenerate case: a single `IN (...)` predicate is
    // more compact than `c=v1 OR c=v2 OR ...` and typically optimizes
    // identically (or better) on indexed columns.
    if (cols.length === 1) {
      const values = validTuples.map((t) => t[0]);
      return this.resolveColumn(cols[0]).in(values);
    }
    // Build equalities through `buildBindAttribute` so each value
    // becomes a `QueryAttribute` (= bind param) rather than an
    // `Arel::Nodes::Casted` (= inlined SQL literal). Inlined values
    // bypass `compileWithBinds` / prepared-statement caching and
    // mishandle `StatementCache::Substitute` placeholders.
    //
    // Use the resolved attribute's `.name` (not the raw `c`) when
    // constructing the bind so qualified column keys
    // (e.g. `"orders.shop_id"`) resolve to the same column-name
    // PredicateBuilder.BasicObjectHandler uses for type lookup —
    // otherwise `typeForAttribute("orders.shop_id")` returns
    // undefined and the cast falls back to identity.
    //
    // Pre-resolve `Attribute[]` once outside the per-tuple loop —
    // each `resolveColumn` allocates a fresh `Arel::Attribute` (and
    // sometimes a `Table`). Reusing the resolved attrs keeps large
    // tuple lists allocation-light.
    const attrs = cols.map((c) => this.resolveColumn(c));
    const groupings: Nodes.Node[] = validTuples.map((tuple) => {
      const eqs = attrs.map((attr, i) => attr.eq(this.buildBindAttribute(attr.name, tuple[i])));
      return new Nodes.Grouping(new Nodes.And(eqs));
    });
    if (groupings.length === 1) return groupings[0];
    // Use n-ary `Or(children[])` (Arel `Nodes::Or` extends `Nary`)
    // for a flat AST instead of the deeply-nested binary chain
    // `reduce` would produce. Keeps depth O(1) instead of O(n) for
    // large tuple lists.
    return new Nodes.Grouping(new Nodes.Or(groupings));
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

  buildBindAttribute(columnName: string, value: unknown): QueryAttribute {
    const type = this.table.typeForAttribute(columnName) as
      | { cast(v: unknown): unknown; serialize(v: unknown): unknown }
      | undefined;
    const castType = type ?? { cast: (v: unknown) => v, serialize: (v: unknown) => v };
    return new QueryAttribute(columnName, value, castType);
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

  static references(conditions: Record<string, unknown>): Nodes.SqlLiteral[] {
    const refs: Nodes.SqlLiteral[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (isPlainObject(value)) {
        refs.push(arelSql(key));
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          refs.push(arelSql(key.slice(0, dot)));
        }
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
