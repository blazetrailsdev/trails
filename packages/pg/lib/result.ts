import {
  ArgumentError,
  block as rbBlock,
  Enumerable,
  IndexError,
  rbNum2Int,
  include,
  rbAnyToS,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";
import type pg from "pg";
import { Constants as PGConstants } from "./pg.js";
import { Error as PgError, lookupErrorClass } from "./exceptions.js";
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
  /** @internal */
  private _cleared = false;
  /** @internal */
  _connection: object | null = null;
  /** @internal */
  private readonly _status: number | null;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    native: pg.QueryResult,
    error: DatabaseErrorFields | null = null,
    status: number | null = null,
  ) {
    this.#native = native;
    this.#error = error;
    this._status = status;
  }

  /** @internal */
  private _pgresultGet(): pg.QueryResult {
    if (this._cleared) throw new PgError("result has been cleared");
    return this.#native;
  }

  mapTypesBang(typeMap: TypeMapByOid): this {
    this.typeMap = typeMap;
    return this;
  }

  clear(): null {
    this._cleared = true;
    return null;
  }

  isCleared(): boolean {
    return this._cleared;
  }

  resultStatus(): number {
    this._pgresultGet();
    if (this._status != null) return this._status;
    if (this.#error != null) return PGConstants.PGRES_FATAL_ERROR;
    return this.nfields() > 0 ? PGConstants.PGRES_TUPLES_OK : PGConstants.PGRES_COMMAND_OK;
  }

  static resStatus(status: unknown): string {
    return (
      Object.keys(PGConstants).find(
        (c) =>
          c.startsWith("PGRES_") &&
          PGConstants[c as keyof typeof PGConstants] === rbNum2Int(status),
      ) ?? "invalid ExecStatusType code"
    );
  }

  resStatus(...args: unknown[]): string {
    this._pgresultGet();
    if (args.length == 0) {
      return Result.resStatus(this.resultStatus());
    } else if (args.length == 1) {
      return Result.resStatus(args[0]);
    } else {
      throw new ArgumentError("only 0 or 1 arguments expected");
    }
  }

  inspect(): string {
    const str = rbAnyToS(this);
    const stats = this.isCleared()
      ? " cleared"
      : ` status=${this.resStatus(this.resultStatus())} ntuples=${this.ntuples()} nfields=${this.nfields()} cmd_tuples=${this.cmdTuples()}`;
    return `${str.slice(0, -1)}${stats}${str.slice(-1)}`;
  }

  errorField(fieldcode: number): string | null {
    this._pgresultGet();
    const name = _ERROR_FIELDS[fieldcode];
    const fieldstr = name == null || this.#error == null ? null : this.#error[name];
    return fieldstr == null ? null : String(fieldstr);
  }

  resultErrorField(fieldcode: number): string | null {
    return this.errorField(fieldcode);
  }

  check(): this {
    let error: string;
    switch (this.resultStatus()) {
      case PGConstants.PGRES_TUPLES_OK:
      case PGConstants.PGRES_COPY_OUT:
      case PGConstants.PGRES_COPY_IN:
      case PGConstants.PGRES_COPY_BOTH:
      case PGConstants.PGRES_SINGLE_TUPLE:
      case PGConstants.PGRES_EMPTY_QUERY:
      case PGConstants.PGRES_COMMAND_OK:
      case PGConstants.PGRES_PIPELINE_SYNC:
      case PGConstants.PGRES_TUPLES_CHUNK:
        return this;
      case PGConstants.PGRES_BAD_RESPONSE:
      case PGConstants.PGRES_FATAL_ERROR:
      case PGConstants.PGRES_NONFATAL_ERROR:
      case PGConstants.PGRES_PIPELINE_ABORTED:
        error = this.#error?.message == null ? "" : String(this.#error.message);
        break;
      default:
        error = "internal error : unknown result status.";
    }
    const sqlstate = this.errorField(PGConstants.PG_DIAG_SQLSTATE);
    const klass = lookupErrorClass(sqlstate);
    throw new klass(error, { connection: this._connection, result: this });
  }

  fieldValues(field: string): unknown[] {
    const fnum = this.fields().indexOf(field);
    if (fnum < 0) throw new IndexError(`no such field '${field}' in result`);
    return this.values().map((row) => row[fnum]);
  }

  ntuples(): number {
    return (this._pgresultGet().rows ?? []).length;
  }

  nfields(): number {
    return (this._pgresultGet().fields ?? []).length;
  }

  ftype(index: number): number {
    if (index < 0 || index >= this.fields().length) {
      throw new ArgumentError(`invalid field number ${index}`);
    }
    return this._pgresultGet().fields[index].dataTypeID;
  }

  fmod(columnNumber: number): number {
    if (columnNumber < 0 || columnNumber >= this.fields().length) {
      throw new ArgumentError(`Column number is out of range: ${columnNumber}`);
    }
    return this._pgresultGet().fields[columnNumber].dataTypeModifier;
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
    return this._pgresultGet().rowCount ?? 0;
  }

  fields(): string[] {
    return (this._pgresultGet().fields ?? []).map((f) => f.name);
  }

  values(): unknown[][] {
    return ((this._pgresultGet().rows ?? []) as unknown[][]).map((row, i) =>
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
