import {
  ArgumentError,
  EOFError,
  FrozenError,
  Hash,
  defineModule,
  include,
  RangeError,
  StandardError,
  rbDbl2num,
  rbObjMethod,
  rbObjClass,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";
import { ExtensionValue } from "./extension-value.js";
import { MessagePack } from "./namespaces.js";
import { fromMsgpackExt } from "./symbol.js";
import { MSGPACK_EXT_RECURSIVE } from "./packer.js";

export class UnpackError extends StandardError {}

export class MalformedFormatError extends UnpackError {}

export class StackError extends UnpackError {}

export const TypeError = defineModule({});

export class UnexpectedTypeError extends UnpackError {}
include(UnexpectedTypeError, TypeError);

export class UnknownExtTypeError extends UnpackError {}

export type UnpackerProc = (data: never) => unknown;

export type UnpackerExtRegistry = Map<number, [unknown, UnpackerProc | null, number]>;

const PRIMITIVE_CONTAINER_START = 1;
const PRIMITIVE_OBJECT_COMPLETE = 0;
const PRIMITIVE_EOF = -1;
const PRIMITIVE_INVALID_BYTE = -2;
const PRIMITIVE_STACK_TOO_DEEP = -3;
const PRIMITIVE_UNEXPECTED_TYPE = -4;
const PRIMITIVE_UNEXPECTED_EXT_TYPE = -5;
const PRIMITIVE_RECURSIVE_RAISED = -6;

const MSGPACK_UNPACKER_STACK_CAPACITY = 128;
const HEAD_BYTE_REQUIRED = 0xc1;
const RAW_TYPE_STRING = 256;
const RAW_TYPE_BINARY = 257;

const STACK_TYPE_ARRAY = 0;
const STACK_TYPE_MAP_KEY = 1;
const STACK_TYPE_MAP_VALUE = 2;
const STACK_TYPE_RECURSIVE = 3;

interface StackEntry {
  count: number;
  type: number;
  object: unknown;
  key: unknown;
  keySymbol: boolean;
}

const utf8 = new TextDecoder("utf-8");

/** @noRailsEquivalent PERMANENT */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0].slice();
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** @noRailsEquivalent PERMANENT */
function rbIntegerFromBigint(n: bigint): number | bigint {
  return Number.isSafeInteger(Number(n)) ? Number(n) : n;
}

/** @noRailsEquivalent PERMANENT */
function rbHashAset(hash: object, key: unknown, value: unknown): object {
  if (hash instanceof Hash) {
    hash.set(key, value);
    return hash;
  }
  if (typeof key === "string" && key !== "__proto__") {
    (hash as Record<string, unknown>)[key] = value;
    return hash;
  }
  const converted = new Hash<unknown, unknown>();
  for (const [k, v] of Object.entries(hash)) converted.set(k, v);
  converted.set(key, value);
  return converted;
}

export class Unpacker {
  /** @internal */
  readonly extRegistry: UnpackerExtRegistry = new Map();
  /** @internal */
  optimizedSymbolExtType = false;
  /** @internal */
  symbolExtType = 0;
  readonly buffer: Buffer;
  private symbolizeKeys = false;
  private freeze = false;
  private allowUnknownExt = false;
  private readonly uk: {
    lastObject: unknown;
    lastObjectSymbol: boolean;
    headByte: number;
    stack: StackEntry[] | null;
    readingRaw: Uint8Array[] | null;
    readingRawRemaining: number;
    readingRawType: number;
  } = {
    lastObject: null,
    lastObjectSymbol: false,
    headByte: HEAD_BYTE_REQUIRED,
    stack: null,
    readingRaw: null,
    readingRawRemaining: 0,
    readingRawType: 0,
  };

