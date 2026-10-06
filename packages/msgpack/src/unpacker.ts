import { DecodeError, Decoder } from "@msgpack/msgpack";
import {
  ArgumentError,
  EOFError,
  FrozenError,
  Hash,
  RangeError,
  StandardError,
  rbObjMethod,
  rbObjClass,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";
import { MSGPACK_EXT_RECURSIVE } from "./packer.js";

export class UnpackError extends StandardError {}

export class MalformedFormatError extends UnpackError {}

export class StackError extends UnpackError {}

export class UnexpectedTypeError extends UnpackError {}

export class UnknownExtTypeError extends UnpackError {}

export type UnpackerProc = (data: never) => unknown;

export type UnpackerExtRegistry = Map<number, [unknown, UnpackerProc | null, number]>;

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
  if (error instanceof globalThis.RangeError) {
    throw new EOFError("end of buffer reached");
  }
  throw error;
}

function ll2inum(obj: unknown): unknown {
  if (obj instanceof ExtObject) return obj.obj;
  if (typeof obj === "bigint") return Number.isSafeInteger(Number(obj)) ? Number(obj) : obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) obj[i] = ll2inum(obj[i]);
  } else if (obj !== null && typeof obj === "object" && obj.constructor === Object) {
    const hash = obj as Record<string, unknown>;
    for (const key of Object.keys(hash)) hash[key] = ll2inum(hash[key]);
  }
  return obj;
}

export class Unpacker {
  /** @internal */
  readonly extRegistry: UnpackerExtRegistry = new Map();
  readonly buffer: Buffer;
  private readonly decoder: Decoder;

  constructor(io: unknown = null, options: object | null = null) {
    if (options == null && io != null && rbObjIsKindOf(io, Hash)) {
      options = io as object;
      io = null;
    } else if (options != null && !rbObjIsKindOf(options, Hash)) {
      throw new ArgumentError(`expected Hash but found ${rbObjClass(options).name}.`);
    }
    this.buffer = new Buffer(io);
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
          throw new UnknownExtTypeError("unexpected extension type");
        },
      },
    });
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
    const each = this.decoder.decodeMulti(this.buffer.toStr());
    let r: IteratorResult<unknown, void>;
    try {
      r = each.next();
      each.return();
    } catch (error) {
      raiseUnpackerError(error);
    }
    if (r.done) throw new EOFError("end of buffer reached");
    this.buffer.skip((this.decoder as unknown as { pos: number }).pos);
    return ll2inum(r.value);
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
