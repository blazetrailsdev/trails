/**
 * Type registrations for ActiveSupport::MessagePack.
 *
 * Mirrors: ActiveSupport::MessagePack::Extensions
 *
 * `install` registers the extension types (Symbol today — the remaining
 * Ruby-native types are tracked as follow-up). `installUnregisteredTypeError`
 * and `installUnregisteredTypeFallback` register the catch-all type 127 used by
 * the plain serializer (raise) and the cache serializer (object fallback via
 * `toMsgpackExt`/`fromMsgpackExt` or `asJson`/`jsonCreate`).
 *
 * Ruby's `Object.const_get` class lookup becomes an explicit name→constructor
 * registry: object-fallback classes opt in via `registerObjectClass`.
 */

import { MessagePackError } from "./factory.js";
import type { Factory, Packer, Unpacker } from "./factory.js";

export class UnserializableObjectError extends Error {}
export class MissingClassError extends Error {}

/** A constructor that participates in the cache serializer's object fallback. */
export interface ObjectClass {
  name: string;
  fromMsgpackExt?: (data: unknown) => unknown;
  jsonCreate?: (data: unknown) => unknown;
}

const objectClassRegistry = new Map<string, ObjectClass>();

/** Mirror of Ruby's implicit `Object.const_get` resolution for object fallback. */
export function registerObjectClass(klass: ObjectClass): void {
  objectClassRegistry.set(klass.name, klass);
}

const LOAD_WITH_MSGPACK_EXT = 0;
const LOAD_WITH_JSON_CREATE = 1;

function classOf(value: object): ObjectClass {
  return (value as { constructor: ObjectClass }).constructor;
}

export const Extensions = {
  install(registry: Factory): void {
    registry.registerType({
      type: 0,
      recursive: false,
      match: (v) => typeof v === "symbol",
      packer: (v) => Buffer.from((v as symbol).description ?? "", "utf-8"),
      unpacker: (payload) => Symbol.for((payload as Buffer).toString("utf-8")),
    });
  },

  installUnregisteredTypeError(registry: Factory): void {
    registry.registerType({
      type: 127,
      recursive: false,
      match: (v) => typeof v === "object" && v !== null,
      packer: (v) => Extensions.raiseUnserializable(v),
      unpacker: () => Extensions.raiseInvalidFormat(),
    });
  },

  installUnregisteredTypeFallback(registry: Factory): void {
    registry.registerType({
      type: 127,
      recursive: true,
      match: (v) => typeof v === "object" && v !== null,
      packer: (v, packer) => Extensions.writeObject(v as object, packer),
      unpacker: (unpacker) => Extensions.readObject(unpacker as Unpacker),
    });
  },

  dumpClass(klass: ObjectClass): string {
    if (!klass.name) throw new UnserializableObjectError("Cannot serialize anonymous class");
    return klass.name;
  },

  loadClass(name: string): ObjectClass {
    const klass = objectClassRegistry.get(name);
    if (!klass) throw new MissingClassError(`Missing class: ${name}`);
    return klass;
  },

  writeClass(klass: ObjectClass, packer: Packer): void {
    packer.write(Extensions.dumpClass(klass));
  },

  readClass(unpacker: Unpacker): ObjectClass {
    return Extensions.loadClass(unpacker.read() as string);
  },

  raiseUnserializable(object: unknown): never {
    const name = typeof object === "object" && object ? classOf(object).name : typeof object;
    throw new UnserializableObjectError(`Unsupported type ${name} for object ${String(object)}`);
  },

  raiseInvalidFormat(): never {
    throw new MessagePackError("Invalid format");
  },

  writeObject(object: object, packer: Packer): void {
    const klass = classOf(object);
    const o = object as { toMsgpackExt?: () => unknown; asJson?: () => unknown };
    // Rails pairs a class-level `from_msgpack_ext`/`json_create` with an
    // instance-level `to_msgpack_ext`/`as_json`. Guard the instance half too so
    // a half-implemented protocol raises UnserializableObjectError rather than a
    // bare TypeError from the cast.
    if (typeof klass.fromMsgpackExt === "function" && typeof o.toMsgpackExt === "function") {
      packer.write(LOAD_WITH_MSGPACK_EXT);
      Extensions.writeClass(klass, packer);
      packer.write(o.toMsgpackExt());
    } else if (typeof klass.jsonCreate === "function" && typeof o.asJson === "function") {
      packer.write(LOAD_WITH_JSON_CREATE);
      Extensions.writeClass(klass, packer);
      packer.write(o.asJson());
    } else {
      Extensions.raiseUnserializable(object);
    }
  },

  readObject(unpacker: Unpacker): unknown {
    switch (unpacker.read()) {
      case LOAD_WITH_MSGPACK_EXT:
        return Extensions.readClass(unpacker).fromMsgpackExt!(unpacker.read());
      case LOAD_WITH_JSON_CREATE:
        return Extensions.readClass(unpacker).jsonCreate!(unpacker.read());
      default:
        return Extensions.raiseInvalidFormat();
    }
  },
};