  constructor(io: unknown = null, options: object | null = null) {
    if (options == null && io != null && rbObjIsKindOf(io, Hash)) {
      options = io as object;
      io = null;
    } else if (options != null && !rbObjIsKindOf(options, Hash)) {
      throw new ArgumentError(`expected Hash but found ${rbObjClass(options).name}.`);
    }
    this.buffer = new Buffer();
    this.buffer.setOptions(io, options);

    if (options != null) {
      const { symbolizeKeys, freeze, allowUnknownExt } = options as Record<string, unknown>;
      this.symbolizeKeys = symbolizeKeys != null && symbolizeKeys !== false;
      this.freeze = freeze != null && freeze !== false;
      this.allowUnknownExt = allowUnknownExt != null && allowUnknownExt !== false;
    }
  }

  isSymbolizeKeys(): boolean {
    return this.symbolizeKeys ? true : false;
  }

  isFreeze(): boolean {
    return this.freeze ? true : false;
  }

  isAllowUnknownExt(): boolean {
    return this.allowUnknownExt ? true : false;
  }

  registerType(
    type: number,
    klass: unknown = null,
    methodName: string | null = null,
    block?: UnpackerProc,
  ): null {
    if (klass != null && methodName != null) {
      const method = rbObjMethod(klass, methodName);
      block = (data: unknown) => method.call(data);
    } else if (block == null) {
      throw new ArgumentError("register_type takes either 3 arguments or a block");
    }
    return this.registerTypeInternal(type, klass, block);
  }

  registeredTypes(): { type: number; class: unknown; unpacker: UnpackerProc | null }[] {
    const list: { type: number; class: unknown; unpacker: UnpackerProc | null }[] = [];

    for (const [type, ary] of this.registeredTypesInternal()) {
      list.push({ type: type, class: ary[0], unpacker: ary[1] });
    }

    return list.sort((a, b) => a.type - b.type);
  }

  isTypeRegistered(klassOrType: unknown): boolean {
    if (typeof klassOrType === "function") {
      const klass = klassOrType;
      return this.registeredTypes().some((entry) => klass === entry.class);
    } else if (typeof klassOrType === "number") {
      const type = klassOrType;
      return this.registeredTypes().some((entry) => type === entry.type);
    } else {
      throw new ArgumentError("class or type id");
    }
  }

  feedReference(data: string | Uint8Array): this {
    this.buffer.write(data);
    return this;
  }

  feed(data: string | Uint8Array): this {
    return this.feedReference(data);
  }

  read(): unknown {
    const r = this.msgpackUnpackerRead(0);
    if (r < 0) {
      this.raiseUnpackerError(r);
    }

    return this.uk.lastObject;
  }

  skip(): null {
    const r = this.msgpackUnpackerSkip(0);
    if (r < 0) {
      this.raiseUnpackerError(r);
    }

    return null;
  }

  unpack(): unknown {
    return this.read();
  }

  skipNil(): boolean {
    const r = this.msgpackUnpackerSkipNil();
    if (r < 0) {
      this.raiseUnpackerError(r);
    }

    if (r) {
      return true;
    }
    return false;
  }

  readArrayHeader(): number {
    const size = this.msgpackUnpackerReadArrayHeader();
    if (size < 0) {
      this.raiseUnpackerError(size);
    }

    return size;
  }

  readMapHeader(): number {
    const size = this.msgpackUnpackerReadMapHeader();
    if (size < 0) {
      this.raiseUnpackerError(size);
    }

    return size;
  }

  each(): Generator<unknown, void>;
  each(block: (v: unknown) => void): null;
  each(block?: (v: unknown) => void): null | Generator<unknown, void> {
    if (block === undefined) {
      return this.enumFor();
    }
    if (this.buffer.io != null) {
      try {
        return this.eachImpl(block);
      } catch (error) {
        if (!(error instanceof EOFError)) throw error;
        return null;
      }
    } else {
      return this.eachImpl(block);
    }
  }

  feedEach(data: string | Uint8Array): Generator<unknown, void>;
  feedEach(data: string | Uint8Array, block: (v: unknown) => void): null;
  feedEach(
    data: string | Uint8Array,
    block?: (v: unknown) => void,
  ): null | Generator<unknown, void> {
    if (block === undefined) {
      return this.enumFor(data);
    }
    this.feedReference(data);
    return this.each(block);
  }

