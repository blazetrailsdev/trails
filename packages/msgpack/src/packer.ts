import { Encoder, ExtData } from "@msgpack/msgpack";
import {
  ArgumentError,
  FrozenError,
  Hash,
  Module,
  NoMethodError,
  RangeError,
  rbFSend,
  rbInspect,
  rbObjClass,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";

export const MSGPACK_EXT_RECURSIVE = 0b0001;

export type PackerProc = (obj: never, packer?: Packer) => unknown;

export type PackerExtType = [number, PackerProc | null, number];

export type PackerExtRegistry = Map<unknown, PackerExtType>;

const encoder = new Encoder();
const floatEncoder = new Encoder({ forceIntegerToFloat: true });

export class Packer {
  /** @internal */
  readonly extRegistry: PackerExtRegistry = new Map();
  private readonly extRegistryCache: PackerExtRegistry = new Map();
  readonly buffer: Buffer;

  constructor(io: unknown = null, options: object | null = null) {
    if (options == null && io != null && rbObjIsKindOf(io, Hash)) {
      io = null;
    }
    this.buffer = new Buffer(io);
  }

  registerType(
    type: number,
    klass: unknown,
    methodName: string | null = null,
    block?: PackerProc,
  ): null {
    if (typeof klass !== "function" && !(klass instanceof Module)) {
      throw new ArgumentError(`expected Module/Class got: ${rbInspect(klass)}`);
    }
    if (block == null && methodName == null) {
      throw new NoMethodError("undefined method `to_proc' for nil", "to_proc");
    }
    return this.registerTypeInternal(
      type,
      klass,
      block || ((obj: unknown) => rbFSend(obj, methodName as string)),
    );
  }

  registeredTypes(): { type: number; class: unknown; packer: PackerProc | null }[] {
    const list: { type: number; class: unknown; packer: PackerProc | null }[] = [];

    for (const [klass, ary] of this.registeredTypesInternal()) {
      list.push({ type: ary[0], class: klass, packer: ary[1] });
    }

    return list.sort((a, b) => a.type - b.type);
  }

  isTypeRegistered(klassOrType: unknown): boolean {
    if (typeof klassOrType === "function") {
      const klass = klassOrType;
      return this.registeredTypes().some(
        (entry) => klass === entry.class || rbObjIsKindOf(klass.prototype, entry.class),
      );
    } else if (typeof klassOrType === "number") {
      const type = klassOrType;
      return this.registeredTypes().some((entry) => type === entry.type);
    } else {
      throw new ArgumentError("class or type id");
    }
  }

  write(v: unknown): this {
    if (v == null || typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
      this.buffer.write(encoder.encodeSharedRef(v));
    } else if (v instanceof Uint8Array) {
      if (v.constructor === Uint8Array || !this.tryWriteWithExtTypeLookup(v)) {
        this.buffer.write(encoder.encodeSharedRef(v));
      }
    } else if (Array.isArray(v)) {
      if (v.constructor === Array || !this.tryWriteWithExtTypeLookup(v)) {
        this.writeArrayHeader(v.length);
        for (const e of v) this.write(e);
      }
    } else if (rbObjIsKindOf(v, Hash)) {
      if (rbObjClass(v) === Hash || !this.tryWriteWithExtTypeLookup(v)) {
        const pairs =
          v instanceof Hash ? [...(v as Hash<unknown, unknown>)] : Object.entries(v as object);
        this.writeMapHeader(pairs.length);
        for (const [key, value] of pairs) {
          this.write(key);
          this.write(value);
        }
      }
    } else if (v instanceof Number) {
      this.buffer.write(floatEncoder.encodeSharedRef(v.valueOf()));
    } else if (typeof v === "bigint") {
      this.writeBignumValue(v);
    } else if (!this.tryWriteWithExtTypeLookup(v)) {
      rbFSend(v, "toMsgpack", this);
    }
    return this;
  }

  writeArrayHeader(n: number): this {
    if (n > 0xffffffff) {
      throw new RangeError(`integer ${n} too big to convert to \`unsigned int'`);
    }
    n = n >>> 0;
    if (n < 16) this.buffer.write(Uint8Array.of(0x90 | n));
    else if (n < 0x10000) this.buffer.write(Uint8Array.of(0xdc, n >> 8, n));
    else this.buffer.write(Uint8Array.of(0xdd, n >>> 24, n >> 16, n >> 8, n));
    return this;
  }

  writeMapHeader(n: number): this {
    if (n > 0xffffffff) {
      throw new RangeError(`integer ${n} too big to convert to \`unsigned int'`);
    }
    n = n >>> 0;
    if (n < 16) this.buffer.write(Uint8Array.of(0x80 | n));
    else if (n < 0x10000) this.buffer.write(Uint8Array.of(0xde, n >> 8, n));
    else this.buffer.write(Uint8Array.of(0xdf, n >>> 24, n >> 16, n >> 8, n));
    return this;
  }

  writeExt(type: number, payload: string | Uint8Array): this {
    if (type < -128 || type > 127) {
      throw new RangeError(`integer ${type} too big to convert to \`signed char'`);
    }
    if (typeof payload === "string") payload = new TextEncoder().encode(payload);
    this.buffer.write(encoder.encodeSharedRef(new ExtData(type, payload)));
    return this;
  }

  reset(): null {
    return this.buffer.clear();
  }

  toStr(): Uint8Array {
    return this.buffer.toStr();
  }

  toS(): Uint8Array {
    return this.toStr();
  }

  fullPack(): Uint8Array {
    const retval = this.buffer.toStr();
    this.buffer.clear();
    return retval;
  }

  private registeredTypesInternal(): PackerExtRegistry {
    return new Map(this.extRegistry);
  }

  private registerTypeInternal(type: number, klass: unknown, proc: PackerProc | null): null {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen MessagePack::Packer");
    }

    if (type < -128 || type > 127) {
      throw new RangeError(`integer ${type} too big to convert to \`signed char'`);
    }

    this.extRegistryCache.clear();
    this.extRegistry.set(klass, [type, proc, 0]);
    return null;
  }

  private writeBignumValue(v: bigint): void {
    if (Number.isSafeInteger(Number(v))) {
      this.write(Number(v));
      return;
    }
    const bytes = new Uint8Array(9);
    if (v > 0n) {
      if (v > 0xffff_ffff_ffff_ffffn) {
        throw new RangeError("bignum too big to convert into `unsigned long long'");
      }
      bytes[0] = 0xcf;
      new DataView(bytes.buffer).setBigUint64(1, v);
    } else {
      if (v < -0x8000_0000_0000_0000n) {
        throw new RangeError("bignum too big to convert into `long long'");
      }
      bytes[0] = 0xd3;
      new DataView(bytes.buffer).setBigInt64(1, v);
    }
    this.buffer.write(bytes);
  }

  private extRegistryFetch(lookupClass: unknown): PackerExtType | null {
    const type = this.extRegistry.get(lookupClass);
    if (type != null) return type;

    const typeInht = this.extRegistryCache.get(lookupClass);
    if (typeInht != null) return typeInht;

    return null;
  }

  private extFindSuperclass(instance: unknown): unknown {
    for (const key of this.extRegistry.keys()) {
      if (rbObjIsKindOf(instance, key)) return key;
    }
    return null;
  }

  private extRegistryLookup(instance: unknown): PackerExtType {
    const lookupClass = rbObjClass(instance);
    const type = this.extRegistryFetch(lookupClass);
    if (type?.[1] != null) return type;

    const superclass = this.extFindSuperclass(instance);
    if (superclass != null) {
      const superclassType = this.extRegistry.get(superclass)!;
      this.extRegistryCache.set(lookupClass, superclassType);
      return superclassType;
    }

    return [0, null, 0];
  }

  private tryWriteWithExtTypeLookup(v: unknown): boolean {
    const [extType, proc, extFlags] = this.extRegistryLookup(v);

    if (proc == null) {
      return false;
    }

    if (extFlags & MSGPACK_EXT_RECURSIVE) {
      const parentBuffer = this.buffer.chunks;
      this.buffer.chunks = [];

      let payload: Uint8Array;
      try {
        proc(v as never, this);
        payload = this.buffer.toStr();
      } finally {
        this.buffer.chunks = parentBuffer;
      }
      this.writeExt(extType, payload);
    } else {
      const payload = proc(v as never) as string | Uint8Array;
      this.writeExt(extType, payload);
    }

    return true;
  }
}
