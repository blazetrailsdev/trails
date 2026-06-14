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
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { TimeZone } from "../values/time-zone.js";

/**
 * Encodes a bigint as MessagePack::Bigint's `CL>*` ext payload: a sign byte (0
 * positive / 1 negative) followed by 32-bit big-endian chunks, least-significant
 * chunk first. Byte-identical to `MessagePack::Bigint.to_msgpack_ext`.
 */
function bigIntToMsgpackExt(value: bigint): Buffer {
  let n = value;
  const bytes: number[] = [n < 0n ? 1 : 0];
  if (n < 0n) n = -n;
  while (n > 0n) {
    const chunk = Number(n & 0xffffffffn);
    bytes.push((chunk >>> 24) & 0xff, (chunk >>> 16) & 0xff, (chunk >>> 8) & 0xff, chunk & 0xff);
    n >>= 32n;
  }
  return Buffer.from(bytes);
}

/**
 * Mirrors Ruby's `load_time_zone` → `ActiveSupport::TimeZone[name]`, which
 * rescues an invalid identifier to `null` (time_zone.rb:236-241) rather than
 * raising. `TimeZone.find` throws on an unknown name, so we catch it here.
 */
function loadTimeZone(name: string): TimeZone | null {
  try {
    return TimeZone.find(name);
  } catch {
    return null;
  }
}

function bigIntFromMsgpackExt(payload: Buffer): bigint {
  const sign = payload[0];
  let sum = 0n;
  for (let i = (payload.length - 1) / 4 - 1; i >= 0; i--) {
    const off = 1 + i * 4;
    const chunk =
      (payload[off] << 24) | (payload[off + 1] << 16) | (payload[off + 2] << 8) | payload[off + 3];
    sum = (sum << 32n) + BigInt(chunk >>> 0);
  }
  return sign === 0 ? sum : -sum;
}

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
      klass: "Symbol",
      recursive: false,
      match: (v) => typeof v === "symbol",
      packer: (v) => Buffer.from((v as symbol).description ?? "", "utf-8"),
      unpacker: (payload) => Symbol.for((payload as Buffer).toString("utf-8")),
    });

    // Native ints inside the 64-bit range are handled directly by the packer;
    // this ext only fires for oversized integers (Ruby Bigint), reached via the
    // `oversizedInteger` flag rather than `match`.
    registry.registerType({
      type: 1,
      klass: "Integer",
      recursive: false,
      oversizedInteger: true,
      match: () => false,
      packer: (v) => bigIntToMsgpackExt(v as bigint),
      unpacker: (payload) => bigIntFromMsgpackExt(payload as Buffer),
    });

    registry.registerType({
      type: 9,
      klass: "ActiveSupport::TimeZone",
      recursive: false,
      match: (v) => v instanceof TimeZone,
      packer: (v) => Buffer.from((v as TimeZone).name, "utf-8"),
      unpacker: (payload) => loadTimeZone((payload as Buffer).toString("utf-8")),
    });

    registry.registerType({
      type: 12,
      klass: "Set",
      recursive: true,
      match: (v) => v instanceof Set,
      packer: (v, packer) => packer.write([...(v as Set<unknown>)]),
      unpacker: (unpacker) => new Set((unpacker as Unpacker).read() as unknown[]),
    });

    registry.registerType({
      type: 17,
      klass: "ActiveSupport::HashWithIndifferentAccess",
      recursive: true,
      match: (v) => v instanceof HashWithIndifferentAccess,
      packer: (v, packer) => packer.write((v as HashWithIndifferentAccess).toHash()),
      unpacker: (unpacker) =>
        new HashWithIndifferentAccess((unpacker as Unpacker).read() as Record<string, unknown>),
    });
  },

  installUnregisteredTypeError(registry: Factory): void {
    registry.registerType({
      type: 127,
      klass: "Object",
      recursive: false,
      match: (v) => typeof v === "object" && v !== null,
      packer: (v) => Extensions.raiseUnserializable(v),
      unpacker: () => Extensions.raiseInvalidFormat(),
    });
  },

  installUnregisteredTypeFallback(registry: Factory): void {
    registry.registerType({
      type: 127,
      klass: "Object",
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