  fullUnpack(): unknown {
    const obj = this.read();

    const extra = this.buffer.size();
    if (extra > 0) {
      throw new MalformedFormatError(`${extra} extra bytes after the deserialized object`);
    }

    return obj;
  }

  reset(): null {
    this.buffer.clear();

    this.uk.headByte = HEAD_BYTE_REQUIRED;

    if (this.uk.stack != null) this.uk.stack.length = 0;
    this.uk.lastObject = null;
    this.uk.lastObjectSymbol = false;
    this.uk.readingRaw = null;
    this.uk.readingRawRemaining = 0;
    return null;
  }

  private *enumFor(data?: string | Uint8Array): Generator<unknown, void> {
    if (data !== undefined) this.feedReference(data);
    try {
      while (true) {
        const r = this.msgpackUnpackerRead(0);
        if (r < 0) {
          if (r === PRIMITIVE_EOF) return;
          this.raiseUnpackerError(r);
        }
        yield this.uk.lastObject;
      }
    } catch (error) {
      if (this.buffer.io == null || !(error instanceof EOFError)) throw error;
    }
  }

  private eachImpl(block: (v: unknown) => void): null {
    while (true) {
      const r = this.msgpackUnpackerRead(0);
      if (r < 0) {
        if (r === PRIMITIVE_EOF) {
          return null;
        }
        this.raiseUnpackerError(r);
      }
      const v = this.uk.lastObject;
      block(v);
    }
  }

  private raiseUnpackerError(r: number): never {
    if (this.uk.stack != null) this.uk.stack.length = 0;
    switch (r) {
      case PRIMITIVE_EOF:
        throw new EOFError("end of buffer reached");
      case PRIMITIVE_INVALID_BYTE:
        throw new MalformedFormatError("invalid byte");
      case PRIMITIVE_STACK_TOO_DEEP:
        throw new StackError("stack level too deep");
      case PRIMITIVE_UNEXPECTED_TYPE:
        throw new UnexpectedTypeError("unexpected type");
      case PRIMITIVE_UNEXPECTED_EXT_TYPE:
        throw new UnknownExtTypeError("unexpected extension type");
      case PRIMITIVE_RECURSIVE_RAISED:
        throw this.uk.lastObject;
      default:
        throw new UnpackError(`logically unknown error ${r}`);
    }
  }

  private stackInit(): boolean {
    if (this.uk.stack == null) {
      this.uk.stack = [];
      return true;
    }
    return false;
  }

  private stackFree(stackAllocated: boolean): void {
    if (stackAllocated) {
      this.uk.stack = null;
    }
  }

  private readHeadByte(): number {
    if (!this.buffer.ensureReadable(1)) {
      return PRIMITIVE_EOF;
    }
    const r = this.buffer.readAll(1)[0];
    return (this.uk.headByte = r);
  }

  private getHeadByte(): number {
    let b = this.uk.headByte;
    if (b === HEAD_BYTE_REQUIRED) {
      b = this.readHeadByte();
    }
    return b;
  }

  private resetHeadByte(): void {
    this.uk.headByte = HEAD_BYTE_REQUIRED;
  }

  /** @inventedArm if — PERMANENT */
  private objectComplete(object: unknown): number {
    if (
      this.freeze &&
      object !== null &&
      typeof object === "object" &&
      !ArrayBuffer.isView(object)
    ) {
      Object.freeze(object);
    }

    this.uk.lastObject = object;
    this.uk.lastObjectSymbol = false;
    this.resetHeadByte();
    return PRIMITIVE_OBJECT_COMPLETE;
  }

  private objectCompleteSymbol(object: string): number {
    this.uk.lastObject = object;
    this.uk.lastObjectSymbol = true;
    this.resetHeadByte();
    return PRIMITIVE_OBJECT_COMPLETE;
  }

