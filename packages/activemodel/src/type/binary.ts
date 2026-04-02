import { Type } from "./value.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class BinaryType extends Type<Uint8Array> {
  readonly name = "binary";

  cast(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Data) return value.bytes;
    if (value instanceof Uint8Array) return value;
    return textEncoder.encode(String(value));
  }

  serialize(value: unknown): Uint8Array | null {
    return this.cast(value);
  }

  deserialize(value: unknown): Uint8Array | null {
    if (value instanceof Data) return value.bytes;
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  isBinary(): boolean {
    return true;
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
}

export class Data {
  readonly bytes: Uint8Array;

  constructor(value: string | Uint8Array) {
    this.bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  }

  toString(): string {
    return textDecoder.decode(this.bytes);
  }

  byteSize(): number {
    return this.bytes.length;
  }

  hex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
