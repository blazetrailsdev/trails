import { TypeError } from "@blazetrails/ruby-compat";
import { Nodes, Table, SelectManager, sql, star } from "@blazetrails/arel";
import { ArgumentError, BigIntegerType } from "@blazetrails/activemodel";
import { any, BigDecimal, isPresent, many, tryCall } from "@blazetrails/activesupport";
import { block, fetch, isEmpty } from "@blazetrails/ruby-compat";
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
  visitor?: { compile(node: any, collector?: any): any };
  toSql(arel: unknown): string;
  quote(value: unknown): string;
  quoteTableName(name: unknown): string;
  quoteColumnName(name: unknown): string;
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
  columnsForDistinct(
    columns: string | string[],
    orders?: (string | Nodes.Node)[],
  ): string | string[];
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
    attributeTypes(): Record<string, ColumnType>;
    _serializedAttributes?: { get(name: string): { load(raw: unknown): unknown } | undefined };
    withConnection<R>(fn: (conn: CalculationConnection) => R | Promise<R>): Promise<R>;
    ensureSchemaLoaded(): Promise<void>;
    disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], options?: { permit?: RegExp }): void;
    attributeNames(): string[];
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
  groupValues: Array<string | Nodes.Node>;
  orderValues: Array<string | Nodes.Node>;
  whereClause: { isContradiction(): boolean };
  havingClause: { isEmpty(): boolean; ast: Nodes.Node };
  selectValues: (string | symbol | Nodes.Node)[];
  withValues: Array<Record<string, unknown>>;
  /** @internal */
  applyJoinDependency<R>(
    options: { eagerLoading?: boolean },
    block: (relation: CalculationRelation, joinDependency: JoinDependency) => R | Promise<R>,
  ): Promise<R>;
  calculate(operation: string, columnName?: string | Nodes.Node | number | null): Promise<unknown>;
  toArray(): Promise<any[]>;
  loaded: boolean;
  /** @internal */
  readonly isScheduled: boolean;
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
      | Nodes.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  pick(
    ...columnNames: Array<
      | string
      | Nodes.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown>;
  ids(): Promise<unknown[]> | unknown[];
  count(
    columnName?: string | Nodes.Node | null | CountBlock,
    block?: CountBlock,
  ): Promise<number | Map<unknown, number>>;
  sum(
    initialValueOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
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
  columnName?: string | Nodes.Node | null | CountBlock,
  block?: CountBlock,
  ...rest: unknown[]
): Promise<number | Map<unknown, number>> {
  if (rest.length > 0 || (block !== undefined && typeof block !== "function")) {
    throw new ArgumentError(`wrong number of arguments (given ${rest.length + 2}, expected 0..1)`);
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
  columnName: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("average", columnName as string);
}

export function asyncAverage(
  this: CalculationRelation,
  columnName: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.async().average(columnName);
}

export async function minimum(
  this: CalculationRelation,
  columnName: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("minimum", columnName as string);
}

export function asyncMinimum(
  this: CalculationRelation,
  columnName: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.async().minimum(columnName);
}

export async function maximum(
  this: CalculationRelation,
  columnName: string | Nodes.Node,
): Promise<unknown | null | Map<unknown, unknown>> {
  return this.calculate("maximum", columnName as string);
}

export function asyncMaximum(
  this: CalculationRelation,
  columnName: string | Nodes.Node,
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
  initialValueOrColumn: string | Nodes.Node | number | null | SumBlock = 0,
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
  const sum = await this.calculate("sum", initialValueOrColumn as string);
  if (this.groupValues.length > 0) return sum as Map<unknown, number | bigint>;
  return (sum as number | bigint) ?? 0;
}

export function asyncSum(
  this: CalculationRelation,
  identityOrColumn: string | Nodes.Node | number | null = null,
): Promise<number | bigint | Map<unknown, number | bigint>> {
  return this.async().sum(identityOrColumn);
}

export async function calculate(
  this: CalculationRelation,
  operation: string,
  columnName?: string | Nodes.Node | number | null,
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

/** @missingRailsName first — PERMANENT */
export async function pluck(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Nodes.Attribute
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

  if (hasInclude(this as any, columnNames.at(0))) {
    return this.applyJoinDependency({}, (relation) => relation.pluck(...columnNames));
  }

  this._model.disallowRawSqlBang(
    this.flattenedArgs(columnNames) as (string | symbol | Nodes.Node)[],
  );
  const relation = this.spawn();
  const columns = relation.arelColumns(columnNames);
  relation.selectValues = columns as (string | Nodes.Node)[];
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
    | Nodes.Attribute
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
    | Nodes.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown> {
  if (this.loaded && isAllAttributes(this, columnNames as unknown as string[])) {
    const records = await this.records();
    if (records.length === 0) return null;
    const first = records[0] as unknown as { get(attrName: string): unknown };
    return columnNames.length > 1
      ? columnNames.map((columnName) => first.get(String(columnName)))
      : first.get(String(columnNames[0]));
  }

  const values = await this.limit(1).pluck(...columnNames);
  return values[0] ?? null;
}

export function asyncPick(
  this: CalculationRelation,
  ...columnNames: Array<
    | string
    | Nodes.Attribute
    | Nodes.NamedFunction
    | Nodes.SqlLiteral
    | Record<string, string | string[]>
  >
): Promise<unknown> {
  return this.async().pick(...columnNames);
}

export function ids(this: CalculationRelation): Promise<unknown[]> | unknown[] {
  const primaryKey = this.model.primaryKey as string | string[] | null;
  const primaryKeyArray = Array.isArray(primaryKey)
    ? primaryKey
    : primaryKey == null
      ? []
      : [primaryKey];

  if (this.loaded) {
    const toId = (record: { _readAttribute(name: string): unknown }): unknown => {
      if (primaryKeyArray.length === 1) {
        return record._readAttribute(primaryKeyArray[0]);
      }
      return primaryKeyArray.map((column) => record._readAttribute(column));
    };
    return this.isScheduled
      ? this.records().then((records) => records.map(toId))
      : this._records.map(toId);
  }

  if (hasInclude(this as any, primaryKey as string)) {
    return this.applyJoinDependency({}, (relation) => relation.group(...primaryKeyArray).ids());
  }

  const columns = this.arelColumns(primaryKeyArray);
  const relation = this.spawn();
  relation.selectValues = columns as (string | Nodes.Node)[];

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

export interface CalculationMethods {
  calculate(operation: "count", column?: string): Promise<number | Map<unknown, number>>;
  calculate(
    operation: "sum",
    column: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Map<unknown, unknown>>;
  calculate(operation: string, column?: string | Nodes.Node | number | null): Promise<unknown>;
  count(
    column?: string | Nodes.Node | null | CountBlock,
    block?: CountBlock,
  ): Promise<number | Map<unknown, number>>;
  sum(block: SumBlock): Promise<number | bigint>;
  sum(initialValue: number | string, block: SumBlock): Promise<number | bigint>;
  sum(
    initialValueOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  average(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  minimum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  maximum(column: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  asyncCount(columnName?: string): Promise<number | Map<unknown, number>>;
  asyncSum(
    identityOrColumn?: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  asyncAverage(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  asyncMinimum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  asyncMaximum(columnName: string | Nodes.Node): Promise<unknown | null | Map<unknown, unknown>>;
  pluck(
    ...columns: Array<
      | string
      | Nodes.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  asyncPluck(
    ...columns: Array<
      | string
      | Nodes.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown[]>;
  pick(
    ...columnNames: Array<
      | string
      | Nodes.Attribute
      | Nodes.NamedFunction
      | Nodes.SqlLiteral
      | string[]
      | Record<string, string | string[]>
    >
  ): Promise<unknown>;
  asyncPick(
    ...columnNames: Array<
      | string
      | Nodes.Attribute
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
  const materialized = withDeferredDistinctPkPredicates(fn);
  return function (this: CalculationRelation, ...args: unknown[]) {
    const modelClass = (this as { _model?: unknown })._model as typeof Base;
    return modelClass.withConnection(() => materialized.apply(this, args as never[]));
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
  calculate: inQueryConnection(calculate),
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
  columnName: string | Nodes.Node | number | null,
): unknown {
  if (columnName instanceof Nodes.Node) return columnName;
  if (columnName === ":all") return star();
  return arelColumn.call(rel as never, columnName);
}

/** @internal */
export function isAllAttributes(rel: CalculationRelation, columnNames: string[]): boolean {
  const model = rel.model as any;
  const known = new Set<string>([
    ...(typeof model.attributeNames === "function" ? (model.attributeNames() as string[]) : []),
    ...Object.keys(model.attributeAliases ?? {}),
  ]);
  return isEmpty(columnNames.map(String).filter((c) => !known.has(c)));
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
  columnName: string | string[] | Nodes.Node | number | null,
): string | Nodes.Node | number | null {
  return Array.isArray(columnName) ? columnName.join(",") : columnName;
}

/** @internal */
export async function performCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
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
  columnName: string | string[] | Nodes.Node | number,
): boolean {
  return typeof columnName === "string" && /\bDISTINCT[\s(]/i.test(columnName);
}

/** @internal */
export function operationOverAggregateColumn(
  column: any,
  operation: string,
  distinct: boolean,
): unknown {
  if (operation === "count") return column.count(distinct);
  return typeof column[operation] === "function" ? column[operation]() : column;
}

/** @internal */
function buildCountSubquery(
  relation: CalculationRelation,
  columnName: string | Nodes.Node | number | null,
  distinct: boolean,
): SelectManager {
  const isAll = columnName === ":all";
  let columnAlias: Nodes.SqlLiteral;
  if (isAll) {
    columnAlias = star();
    if (!distinct) relation.selectValues = [sql(ONE_AS_ONE)];
  } else {
    columnAlias = sql("count_column");
    const column = aggregateColumn(relation, columnName) as Nodes.Node & {
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

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export async function executeSimpleCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
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
      columnName as string | Nodes.Node | null,
      distinct === true,
    );
  } else {
    relation = rel.unscope(":order").distinctBang(false) as CalculationRelation;

    column = aggregateColumn(relation, columnName as string | Nodes.Node | number | null);
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

  return typeCastCalculatedValue(result.castValues()[0], operation, type);
}

/**
 * @internal
 * @missingRailsArgs fetch — PERMANENT
 */
export async function executeGroupedCalculation(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
  distinct: boolean | null,
): Promise<Map<unknown, unknown>> {
  const fn = operation.toLowerCase() as AggFn;
  columnName = aggregateTarget(columnName);
  let groupFields: unknown[] = rel.groupValues;
  if (groupFields.length > 1) groupFields = groupFields.filter((f, i, all) => all.indexOf(f) === i);
  let association: any = null;
  let associated = false;
  if (groupFields.length === 1 && typeof groupFields[0] === "string") {
    association = (rel.model as any)._reflectOnAssociation?.(groupFields[0]) ?? null;
    associated = association != null && association.belongsTo?.() === true;
    if (associated) {
      groupFields = Array.isArray(association.foreignKey())
        ? [...(association.foreignKey() as string[])]
        : [association.foreignKey() as string];
    }
  }
  const relation = rel.except("group").distinctBang(false) as CalculationRelation;
  const groupNodes = arelColumns.call(relation as never, groupFields) as Nodes.Node[];

  return rel.model.withConnection(async (connection) => {
    const columnAliasTracker = new ColumnAliasTracker(connection);

    const groupAliases = groupNodes.map((field) =>
      columnAliasTracker.aliasFor(
        (field instanceof Nodes.Node
          ? (connection.visitor?.compile(field) ?? String(field))
          : String(field)
        ).toLowerCase(),
      ),
    );
    const groupColumns = groupAliases.map((aliaz, i) => [aliaz, groupNodes[i]] as const);

    const column = aggregateColumn(relation, columnName);
    const columnAlias = columnAliasTracker.aliasFor(
      `${fn} ${(columnName == null ? "" : String(columnName)).toLowerCase()}`,
    );
    const selectValue = operationOverAggregateColumn(column, fn, distinct ?? false) as any;

    const selectValues: Nodes.Node[] = [selectValue.as(connection.quoteColumnName(columnAlias))];
    if (!rel.havingClause.isEmpty()) {
      selectValues.push(
        ...(arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[]),
      );
    }
    selectValues.push(
      ...groupColumns.map(
        ([aliaz, field]) =>
          new Nodes.As(field, new Nodes.SqlLiteral(connection.quoteColumnName(aliaz))),
      ),
    );

    relation.groupValues = groupNodes;
    relation.selectValues = selectValues as (string | Nodes.Node)[];

    const opName = fn.charAt(0).toUpperCase() + fn.slice(1);
    const calculatedData = await (
      rel as unknown as { skipQueryCacheIfNecessary<R>(block: () => R): R }
    ).skipQueryCacheIfNecessary(() =>
      connection.selectAll(relation.arel(), `${rel.model.name} ${opName}`),
    );
    const rows = calculatedData.toArray();

    const keyOf = (vals: unknown[]): string => vals.map((v) => String(v)).join("\u0000");
    let keyRecords: Map<string, unknown> | null = null;
    if (association) {
      const klass = association.klass.baseClass ?? association.klass;
      const primaryKey = (
        Array.isArray(klass.primaryKey) ? klass.primaryKey : [klass.primaryKey]
      ) as string[];
      const keyIds = rows
        .map((row) => groupAliases.map((aliaz) => row[aliaz]))
        .filter((vals) => vals.every((v) => v != null));
      const records: any[] = await klass.where(new Map([[primaryKey, keyIds]])).toArray();
      keyRecords = new Map(
        records.map((r) => [keyOf(primaryKey.map((k) => r._readAttribute(k))), r]),
      );
    }

    const keyTypes = groupColumns.map(
      ([aliaz, colName]) =>
        (typeCasterFor(colName) ??
          typeFor(rel, colName, () =>
            fetch(calculatedData.columnTypes, aliaz, defaultValue()),
          )) as { deserialize?(v: unknown): unknown } | null,
    );

    let type: unknown;
    if (fn !== "count") {
      type =
        typeCasterFor(column) ??
        lookupCastTypeFromJoinDependencies(rel, String(columnName)) ??
        defaultValue();
      if (type instanceof EnumType) type = type.subtype;
    }

    const result = new Map<unknown, unknown>();
    for (const row of rows) {
      const key = groupAliases.map((aliaz, i) => {
        const raw = row[aliaz];
        const keyType = keyTypes[i];
        return raw == null
          ? null
          : typeof keyType?.deserialize === "function"
            ? keyType.deserialize(raw)
            : raw;
      });
      let resultKey: unknown = key.length === 1 ? key[0] : key;
      if (associated) {
        resultKey = key.every((v) => v != null) ? (keyRecords?.get(keyOf(key)) ?? null) : null;
      }
      result.set(resultKey, typeCastCalculatedValue(row[columnAlias] ?? null, fn, type));
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
  field: string | Nodes.Node | number,
  block?: () => ColumnType,
): unknown {
  const fieldName =
    (field as unknown as { name?: unknown }).name != null
      ? String((field as unknown as { name: unknown }).name)
      : (String(field).split(".").pop() ?? "");
  return rel.model.typeForAttribute?.(fieldName, block);
}

/**
 * @internal
 * @missingRailsArgs fetch — PERMANENT
 */
export function lookupCastTypeFromJoinDependencies(
  rel: CalculationRelation,
  name: string,
  joinDependencies?: JoinDependency[],
): unknown {
  let found: unknown = null;
  eachJoinDependencies.call(rel as any, joinDependencies, (join: any) => {
    if (found != null) return;
    const type = fetch(join.baseKlass.attributeTypes(), name, null);
    if (type) found = type;
  });
  return found;
}

/**
 * @internal
 * @missingRailsCall size — PERMANENT
 */
export async function typeCastPluckValues(
  this: CalculationRelation,
  result: Result,
  columns: Array<string | Nodes.Node | unknown>,
): Promise<unknown[]> {
  await this.model.ensureSchemaLoaded();
  let castTypes: ColumnTypes | ColumnType[];
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
export function typeCastCalculatedValue(value: unknown, operation: string, type: unknown): unknown {
  switch (operation) {
    case "count":
      return Number(value ?? 0);
    case "sum":
      if (type instanceof BigIntegerType) return type.deserialize(value ?? 0) ?? 0n;
      return Number(value ?? 0);
    case "average": {
      switch ((type as { type?(): string } | null)?.type?.()) {
        case "integer":
        case "decimal":
          return value == null
            ? null
            : value instanceof BigDecimal
              ? value
              : new BigDecimal(value as string | number | bigint);
        default: {
          if (value === null || value === undefined) return null;
          const ct = type as { deserialize?(v: unknown): unknown } | null;
          if (typeof ct?.deserialize === "function") return ct.deserialize(value);
          return value;
        }
      }
    }
    default: {
      if (value === null || value === undefined) return null;
      const ct = type as { deserialize?(v: unknown): unknown } | null;
      if (typeof ct?.deserialize === "function") return ct.deserialize(value);
      return value;
    }
  }
}

/** @internal */
export async function selectForCount(rel: CalculationRelation): Promise<string> {
  if (isEmpty(rel.selectValues)) return ":all";
  return rel.withConnection((conn) =>
    (arelColumns.call(rel as never, rel.selectValues as never[]) as Nodes.Node[])
      .map((column) => (conn.visitor ? conn.visitor.compile(column) : String(column)))
      .join(", "),
  );
}

/** @internal */
export function isBuildCountSubquery(
  rel: CalculationRelation,
  operation: string,
  columnName: string | string[] | Nodes.Node | number | null,
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
