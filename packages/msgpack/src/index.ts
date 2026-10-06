import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Buffer } from "./buffer.js";
import { Factory } from "./factory.js";
import { DefaultFactory, dump, load, pack, unpack } from "./msgpack.js";
import { Packer } from "./packer.js";
import {
  MalformedFormatError,
  StackError,
  UnexpectedTypeError,
  UnknownExtTypeError,
  UnpackError,
  Unpacker,
} from "./unpacker.js";
import { VERSION } from "./version.js";

export * from "./buffer.js";
export { Factory } from "./factory.js";
export type { RegisterTypeOptions, RegisteredType } from "./factory.js";
export * from "./msgpack.js";
export * from "./packer.js";
export * from "./unpacker.js";
export * from "./version.js";

export const MessagePack = { name: "MessagePack", load, unpack, pack, dump } as {
  readonly name: string;
  load: typeof load;
  unpack: typeof unpack;
  pack: typeof pack;
  dump: typeof dump;
  VERSION: typeof VERSION;
  Buffer: typeof Buffer;
  Packer: typeof Packer;
  Unpacker: typeof Unpacker;
  UnpackError: typeof UnpackError;
  MalformedFormatError: typeof MalformedFormatError;
  StackError: typeof StackError;
  UnexpectedTypeError: typeof UnexpectedTypeError;
  UnknownExtTypeError: typeof UnknownExtTypeError;
  Factory: typeof Factory;
  DefaultFactory: typeof DefaultFactory;
};
rbModConstSet(MessagePack, "VERSION", VERSION);
rbModConstSet(MessagePack, "Buffer", Buffer);
rbModConstSet(MessagePack, "Packer", Packer);
rbModConstSet(MessagePack, "Unpacker", Unpacker);
rbModConstSet(MessagePack, "UnpackError", UnpackError);
rbModConstSet(MessagePack, "MalformedFormatError", MalformedFormatError);
rbModConstSet(MessagePack, "StackError", StackError);
rbModConstSet(MessagePack, "UnexpectedTypeError", UnexpectedTypeError);
rbModConstSet(MessagePack, "UnknownExtTypeError", UnknownExtTypeError);
rbModConstSet(MessagePack, "Factory", Factory);
rbModConstSet(MessagePack, "DefaultFactory", DefaultFactory);
