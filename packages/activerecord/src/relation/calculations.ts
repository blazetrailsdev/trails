import { TypeError } from "@blazetrails/ruby-compat";
import type * as Arel from "@blazetrails/arel";
import {
  Expressions,
  Nodes,
  Table,
  SelectManager,
  arelNode,
  sql,
  star,
  type ArelNode,
} from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  any,
  isPresent,
  kernelArray,
  many,
  pick as enumerablePick,
  tryCall,
} from "@blazetrails/activesupport";
import {
  block,
  fetch,
  first,
  type Hash,
  isEmpty,
  isModuleIncluded,
  rbFPublicSend,
  rbObjRespondTo,
  rtest,
  toD,
  toI,
  uniq,
} from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import type { JoinDependency } from "../associations/join-dependency.js";
import { Result, type ColumnType, type ColumnTypes } from "../result.js";
import { FutureResult } from "../future-result.js";
import { EnumType } from "../enum.js";
import { defaultValue } from "../type.js";
import {
  arelColumn,
  arelColumns,
  buildJoinDependencies,
  eachJoinDependencies,
} from "./query-methods.js";
import { ONE_AS_ONE } from "./finder-methods.js";

export class ColumnAliasTracker {
  private connection: AliasingConnection;
  private aliases: Map<string, number> = new Map();

  constructor(connection: AliasingConnection) {
    this.connection = connection;
  }

  aliasFor(field: string): string {
    const aliasedName = this.columnAliasFor(field);

    if ((this.aliases.get(aliasedName) ?? 0) === 0) {
      this.aliases.set(aliasedName, 1);
      return aliasedName;
    } else {
      const count = (this.aliases.get(aliasedName) ?? 0) + 1;
      this.aliases.set(aliasedName, count);
      return `${this.truncate(aliasedName)}_${count}`;
    }
  }

  private columnAliasFor(field: string): string {
    let columnAlias = field;
    columnAlias = columnAlias.replace(/\*/g, "all");
    columnAlias = columnAlias.replace(/\W+/g, " ");
    columnAlias = columnAlias.trim();
    columnAlias = columnAlias.replace(/ +/g, "_");
    return this.connection.tableAliasFor(columnAlias);
  }

  private truncate(name: string): string {
    return name.slice(0, this.connection.tableAliasLength() - 2);
  }
}

/** @internal */
interface AliasingConnection {
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
}

interface CalculationConnection {
  adapterName: string;
  visitor: { compile(node: any, collector?: any): any };
  toSql(arel: unknown): string;
  quote(value: unknown): string;
  quoteTableName(name: unknown): string;
  quoteColumnName(name: unknown): string;
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
  columnsForDistinct(columns: string | string[], orders?: (string | ArelNode)[]): string | string[];
  execute(sql: string): Promise<Record<string, unknown>[]>;
  selectAll(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { async?: boolean },
  ): Promise<import("../result.js").Result>;
}

