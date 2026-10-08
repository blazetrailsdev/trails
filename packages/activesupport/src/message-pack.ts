import "@blazetrails/msgpack";
import { rbModConstSet } from "@blazetrails/ruby-compat/include";
import { runLoadHooks } from "./lazy-load-hooks.js";
import { CacheSerializer } from "./message-pack/cache-serializer.js";
import { Serializer } from "./message-pack/serializer.js";
import { ActiveSupport } from "./namespaces.js";

export { Serializer } from "./message-pack/serializer.js";
export { CacheSerializer } from "./message-pack/cache-serializer.js";
export {
  Extensions,
  UnserializableObjectError,
  MissingClassError,
} from "./message-pack/extensions.js";
export type { ObjectClass } from "./message-pack/extensions.js";

export const MessagePackCacheSerializer = new CacheSerializer();
/** @noRailsEquivalent CONVERGEABLE message-pack-serializer-is-a-module-extended-onto-message-pack */
export const MessagePack = Object.assign(new Serializer(), {
  CacheSerializer: MessagePackCacheSerializer,
});
rbModConstSet(ActiveSupport, "MessagePack", MessagePack);

runLoadHooks("message_pack", MessagePack);
