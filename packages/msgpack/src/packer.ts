import { Encoder, ExtData } from "@msgpack/msgpack";
import {
  ArgumentError,
  FrozenError,
  Hash,
  Module,
  NoMethodError,
  RangeError,
  TypeError,
  isSymbol,
  kernelFloat,
  rbAbsintSize,
  rbBuiltinClassName,
  rbCString,
  rbClassInheritedP,
  rbClassOf,
  rbFSend,
  rbInspect,
  isStruct,
  rbCNumeric,
  rbModConstSet,
  rbObjAsString,
  rbObjClass,
  rbObjIsKindOf,
  stringValue,
  symbolToS,
  type StructInstance,
} from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";
import { MessagePack } from "./namespaces.js";

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
  /** @internal */
  hasBigintExtType = false;
  readonly buffer: Buffer;

  constructor(io: unknown = null, options: object | null = null) {
    if (options == null && io != null && rbObjIsKindOf(io, Hash)) {
      options = io as object;
      io = null;
    }

    if (options != null && !rbObjIsKindOf(options, Hash)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(options)} (expected Hash)`);
    }

    this.buffer = new Buffer();
    this.buffer.setOptions(io, options);
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
      return this.registeredTypes().some((entry) => rbClassInheritedP(klass, entry.class));
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
      if (rbClassOf(v) === rbCString || !this.tryWriteWithExtTypeLookup(v)) {
        this.buffer.write(encoder.encodeSharedRef(v));
      }
    } else if (Array.isArray(v)) {
      if (rbClassOf(v) === Array || !this.tryWriteWithExtTypeLookup(v)) {
        this.writeArrayValue(v);
      }
    } else if (rbObjIsKindOf(v, Hash)) {
      if (rbClassOf(v) === Hash || !this.tryWriteWithExtTypeLookup(v)) {
        this.writeHashValue(v);
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

  pack(v: unknown): this {
    return this.write(v);
  }

  writeNil(): this {
    this.buffer.write(Uint8Array.of(0xc0));
    return this;
  }

  writeTrue(): this {
    this.buffer.write(Uint8Array.of(0xc3));
    return this;
  }

  writeFalse(): this {
    this.buffer.write(Uint8Array.of(0xc2));
    return this;
  }

  writeFloat(obj: unknown): this {
    let d: number;
    if (typeof obj === "number" || typeof obj === "bigint" || obj instanceof Number) {
      d = Number(obj);
    } else if (obj == null || typeof obj === "boolean") {
      throw new TypeError(`no implicit conversion to float from ${obj == null ? "nil" : obj}`);
    } else if (typeof obj === "string" || obj instanceof Uint8Array) {
      throw new TypeError("no implicit conversion to float from string");
    } else {
      d = kernelFloat(obj);
    }
    this.buffer.write(floatEncoder.encodeSharedRef(d));
    return this;
  }

  writeString(obj: unknown): this {
    if (typeof obj !== "string" && !(obj instanceof Uint8Array)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected String)`);
    }
    this.buffer.write(encoder.encodeSharedRef(obj));
    return this;
  }

  writeBin(obj: unknown): this {
    if (typeof obj !== "string" && !(obj instanceof Uint8Array)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected String)`);
    }

    if (typeof obj === "string") obj = new TextEncoder().encode(obj);

    this.buffer.write(encoder.encodeSharedRef(obj));
    return this;
  }

  writeArray(obj: unknown): this {
    if (!Array.isArray(obj)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected Array)`);
    }
    this.writeArrayValue(obj);
    return this;
  }

  writeHash(obj: unknown): this {
    if (!rbObjIsKindOf(obj, Hash)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected Hash)`);
    }
    this.writeHashValue(obj);
    return this;
  }

  writeSymbol(obj: unknown): this {
    if (!isSymbol(obj)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected Symbol)`);
    }
    this.buffer.write(encoder.encodeSharedRef(symbolToS(obj)));
    return this;
  }

  writeInt(obj: unknown): this {
    if (Number.isSafeInteger(obj)) {
      this.buffer.write(encoder.encodeSharedRef(obj));
    } else {
      if (typeof obj !== "bigint" && !(typeof obj === "number" && Number.isInteger(obj))) {
        throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected Integer)`);
      }
      this.writeBignumValue(BigInt(obj));
    }
    return this;
  }

  writeExtension(obj: unknown): this {
    if (!isStruct(obj)) {
      throw new TypeError(`wrong argument type ${rbBuiltinClassName(obj)} (expected Struct)`);
    }
    const struct = obj as StructInstance & Record<string, unknown>;

    const rbExtType = struct[struct.members()[0]];
    if (typeof rbExtType !== "number" || !Number.isSafeInteger(rbExtType)) {
      throw new RangeError(
        `integer ${rbObjAsString(rbExtType)} too big to convert to \`signed char'`,
      );
    }

    const extType = rbExtType;
    if (extType < -128 || extType > 127) {
      throw new RangeError(`integer ${extType} too big to convert to \`signed char'`);
    }
    let payload = struct[struct.members()[1]] as string | Uint8Array;
    if (!(payload instanceof Uint8Array)) payload = stringValue(payload);
    this.writeExt(extType, payload);

    return this;
  }

  writeArrayHeader(n: number): this {
    if (n > 0xffffffff || n < -0x80000000) {
      throw new RangeError(
        `integer ${n} too ${n < 0 ? "small" : "big"} to convert to \`unsigned int'`,
      );
    }
    n = n >>> 0;
    if (n < 16) this.buffer.write(Uint8Array.of(0x90 | n));
    else if (n < 0x10000) this.buffer.write(Uint8Array.of(0xdc, n >> 8, n));
    else this.buffer.write(Uint8Array.of(0xdd, n >>> 24, n >> 16, n >> 8, n));
    return this;
  }

  writeMapHeader(n: number): this {
    if (n > 0xffffffff || n < -0x80000000) {
      throw new RangeError(
        `integer ${n} too ${n < 0 ? "small" : "big"} to convert to \`unsigned int'`,
      );
    }
    n = n >>> 0;
    if (n < 16) this.buffer.write(Uint8Array.of(0x80 | n));
    else if (n < 0x10000) this.buffer.write(Uint8Array.of(0xde, n >> 8, n));
    else this.buffer.write(Uint8Array.of(0xdf, n >>> 24, n >> 16, n >> 8, n));
    return this;
  }

  writeBinHeader(n: number): this {
    if (n > 0xffffffff || n < -0x80000000) {
      throw new RangeError(
        `integer ${n} too ${n < 0 ? "small" : "big"} to convert to \`unsigned int'`,
      );
    }
    n = n >>> 0;
    if (n < 256) this.buffer.write(Uint8Array.of(0xc4, n));
    else if (n < 65536) this.buffer.write(Uint8Array.of(0xc5, n >> 8, n));
    else this.buffer.write(Uint8Array.of(0xc6, n >>> 24, n >> 16, n >> 8, n));
    return this;
  }

  writeFloat32(numeric: unknown): this {
    if (!rbObjIsKindOf(numeric, rbCNumeric)) {
      throw new ArgumentError("Expected numeric");
    }

    const bytes = new Uint8Array(5);
    bytes[0] = 0xca;
    new DataView(bytes.buffer).setFloat32(1, Number(numeric));
    this.buffer.write(bytes);
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

  flush(): this {
    this.buffer.flush();
    return this;
  }

  reset(): null {
    return this.buffer.clear();
  }

  clear(): null {
    return this.reset();
  }

  size(): number {
    return this.buffer.size();
  }

  isEmpty(): boolean {
    return this.buffer.size() === 0;
  }

  toStr(): Uint8Array {
    return this.buffer.toStr();
  }

  toS(): Uint8Array {
    return this.toStr();
  }

  toA(): Uint8Array[] {
    return this.buffer.toA();
  }

  writeTo(io: unknown): number {
    return this.buffer.flushToIo(io, "write", true);
  }

  fullPack(): Uint8Array | null {
    let retval: Uint8Array | null;

    if (this.buffer.io != null) {
      this.buffer.flush();
      retval = null;
    } else {
      retval = this.buffer.toStr();
    }

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

  private writeArrayValue(v: unknown[]): void {
    this.writeArrayHeader(v.length);
    for (const e of v) this.write(e);
  }

  private writeHashValue(v: unknown): void {
    const pairs =
      v instanceof Hash ? [...(v as Hash<unknown, unknown>)] : Object.entries(v as object);
    this.writeMapHeader(pairs.length);
    for (const [key, value] of pairs) {
      this.write(key);
      this.write(value);
    }
  }

  private writeBignumValue(v: bigint): void {
    if (Number.isSafeInteger(Number(v))) {
      this.write(Number(v));
      return;
    }
    const [size, leadingZeroBits] = rbAbsintSize(v);
    let requiredSize = size;
    const bytes = new Uint8Array(9);

    if (v > 0n) {
      if (requiredSize > 8 && this.hasBigintExtType) {
        if (this.tryWriteWithExtTypeLookup(v)) {
          return;
        }
      }

      if (v > 0xffff_ffff_ffff_ffffn) {
        throw new RangeError("bignum too big to convert into `unsigned long long'");
      }
      bytes[0] = 0xcf;
      new DataView(bytes.buffer).setBigUint64(1, v);
    } else {
      if (leadingZeroBits === 0) {
        requiredSize += 1;
      }

      if (requiredSize > 8 && this.hasBigintExtType) {
        if (this.tryWriteWithExtTypeLookup(v)) {
          return;
        }
      }

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

  private extFindSuperclass(lookupClass: unknown): unknown {
    for (const key of this.extRegistry.keys()) {
      if (rbClassInheritedP(lookupClass, key) === true) return key;
    }
    return null;
  }

  private extRegistryLookup(instance: unknown): PackerExtType {
    const lookupClass = rbClassOf(instance);
    let type = this.extRegistryFetch(lookupClass);
    if (type?.[1] != null) {
      return type;
    }

    const realClass = rbObjClass(instance);
    if (lookupClass !== realClass) {
      type = this.extRegistryFetch(realClass);
      if (type?.[1] != null) {
        return type;
      }
    }

    const superclass = this.extFindSuperclass(lookupClass);
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

rbModConstSet(MessagePack, "Packer", Packer);
