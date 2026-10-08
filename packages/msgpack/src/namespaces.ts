import type { Bigint } from "./bigint.js";
import type { Buffer } from "./buffer.js";
import type { CoreExt } from "./core-ext.js";
import type { ExtensionValue } from "./extension-value.js";
import type { Factory } from "./factory.js";
import type { dump, load, pack, unpack } from "./msgpack.js";
import type { Packer } from "./packer.js";
import type { Time } from "./time.js";
import type { Timestamp } from "./timestamp.js";
import type {
  MalformedFormatError,
  StackError,
  TypeError,
  UnexpectedTypeError,
  UnknownExtTypeError,
  UnpackError,
  Unpacker,
} from "./unpacker.js";
import type { VERSION } from "./version.js";

export const MessagePack = { name: "MessagePack" } as {
  readonly name: string;
  load: typeof load;
  unpack: typeof unpack;
  pack: typeof pack;
  dump: typeof dump;
  VERSION: typeof VERSION;
  Bigint: typeof Bigint;
  Buffer: typeof Buffer;
  CoreExt: typeof CoreExt;
  ExtensionValue: typeof ExtensionValue;
  Packer: typeof Packer;
  Unpacker: typeof Unpacker;
  UnpackError: typeof UnpackError;
  MalformedFormatError: typeof MalformedFormatError;
  StackError: typeof StackError;
  TypeError: typeof TypeError;
  UnexpectedTypeError: typeof UnexpectedTypeError;
  UnknownExtTypeError: typeof UnknownExtTypeError;
  Factory: typeof Factory;
  DefaultFactory: Factory;
  Time: typeof Time;
  Timestamp: typeof Timestamp;
};