  private objectCompleteExt(extType: number, str: Uint8Array | null): number {
    if (this.optimizedSymbolExtType && extType === this.symbolExtType) {
      return this.objectCompleteSymbol(fromMsgpackExt(str ?? new Uint8Array(0)));
    }

    const [, proc] = this.extRegistry.get(extType) ?? [null, null, 0];

    if (proc != null) {
      let obj: unknown;
      const arg = str ?? new Uint8Array(0);
      try {
        obj = proc(arg as never);
      } catch (error) {
        this.uk.lastObject = error;
        return PRIMITIVE_RECURSIVE_RAISED;
      }
      return this.objectComplete(obj);
    }

    if (this.allowUnknownExt) {
      const obj = new ExtensionValue(extType, str ?? new Uint8Array(0));
      return this.objectComplete(obj);
    }

    return PRIMITIVE_UNEXPECTED_EXT_TYPE;
  }

  private stackEntryTop(): StackEntry {
    return this.uk.stack![this.uk.stack!.length - 1];
  }

  private stackPush(type: number, count: number, object: unknown): number {
    this.resetHeadByte();

    if (MSGPACK_UNPACKER_STACK_CAPACITY - this.uk.stack!.length <= 0) {
      return PRIMITIVE_STACK_TOO_DEEP;
    }

    this.uk.stack!.push({ count, type, object, key: null, keySymbol: false });
    return PRIMITIVE_CONTAINER_START;
  }

  private stackPop(): number {
    this.uk.stack!.pop();
    return this.uk.stack!.length;
  }

  private isStackEmpty(): boolean {
    return this.uk.stack!.length === 0;
  }

  private readCastBlock(n: number): DataView | null {
    if (!this.buffer.ensureReadable(n)) {
      return null;
    }
    const cb = this.buffer.readAll(n);
    return new DataView(cb.buffer, cb.byteOffset, n);
  }

  private isReadingMapKey(): boolean {
    if (this.uk.stack != null && this.uk.stack.length > 0) {
      const top = this.stackEntryTop();
      if (top.type === STACK_TYPE_MAP_KEY) {
        return true;
      }
    }
    return false;
  }

  private readRawBodyCont(): number {
    let length = this.uk.readingRawRemaining;

    if (this.uk.readingRaw == null) {
      this.uk.readingRaw = [];
    }

    do {
      const n = this.buffer.readToString(this.uk.readingRaw, length);
      if (n === 0) {
        return PRIMITIVE_EOF;
      }
      this.uk.readingRawRemaining = length = length - n;
    } while (length > 0);

    const raw = concatBytes(this.uk.readingRaw);
    let ret: number;
    if (this.uk.readingRawType === RAW_TYPE_STRING) {
      ret = this.objectComplete(utf8.decode(raw));
    } else if (this.uk.readingRawType === RAW_TYPE_BINARY) {
      ret = this.objectComplete(raw);
    } else {
      ret = this.objectCompleteExt(this.uk.readingRawType, raw);
    }
    this.uk.readingRaw = null;
    return ret;
  }

  private readRawBodyBegin(rawType: number): number {
    if (!(rawType === RAW_TYPE_STRING || rawType === RAW_TYPE_BINARY)) {
      const [, proc, extFlags] = this.extRegistry.get(rawType) ?? [null, null, 0];
      if (proc != null && extFlags & MSGPACK_EXT_RECURSIVE) {
        let obj: unknown;
        this.uk.lastObject = null;
        this.resetHeadByte();
        this.uk.readingRawRemaining = 0;

        this.stackPush(STACK_TYPE_RECURSIVE, 1, null);
        try {
          obj = proc(this as never);
        } catch (error) {
          this.stackPop();
          this.uk.lastObject = error;
          return PRIMITIVE_RECURSIVE_RAISED;
        }
        this.stackPop();

        return this.objectComplete(obj);
      }
    }

    const length = this.uk.readingRawRemaining;
    if (length <= this.buffer.topReadableSize()) {
      const bytes = this.buffer.readAll(length);
      let ret: number;
      if (this.optimizedSymbolExtType && this.symbolExtType === rawType) {
        ret = this.objectCompleteSymbol(fromMsgpackExt(bytes));
      } else if (this.isReadingMapKey() && rawType === RAW_TYPE_STRING) {
        const key = utf8.decode(bytes);
        if (this.symbolizeKeys) {
          ret = this.objectCompleteSymbol(`:${key}`);
        } else {
          ret = this.objectComplete(key);
        }
      } else {
        if (rawType === RAW_TYPE_STRING) {
          ret = this.objectComplete(utf8.decode(bytes));
        } else if (rawType === RAW_TYPE_BINARY) {
          ret = this.objectComplete(bytes);
        } else {
          ret = this.objectCompleteExt(rawType, bytes);
        }
      }
      this.uk.readingRawRemaining = 0;
      return ret;
    }

    this.uk.readingRawType = rawType;
    return this.readRawBodyCont();
  }

