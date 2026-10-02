import {
  ArgumentError,
  last,
  rbFPublicSend,
  rbObjAsString as toS,
  rbObjRespondTo,
  Range,
  toH,
  zip,
} from "@blazetrails/ruby-compat";
import type * as Arel from "@blazetrails/arel";
import { Nodes, sql } from "@blazetrails/arel";
import { kernelArray, stringifyKeys, Tryable, wrap } from "@blazetrails/activesupport";

import { QueryAttribute } from "./query-attribute.js";
import { ArrayHandler } from "./predicate-builder/array-handler.js";
import { RangeHandler } from "./predicate-builder/range-handler.js";
import { BasicObjectHandler } from "./predicate-builder/basic-object-handler.js";
import { RelationHandler } from "./predicate-builder/relation-handler.js";
import { DeferredPluck } from "./predicate-builder/deferred-distinct-pk-in.js";
import { AssociationQueryValue } from "./predicate-builder/association-query-value.js";
import { Substitute } from "../statement-cache.js";
import { PolymorphicArrayValue } from "./predicate-builder/polymorphic-array-value.js";
import type { TableMetadata } from "../table-metadata.js";

export class PredicateBuilder {
  private _table: TableMetadata;

  /** @internal */
  get table(): TableMetadata {
    return this._table;
  }

  protected set table(value: TableMetadata) {
    this._table = value;
  }
  private handlers: Array<[any, { call(attr: Arel.Attribute, value: any): Nodes.Node }]> = [];

  constructor(table: TableMetadata) {
    this._table = table;

    this.registerHandler(BasicObject, new BasicObjectHandler(this));
    this.registerHandler(Range, new RangeHandler(this));
    this.registerHandler(Relation, new RelationHandler());
    this.registerHandler(Array, new ArrayHandler(this));
    this.registerHandler(Set, new ArrayHandler(this));
  }

  buildFromHash(
    attributes: Attributes,
    block?: (tableName: string) => unknown,
  ): (Nodes.Node | Nodes.SqlLiteral)[] {
    attributes = this.convertDotNotationToHash(attributes);
    return this.expandFromHash(attributes, block);
  }

  protected expandFromHash(
    attributes: Attributes,
    block?: (tableName: string) => unknown,
  ): (Nodes.Node | Nodes.SqlLiteral)[] {
    if (entriesOf(attributes).length === 0) return [sql("1=0")];

    return entriesOf(attributes).flatMap(([key, value]) => {
      if (value instanceof DeferredPluck) {
        const arelTable = this.table.arelTable;
        return value.in(
          Array.isArray(key)
            ? new Nodes.Grouping(key.map((col) => arelTable.get(col)))
            : arelTable.get(key),
        );
      }

      if (Array.isArray(key) && key.length === 1) {
        key = key[0];
        value = (value as unknown[]).flat(Infinity);
      }

      if (Array.isArray(key)) {
        const cols = key;
        const queries = kernelArray(value).map((idsSet) => {
          if (!Array.isArray(idsSet)) {
            throw new ArgumentError(`Expected corresponding value for ${toS(cols)} to be an Array`);
          }
          return this.expandFromHash(toH(zip(cols, idsSet)));
        });
        return this.groupingQueries(queries);
      } else if (isPlainObject(value) && !this.table.hasColumn(key)) {
        return this.table
          .associatedTable(key, block as (name: string) => never)
          .predicateBuilder.expandFromHash(stringifyKeys(value));
      } else if (this.table.isAssociatedWith(key)) {
        const associatedTable = this.table.associatedTable(key);
        let klass: typeof PolymorphicArrayValue | typeof AssociationQueryValue | undefined;
        if (associatedTable.isPolymorphicAssociation()) {
          if (!Array.isArray(value)) value = [value];
          klass = PolymorphicArrayValue;
        } else if (associatedTable.isThroughAssociation()) {
          return associatedTable.predicateBuilder.expandFromHash(
            new Map([[associatedTable.primaryKey, value]]),
          );
        }

        klass ||= AssociationQueryValue;
        const queries = new klass(associatedTable as never, value as never)
          .queries()
          .map((query) =>
            isSameHash(query, attributes) ? [this.get(key, value)] : this.expandFromHash(query),
          );

        return this.groupingQueries(queries);
      } else if (this.table.aggregatedWith(key)) {
        const mapping: [string, string][] = this.table.reflectOnAggregation(key).mapping();
        let values: unknown[] = value === null || value === undefined ? [null] : wrap(value);
        if (mapping.length === 1 || values.length === 0) {
          const [columnName, aggrAttr] = mapping[0];
          values = values.map((object) =>
            rbObjRespondTo(object, aggrAttr) ? rbFPublicSend(object, aggrAttr) : object,
          );
          return this.get(columnName, values);
        } else {
          const queries = values.map((object) =>
            mapping.map(([fieldAttr, aggregateAttr]) =>
              this.get(fieldAttr, Tryable.tryBang(object, aggregateAttr)),
            ),
          );

          return this.groupingQueries(queries);
        }
      } else {
        return this.get(key, value);
      }
    });
  }

