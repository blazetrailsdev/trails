import { ArgumentError } from "@blazetrails/ruby-compat";
import type pg from "pg";
import { PGTypeMapByOid } from "../connection-adapters/postgresql/pg-text-decoder.js";
import { Result as ActiveRecordResult } from "../result.js";
import * as Constants from "./exceptions.js";

type DatabaseErrorFields = Partial<Record<keyof pg.DatabaseError, unknown>>;

const _ERROR_FIELDS: Record<number, keyof pg.DatabaseError> = {
  [Constants.PG_DIAG_SEVERITY]: "severity",
  [Constants.PG_DIAG_SQLSTATE]: "code",
  [Constants.PG_DIAG_MESSAGE_PRIMARY]: "message",
  [Constants.PG_DIAG_MESSAGE_DETAIL]: "detail",
  [Constants.PG_DIAG_MESSAGE_HINT]: "hint",
  [Constants.PG_DIAG_STATEMENT_POSITION]: "position",
  [Constants.PG_DIAG_INTERNAL_POSITION]: "internalPosition",
  [Constants.PG_DIAG_INTERNAL_QUERY]: "internalQuery",
  [Constants.PG_DIAG_CONTEXT]: "where",
  [Constants.PG_DIAG_SOURCE_FILE]: "file",
  [Constants.PG_DIAG_SOURCE_LINE]: "line",
  [Constants.PG_DIAG_SOURCE_FUNCTION]: "routine",
  [Constants.PG_DIAG_SCHEMA_NAME]: "schema",
  [Constants.PG_DIAG_TABLE_NAME]: "table",
  [Constants.PG_DIAG_COLUMN_NAME]: "column",
  [Constants.PG_DIAG_DATATYPE_NAME]: "dataType",
  [Constants.PG_DIAG_CONSTRAINT_NAME]: "constraint",
};

export class Result extends Array<Record<string, unknown>> {
  /** @noRailsEquivalent CONVERGEABLE pg-result-is-not-an-array-execute-returns-the-raw-driver-result */
  static get [Symbol.species]() {
    return Array;
  }

  readonly #native: pg.QueryResult;
  #typemap = new PGTypeMapByOid();

  readonly #error: DatabaseErrorFields | null;

  constructor(native: pg.QueryResult, error: DatabaseErrorFields | null = null) {
    super();
    this.#native = native;
    this.#error = error;
    const hashes = new ActiveRecordResult(
      (native.fields ?? []).map((f) => f.name),
      (native.rows ?? []) as unknown[][],
    ).toArray();
    for (const hash of hashes) this.push(hash);
  }

  mapTypesBang(typeMap: PGTypeMapByOid): this {
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

  override values(): unknown[][] & ArrayIterator<Record<string, unknown>> {
    return ((this.#native.rows ?? []) as unknown[][]).map((row, i) =>
      row.map((_, j) => this.#typecastResultValue(i, j)),
    ) as unknown[][] & ArrayIterator<Record<string, unknown>>;
  }

  set typeMap(typemap: PGTypeMapByOid) {
    this.#typemap = typemap;
    this.fields().forEach((name, j) => {
      this.forEach((tuple, i) => (tuple[name] = this.#typecastResultValue(i, j)));
    });
  }

  get typeMap(): PGTypeMapByOid {
    return this.#typemap;
  }

  #typecastResultValue(i: number, j: number): unknown {
    const value = (this.#native.rows as unknown[][])[i][j];
    const oid = this.#native.fields[j].dataTypeID;
    const decoder = this.#typemap.coders.get(oid) ?? this.#typemap.defaultTypeMap?.coders.get(oid);
    return typeof value !== "string" || !decoder ? value : decoder.decode(value);
  }
}