  private readPrimitive(): number {
    if (this.uk.readingRawRemaining > 0) {
      return this.readRawBodyCont();
    }

    const b = this.getHeadByte();
    if (b < 0) {
      return b;
    }

    if (0x00 <= b && b <= 0x7f) {
      return this.objectComplete(b);
    } else if (0xe0 <= b && b <= 0xff) {
      return this.objectComplete((b << 24) >> 24);
    } else if (0xa0 <= b && b <= 0xbf) {
      this.uk.readingRawRemaining = b & 0x1f;
      return this.readRawBodyBegin(RAW_TYPE_STRING);
    } else if (0x90 <= b && b <= 0x9f) {
      const count = b & 0x0f;
      if (count === 0) {
        return this.objectComplete([]);
      }
      return this.stackPush(STACK_TYPE_ARRAY, count, []);
    } else if (0x80 <= b && b <= 0x8f) {
      const count = b & 0x0f;
      if (count === 0) {
        return this.objectComplete({});
      }
      return this.stackPush(STACK_TYPE_MAP_KEY, count * 2, {});
    } else if (0xc0 <= b && b <= 0xdf) {
      switch (b) {
        case 0xc0:
          return this.objectComplete(null);
        case 0xc2:
          return this.objectComplete(false);
        case 0xc3:
          return this.objectComplete(true);
        case 0xc7: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          const length = cb.getUint8(0);
          const extType = cb.getInt8(1);
          if (length === 0) {
            return this.objectCompleteExt(extType, null);
          }
          this.uk.readingRawRemaining = length;
          return this.readRawBodyBegin(extType);
        }
        case 0xc8: {
          const cb = this.readCastBlock(3);
          if (cb == null) return PRIMITIVE_EOF;
          const length = cb.getUint16(0);
          const extType = cb.getInt8(2);
          if (length === 0) {
            return this.objectCompleteExt(extType, null);
          }
          this.uk.readingRawRemaining = length;
          return this.readRawBodyBegin(extType);
        }
        case 0xc9: {
          const cb = this.readCastBlock(5);
          if (cb == null) return PRIMITIVE_EOF;
          const length = cb.getUint32(0);
          const extType = cb.getInt8(4);
          if (length === 0) {
            return this.objectCompleteExt(extType, null);
          }
          this.uk.readingRawRemaining = length;
          return this.readRawBodyBegin(extType);
        }
        case 0xca: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(rbDbl2num(cb.getFloat32(0)));
        }
        case 0xcb: {
          const cb = this.readCastBlock(8);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(rbDbl2num(cb.getFloat64(0)));
        }
        case 0xcc: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getUint8(0));
        }
        case 0xcd: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getUint16(0));
        }
        case 0xce: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getUint32(0));
        }
        case 0xcf: {
          const cb = this.readCastBlock(8);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(rbIntegerFromBigint(cb.getBigUint64(0)));
        }
        case 0xd0: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getInt8(0));
        }
        case 0xd1: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getInt16(0));
        }
        case 0xd2: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(cb.getInt32(0));
        }
        case 0xd3: {
          const cb = this.readCastBlock(8);
          if (cb == null) return PRIMITIVE_EOF;
          return this.objectComplete(rbIntegerFromBigint(cb.getBigInt64(0)));
        }
        case 0xd4: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          const extType = cb.getInt8(0);
          this.uk.readingRawRemaining = 1;
          return this.readRawBodyBegin(extType);
        }
        case 0xd5: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          const extType = cb.getInt8(0);
          this.uk.readingRawRemaining = 2;
          return this.readRawBodyBegin(extType);
        }
        case 0xd6: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          const extType = cb.getInt8(0);
          this.uk.readingRawRemaining = 4;
          return this.readRawBodyBegin(extType);
        }
        case 0xd7: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          const extType = cb.getInt8(0);
          this.uk.readingRawRemaining = 8;
          return this.readRawBodyBegin(extType);
        }
        case 0xd8: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          const extType = cb.getInt8(0);
          this.uk.readingRawRemaining = 16;
          return this.readRawBodyBegin(extType);
        }
        case 0xd9: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint8(0);
          return this.readRawBodyBegin(RAW_TYPE_STRING);
        }
        case 0xda: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint16(0);
          return this.readRawBodyBegin(RAW_TYPE_STRING);
        }
        case 0xdb: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint32(0);
          return this.readRawBodyBegin(RAW_TYPE_STRING);
        }
        case 0xc4: {
          const cb = this.readCastBlock(1);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint8(0);
          return this.readRawBodyBegin(RAW_TYPE_BINARY);
        }
        case 0xc5: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint16(0);
          return this.readRawBodyBegin(RAW_TYPE_BINARY);
        }
        case 0xc6: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          this.uk.readingRawRemaining = cb.getUint32(0);
          return this.readRawBodyBegin(RAW_TYPE_BINARY);
        }
        case 0xdc: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          const count = cb.getUint16(0);
          if (count === 0) {
            return this.objectComplete([]);
          }
          return this.stackPush(STACK_TYPE_ARRAY, count, []);
        }
        case 0xdd: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          const count = cb.getUint32(0);
          if (count === 0) {
            return this.objectComplete([]);
          }
          return this.stackPush(STACK_TYPE_ARRAY, count, []);
        }
        case 0xde: {
          const cb = this.readCastBlock(2);
          if (cb == null) return PRIMITIVE_EOF;
          const count = cb.getUint16(0);
          if (count === 0) {
            return this.objectComplete({});
          }
          return this.stackPush(STACK_TYPE_MAP_KEY, count * 2, {});
        }
        case 0xdf: {
          const cb = this.readCastBlock(4);
          if (cb == null) return PRIMITIVE_EOF;
          const count = cb.getUint32(0);
          if (count === 0) {
            return this.objectComplete({});
          }
          return this.stackPush(STACK_TYPE_MAP_KEY, count * 2, {});
        }
        default:
          return PRIMITIVE_INVALID_BYTE;
      }
    } else {
      return PRIMITIVE_INVALID_BYTE;
    }
  }

  private msgpackUnpackerReadArrayHeader(): number {
    const b = this.getHeadByte();
    if (b < 0) {
      return b;
    }

    let resultSize: number;
    if (0x90 <= b && b <= 0x9f) {
      resultSize = b & 0x0f;
    } else if (b === 0xdc) {
      const cb = this.readCastBlock(2);
      if (cb == null) return PRIMITIVE_EOF;
      resultSize = cb.getUint16(0);
    } else if (b === 0xdd) {
      const cb = this.readCastBlock(4);
      if (cb == null) return PRIMITIVE_EOF;
      resultSize = cb.getUint32(0);
    } else {
      return PRIMITIVE_UNEXPECTED_TYPE;
    }

    this.resetHeadByte();
    return resultSize;
  }

  private msgpackUnpackerReadMapHeader(): number {
    const b = this.getHeadByte();
    if (b < 0) {
      return b;
    }

    let resultSize: number;
    if (0x80 <= b && b <= 0x8f) {
      resultSize = b & 0x0f;
    } else if (b === 0xde) {
      const cb = this.readCastBlock(2);
      if (cb == null) return PRIMITIVE_EOF;
      resultSize = cb.getUint16(0);
    } else if (b === 0xdf) {
      const cb = this.readCastBlock(4);
      if (cb == null) return PRIMITIVE_EOF;
      resultSize = cb.getUint32(0);
    } else {
      return PRIMITIVE_UNEXPECTED_TYPE;
    }

    this.resetHeadByte();
    return resultSize;
  }

  private msgpackUnpackerRead(targetStackDepth: number): number {
    const stackAllocated = this.stackInit();

    while (true) {
      const r = this.readPrimitive();
      if (r < 0) {
        if (r !== PRIMITIVE_EOF) {
          this.stackFree(stackAllocated);
        }
        return r;
      }
      if (r === PRIMITIVE_CONTAINER_START) {
        continue;
      }

      if (this.isStackEmpty()) {
        this.stackFree(stackAllocated);
        return PRIMITIVE_OBJECT_COMPLETE;
      }

      while (true) {
        const top = this.stackEntryTop();
        switch (top.type) {
          case STACK_TYPE_ARRAY:
            (top.object as unknown[]).push(this.uk.lastObject);
            break;
          case STACK_TYPE_MAP_KEY:
            top.key = this.uk.lastObject;
            top.keySymbol = this.uk.lastObjectSymbol;
            top.type = STACK_TYPE_MAP_VALUE;
            break;
          case STACK_TYPE_MAP_VALUE:
            if (this.symbolizeKeys && typeof top.key === "string" && !top.keySymbol) {
              top.object = rbHashAset(top.object as object, `:${top.key}`, this.uk.lastObject);
            } else {
              top.object = rbHashAset(top.object as object, top.key, this.uk.lastObject);
            }
            top.type = STACK_TYPE_MAP_KEY;
            break;
          case STACK_TYPE_RECURSIVE:
            this.stackFree(stackAllocated);
            return PRIMITIVE_OBJECT_COMPLETE;
        }
        const count = --top.count;

        if (count === 0) {
          this.objectComplete(top.object);
          if (this.stackPop() <= targetStackDepth) {
            this.stackFree(stackAllocated);
            return PRIMITIVE_OBJECT_COMPLETE;
          }
          continue;
        }
        break;
      }
    }
  }

  private msgpackUnpackerSkip(targetStackDepth: number): number {
    const stackAllocated = this.stackInit();

    while (true) {
      const r = this.readPrimitive();
      if (r < 0) {
        this.stackFree(stackAllocated);
        return r;
      }
      if (r === PRIMITIVE_CONTAINER_START) {
        continue;
      }

      if (this.isStackEmpty()) {
        this.stackFree(stackAllocated);
        return PRIMITIVE_OBJECT_COMPLETE;
      }

      while (true) {
        const top = this.stackEntryTop();

        const count = --top.count;

        if (count === 0) {
          this.objectComplete(null);
          if (this.stackPop() <= targetStackDepth) {
            this.stackFree(stackAllocated);
            return PRIMITIVE_OBJECT_COMPLETE;
          }
          continue;
        }
        break;
      }
    }
  }

  private msgpackUnpackerSkipNil(): number {
    const b = this.getHeadByte();
    if (b < 0) {
      return b;
    }
    if (b === 0xc0) {
      return 1;
    }
    return 0;
  }

  private registeredTypesInternal(): UnpackerExtRegistry {
    return new Map(this.extRegistry);
  }

  private registerTypeInternal(type: number, klass: unknown, proc: UnpackerProc | null): null {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen MessagePack::Unpacker");
    }

    if (type < -128 || type > 127) {
      throw new RangeError(`integer ${type} too big to convert to \`signed char'`);
    }

    this.extRegistry.set(type, [klass, proc, 0]);
    return null;
  }
}

MessagePack.TypeError = TypeError;
MessagePack.Unpacker = Unpacker;
MessagePack.UnpackError = UnpackError;
MessagePack.MalformedFormatError = MalformedFormatError;
MessagePack.StackError = StackError;
MessagePack.UnexpectedTypeError = UnexpectedTypeError;
MessagePack.UnknownExtTypeError = UnknownExtTypeError;
