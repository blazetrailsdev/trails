import { ArgumentError } from "@blazetrails/ruby-compat";
import type pg from "pg";
import { PGTypeMapByOid } from "../connection-adapters/postgresql/pg-text-decoder.js";
import { Result as ActiveRecordResult } from "../result.js";

export class Result extends Array<Record<string, unknown>> {
  /** @noRailsEquivalent CONVERGEABLE pg-result-is-not-an-array-execute-returns-the-raw-driver-result */
  static get [Symbol.species]() {
    return Array;
  }

  readonly #native: pg.QueryResult;
  #typemap = new PGTypeMapByOid();

  constructor(native: pg.QueryResult) {
    super();
    this.#native = native;
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
