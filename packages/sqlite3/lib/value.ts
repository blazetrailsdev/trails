import { SQLite3 } from "./namespaces.js";
import { Constants } from "./constants.js";

/** @noRailsEquivalent PERMANENT */
export interface ValueDriver<H = unknown> {
  valueBlob(handle: H): Uint8Array | null;
  valueBytes(handle: H): number;
  valueBytes16(handle: H): number;
  valueDouble(handle: H): number;
  valueInt(handle: H): number;
  valueInt64(handle: H): number | bigint;
  valueText(handle: H, utf16: boolean): string | null;
  valueType(handle: H): number;
}

export class Value<H = unknown> {
  readonly handle: H;
  #driver: ValueDriver<H>;

  constructor(db: { driver: ValueDriver<H> }, handle: H) {
    this.#driver = db.driver;
    this.handle = handle;
  }

  isNull(): boolean {
    return this.type() === "null";
  }

  toBlob(): Uint8Array | null {
    return this.#driver.valueBlob(this.handle);
  }

  length(utf16 = false): number {
    if (utf16) {
      return this.#driver.valueBytes16(this.handle);
    } else {
      return this.#driver.valueBytes(this.handle);
    }
  }

  toF(): number {
    return this.#driver.valueDouble(this.handle);
  }

  toI(): number {
    return this.#driver.valueInt(this.handle);
  }

  toInt64(): number | bigint {
    return this.#driver.valueInt64(this.handle);
  }

  toString(utf16 = false): string | null {
    return this.#driver.valueText(this.handle, utf16);
  }

  type(): "int" | "float" | "text" | "blob" | "null" | null {
    switch (this.#driver.valueType(this.handle)) {
      case Constants.ColumnType.INTEGER:
        return "int";
      case Constants.ColumnType.FLOAT:
        return "float";
      case Constants.ColumnType.TEXT:
        return "text";
      case Constants.ColumnType.BLOB:
        return "blob";
      case Constants.ColumnType.NULL:
        return "null";
      default:
        return null;
    }
  }
}

SQLite3.Value = Value;
