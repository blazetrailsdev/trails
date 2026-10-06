import { isPlainObject } from "@blazetrails/activesupport";
import {
  ArgumentError,
  block,
  fetch,
  first,
  type Hash,
  KeyError,
  last,
  rbEqual,
  transformValues,
} from "@blazetrails/ruby-compat";
import { FutureResult, type Complete } from "./future-result.js";
import { defaultValue } from "./type.js";

export type ColumnType = { deserialize(value: unknown): unknown };
export type ColumnTypes = Record<string | number, ColumnType>;

const EMPTY_COLUMN_TYPES: ColumnTypes = Object.freeze({}) as ColumnTypes;

export class IndexedRow {
  private readonly columnIndexes: Record<string, number>;
  private readonly row: unknown[];

  constructor(columnIndexes: Record<string, number>, row: unknown[]) {
    this.columnIndexes = columnIndexes;
    this.row = row;
  }

  get size(): number {
    return Object.keys(this.columnIndexes).length;
  }

  get length(): number {
    return this.size;
  }

  keys(): string[] {
    return Object.keys(this.columnIndexes);
  }

  eachKey(block: (key: string) => void): void {
    for (const key of Object.keys(this.columnIndexes)) block(key);
  }

  isKey(column: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.columnIndexes, column);
  }

  get(column: string): unknown {
    const i = this.columnIndexes[column];
    return i === undefined ? undefined : this.row[i];
  }

  fetch(column: string, fallback?: () => unknown): unknown {
    if (Object.prototype.hasOwnProperty.call(this.columnIndexes, column)) {
      return this.row[this.columnIndexes[column]];
    }
    if (fallback) return fallback();
    throw new KeyError(`key not found: "${column}"`);
  }

  toH(): Record<string, unknown> {
    return transformValues(this.columnIndexes, (index) => this.row[index]);
  }

  toHash(): Record<string, unknown> {
    return this.toH();
  }

  equals(other: unknown): boolean {
    if (isPlainObject(other)) {
      return rbEqual(this.toHash(), other);
    } else {
      return this === other;
    }
  }
}

export class Result {
  readonly columns: string[];
  readonly rows: unknown[][];
  readonly columnTypes: ColumnTypes;

  #hashRows: Record<string, unknown>[] | null = null;
  #columnIndexes: Record<string, number> | null = null;
  #indexedRows: readonly IndexedRow[] | null = null;

  constructor(columns: string[], rows: unknown[][], columnTypes: ColumnTypes | null = null) {
    this.columns = columns;
    this.rows = rows;
    this.columnTypes = columnTypes ?? EMPTY_COLUMN_TYPES;
  }

  static empty({ async = false }: { async?: boolean } = {}): Result {
    if (async) {
      return emptyAsync() as unknown as Result;
    } else {
      return EMPTY;
    }
  }

  /** @noRailsEquivalent CONVERGEABLE result-includes-enumerable-and-cast-values-asks-columns-one-p */
  [Symbol.iterator](): IterableIterator<Record<string, unknown>> {
    return this.hashRows()[Symbol.iterator]();
  }

  includesColumn(name: string | null): boolean {
    return this.columns.includes(name as string);
  }

  get length(): number {
    return this.rows.length;
  }

  isEmpty(): boolean {
    return this.rows.length === 0;
  }

  each(block: (row: Record<string, unknown>) => void): void;
  each(): IterableIterator<Record<string, unknown>> & { size: number };
  each(
    block?: (row: Record<string, unknown>) => void,
  ): (IterableIterator<Record<string, unknown>> & { size: number }) | void {
    const rows = this.hashRows();
    if (block) {
      for (const row of rows) block(row);
      return;
    }
    const iter = rows[Symbol.iterator]() as unknown as IterableIterator<Record<string, unknown>> & {
      size: number;
    };
    Object.defineProperty(iter, "size", { value: this.rows.length });
    return iter;
  }

  toArray(): Record<string, unknown>[] {
    return this.hashRows();
  }

