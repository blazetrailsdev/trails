import "@blazetrails/msgpack";
import { extend, rbModConstSet } from "@blazetrails/ruby-compat/include";
import { runLoadHooks } from "./lazy-load-hooks.js";
import { CacheSerializer } from "./message-pack/cache-serializer.js";
import { Serializer } from "./message-pack/serializer.js";
import type {
  Extensions,
  MissingClassError,
  UnserializableObjectError,
} from "./message-pack/extensions.js";
import { ActiveSupport } from "./namespaces.js";

export { Serializer } from "./message-pack/serializer.js";
export { CacheSerializer } from "./message-pack/cache-serializer.js";
export {
  Extensions,
  UnserializableObjectError,
  MissingClassError,
} from "./message-pack/extensions.js";
export type { ObjectClass } from "./message-pack/extensions.js";

export const MessagePack = ActiveSupport.MessagePack as Serializer & {
  Serializer: typeof Serializer;
  CacheSerializer: typeof CacheSerializer & Serializer;
  Extensions: typeof Extensions;
  UnserializableObjectError: typeof UnserializableObjectError;
  MissingClassError: typeof MissingClassError;
};
rbModConstSet(MessagePack, "CacheSerializer", CacheSerializer);
rbModConstSet(MessagePack, "Serializer", Serializer);
extend(MessagePack, Serializer);

runLoadHooks("message_pack", MessagePack);
