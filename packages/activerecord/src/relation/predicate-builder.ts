import { ArgumentError, rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { Nodes, sql } from "@blazetrails/arel";
import { wrap, Range } from "@blazetrails/activesupport";

import { QueryAttribute } from "./query-attribute.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { RangeHandler } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { Substitute } from "../statement-cache.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";
import type { TableMetadata } from "../table-metadata.js";
import type { Base } from "../base.js";

export class PredicateBuilder {
  private _table: TableMetadata;

  /** @internal */
  get table(): TableMetadata {
    return this._table;
  }

  protected set table(value: TableMetadata) {
    this._table = value;
  }
  private handlers: Array<[any, { call(attr: Nodes.Attribute, value: any): Nodes.Node }]> = [];

  constructor(table: TableMetadata) {
    this._table = table;

    this.registerHandler(BasicObject, new BasicObjectHandler(this));
    this.registerHandler(Range, new RangeHandler(this));
    this.registerHandler(Relation, new RelationHandler());
    this.registerHandler(Array, new ArrayHandler(this));
    this.registerHandler(Set, new ArrayHandler(this));
  }

  buildFromHash(
    attributes: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    attributes = this.convertDotNotationToHash(attributes);
    return this.expandFromHash(attributes, block);
  }

  protected expandFromHash(
    attributes: Record<string, unknown>,
    block?: (tableName: string) => unknown,
  ): Nodes.Node[] {
    if (Object.keys(attributes).length === 0) {
      return [sql("1=0")];
    }
    const nodes: Nodes.Node[] = [];
    for (const [key, value] of Object.entries(attributes)) {
      if (isPlainObject(value) && !this.table.hasColumn(key)) {
        const assocPb: PredicateBuilder = this.table.associatedTable(
          key,
          block as (name: string) => never,
        ).predicateBuilder;
        nodes.push(...assocPb.expandFromHash(value));
      } else if (this.table.isAssociatedWith(key)) {
        const assocNodes = this.buildFromHashAssociation(
          this.table.associatedTable(key),
          key,
          value,
          attributes,
        );
        nodes.push(...assocNodes);
      } else if (this.table.aggregatedWith(key)) {
        nodes.push(...this.buildFromHashAggregate(key, value));
      } else {
        nodes.push(this.build(this.table.arelTable.get(key), value));
      }
    }
    return nodes;
  }

  /** @internal */
  private buildFromHashAggregate(key: string, value: unknown): Nodes.Node[] {
    const reflection = this.table.reflectOnAggregation(key);
    const mapping: [string, string][] = reflection.mapping();
    const values = value === null || value === undefined ? [null] : wrap(value);
    if (mapping.length === 1 || values.length === 0) {
      const [columnName, aggregateAttr] = mapping[0];
      const mapped = values.map((object) => extractAggregateAttr(object, aggregateAttr, false));
      return [this.build(this.table.arelTable.get(columnName), mapped)];
    }
    const queryGroups: Nodes.Node[][] = values.map((object) =>
      mapping.map(([fieldAttr, aggregateAttr]) =>
        this.build(
          this.table.arelTable.get(fieldAttr),
          extractAggregateAttr(object, aggregateAttr, true),
        ),
      ),
    );
    return this.groupingQueries(queryGroups);
  }

  /** @internal */
  private buildFromHashAssociation(
    associatedTable: any,
    key: string,
    value: unknown,
    attributes: Record<string, unknown>,
  ): Nodes.Node[] {
    if (associatedTable.isPolymorphicAssociation?.()) {
      const fk = associatedTable.joinForeignKey as string | string[];
      const ft = associatedTable.joinForeignType as string;
      const refl = associatedTable.reflection;
      const pkFor = (klass?: unknown): string | string[] => {
        const pk = associatedTable.joinPrimaryKey(klass as typeof Base | undefined) ?? "id";
        return Array.isArray(pk) ? pk : String(pk);
      };
      const values = Array.isArray(value) ? value : [value];
      const queries = new PolymorphicArrayValue(
        { joinForeignKey: fk, joinForeignType: ft, joinPrimaryKey: pkFor },
        values,
      ).queries();
      const queryGroups: Nodes.Node[][] = [];
      for (const query of queries) {
        const inner = this.expandFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
      return this.groupingQueries(queryGroups);
    }
    if (associatedTable.isThroughAssociation?.()) {
      const rawPk = associatedTable.primaryKey;
      const assocPb: PredicateBuilder = associatedTable.predicateBuilder;
      if (Array.isArray(rawPk)) {
        if (rawPk.length === 1) {
          const flat = Array.isArray(value) ? value.flat(Infinity) : value;
          return assocPb.expandFromHash({ [rawPk[0]]: flat });
        }
        const values =
          value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
        const queryGroups: Nodes.Node[][] = values.map((idsSet) => {
          if (!Array.isArray(idsSet)) {
            throw new ArgumentError(
              `Expected corresponding value for [${rawPk.map((c) => `"${c}"`).join(", ")}] to be an Array`,
            );
          }
          const zipped: Record<string, unknown> = {};
          rawPk.forEach((col, i) => {
            zipped[col] = idsSet[i];
          });
          return assocPb.expandFromHash(zipped);
        });
        return assocPb.groupingQueries(queryGroups);
      }
      return assocPb.expandFromHash({ [rawPk as string]: value });
    }
    const queries = new AssociationQueryValue(associatedTable, value).queries();
    const queryGroups: Nodes.Node[][] = [];
    for (const query of queries) {
      if (isSameHash(query, attributes)) {
        queryGroups.push([this.build(this.table.arelTable.get(key), value)]);
      } else {
        const inner = this.expandFromHash(query);
        if (inner.length === 0) continue;
        queryGroups.push(inner);
      }
    }
    return this.groupingQueries(queryGroups);
  }

  /** @internal */
  private groupingQueries(queries: Nodes.Node[][]): Nodes.Node[] {
    if (queries.length === 0) return [];
    if (queries.length === 1) return queries[0];
    const reduced = queries.map((query) => query.reduce((left, right) => left.and(right)));
    return [new Nodes.Grouping(new Nodes.Or(reduced))];
  }

  build(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    if (respondsToId(value)) {
      value = (value as { id: unknown }).id;
    }
    if (this.isScalarQueryValue(value)) {
      const normalized = this.normalizeQueryValue(toS(attribute.name), value);
      if (normalized === null || normalized === undefined) {
        return attribute.eq(null);
      }
    }
    if (value === null || value === undefined) {
      return attribute.eq(null);
    }
    if (this.table.type(toS(attribute.name)).isForceEquality?.(value) === true) {
      return attribute.eq(this.buildBindAttribute(toS(attribute.name), value));
    }
    return this.handlerFor(value).call(attribute, value);
  }

  private isScalarQueryValue(value: unknown): boolean {
    return !(
      value === null ||
      value === undefined ||
      Array.isArray(value) ||
      value instanceof Set ||
      value instanceof Range ||
      value instanceof Substitute ||
      this.isRelation(value)
    );
  }

  private normalizeQueryValue(columnName: string, value: unknown): unknown {
    const klass = this.table.klass as { normalizedAttributes?: Set<string> } | null;
    const normalizedAttributes = klass?.normalizedAttributes;
    if (!normalizedAttributes || !normalizedAttributes.has(columnName)) return value;
    return this.table.type(columnName).cast(value);
  }

  /** @noRailsEquivalent CONVERGEABLE fold-build-composite-and-perform-merge */
  buildComposite(
    cols: string[],
    tuples: unknown[][],
    fallback?: (name: string) => typeof Base | null,
  ): Nodes.Node[] {
    if (cols.length === 0) {
      throw new ArgumentError("PredicateBuilder.buildComposite: empty column list");
    }
    if (!Array.isArray(tuples)) {
      throw new ArgumentError(
        `PredicateBuilder.buildComposite: tuples must be an array, got ${tuples === null ? "null" : typeof tuples}`,
      );
    }
    for (const tuple of tuples) {
      if (!Array.isArray(tuple)) {
        throw new ArgumentError(
          `PredicateBuilder.buildComposite: tuple must be an array, got ${typeof tuple}`,
        );
      }
      if (tuple.length !== cols.length) {
        throw new ArgumentError(
          `PredicateBuilder.buildComposite: tuple arity ${tuple.length} does not match column count ${cols.length} (cols=[${cols.join(", ")}])`,
        );
      }
    }
    const validTuples = tuples.filter((t) => t.every((v) => v !== null && v !== undefined));
    if (validTuples.length === 0) return [];
    if (cols.length === 1) {
      return this.buildFromHash({ [cols[0]]: validTuples.map((t) => t[0]) }, fallback);
    }
    const queryGroups = validTuples.map((tuple) =>
      this.buildFromHash(Object.fromEntries(cols.map((col, i) => [col, tuple[i]])), fallback),
    );
    return this.groupingQueries(queryGroups);
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
    this.handlers.unshift([klass, handler]);
  }

  buildBindAttribute(columnName: string, value: unknown): QueryAttribute {
    return new QueryAttribute(columnName, value, this.table.type(columnName));
  }

  resolveArelAttribute(
    tableName: string,
    columnName: string,
    fallback?: (name: string) => unknown,
  ): Nodes.Attribute {
    return this.table
      .associatedTable(tableName, fallback as (name: string) => never)
      .arelTable.get(columnName);
  }

  with(table: TableMetadata): PredicateBuilder {
    const builder = new PredicateBuilder(table);
    builder.handlers = this.handlers;
    return builder;
  }

  static references(attributes: string[] | Record<string, unknown>): Nodes.SqlLiteral[] {
    const refs: Nodes.SqlLiteral[] = [];
    const entries: Array<[string, unknown]> = Array.isArray(attributes)
      ? attributes.map((k) => [k, undefined] as [string, unknown])
      : Object.entries(attributes);
    for (const [key, value] of entries) {
      if (isPlainObject(value)) {
        refs.push(sql(key, { retryable: true }));
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          refs.push(sql(key.slice(0, dot), { retryable: true }));
        }
      }
    }
    return refs;
  }

  references(): string[] {
    return [];
  }

  private isRelation(value: unknown): boolean {
    return typeof value === "object" && value !== null && "_model" in value && "arel" in value;
  }

  private convertDotNotationToHash(attributes: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (isPlainObject(value)) {
        const existing = converted[key];
        if (existing && isPlainObject(existing)) {
          Object.assign(existing, value);
        } else {
          converted[key] = { ...value };
        }
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          const tableName = key.slice(0, dot);
          const colName = key.slice(dot + 1);
          const existing = converted[tableName];
          if (existing && isPlainObject(existing)) {
            existing[colName] = value;
          } else {
            converted[tableName] = { [colName]: value };
          }
        } else {
          converted[key] = value;
        }
      }
    }
    return converted;
  }

  /** @missingRailsCall last — PERMANENT */
  private handlerFor(object: unknown): { call(attr: Nodes.Attribute, value: any): Nodes.Node } {
    return this.handlers.find(([klass]) =>
      klass === BasicObject
        ? true
        : klass === Relation
          ? this.isRelation(object)
          : object instanceof klass,
    )![1];
  }
}

class BasicObject {}

class Relation {}

function respondsToId(value: unknown): value is { id: unknown } {
  return value != null && typeof value === "object" && "id" in value && !isPlainObject(value);
}

function extractAggregateAttr(object: unknown, attr: string, tryBang: boolean): unknown {
  if (object === null || object === undefined) return tryBang ? null : object;
  if (typeof object === "object" && attr in object) {
    const v = (object as Record<string, unknown>)[attr];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).call(object) : v;
  }
  if (tryBang) {
    throw new TypeError(
      `composed_of value ${describeAggregateValue(object)} does not respond to mapped attribute '${attr}'`,
    );
  }
  return object;
}

function describeAggregateValue(object: unknown): string {
  const ctor = (object as { constructor?: { name?: string } } | null)?.constructor?.name;
  return ctor ? `(${ctor})` : String(object);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isSameHash(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b) || !isSameValue(a[k], b[k])) return false;
  }
  return true;
}

function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isSameValue(v, b[i]));
  }
  return false;
}