  pluck(key: string): unknown[];
  pluck(...keys: string[]): unknown[][];
  pluck(...keys: string[]): unknown[] {
    const indexes = this.columnIndexes;
    if (keys.length === 1) {
      const i = indexes[keys[0]];
      return i === undefined ? this.rows.map(() => undefined) : this.rows.map((row) => row[i]);
    }
    const idxs = keys.map((k) => indexes[k]);
    return this.rows.map((row) => idxs.map((i) => (i === undefined ? undefined : row[i])));
  }

  at(idx: number): Record<string, unknown> | undefined {
    const rows = this.hashRows();
    return idx < 0 ? rows[rows.length + idx] : rows[idx];
  }

  first(): Record<string, unknown> | undefined;
  first(n: number): Record<string, unknown>[];
  first(n?: number): Record<string, unknown> | Record<string, unknown>[] | undefined {
    const rows = this.hashRows();
    if (n === undefined) return rows[0];
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    return rows.slice(0, n);
  }

  last(): Record<string, unknown> | undefined;
  last(n: number): Record<string, unknown>[];
  last(n?: number): Record<string, unknown> | Record<string, unknown>[] | undefined {
    return n != null ? last(this.hashRows(), n) : last(this.hashRows());
  }

  result(): Result {
    return this;
  }

  cancel(): Result {
    return this;
  }

  /** @missingRailsCall one? — CONVERGEABLE result-includes-enumerable-and-cast-values-asks-columns-one-p */
  castValues(typeOverrides: ColumnTypes | Hash<string, ColumnType> | ColumnType[] = {}): unknown[] {
    if (this.columns.length === 1) {
      const type = Array.isArray(typeOverrides)
        ? first(typeOverrides)!
        : this.#columnType(first(this.columns)!, 0, typeOverrides);

      return this.rows.map(([value]) => type.deserialize(value));
    } else {
      const types = Array.isArray(typeOverrides)
        ? typeOverrides
        : this.columns.map((name, i) => this.#columnType(name, i, typeOverrides));

      return this.rows.map((values) =>
        Array.from({ length: values.length }, (_, i) => types[i].deserialize(values[i])),
      );
    }
  }

  dup(): Result {
    return new Result(this.columns, this.rows.slice(), { ...this.columnTypes });
  }

  freeze(): this {
    Object.freeze(this.hashRows());
    Object.freeze(this.indexedRows);
    Object.freeze(this);
    return this;
  }

  get columnIndexes(): Record<string, number> {
    return (this.#columnIndexes ??= (() => {
      let index = 0;
      const hash: Record<string, number> = {};
      const length = this.columns.length;
      while (index < length) {
        hash[this.columns[index]] = index;
        index += 1;
      }
      return Object.freeze(hash);
    })());
  }

  get indexedRows(): readonly IndexedRow[] {
    return (this.#indexedRows ??= (() => {
      const columns = this.columnIndexes;
      return Object.freeze(this.rows.map((row) => new IndexedRow(columns, row)));
    })());
  }

  /** @internal */
  private hashRows(): Record<string, unknown>[] {
    return (this.#hashRows ??= this.rows.map((row) =>
      transformValues(this.columnIndexes, (index) => row[index]),
    ));
  }

  #columnType(
    name: string,
    index: number,
    typeOverrides: ColumnTypes | Hash<string, ColumnType>,
  ): ColumnType {
    return columnType(this, name, index, typeOverrides);
  }
}

const EMPTY_COLUMNS = Object.freeze([]) as unknown as string[];
const EMPTY_ROWS = Object.freeze([]) as unknown as unknown[][];
const EMPTY = new Result(EMPTY_COLUMNS, EMPTY_ROWS, EMPTY_COLUMN_TYPES).freeze();

let EMPTY_ASYNC: Complete | undefined;

function emptyAsync(): Complete {
  return (EMPTY_ASYNC ??= FutureResult.wrap(EMPTY) as Complete);
}

/** @internal */
export function columnType(
  result: Result,
  name: string,
  index: number,
  typeOverrides: ColumnTypes | Hash<string, ColumnType>,
): ColumnType {
  const columnTypes = result.columnTypes;
  return fetch<ColumnType>(
    typeOverrides,
    name,
    block(() =>
      fetch<ColumnType>(
        columnTypes,
        index as unknown as string,
        block(() => fetch<ColumnType>(columnTypes, name, defaultValue())),
      ),
    ),
  );
}
