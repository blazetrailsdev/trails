import { DecodeError, Decoder } from "@msgpack/msgpack";
import {
  ArgumentError,
  EOFError,
  FrozenError,
  Hash,
  Module,
  include,
  RangeError,
  StandardError,
  rbModConstSet,
  rbObjMethod,
  rbObjClass,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";
import { ExtensionValue } from "./extension-value.js";
import { MessagePack } from "./namespaces.js";
import { MSGPACK_EXT_RECURSIVE } from "./packer.js";

export class UnpackError extends StandardError {}

export class MalformedFormatError extends UnpackError {}

export class StackError extends UnpackError {}

export const TypeError = new Module();

export class UnexpectedTypeError extends UnpackError {}
include(UnexpectedTypeError, TypeError);

export class UnknownExtTypeError extends UnpackError {}

export type UnpackerProc = (data: never) => unknown;

export type UnpackerExtRegistry = Map<number, [unknown, UnpackerProc | null, number]>;

const PRIMITIVE_OBJECT_COMPLETE = 0;
const PRIMITIVE_EOF = -1;

class RecursiveRaised {
  constructor(readonly lastObject: unknown) {}
}

class ExtObject {
  constructor(readonly obj: unknown) {}
}

function raiseUnpackerError(error: unknown): never {
  if (error instanceof RecursiveRaised) throw error.lastObject;
  if (error instanceof DecodeError) {
    if (error.message.startsWith("Unrecognized")) throw new MalformedFormatError("invalid byte");
    throw new UnpackError(error.message);
  }
  throw error;
}

function objectComplete(obj: unknown, freeze: boolean): unknown {
  if (obj instanceof ExtObject) {
    obj = obj.obj;
  } else if (typeof obj === "bigint") {
    return Number.isSafeInteger(Number(obj)) ? Number(obj) : obj;
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) obj[i] = objectComplete(obj[i], freeze);
  } else if (obj !== null && typeof obj === "object" && obj.constructor === Object) {
    const hash = obj as Record<string, unknown>;
    for (const key of Object.keys(hash)) hash[key] = objectComplete(hash[key], freeze);
  }
  if (freeze && !ArrayBuffer.isView(obj)) {
    Object.freeze(obj);
  }
  return obj;
}

export class Unpacker {
  /** @internal */
  readonly extRegistry: UnpackerExtRegistry = new Map();
  readonly buffer: Buffer;
  private readonly decoder: Decoder;
  /** @missingRailsCall rb_str_intern — CONVERGEABLE msgpack-unpacker-read-loop-the-engine-hides */
  private symbolizeKeys = false;
  private freeze = false;
  private allowUnknownExt = false;
  private readonly uk: { lastObject: unknown } = { lastObject: null };

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
    this.decoder = new Decoder({
      useBigInt64: true,
      extensionCodec: {
        tryToEncode: () => null,
        decode: (data, type) => {
          const [, proc, extFlags] = this.extRegistry.get(type) ?? [null, null, 0];
          if (proc != null) {
            try {
              if (extFlags & MSGPACK_EXT_RECURSIVE) {
                const uk = new Unpacker(null, options);
                for (const [key, value] of this.extRegistry) uk.extRegistry.set(key, value);
                if (Object.isFrozen(this)) Object.freeze(uk);
                uk.feedReference(data);
                return new ExtObject(proc(uk as never));
              }
              return new ExtObject(proc(data as never));
            } catch (error) {
              throw new RecursiveRaised(error);
            }
          }
          if (this.allowUnknownExt) {
            return new ExtObject(new ExtensionValue(type, data));
          }
          throw new UnknownExtTypeError("unexpected extension type");
        },
      },
    });
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
    const r = this.unpackerRead();
    if (r < 0) {
      throw new EOFError("end of buffer reached");
    }
    return this.uk.lastObject;
  }

  unpack(): unknown {
    return this.read();
  }

  skipNil(): boolean {
    const b = this.getHeadByte();
    if (b === 0xc0) {
      this.buffer.skipAll(1);
      return true;
    }
    return false;
  }

  readArrayHeader(): number {
    const b = this.getHeadByte();
    let resultSize: number;

    if (0x90 <= b && b <= 0x9f) {
      resultSize = b & 0x0f;
      this.buffer.skipAll(1);
    } else if (b === 0xdc) {
      resultSize = this.readCastBlock(2);
    } else if (b === 0xdd) {
      resultSize = this.readCastBlock(4);
    } else {
      throw new UnexpectedTypeError("unexpected type");
    }

    return resultSize;
  }

  readMapHeader(): number {
    const b = this.getHeadByte();
    let resultSize: number;

    if (0x80 <= b && b <= 0x8f) {
      resultSize = b & 0x0f;
      this.buffer.skipAll(1);
    } else if (b === 0xde) {
      resultSize = this.readCastBlock(2);
    } else if (b === 0xdf) {
      resultSize = this.readCastBlock(4);
    } else {
      throw new UnexpectedTypeError("unexpected type");
    }

    return resultSize;
  }

  each(): Generator<unknown, void>;
  each(block: (v: unknown) => void): null;
  each(block?: (v: unknown) => void): null | Generator<unknown, void> {
    if (block === undefined) {
      return this.enumFor((block) => this.each(block));
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
      return this.enumFor((block) => this.feedEach(data, block));
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
    return this.buffer.clear();
  }

  private *enumFor(meth: (block: (v: unknown) => void) => null): Generator<unknown, void> {
    const objects: unknown[] = [];
    meth((v) => objects.push(v));
    yield* objects;
  }

  private eachImpl(block: (v: unknown) => void): null {
    while (true) {
      const r = this.unpackerRead();
      if (r < 0) {
        return null;
      }
      const v = this.uk.lastObject;
      block(v);
    }
  }

  private unpackerRead(): number {
    while (true) {
      const each = this.decoder.decodeMulti(this.buffer.toStr());
      let r: IteratorResult<unknown, void>;
      try {
        r = each.next();
        each.return();
      } catch (error) {
        if (!(error instanceof globalThis.RangeError)) raiseUnpackerError(error);
        r = { done: true, value: undefined };
      }
      if (r.done) {
        if (this.buffer.io == null) return PRIMITIVE_EOF;
        this.buffer.ensureReadable(this.buffer.size() + 1);
        continue;
      }
      this.buffer.skipAll((this.decoder as unknown as { pos: number }).pos);
      this.uk.lastObject = objectComplete(r.value, this.freeze);
      return PRIMITIVE_OBJECT_COMPLETE;
    }
  }

  private getHeadByte(): number {
    if (!this.buffer.ensureReadable(1)) {
      throw new EOFError("end of buffer reached");
    }
    return this.buffer.toStr()[0];
  }

  private readCastBlock(n: number): number {
    if (!this.buffer.ensureReadable(1 + n)) {
      throw new EOFError("end of buffer reached");
    }
    const cb = this.buffer.toStr();
    const view = new DataView(cb.buffer, cb.byteOffset + 1, n);
    this.buffer.skipAll(1 + n);
    return n === 2 ? view.getUint16(0) : view.getUint32(0);
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

rbModConstSet(MessagePack, "TypeError", TypeError);
rbModConstSet(MessagePack, "Unpacker", Unpacker);
rbModConstSet(MessagePack, "UnpackError", UnpackError);
rbModConstSet(MessagePack, "MalformedFormatError", MalformedFormatError);
rbModConstSet(MessagePack, "StackError", StackError);
rbModConstSet(MessagePack, "UnexpectedTypeError", UnexpectedTypeError);
rbModConstSet(MessagePack, "UnknownExtTypeError", UnknownExtTypeError);
