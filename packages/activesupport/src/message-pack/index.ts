/**
 * Mirrors: ActiveSupport::MessagePack
 *
 * `MessagePack` is the singleton that `extend Serializer` produces in Ruby;
 * `MessagePack.dump`/`load`/`isSignature` round-trip via the registered extension
 * types. `MessagePackCacheSerializer` is the cache variant.
 */

import { Serializer } from "./serializer.js";
import { CacheSerializer } from "./cache-serializer.js";

export { Serializer } from "./serializer.js";
export { CacheSerializer } from "./cache-serializer.js";
export { Factory, MessagePackError } from "./factory.js";
export {
  Extensions,
  UnserializableObjectError,
  MissingClassError,
  registerObjectClass,
} from "./extensions.js";
export type { ObjectClass } from "./extensions.js";

export const MessagePack = new Serializer();
export const MessagePackCacheSerializer = new CacheSerializer();
