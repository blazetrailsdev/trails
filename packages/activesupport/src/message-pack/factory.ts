/**
 * MessagePack packer/unpacker with extension-type support.
 *
 * Mirrors the slice of the `msgpack` gem's `MessagePack::Factory` that
 * `ActiveSupport::MessagePack` relies on: `register_type` plus packer/unpacker
 * objects that understand the ext format. Base scalars (nil/bool/int/float/
 * str/bin/array/map) are byte-compatible with MRI; registered types serialize
 * as msgpack ext (`fixext`/`ext8`/`ext16`/`ext32`) carrying a 0..127 type id.
 *
 * `recursive` types pack their parts through a child packer so the ext payload
 * is itself a packed stream (e.g. Time's tv_sec/tv_nsec/utc_offset); plain
 * types map a JS value straight to/from the raw ext payload bytes.
 *
 * No third-party deps; `Buffer` is a runtime global, not a `node:*` import.
 */

export class MessagePackError extends Error {}

/** @internal A plain hash (literal or null-prototype) vs. a tagged class instance. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}

/** A type registered with the factory, matched during packing by `match`. */
export interface RegisteredType {
  type: number;
  match: (value: unknown) => boolean;
  recursive: boolean;
  /** Non-recursive: return the raw ext payload. Recursive: write parts to `packer`. */
  packer: (value: unknown, packer: Packer) => Buffer | void;
  /** Non-recursive: receive the raw payload Buffer. Recursive: read parts from `unpacker`. */
  unpacker: (source: Buffer | Unpacker) => unknown;
}

export class Factory {
  private types: RegisteredType[] = [];

  registerType(type: RegisteredType): void {
    this.types.push(type);
  }

  typeFor(value: unknown): RegisteredType | undefined {
    return this.types.find((t) => t.match(value));
  }

  typeById(id: number): RegisteredType | undefined {
    return this.types.find((t) => t.type === id);
  }

  packer(): Packer {
    return new Packer(this);
  }

  unpacker(buf: Buffer): Unpacker {
    return new Unpacker(buf, this);
  }
}

export class Packer {
  private out: number[] = [];

  constructor(private factory: Factory) {}

  toBuffer(): Buffer {
    return Buffer.from(this.out);
  }

  write(value: unknown): void {
    if (value === null || value === undefined) return void this.out.push(0xc0);
    if (typeof value === "boolean") return void this.out.push(value ? 0xc3 : 0xc2);
    if (Buffer.isBuffer(value)) return this.writeBin(value);
    if (typeof value === "string") return this.writeStr(value);
    if (typeof value === "number") return this.writeNumber(value);
    if (Array.isArray(value)) return this.writeArray(value);

    // Plain hashes map to native msgpack maps; only tagged values (Symbol) and
    // class instances dispatch to registered ext types — matching msgpack's
    // class-based lookup, where Hash is native and Object (127) is the catch-all.
    if (typeof value === "object" && isPlainObject(value)) {
      return this.writeMap(value as Record<string, unknown>);
    }
    const registered = this.factory.typeFor(value);
    if (registered) return this.writeExt(registered, value);
    throw new MessagePackError(`Cannot encode value of type ${typeof value}`);
  }

  /** @internal */
  private pushSized(tag: number, value: number, n: number): void {
    this.out.push(tag);
    for (let shift = (n - 1) * 8; shift >= 0; shift -= 8) this.out.push((value >>> shift) & 0xff);
  }

  /** @internal */
  private writeStr(str: string): void {
    const bytes = Buffer.from(str, "utf-8");
    const len = bytes.length;
    if (len < 32) this.out.push(0xa0 | len);
    else if (len < 0x100) this.pushSized(0xd9, len, 1);
    else if (len < 0x10000) this.pushSized(0xda, len, 2);
    else this.pushSized(0xdb, len, 4);
    for (const b of bytes) this.out.push(b);
  }

  /** @internal */
  private writeBin(buf: Buffer): void {
    const len = buf.length;
    if (len < 0x100) this.pushSized(0xc4, len, 1);
    else if (len < 0x10000) this.pushSized(0xc5, len, 2);
    else this.pushSized(0xc6, len, 4);
    for (const b of buf) this.out.push(b);
  }

  /** @internal */
  private writeNumber(n: number): void {
    if (!Number.isInteger(n)) {
      this.out.push(0xcb);
      const buf = Buffer.alloc(8);
      buf.writeDoubleBE(n);
      for (const b of buf) this.out.push(b);
      return;
    }
    // pushSized only emits up to a 32-bit field; `>>>` would silently truncate
    // anything wider. Rails routes oversized integers through the Integer ext
    // type (1, the bigint extension) before reaching a native uint/int — until
    // that type is ported, refuse rather than corrupt. (64-bit native + bigint
    // land in activesupport-messagepack-native-extension-types.)
    if (n > 0xffffffff || n < -0x80000000) {
      throw new MessagePackError(`Integer ${n} is out of the supported MessagePack range`);
    }
    if (n >= 0) {
      if (n < 0x80) this.out.push(n);
      else if (n < 0x100) this.pushSized(0xcc, n, 1);
      else if (n < 0x10000) this.pushSized(0xcd, n, 2);
      else this.pushSized(0xce, n, 4);
    } else if (n >= -32) this.out.push(0xe0 | (n + 32));
    else if (n >= -0x80) this.pushSized(0xd0, n & 0xff, 1);
    else if (n >= -0x8000) this.pushSized(0xd1, n & 0xffff, 2);
    else this.pushSized(0xd2, n >>> 0, 4);
  }

