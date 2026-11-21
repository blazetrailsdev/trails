import {
  ArgumentError,
  block as rbBlock,
  Enumerable,
  IndexError,
  rbNum2Int,
  include,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";
import type pg from "pg";
import { Constants as PGConstants } from "./pg.js";
import { PG } from "./namespaces.js";
import type { TypeMapByOid } from "./type-map-by-oid.js";

type DatabaseErrorFields = Partial<Record<keyof pg.DatabaseError, unknown>>;

/** @noRailsEquivalent PERMANENT */
const _ERROR_FIELDS: Record<number, keyof pg.DatabaseError> = {
  [PGConstants.PG_DIAG_SEVERITY]: "severity",
  [PGConstants.PG_DIAG_SQLSTATE]: "code",
  [PGConstants.PG_DIAG_MESSAGE_PRIMARY]: "message",
  [PGConstants.PG_DIAG_MESSAGE_DETAIL]: "detail",
  [PGConstants.PG_DIAG_MESSAGE_HINT]: "hint",
  [PGConstants.PG_DIAG_STATEMENT_POSITION]: "position",
  [PGConstants.PG_DIAG_INTERNAL_POSITION]: "internalPosition",
  [PGConstants.PG_DIAG_INTERNAL_QUERY]: "internalQuery",
  [PGConstants.PG_DIAG_CONTEXT]: "where",
  [PGConstants.PG_DIAG_SOURCE_FILE]: "file",
  [PGConstants.PG_DIAG_SOURCE_LINE]: "line",
  [PGConstants.PG_DIAG_SOURCE_FUNCTION]: "routine",
  [PGConstants.PG_DIAG_SCHEMA_NAME]: "schema",
  [PGConstants.PG_DIAG_TABLE_NAME]: "table",
  [PGConstants.PG_DIAG_COLUMN_NAME]: "column",
  [PGConstants.PG_DIAG_DATATYPE_NAME]: "dataType",
  [PGConstants.PG_DIAG_CONSTRAINT_NAME]: "constraint",
};

export class Result {
  declare filterMap: <R>(
    block: (row: Record<string, unknown>) => R | false | null | undefined,
  ) => R[];
  declare map: <R>(block: (row: Record<string, unknown>) => R) => R[];
  /** @noRailsEquivalent PERMANENT */
  declare [Symbol.iterator]: () => IterableIterator<Record<string, unknown>>;

  readonly #native: pg.QueryResult;
  #typemap: TypeMapByOid | null = null;

  readonly #error: DatabaseErrorFields | null;

  /** @noRailsEquivalent PERMANENT */
  constructor(native: pg.QueryResult, error: DatabaseErrorFields | null = null) {
    this.#native = native;
    this.#error = error;
  }

  mapTypesBang(typeMap: TypeMapByOid): this {
    this.typeMap = typeMap;
    return this;
  }

  clear(): null {
    return null;
  }

  errorField(fieldcode: number): string | null {
    const name = _ERROR_FIELDS[fieldcode];
    const fieldstr = name == null || this.#error == null ? null : this.#error[name];
    return fieldstr == null ? null : String(fieldstr);
  }

  resultErrorField(fieldcode: number): string | null {
    return this.errorField(fieldcode);
  }

  ntuples(): number {
    return (this.#native.rows ?? []).length;
  }

  ftype(index: number): number {
    if (index < 0 || index >= this.fields().length) {
      throw new ArgumentError(`invalid field number ${index}`);
    }
    return this.#native.fields[index].dataTypeID;
  }

  fmod(columnNumber: number): number {
    if (columnNumber < 0 || columnNumber >= this.fields().length) {
      throw new ArgumentError(`Column number is out of range: ${columnNumber}`);
    }
    return this.#native.fields[columnNumber].dataTypeModifier;
  }

  getvalue(tupNum: number, fieldNum: number): unknown {
    if (tupNum < 0 || tupNum >= this.ntuples()) {
      throw new ArgumentError(`invalid tuple number ${tupNum}`);
    }
    if (fieldNum < 0 || fieldNum >= this.fields().length) {
      throw new ArgumentError(`invalid field number ${fieldNum}`);
    }
    return this.#typecastResultValue(tupNum, fieldNum);
  }

  cmdTuples(): number {
    return this.#native.rowCount ?? 0;
  }

  fields(): string[] {
    return (this.#native.fields ?? []).map((f) => f.name);
  }

  values(): unknown[][] {
    return ((this.#native.rows ?? []) as unknown[][]).map((row, i) =>
      row.map((_, j) => this.#typecastResultValue(i, j)),
    );
  }

  get(index: number): Record<string, unknown> {
    const tupleNum = rbNum2Int(index);
    const numTuples = this.ntuples();
    if (tupleNum < 0 || tupleNum >= numTuples) {
      throw new IndexError(`Index ${tupleNum} is out of range`);
    }
    const fields = this.fields();
    return Object.fromEntries(
      fields.map((name, fieldNum) => [name, this.#typecastResultValue(tupleNum, fieldNum)]),
    );
  }

  each(): Enumerator<Record<string, unknown>>;
  each(block: (tuple: Record<string, unknown>) => void): this;
  each(
    block?: (tuple: Record<string, unknown>) => void,
  ): this | Enumerator<Record<string, unknown>> {
    if (!block)
      return toEnum(
        this,
        "each",
        rbBlock(() => this.ntuples()),
      );
    const fields = this.fields();
    for (let i = 0; i < this.ntuples(); i++) {
      block(Object.fromEntries(fields.map((name, j) => [name, this.#typecastResultValue(i, j)])));
    }
    return this;
  }

  set typeMap(typemap: TypeMapByOid) {
    this.#typemap = typemap;
  }

  get typeMap(): TypeMapByOid | null {
    return this.#typemap;
  }

  #typecastResultValue(i: number, j: number): unknown {
    const value = (this.#native.rows as unknown[][])[i][j];
    const oid = this.#native.fields[j].dataTypeID;
    const decoder = this.#typemap?._lookupOid(0, oid);
    return typeof value !== "string" || !decoder ? value : decoder.decode(value, i, j);
  }
}

include(Result, Enumerable);

PG.Result = Result;
