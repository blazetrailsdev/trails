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

function dumpClass(klass: ObjectClass): string {
  if (!klass.name) throw new UnserializableObjectError("Cannot serialize anonymous class");
  return klass.name;
}

function loadClass(name: string): ObjectClass {
  const klass = objectClassRegistry.get(name);
  if (!klass) throw new MissingClassError(`Missing class: ${name}`);
  return klass;
}

function raiseUnserializable(object: unknown): never {
  const name = typeof object === "object" && object ? classOf(object).name : typeof object;
  throw new UnserializableObjectError(`Unsupported type ${name} for object ${String(object)}`);
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
      packer: (v) => raiseUnserializable(v),
      unpacker: () => {
        throw new MessagePackError("Invalid format");
      },
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

  writeObject(object: object, packer: Packer): void {
    const klass = classOf(object);
    if (typeof klass.fromMsgpackExt === "function") {
      packer.write(LOAD_WITH_MSGPACK_EXT);
      packer.write(dumpClass(klass));
      packer.write((object as { toMsgpackExt: () => unknown }).toMsgpackExt());
    } else if (typeof klass.jsonCreate === "function") {
      packer.write(LOAD_WITH_JSON_CREATE);
      packer.write(dumpClass(klass));
      packer.write((object as { asJson: () => unknown }).asJson());
    } else {
      raiseUnserializable(object);
    }
  },

  readObject(unpacker: Unpacker): unknown {
    switch (unpacker.read()) {
      case LOAD_WITH_MSGPACK_EXT:
        return loadClass(unpacker.read() as string).fromMsgpackExt!(unpacker.read());
      case LOAD_WITH_JSON_CREATE:
        return loadClass(unpacker.read() as string).jsonCreate!(unpacker.read());
      default:
        throw new MessagePackError("Invalid format");
    }
  },
};
