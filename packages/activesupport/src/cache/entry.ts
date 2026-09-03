import { deflate, inflate } from "../gzip.js";
import { DeserializationError } from "./deserialization-error.js";
import { coder } from "./coder.js";

/** @internal */
export class Entry {
  protected _value: unknown;
  readonly version: string | null;
  private _createdAt: number;
  private _expiresIn: number | null;
  private _compressed: boolean;
  private _bytesize?: number;

  static unpack(members: unknown[]): Entry {
    return new Entry(members.length > 0 ? members[0] : null, {
      expiresAt: (members[1] as number | null) ?? null,
      version: (members[2] as string | null) ?? null,
    });
  }

  constructor(
    value: unknown,
    options: {
      compressed?: boolean;
      version?: string | null;
      expiresIn?: number | null;
      expiresAt?: number | null;
    } = {},
  ) {
    this._value = value;
    this.version = options.version ?? null;
    this._createdAt = 0;
    if (options.expiresAt != null) {
      this._expiresIn = options.expiresAt - this._createdAt;
    } else if (options.expiresIn != null) {
      this._expiresIn = options.expiresIn * 1000 + Date.now();
    } else {
      this._expiresIn = null;
    }
    this._compressed = options.compressed === true;
  }

  get value(): unknown {
    return this.isCompressed() ? this.uncompress(this._value as string) : this._value;
  }

  get expiresAt(): number | null {
    return this._expiresIn != null ? this._createdAt + this._expiresIn : null;
  }

  set expiresAt(value: number | null) {
    this._expiresIn = value != null ? value - this._createdAt : null;
  }

  isExpired(): boolean {
    return this._expiresIn != null && this._createdAt + this._expiresIn <= Date.now();
  }

  isMismatched(version: string | null | undefined): boolean {
    return !!(this.version && version && this.version !== version);
  }

  isCompressed(): boolean {
    return this._compressed;
  }

  bytesize(): number {
    const value = this.value;
    if (value == null) {
      return 0;
    } else if (typeof value === "string") {
      return this._compressed ? (this._value as string).length : byteLength(this._value as string);
    } else {
      return (this._bytesize ??= this._compressed
        ? marshalStringBytesize((this._value as string).length)
        : byteLength(coder.dump(this._value)));
    }
  }

  isLocal(): boolean {
    return false;
  }

  dupValueBang(): void {
    if (
      this._value != null &&
      !this.isCompressed() &&
      !(typeof this._value === "number" || typeof this._value === "boolean")
    ) {
      if (typeof this._value !== "string") {
        this._value = coder.load(coder.dump(this._value));
      }
    }
  }

  pack(): unknown[] {
    const members: unknown[] = [this.value, this.expiresAt, this.version];
    while (members.length > 0 && members[members.length - 1] === null) {
      members.pop();
    }
    return members;
  }

  compressed(compressThreshold: number): Entry {
    if (this._compressed) return this;

    let serialized: string | undefined;
    let uncompressedSize: number;
    if (
      this._value == null ||
      typeof this._value === "boolean" ||
      typeof this._value === "number"
    ) {
      uncompressedSize = 0;
    } else if (typeof this._value === "string") {
      uncompressedSize = byteLength(this._value);
    } else {
      serialized = coder.dump(this._value);
      uncompressedSize = byteLength(serialized);
    }

    if (uncompressedSize >= compressThreshold) {
      serialized ??= coder.dump(this._value);
      const compressed = deflate(serialized);
      if (compressed.length < uncompressedSize) {
        return new Entry(compressed, {
          compressed: true,
          expiresAt: this.expiresAt,
          version: this.version,
        });
      }
    }
    return this;
  }

  private uncompress(value: string): unknown {
    return this.marshalLoad(inflate(value));
  }

  private marshalLoad(payload: string): unknown {
    try {
      return coder.load(payload);
    } catch (error) {
      throw new DeserializationError(error instanceof Error ? error.message : String(error));
    }
  }
}

function marshalStringBytesize(byteLen: number): number {
  return 2 + 1 + marshalUintSize(byteLen) + byteLen;
}

function marshalUintSize(n: number): number {
  if (n <= 122) return 1;
  let count = 0;
  for (let v = n; v > 0; v = Math.floor(v / 256)) count++;
  return 1 + count;
}

function byteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
