import { ValueType } from "./value.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class BinaryType extends ValueType<unknown> {
  readonly name = "binary";

  type(): string {
    return this.name;
  }

  isBinary(): boolean {
    return true;
  }

  cast(value: unknown): unknown {
    if (value instanceof Data) {
      return value.bytes;
    } else {
      value = super.cast(value);
      if (!(value instanceof Uint8Array) && typeof value === "string") {
        value = textEncoder.encode(value);
      }
      return value;
    }
  }

  serialize(value: unknown): Data | null {
    if (value === null || value === undefined) return null;
    return new Data(super.serialize(value));
  }

  isChangedInPlace(rawOldValue: unknown, value: unknown): boolean {
    const oldValue = this.deserialize(rawOldValue);
    const cur = this.cast(value);
    if (oldValue instanceof Uint8Array && cur instanceof Uint8Array) {
      if (oldValue.length !== cur.length) return true;
      for (let i = 0; i < oldValue.length; i++) {
        if (oldValue[i] !== cur[i]) return true;
      }
      return false;
    }
    return oldValue !== cur;
  }
}

export class Data {
  readonly bytes: Uint8Array;

  constructor(value: unknown) {
    if (value instanceof Data) this.bytes = value.bytes;
    else if (value instanceof Uint8Array) this.bytes = value;
    else this.bytes = textEncoder.encode(String(value));
  }

  toString(): string {
    return textDecoder.decode(this.bytes);
  }

  hex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  equals(other: unknown): boolean {
    let otherBytes: Uint8Array;
    if (other instanceof Data) otherBytes = other.bytes;
    else if (other instanceof Uint8Array) otherBytes = other;
    else if (typeof other === "string") otherBytes = textEncoder.encode(other);
    else return false;

    if (this.bytes.length !== otherBytes.length) return false;
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i] !== otherBytes[i]) return false;
    }
    return true;
  }
}
