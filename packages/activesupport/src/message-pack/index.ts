import { Serializer } from "./serializer.js";
import { CacheSerializer } from "./cache-serializer.js";

export { Serializer } from "./serializer.js";
export { CacheSerializer } from "./cache-serializer.js";
export { Factory, MalformedFormatError, UnknownExtTypeError, UnpackError } from "./factory.js";
export type { Packer, Unpacker } from "./factory.js";
export { Extensions, UnserializableObjectError, MissingClassError } from "./extensions.js";
export type { ObjectClass } from "./extensions.js";

export const MessagePack = new Serializer();
export const MessagePackCacheSerializer = new CacheSerializer();
