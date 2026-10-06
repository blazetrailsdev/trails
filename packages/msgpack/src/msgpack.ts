import { Factory } from "./factory.js";
import type { Packer } from "./packer.js";
import type { Unpacker } from "./unpacker.js";

export const DefaultFactory = new Factory();

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

export function pack(
  v: unknown,
  io: unknown = null,
  options: object | null = null,
): ReturnType<Packer["fullPack"]> {
  const packer = DefaultFactory.packer(io, options);
  packer.write(v);
  return packer.fullPack();
}

export function dump(
  v: unknown,
  io: unknown = null,
  options: object | null = null,
): ReturnType<Packer["fullPack"]> {
  return pack(v, io, options);
}
