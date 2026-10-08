import "@blazetrails/msgpack";
import { runLoadHooks } from "./lazy-load-hooks.js";
import { CacheSerializer } from "./message-pack/cache-serializer.js";
import { Serializer } from "./message-pack/serializer.js";

export { Serializer } from "./message-pack/serializer.js";
export { CacheSerializer } from "./message-pack/cache-serializer.js";
export {
  Extensions,
  UnserializableObjectError,
  MissingClassError,
} from "./message-pack/extensions.js";
export type { ObjectClass } from "./message-pack/extensions.js";

export const MessagePack = new Serializer();
export const MessagePackCacheSerializer = new CacheSerializer();

runLoadHooks("message_pack", MessagePack);
