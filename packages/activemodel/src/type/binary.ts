import { ValueType } from "./value.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class BinaryType extends ValueType<Uint8Array> {
  readonly name = "binary";

  type(): string {
    return this.name;
  }

  isBinary(): boolean {
    return true;
  }

  cast(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Data) return value.bytes;
    if (value instanceof Uint8Array) return value;
    return textEncoder.encode(String(value));
  }

  serialize(value: unknown): Uint8Array | null {
    return this.cast(value);
  }

  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const old = this.deserialize(rawOldValue);
    const cur = this.serialize(newValue);
    if (old === null && cur === null) return false;
    if (old === null || cur === null) return true;
    if (old.length !== (cur as Uint8Array).length) return true;
    for (let i = 0; i < old.length; i++) {
      if (old[i] !== (cur as Uint8Array)[i]) return true;
    }
    return false;
  }

  deserialize(value: unknown): Uint8Array | null {
    if (value instanceof Data) return value.bytes;
    return this.cast(value);
  }
}

export class Data {
  readonly bytes: Uint8Array;

  constructor(value: string | Uint8Array) {
    this.bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  }

  toString(): string {
    return textDecoder.decode(this.bytes);
  }

  hex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  byteSize(): number {
    return this.bytes.length;
  }
}
