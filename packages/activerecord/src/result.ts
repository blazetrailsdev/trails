/**
 * Encapsulates a result returned from a database adapter's execQuery.
 *
 * Mirrors: ActiveRecord::Result
 */

export type ColumnType = { deserialize(value: unknown): unknown };
export type ColumnTypes = Record<string | number, ColumnType>;

const EMPTY_COLUMN_TYPES: ColumnTypes = Object.freeze({}) as ColumnTypes;

const IDENTITY_TYPE: ColumnType = {
  deserialize(value: unknown) {
    return value;
  },
};

/**
 * Read-only hash-like view over a single result row.
 *
 * Mirrors: ActiveRecord::Result::IndexedRow
 */
export class IndexedRow {
  readonly #columnIndexes: Record<string, number>;
  readonly #row: unknown[];

  constructor(columnIndexes: Record<string, number>, row: unknown[]) {
    this.#columnIndexes = columnIndexes;
    this.#row = row;
  }

  get size(): number {
    return Object.keys(this.#columnIndexes).length;
  }

  get length(): number {
    return this.size;
  }

  keys(): string[] {
    return Object.keys(this.#columnIndexes);
  }

  eachKey(block: (key: string) => void): void {
    for (const key of Object.keys(this.#columnIndexes)) block(key);
  }

  hasKey(column: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.#columnIndexes, column);
  }

  get(column: string): unknown {
    const i = this.#columnIndexes[column];
    return i === undefined ? undefined : this.#row[i];
  }

  fetch(column: string, fallback?: () => unknown): unknown {
    if (Object.prototype.hasOwnProperty.call(this.#columnIndexes, column)) {
      return this.#row[this.#columnIndexes[column]];
    }
    if (fallback) return fallback();
    throw new Error(`key not found: "${column}"`);
  }

  toHash(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, index] of Object.entries(this.#columnIndexes)) {
      out[key] = this.#row[index];
    }
    return out;
  }

  equals(other: unknown): boolean {
    if (other instanceof IndexedRow) {
      return this === other;
    }
    if (other && typeof other === "object") {
      const hash = this.toHash();
      const otherObj = other as Record<string, unknown>;
      const keys = Object.keys(hash);
      if (keys.length !== Object.keys(otherObj).length) return false;
      return keys.every((k) => hash[k] === otherObj[k]);
    }
    return false;
  }
}

export class Result {
  readonly columns: string[];
  readonly rows: unknown[][];
  readonly columnTypes: ColumnTypes;

  #hashRows: Record<string, unknown>[] | null = null;
  #columnIndexes: Record<string, number> | null = null;
  #indexedRows: IndexedRow[] | null = null;

  constructor(columns: string[], rows: unknown[][], columnTypes: ColumnTypes | null = null) {
    this.columns = columns;
    this.rows = rows;
    this.columnTypes = columnTypes ?? EMPTY_COLUMN_TYPES;
  }

  static empty(): Result {
    return EMPTY;
  }

  /**
   * Builds a Result from the row-hash shape returned by our driver-level
   * `execute()` methods. Column order is taken from the keys of the first
   * row; empty inputs produce an empty Result.
   */
  static fromRowHashes(rows: Record<string, unknown>[]): Result {
    if (rows.length === 0) return new Result([], []);
    const columns = Object.keys(rows[0]);
    const rowArrays = rows.map((row) => columns.map((col) => row[col]));
    return new Result(columns, rowArrays);
  }

  [Symbol.iterator](): IterableIterator<Record<string, unknown>> {
    return this.#getHashRows()[Symbol.iterator]();
  }

  includesColumn(name: string): boolean {
    return this.columns.includes(name);
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
    const rows = this.#getHashRows();
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
    return this.#getHashRows();
  }

  at(idx: number): Record<string, unknown> | undefined {
    const rows = this.#getHashRows();
    return idx < 0 ? rows[rows.length + idx] : rows[idx];
  }

  first(): Record<string, unknown> | undefined;
  first(n: number): Record<string, unknown>[];
  first(n?: number): Record<string, unknown> | Record<string, unknown>[] | undefined {
    const rows = this.#getHashRows();
    if (n === undefined) return rows[0];
    if (n < 0) throw new Error("negative array size");
    return rows.slice(0, n);
  }

  last(): Record<string, unknown> | undefined;
  last(n: number): Record<string, unknown>[];
  last(n?: number): Record<string, unknown> | Record<string, unknown>[] | undefined {
    const rows = this.#getHashRows();
    if (n === undefined) return rows[rows.length - 1];
    if (n < 0) throw new Error("negative array size");
    return n >= rows.length ? rows.slice() : rows.slice(rows.length - n);
  }

  result(): Result {
    return this;
  }

  cancel(): Result {
    return this;
  }

  castValues(typeOverrides: ColumnTypes | ColumnType[] = {}): unknown[] {
    const overridesArray = Array.isArray(typeOverrides) ? typeOverrides : null;

    if (this.columns.length === 1) {
      const type = overridesArray
        ? overridesArray[0]
        : this.#columnType(this.columns[0], 0, typeOverrides as ColumnTypes);
      return this.rows.map((row) => type.deserialize(row[0]));
    }

    const types = overridesArray
      ? overridesArray
      : this.columns.map((name, i) => this.#columnType(name, i, typeOverrides as ColumnTypes));

    return this.rows.map((row) => row.map((value, i) => types[i].deserialize(value)));
  }

  get columnIndexes(): Record<string, number> {
    if (this.#columnIndexes) return this.#columnIndexes;
    const hash: Record<string, number> = {};
    for (let i = 0; i < this.columns.length; i++) {
      hash[this.columns[i]] = i;
    }
    this.#columnIndexes = hash;
    return hash;
  }

  get indexedRows(): IndexedRow[] {
    if (this.#indexedRows) return this.#indexedRows;
    const idx = this.columnIndexes;
    this.#indexedRows = this.rows.map((row) => new IndexedRow(idx, row));
    return this.#indexedRows;
  }

  #getHashRows(): Record<string, unknown>[] {
    if (this.#hashRows) return this.#hashRows;
    const entries = Object.entries(this.columnIndexes);
    this.#hashRows = this.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const [key, i] of entries) obj[key] = row[i];
      return obj;
    });
    return this.#hashRows;
  }

  #columnType(name: string, index: number, typeOverrides: ColumnTypes): ColumnType {
    if (typeOverrides && name in typeOverrides) return typeOverrides[name];
    if (index in this.columnTypes) return this.columnTypes[index as unknown as string];
    if (name in this.columnTypes) return this.columnTypes[name];
    return IDENTITY_TYPE;
  }
}

const EMPTY_COLUMNS = Object.freeze([]) as unknown as string[];
const EMPTY_ROWS = Object.freeze([]) as unknown as unknown[][];
const EMPTY = Object.freeze(new Result(EMPTY_COLUMNS, EMPTY_ROWS, EMPTY_COLUMN_TYPES)) as Result;