  /** @internal */
  private groupingQueries(
    queries: (Nodes.Node | Nodes.SqlLiteral)[][],
  ): (Nodes.Node | Nodes.SqlLiteral)[];
  private groupingQueries(
    queries: (Nodes.Node | Nodes.SqlLiteral)[][] | (Nodes.Node | Nodes.SqlLiteral)[] | Nodes.Or,
  ): (Nodes.Node | Nodes.SqlLiteral)[] {
    queries = queries as (Nodes.Node | Nodes.SqlLiteral)[][];
    if (queries.length === 1) return queries[0];
    queries = queries.map((query) =>
      query.reduce((left, right) => rbFPublicSend(left, "and", right) as Nodes.Node),
    );
    queries = new Nodes.Or(queries);
    return [new Nodes.Grouping(queries)];
  }

  get(attrName: string, value: unknown, operator: string | null = null): Nodes.Node {
    return this.build(this.table.arelTable.get(attrName), value, operator);
  }

  /** @missingRailsName name — PERMANENT */
  build(attribute: Arel.Attribute, value: unknown, operator: string | null = null): Nodes.Node {
    if (respondsToId(value)) {
      value = (value as { id: unknown }).id;
    }
    if (
      (operator ??=
        this.table.type(toS(attribute.name)).isForceEquality?.(value) === true ? "eq" : null) !=
      null
    ) {
      const bind = this.buildBindAttribute(toS(attribute.name), value);
      return (attribute as unknown as Record<string, (b: unknown) => Nodes.Node>)[operator](bind);
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

  registerHandler(
    klass: any,
    handler: { call(attr: Arel.Attribute, value: any): Nodes.Node },
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
  ): Arel.Attribute {
    return this.table
      .associatedTable(tableName, fallback as (name: string) => never)
      .arelTable.get(columnName);
  }

  with(table: TableMetadata): PredicateBuilder {
    const builder = new PredicateBuilder(table);
    builder.handlers = this.handlers;
    return builder;
  }

  static references(attributes: string[] | Attributes): Nodes.SqlLiteral[] {
    const refs: Nodes.SqlLiteral[] = [];
    const entries: Array<[string | string[], unknown]> = Array.isArray(attributes)
      ? attributes.map((k) => [k, undefined] as [string, unknown])
      : entriesOf(attributes);
    for (const [key, value] of entries) {
      if (Array.isArray(key)) {
        continue;
      }
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

  private convertDotNotationToHash(attributes: Attributes): Attributes {
    const converted = new Map<string | string[], unknown>();
    let arrayKeyed = false;
    for (const [key, value] of entriesOf(attributes)) {
      if (Array.isArray(key)) {
        arrayKeyed = true;
        converted.set(key, value);
      } else if (isPlainObject(value)) {
        const existing = converted.get(key);
        if (existing && isPlainObject(existing)) {
          Object.assign(existing, value);
        } else {
          converted.set(key, { ...value });
        }
      } else {
        const dot = key.lastIndexOf(".");
        if (dot !== -1) {
          const tableName = key.slice(0, dot);
          const colName = key.slice(dot + 1);
          const existing = converted.get(tableName);
          if (existing && isPlainObject(existing)) {
            existing[colName] = value;
          } else {
            converted.set(tableName, { [colName]: value });
          }
        } else {
          converted.set(key, value);
        }
      }
    }
    if (arrayKeyed) return converted as Map<unknown, unknown>;
    return Object.fromEntries(converted as Map<string, unknown>);
  }

  private handlerFor(object: unknown): { call(attr: Arel.Attribute, value: any): Nodes.Node } {
    return last(
      this.handlers.find(([klass]) =>
        klass === BasicObject
          ? true
          : klass === Relation
            ? this.isRelation(object)
            : object instanceof klass,
      )!,
    ) as { call(attr: Arel.Attribute, value: any): Nodes.Node };
  }
}

class BasicObject {}

class Relation {}

type Attributes = Record<string, unknown> | Map<unknown, unknown>;

function entriesOf(attributes: Attributes): [string | string[], unknown][] {
  return attributes instanceof Map
    ? ([...attributes] as [string | string[], unknown][])
    : Object.entries(attributes);
}

function respondsToId(value: unknown): value is { id: unknown } {
  return value != null && typeof value === "object" && "id" in value && !isPlainObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isSameHash(a: Attributes, b: Attributes): boolean {
  const aEntries = entriesOf(a);
  const bEntries = entriesOf(b);
  if (aEntries.length !== bEntries.length) return false;
  for (const [k, v] of aEntries) {
    const other = bEntries.find(([bk]) => isSameValue(bk, k));
    if (!other || !isSameValue(v, other[1])) return false;
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
