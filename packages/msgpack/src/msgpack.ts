import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Factory } from "./factory.js";
import { MessagePack } from "./namespaces.js";
import type { Unpacker } from "./unpacker.js";

export const DefaultFactory = rbModConstSet(MessagePack, "DefaultFactory", new Factory());

export function load(src: unknown, param: object | null = null): unknown {
  let unpacker: Unpacker;

  if (typeof src === "string" || src instanceof Uint8Array) {
    unpacker = DefaultFactory.unpacker(param);
    unpacker.feedReference(src);
  } else {
    unpacker = DefaultFactory.unpacker(src, param);
  }

  return unpacker.fullUnpack();
}

export function unpack(src: unknown, param: object | null = null): unknown {
  return load(src, param);
}

export function pack(v: unknown): Uint8Array;
export function pack(v: unknown, io: unknown, options?: object | null): Uint8Array | null;
export function pack(
  v: unknown,
  io: unknown = null,
  options: object | null = null,
): Uint8Array | null {
  const packer = DefaultFactory.packer(io, options);
  packer.write(v);
  return packer.fullPack();
}

export function dump(v: unknown): Uint8Array;
export function dump(v: unknown, io: unknown, options?: object | null): Uint8Array | null;
export function dump(
  v: unknown,
  io: unknown = null,
  options: object | null = null,
): Uint8Array | null {
  return pack(v, io, options);
}

MessagePack.load = load;
MessagePack.unpack = unpack;
MessagePack.pack = pack;
MessagePack.dump = dump;