interface CalculationRelation {
  model: CalculationRelation["_model"];
  primaryKey: string | string[];
  _model: {
    arelTable: any;
    primaryKey: string | string[];
    name: string;
    typeForAttribute?(name: string, block?: () => ColumnType): ColumnType | null;
    attributeTypes(): ColumnTypes | Hash<string, ColumnType>;
    _serializedAttributes?: { get(name: string): { load(raw: unknown): unknown } | undefined };
    withConnection<R>(fn: (conn: CalculationConnection) => R | Promise<R>): Promise<R>;
    ensureSchemaLoaded(): Promise<void>;
    disallowRawSqlBang(args: (string | symbol | ArelNode)[], options?: { permit?: RegExp }): void;
    attributeNames(): string[];
    attributeAliases: Record<string, string>;
  };
  withConnection<R>(fn: (conn: CalculationConnection) => R | Promise<R>): Promise<R>;
  limitValue: number | string | null;
  offsetValue: number | string | null;
  optimizerHintsValues: string[];
  _isNone: boolean;
  _async?: boolean;
  async(): CalculationRelation;
  /** @internal */
  isNullRelation(): boolean;
  distinctValue: boolean;
  distinctBang(value?: boolean): unknown;
  unscope(...args: unknown[]): CalculationRelation;
  except(...skips: string[]): CalculationRelation;
  arel(): SelectManager;
  buildSubquery(subqueryAlias: string | Nodes.SqlLiteral, selectValue: unknown): SelectManager;
  spawn(): CalculationRelation;
  _values: Record<string, unknown>;
  groupValues: Array<string | ArelNode>;
  orderValues: Array<string | ArelNode>;
  whereClause: { isContradiction(): boolean };
  havingClause: { isEmpty(): boolean; ast: Nodes.Node };
  selectValues: (string | symbol | ArelNode)[];
  withValues: Array<Record<string, unknown>>;
  /** @internal */
  applyJoinDependency<R>(
    options: { eagerLoading?: boolean },
    block: (relation: CalculationRelation, joinDependency: JoinDependency) => R | Promise<R>,
  ): Promise<R>;
  calculate(operation: string, columnName?: string | ArelNode | number | null): Promise<unknown>;
  toArray(): Promise<any[]>;
  loaded: boolean;
  /** @internal */
  readonly isScheduled: boolean;
  /** @internal */
  readonly _loadResult?: Promise<unknown>;
  records(): Promise<
    Array<{ _readAttribute(name: string): unknown; get(attrName: string): unknown }>
  >;
  /** @internal */
  _records: Array<{ _readAttribute(name: string): unknown; get(attrName: string): unknown }>;
  table: Table;
  limit(value: number | null): CalculationRelation;
  where(opts: unknown): CalculationRelation;
  group(...args: unknown[]): CalculationRelation;
  leftOuterJoins(...args: unknown[]): CalculationRelation;
  pluck(
    ...columns: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  pick(
    ...columnNames: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown>;
  ids(): Promise<unknown[]> | unknown[];
  count(
    columnName?: string | ArelNode | null | CountBlock,
    block?: CountBlock,
  ): Promise<number | Map<unknown, number>>;
  sum(
    initialValueOrColumn?: string | ArelNode | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(columnName: string | ArelNode): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(columnName: string | ArelNode): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(columnName: string | ArelNode): Promise<unknown | null | Map<unknown, unknown>>;
  arelColumns(columns: unknown[]): unknown[];
  flattenedArgs(args: unknown[]): unknown[];
  skipQueryCacheIfNecessary<R>(block: () => R): R;
  /** @internal */
  _materializeDeferredDistinctPkPredicates(): Promise<void> | void;
  /** @internal */
  eagerLoadValues: unknown[];
  includesValues: unknown[];
  /** @internal */
  clone(): CalculationRelation;
  hasLimitOrOffset: boolean;
  /** @internal */
  readonly isEagerLoading: boolean;
  except(...values: string[]): CalculationRelation;
  group(...args: unknown[]): CalculationRelation;
  ids(): Promise<unknown[]> | unknown[];
  /** @internal */
  arel(aliases?: unknown): SelectManager;
}

type AggFn = "count" | "sum" | "average" | "minimum" | "maximum";

export type SumBlock = (record: any) => number | bigint | string;

export type CountBlock = (record: any) => unknown;

export async function count(
  this: CalculationRelation,
  columnName?: string | ArelNode | null | CountBlock,
  block?: CountBlock,
): Promise<number | Map<unknown, number>> {
  if (arguments.length > 2) {
    throw new ArgumentError(`wrong number of arguments (given ${arguments.length}, expected 0..1)`);
  }
  if (typeof columnName === "function") {
    block = columnName;
    columnName = null;
  }
  if (block !== undefined) {
    if (columnName != null) {
      throw new ArgumentError("Column name argument is not supported when a block is passed.");
    }

    return (await this.toArray()).filter((record) => {
      const result = block(record);
      return result != null && result !== false;
    }).length;
  } else {
    return this.calculate("count", columnName as string) as Promise<number | Map<unknown, number>>;
  }
}

export function asyncCount(
  this: CalculationRelation,
  columnName?: string,
): Promise<number | Map<unknown, number>> {
  return this.async().count(columnName);
}

export async function average(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("average", columnName as string);
}

export function asyncAverage(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.async().average(columnName);
}

export async function minimum(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("minimum", columnName as string);
}

export function asyncMinimum(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.async().minimum(columnName);
}

export async function maximum(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("maximum", columnName as string);
}

export function asyncMaximum(
  this: CalculationRelation,
  columnName: string | ArelNode,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.async().maximum(columnName);
}

function sumAdd(
  memo: number | bigint | string,
  value: number | bigint | string,
): number | bigint | string {
  if (typeof memo === "string") {
    if (typeof value === "string") return memo + value;
    throw new TypeError(
      `no implicit conversion of ${
        typeof value === "bigint" || Number.isInteger(value) ? "Integer" : "Float"
      } into String`,
    );
  }
  if (typeof memo !== "number" && typeof memo !== "bigint") {
    throw new TypeError(
      `no implicit conversion of ${
        typeof value === "bigint" || Number.isInteger(value) ? "Integer" : "Float"
      } into ${(memo as object).constructor.name}`,
    );
  }
  if (typeof value === "string") {
    throw new TypeError(
      `String can't be coerced into ${
        typeof memo === "bigint" || Number.isInteger(memo) ? "Integer" : "Float"
      }`,
    );
  }
  if (typeof memo === typeof value) {
    return typeof memo === "bigint" ? memo + (value as bigint) : memo + (value as number);
  }
  const [n, b] = typeof memo === "bigint" ? [value as number, memo] : [memo, value];
  if (!Number.isInteger(n)) return n + Number(b);
  return BigInt(n) + (b as bigint);
}

export async function sum(
  this: CalculationRelation,
  initialValueOrColumn: string | ArelNode | number | null | SumBlock = 0,
  block?: SumBlock,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  if (typeof initialValueOrColumn === "function") {
    block = initialValueOrColumn;
    initialValueOrColumn = 0;
  }
  if (block !== undefined) {
    const records = await this.toArray();
    return records.map(block).reduce(sumAdd, initialValueOrColumn as number | bigint | string) as
      | number
      | bigint;
  }
  return this.calculate("sum", initialValueOrColumn as string) as Promise<
    number | bigint | Map<unknown, number | bigint>
  >;
}

export function asyncSum(
  this: CalculationRelation,
  identityOrColumn: string | ArelNode | number | null = null,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  return this.async().sum(identityOrColumn);
}

export async function calculate(
  this: CalculationRelation,
  operation: string,
  columnName?: string | ArelNode | number | null,
): Promise<unknown> {
  operation = operation.toLowerCase();

  if (this.isNullRelation()) {
    switch (operation) {
      case "count":
      case "sum":
        return any(this.groupValues) ? new Map() : 0;
      case "average":
      case "minimum":
      case "maximum":
        return any(this.groupValues) ? new Map() : null;
    }
  }

  if (hasInclude(this, columnName ?? null)) {
    return this.applyJoinDependency({}, async (relation) => {
      if (operation === "count") {
        if (
          !this.distinctValue &&
          !isDistinctSelect(this, columnName ?? (await selectForCount(this)))
        ) {
          relation.distinctBang();
          const primaryKey = this.model.primaryKey;
          relation.selectValues =
            primaryKey == null
              ? [new Nodes.SqlLiteral("*")]
              : Array.isArray(primaryKey)
                ? [...primaryKey]
                : [primaryKey];
        }
        if (this.groupValues.length === 0) relation.orderValues = [];
      }

      return relation.calculate(operation, columnName);
    });
  } else {
    return performCalculation(this, operation, columnName ?? null);
  }
}

/** @missingRailsName async — PERMANENT */
export async function pluck(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Arel.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown[]> {
  if (this.isNullRelation()) return [];

  if (this.loaded && isAllAttributes(this, columnNames as unknown as string[])) {
    const records = await this.records();
    return records.map((record) =>
      columnNames.length > 1
        ? columnNames.map((column) => record.get(String(column)))
        : record.get(String(columnNames[0])),
    );
  }

  if (hasInclude(this as any, first(columnNames))) {
    return this.applyJoinDependency({}, (relation) => relation.pluck(...columnNames));
  }

  this._model.disallowRawSqlBang(this.flattenedArgs(columnNames) as (string | symbol | ArelNode)[]);
  const relation = this.spawn();
  const columns = relation.arelColumns(columnNames);
  relation.selectValues = columns as (string | ArelNode)[];
  const result = await this.skipQueryCacheIfNecessary(() =>
    this.whereClause.isContradiction()
      ? Result.empty({ async: this._async })
      : this.model.withConnection((c) =>
          c.selectAll(relation.arel(), `${this.model.name} Pluck`, [], { async: this._async }),
        ),
  );

  return await typeCastPluckValues.call(this, result, columns);
}

export function asyncPluck(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Arel.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown[]> {
  return this.async().pluck(...columnNames);
}

export async function pick(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Arel.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown> {
  if (this.loaded && isAllAttributes(this, columnNames as unknown as string[])) {
    return enumerablePick(await this.records(), ...(columnNames as never[])) ?? null;
  }

  return this.limit(1)
    .pluck(...columnNames)
    .then((values) => first(values) ?? null);
}

export function asyncPick(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Arel.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown> {
  return this.async().pick(...columnNames);
}

export function ids(this: CalculationRelation): Promise<unknown[]> | unknown[] {
  const primaryKey = this.model.primaryKey as string | string[] | null;
  const primaryKeyArray = kernelArray<string>(primaryKey);

  if (this.loaded) {
    const toId = (record: { _readAttribute(name: string): unknown }): unknown => {
      if (primaryKeyArray.length === 1) {
        return record._readAttribute(primaryKeyArray[0]);
      }
      return primaryKeyArray.map((column) => record._readAttribute(column));
    };
    return this.isScheduled || this._loadResult
      ? this.records().then((records) => records.map(toId))
      : this._records.map(toId);
  }

  if (hasInclude(this as any, primaryKey as string)) {
    return this.applyJoinDependency({}, (relation) => relation.group(...primaryKeyArray).ids());
  }

  const columns = this.arelColumns(primaryKeyArray);
  const relation = this.spawn();
  relation.selectValues = columns as (string | ArelNode)[];

  return (async () => {
    const result = relation.whereClause.isContradiction()
      ? Result.empty()
      : await this.skipQueryCacheIfNecessary(() =>
          this.withConnection(async (c) => {
            const manager = relation.arel();
            return c.selectAll(manager, `${this.model.name} Ids`, [], { async: this._async });
          }),
        );

    return await typeCastPluckValues.call(this, result, columns);
  })();
}

export function asyncIds(this: CalculationRelation): Promise<unknown[]> {
  return Promise.resolve(this.async().ids());
}

type Grouped<G extends boolean, S, M> = boolean extends G ? S | M : G extends true ? M : S;

export interface CalculationMethods<G extends boolean = boolean> {
  calculate(operation: "count", column?: string): Promise<Grouped<G, number, Map<unknown, number>>>;
  calculate(
    operation: "sum",
    column: string | ArelNode | number | null,
  ): Promise<Grouped<G, number | bigint, Map<unknown, number | bigint>>>;
  calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  calculate(operation: string, column?: string | ArelNode | number | null): Promise<unknown>;
  count(
    column?: string | ArelNode | null | CountBlock,
    block?: CountBlock,
  ): Promise<Grouped<G, number, Map<unknown, number>>>;
  sum(block: SumBlock): Promise<number | bigint>;
  sum(initialValue: number | string, block: SumBlock): Promise<number | bigint>;
  sum(
    initialValueOrColumn?: string | ArelNode | number | null,
  ): Promise<Grouped<G, number | bigint, Map<unknown, number | bigint>>>;
  average(column: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  minimum(column: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  maximum(column: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  asyncCount(columnName?: string): Promise<Grouped<G, number, Map<unknown, number>>>;
  asyncSum(
    identityOrColumn?: string | ArelNode | number | null,
  ): Promise<Grouped<G, number | bigint, Map<unknown, number | bigint>>>;
  asyncAverage(columnName: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  asyncMinimum(columnName: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  asyncMaximum(columnName: string | ArelNode): Promise<Grouped<G, unknown, Map<unknown, unknown>>>;
  pluck(
    ...columns: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  asyncPluck(
    ...columns: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  pick(
    ...columnNames: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown>;
  asyncPick(
    ...columnNames: Array<
      | string
      | Arel.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown>;
  ids(): Promise<unknown[]> | unknown[];
  asyncIds(): Promise<unknown[]>;
}

function inQueryConnection<F extends (this: CalculationRelation, ...args: never[]) => Promise<any>>(
  fn: F,
): F {
  return function (this: CalculationRelation, ...args: unknown[]) {
    const modelClass = (this as { _model?: unknown })._model as typeof Base;
    return modelClass.withConnection(() => fn.apply(this, args as never[]));
  } as unknown as F;
}

function withDeferredDistinctPkPredicates<
  F extends (this: CalculationRelation, ...args: never[]) => unknown,
>(fn: F): F {
  return function (this: CalculationRelation, ...args: never[]) {
    const materializing = (
      this as { _materializeDeferredDistinctPkPredicates?(): Promise<void> | void }
    )._materializeDeferredDistinctPkPredicates?.();
    if (materializing == null) return fn.apply(this, args);
    return materializing.then(() => fn.apply(this, args));
  } as unknown as F;
}

export const Calculations = {
  count: inQueryConnection(count),
  asyncCount,
  average: inQueryConnection(average),
  asyncAverage,
  minimum: inQueryConnection(minimum),
  asyncMinimum,
  maximum: inQueryConnection(maximum),
  asyncMaximum,
  sum: inQueryConnection(sum),
  asyncSum,
  calculate: inQueryConnection(withDeferredDistinctPkPredicates(calculate)),
  pluck: withDeferredDistinctPkPredicates(pluck),
  asyncPluck,
  pick,
  asyncPick,
  ids: withDeferredDistinctPkPredicates(ids),
  asyncIds,
} as const;

/** @internal */
export function aggregateColumn(
  rel: CalculationRelation,
  columnName: string | ArelNode | number | null,
): unknown {
  if (
    columnName != null &&
    typeof columnName === "object" &&
    isModuleIncluded(columnName.constructor, Expressions)
  ) {
    return columnName;
  }
  if (columnName === ":all") return star();
  return arelColumn.call(rel as never, columnName);
}

/** @internal */
export function isAllAttributes(rel: CalculationRelation, columnNames: string[]): boolean {
  const attributeNames: string[] = rel.model.attributeNames();
  const attributeAliases = Object.keys(rel.model.attributeAliases);
  return isEmpty(
    columnNames
      .map(String)
      .filter((name) => !attributeNames.includes(name))
      .filter((name) => !attributeAliases.includes(name)),
  );
}

/** @internal */
export function hasInclude(rel: CalculationRelation, columnName: unknown): boolean {
  return (
    rel.isEagerLoading ||
    (isPresent(rel.includesValues) && columnName != null && columnName !== ":all")
  );
}

/** @internal */
function aggregateTarget(
  columnName: string | string[] | ArelNode | number | null,
): string | ArelNode | number | null {
  return Array.isArray(columnName) ? columnName.join(",") : columnName;
}

/** @internal */
export async function performCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | ArelNode | number | null,
): Promise<unknown> {
  operation = operation.toLowerCase();

  let distinct: boolean | null = rel.distinctValue;
  if (operation === "count") {
    columnName ??= await selectForCount(rel);
    if (columnName === ":all") {
      if (!distinct) {
        if (rel.groupValues.length === 0)
          distinct = isDistinctSelect(rel, await selectForCount(rel));
      } else if (
        any(rel.groupValues) ||
        (rel.selectValues.length === 0 && rel.orderValues.length === 0)
      ) {
        columnName = rel.primaryKey;
      }
    } else if (isDistinctSelect(rel, columnName)) {
      distinct = null;
    }
  }

  if (any(rel.groupValues)) {
    return executeGroupedCalculation(rel, operation, columnName, distinct);
  }
  return executeSimpleCalculation(rel, operation, columnName, distinct);
}

/** @internal */
export function isDistinctSelect(
  _rel: CalculationRelation,
  columnName: string | string[] | ArelNode | number,
): boolean {
  return typeof columnName === "string" && /\bDISTINCT[\s(]/i.test(columnName);
}

/** @internal */
export function operationOverAggregateColumn(
  column: any,
  operation: string,
  distinct: boolean,
): unknown {
  return operation === "count" ? column.count(distinct) : rbFPublicSend(column, operation);
}

/** @internal */
function buildCountSubquery(
  relation: CalculationRelation,
  columnName: string | ArelNode | number | null,
  distinct: boolean,
): SelectManager {
  const isAll = columnName === ":all";
  let columnAlias: Nodes.SqlLiteral;
  if (isAll) {
    columnAlias = star();
    if (!distinct) relation.selectValues = [sql(ONE_AS_ONE)];
  } else {
    columnAlias = sql("count_column");
    const column = aggregateColumn(relation, columnName) as ArelNode & {
      as(alias: Nodes.SqlLiteral): Nodes.Node;
    };
    relation.selectValues = [column.as(columnAlias)];
  }

  const subqueryAlias = sql("subquery_for_count", { retryable: true });
  const selectValue = operationOverAggregateColumn(columnAlias, "count", false);

  return isAll
    ? relation.unscope(":order").buildSubquery(subqueryAlias, selectValue)
    : relation.buildSubquery(subqueryAlias, selectValue);
}

/** @internal */
export async function executeSimpleCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | ArelNode | number | null,
  distinct: boolean | null,
): Promise<unknown> {
  let relation: CalculationRelation;
  let queryBuilder: unknown;
  let column: unknown = null;

  if (isBuildCountSubquery(rel, operation, columnName, distinct === true)) {
    if (rel.limitValue === 0) return 0;

    relation = rel;
    queryBuilder = buildCountSubquery(
      rel.spawn(),
      columnName as string | ArelNode | null,
      distinct === true,
    );
  } else {
    relation = rel.unscope(":order").distinctBang(false) as CalculationRelation;

    column = aggregateColumn(relation, columnName as string | ArelNode | number | null);
    const selectValue = operationOverAggregateColumn(
      column,
      operation,
      distinct === true,
    ) as Nodes.Node & { distinct: boolean; as(alias: string): Nodes.Node };
    if (operation === "sum" && distinct) selectValue.distinct = true;

    relation.selectValues = [selectValue];

    queryBuilder = relation.arel();
  }

  const queryResult = relation.whereClause.isContradiction()
    ? rel._async
      ? FutureResult.wrap(Result.empty())
      : Result.empty()
    : (
        rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
      ).skipQueryCacheIfNecessary(() =>
        rel.model.withConnection((c) =>
          c.selectAll(
            queryBuilder,
            `${rel.model.name} ${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
            [],
            { async: rel._async },
          ),
        ),
      );

  const result = await queryResult;

  let type: unknown;
  if (operation !== "count") {
    type =
      typeCasterFor(column) ??
      lookupCastTypeFromJoinDependencies(rel, String(columnName ?? "")) ??
      defaultValue();
    if (type instanceof EnumType) type = type.subtype;
  }

  return typeCastCalculatedValue(first(result.castValues()), operation, type);
}

/** @internal */
export async function executeGroupedCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | ArelNode | number | null,
  distinct: boolean | null,
): Promise<Map<unknown, unknown>> {
  const fn = operation.toLowerCase() as AggFn;
  columnName = aggregateTarget(columnName);
  let groupFields: unknown[] = rel.groupValues;
  if (groupFields.length > 1) groupFields = uniq(groupFields);
  let association: any = null;
  let associated = false;
  if (groupFields.length === 1 && typeof groupFields[0] === "string") {
    association = (rel.model as any)._reflectOnAssociation?.(groupFields[0]) ?? null;
    associated = association != null && association.belongsTo?.() === true;
    if (associated) groupFields = kernelArray(association.foreignKey());
  }
  const relation = rel.except("group").distinctBang(false) as CalculationRelation;
  const groupNodes = arelColumns.call(relation as never, groupFields) as ArelNode[];

  return rel.model.withConnection(async (connection) => {
    const columnAliasTracker = new ColumnAliasTracker(connection);

    const groupAliases = groupNodes.map((field: ArelNode | string) => {
      if (arelNode(field)) field = connection.visitor.compile(field);
      return columnAliasTracker.aliasFor(String(field).toLowerCase());
    });
    const groupColumns = groupAliases.map((aliaz, i) => [aliaz, groupNodes[i]] as const);

    const column = aggregateColumn(relation, columnName);
    const columnAlias = columnAliasTracker.aliasFor(
      `${fn} ${(columnName == null ? "" : String(columnName)).toLowerCase()}`,
    );
    const selectValue = operationOverAggregateColumn(column, fn, distinct ?? false) as any;

    const selectValues: ArelNode[] = [selectValue.as(connection.quoteColumnName(columnAlias))];
    if (!rel.havingClause.isEmpty()) {
      selectValues.push(
        ...(arelColumns.call(rel as never, rel.selectValues as never[]) as ArelNode[]),
      );
    }
    selectValues.push(
      ...groupColumns.map(([aliaz, field]) => {
        aliaz = connection.quoteColumnName(aliaz);
        if (rbObjRespondTo(field, "as")) {
          return (field as unknown as { as(aliaz: string): ArelNode }).as(aliaz);
        } else {
          return `${field} AS ${aliaz}` as unknown as ArelNode;
        }
      }),
    );

    relation.groupValues = groupNodes;
    relation.selectValues = selectValues as (string | ArelNode)[];

    const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
    const calculatedData = await (
      rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
    ).skipQueryCacheIfNecessary(() =>
      connection.selectAll(relation.arel(), `${rel.model.name} ${opName}`),
    );

    const keyOf = (vals: unknown[]): string => vals.map((v) => String(v)).join("\u0000");
    let keyRecords: Map<string, unknown> | null = null;
    if (association) {
      const klass = association.klass.baseClass ?? association.klass;
      const primaryKey = kernelArray<string>(klass.primaryKey);
      const keyIds = calculatedData
        .toArray()
        .map((row) => groupAliases.map((aliaz) => row[aliaz]))
        .filter((vals) => vals.every((v) => v != null));
      const records: any[] = await klass.where(new Map([[primaryKey, keyIds]])).toArray();
      keyRecords = new Map(
        records.map((r) => [keyOf(primaryKey.map((k) => r._readAttribute(k))), r]),
      );
    }

    const keyTypes: ColumnTypes = {};
    for (const [aliaz, colName] of groupColumns) {
      keyTypes[aliaz] = (typeCasterFor(colName) ??
        typeFor(rel, colName, () =>
          fetch(calculatedData.columnTypes, aliaz, defaultValue()),
        )) as ColumnType;
    }

    const hashRows = (calculatedData.castValues(keyTypes) as unknown[][]).map((row) => {
      const hash: Record<string, unknown> = {};
      for (const [i, colName] of calculatedData.columns.entries()) {
        hash[colName] = row[i];
      }
      return hash;
    });

    let type: unknown;
    if (fn !== "count") {
      type =
        typeCasterFor(column) ??
        lookupCastTypeFromJoinDependencies(rel, String(columnName)) ??
        defaultValue();
      if (type instanceof EnumType) type = type.subtype;
    }

    const result = new Map<unknown, unknown>();
    for (const row of hashRows) {
      let key: unknown = groupAliases.map((aliaz) => row[aliaz]);
      if ((key as unknown[]).length === 1) key = (key as unknown[])[0];
      if (associated) key = keyRecords!.get(keyOf([key].flat())) ?? null;

      result.set(key, typeCastCalculatedValue(row[columnAlias], fn, type));
    }
    return result;
  });
}

function typeCasterFor(column: unknown): unknown {
  const relation = (column as { relation?: { isAbleToTypeCast?(): boolean } } | null)?.relation;
  if (relation?.isAbleToTypeCast?.() !== true) return null;
  return tryCall(column as object, "typeCaster") ?? null;
}

/** @internal */
export function typeFor(
  rel: CalculationRelation,
  field: string | ArelNode | number,
  block?: () => ColumnType,
): unknown {
  const fieldName =
    (field as unknown as { name?: unknown }).name != null
      ? String((field as unknown as { name: unknown }).name)
      : (String(field).split(".").pop() ?? "");
  return rel.model.typeForAttribute?.(fieldName, block);
}

/** @internal */
export function lookupCastTypeFromJoinDependencies(
  rel: CalculationRelation,
  name: string,
  joinDependencies: JoinDependency[] = buildJoinDependencies.call(rel as any),
): unknown {
  let found: unknown = null;
  eachJoinDependencies.call(rel as any, joinDependencies, (join: any) => {
    const type = fetch(join.baseKlass.attributeTypes(), name, null);
    if (rtest(type)) found ??= type;
  });
  return found;
}

/** @internal */
export async function typeCastPluckValues(
  this: CalculationRelation,
  result: Result,
  columns: Array<string | ArelNode | unknown>,
): Promise<unknown[]> {
  await this.model.ensureSchemaLoaded();
  let castTypes: ColumnTypes | Hash<string, ColumnType> | ColumnType[];
  if (result.columns.length !== columns.length) {
    castTypes = this.model.attributeTypes();
  } else {
    let joinDependencies: JoinDependency[] | undefined;
    castTypes = columns.map((column, i) => {
      let name: string;
      return (typeCasterFor(column) ??
        fetch(
          this.model.attributeTypes(),
          (name = result.columns[i]),
          block(() => {
            joinDependencies ??= buildJoinDependencies.call(this as any);
            return (
              (lookupCastTypeFromJoinDependencies(this, name, joinDependencies) as
                | ColumnType
                | undefined) ??
              result.columnTypes[i] ??
              defaultValue()
            );
          }),
        )) as ColumnType;
    });
  }
  return result.castValues(castTypes);
}

/** @internal */
export function typeCastCalculatedValue(value: unknown, operation: string, type: any): unknown {
  switch (operation) {
    case "count":
      return toI(value);
    case "sum":
      return type.deserialize(rtest(value) ? value : 0);
    case "average":
      switch (type.type()) {
        case "integer":
        case "decimal":
          return value == null ? null : toD(String(value));
        default:
          return type.deserialize(value);
      }
    default:
      return type.deserialize(value);
  }
}

/** @internal */
export async function selectForCount(rel: CalculationRelation): Promise<string> {
  if (isEmpty(rel.selectValues)) return ":all";
  return rel.withConnection((conn) =>
    (arelColumns.call(rel as never, rel.selectValues as never[]) as ArelNode[])
      .map((column) => conn.visitor.compile(column))
      .join(", "),
  );
}

/** @internal */
export function isBuildCountSubquery(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | ArelNode | number | null,
  distinct: boolean,
): boolean {
  const isAll = columnName === ":all";
  const selectValues = rel.selectValues ?? [];
  return (
    operation === "count" &&
    (((isAll || many(selectValues)) && distinct) ||
      rel.limitValue !== null ||
      rel.offsetValue !== null)
  );
}