  /** @internal */
  private writeArray(arr: unknown[]): void {
    const len = arr.length;
    if (len < 16) this.out.push(0x90 | len);
    else if (len < 0x10000) this.pushSized(0xdc, len, 2);
    else this.pushSized(0xdd, len, 4);
    for (const item of arr) this.write(item);
  }

  /** @internal */
  private writeMap(obj: Record<string, unknown>): void {
    const entries = Object.entries(obj);
    const len = entries.length;
    if (len < 16) this.out.push(0x80 | len);
    else if (len < 0x10000) this.pushSized(0xde, len, 2);
    else this.pushSized(0xdf, len, 4);
    for (const [key, value] of entries) {
      this.writeStr(key);
      this.write(value);
    }
  }

  /** @internal */
  private writeExt(registered: RegisteredType, value: unknown): void {
    let payload: Buffer;
    if (registered.recursive) {
      const child = new Packer(this.factory);
      registered.packer(value, child);
      payload = child.toBuffer();
    } else {
      payload = registered.packer(value, this) as Buffer;
    }
    const len = payload.length;
    if (len === 1) this.out.push(0xd4);
    else if (len === 2) this.out.push(0xd5);
    else if (len === 4) this.out.push(0xd6);
    else if (len === 8) this.out.push(0xd7);
    else if (len === 16) this.out.push(0xd8);
    else if (len < 0x100) this.pushSized(0xc7, len, 1);
    else if (len < 0x10000) this.pushSized(0xc8, len, 2);
    else this.pushSized(0xc9, len, 4);
    this.out.push(registered.type);
    for (const b of payload) this.out.push(b);
  }
}

export class Unpacker {
  private pos = 0;

  constructor(
    private buf: Buffer,
    private factory: Factory,
  ) {}

  /** @internal */
  private readUint(n: number): number {
    if (this.pos + n > this.buf.length)
      throw new MessagePackError("Unexpected end of MessagePack data");
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + this.buf[this.pos++];
    return v;
  }

  /** @internal */
  private readInt(n: number): number {
    const u = this.readUint(n);
    const bits = n * 8;
    return u >= 2 ** (bits - 1) ? u - 2 ** bits : u;
  }

  /** @internal */
  private readBytes(len: number): Buffer {
    if (this.pos + len > this.buf.length)
      throw new MessagePackError("Unexpected end of MessagePack data");
    const b = Buffer.from(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return b;
  }

  read(): unknown {
    const tag = this.readUint(1);
    if (tag < 0x80) return tag;
    if (tag >= 0xe0) return tag - 0x100;
    if (tag <= 0x8f) return this.readMap(tag & 0x0f);
    if (tag <= 0x9f) return this.readArray(tag & 0x0f);
    if (tag <= 0xbf) return this.readBytes(tag & 0x1f).toString("utf-8");

    switch (tag) {
      case 0xc0:
        return null;
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xc4:
        return this.readBytes(this.readUint(1));
      case 0xc5:
        return this.readBytes(this.readUint(2));
      case 0xc6:
        return this.readBytes(this.readUint(4));
      case 0xc7:
        return this.readExt(this.readUint(1));
      case 0xc8:
        return this.readExt(this.readUint(2));
      case 0xc9:
        return this.readExt(this.readUint(4));
      case 0xcb: {
        const v = this.buf.readDoubleBE(this.pos);
        this.pos += 8;
        return v;
      }
      case 0xcc:
        return this.readUint(1);
      case 0xcd:
        return this.readUint(2);
      case 0xce:
        return this.readUint(4);
      case 0xd0:
        return this.readInt(1);
      case 0xd1:
        return this.readInt(2);
      case 0xd2:
        return this.readInt(4);
      case 0xd4:
        return this.readExt(1);
      case 0xd5:
        return this.readExt(2);
      case 0xd6:
        return this.readExt(4);
      case 0xd7:
        return this.readExt(8);
      case 0xd8:
        return this.readExt(16);
      case 0xd9:
        return this.readBytes(this.readUint(1)).toString("utf-8");
      case 0xda:
        return this.readBytes(this.readUint(2)).toString("utf-8");
      case 0xdb:
        return this.readBytes(this.readUint(4)).toString("utf-8");
      case 0xdc:
        return this.readArray(this.readUint(2));
      case 0xdd:
        return this.readArray(this.readUint(4));
      case 0xde:
        return this.readMap(this.readUint(2));
      case 0xdf:
        return this.readMap(this.readUint(4));
      default:
        throw new MessagePackError(`Unsupported MessagePack tag 0x${tag.toString(16)}`);
    }
  }

  /** @internal */
  private readArray(size: number): unknown[] {
    const arr: unknown[] = [];
    for (let i = 0; i < size; i++) arr.push(this.read());
    return arr;
  }

  /** @internal */
  private readMap(size: number): Record<string, unknown> {
    const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (let i = 0; i < size; i++) {
      const key = this.read();
      if (typeof key !== "string")
        throw new MessagePackError("MessagePack map keys must be strings");
      obj[key] = this.read();
    }
    return obj;
  }

  /** @internal */
  private readExt(len: number): unknown {
    const type = this.readUint(1);
    const payload = this.readBytes(len);
    const registered = this.factory.typeById(type);
    if (!registered) throw new MessagePackError(`Unregistered MessagePack ext type ${type}`);
    return registered.recursive
      ? registered.unpacker(new Unpacker(payload, this.factory))
      : registered.unpacker(payload);
  }
}
