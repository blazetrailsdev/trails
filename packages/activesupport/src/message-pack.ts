import { warn } from "@blazetrails/ruby-compat";
import { runLoadHooks } from "./lazy-load-hooks.js";
import { CacheSerializer } from "./message-pack/cache-serializer.js";
import { Serializer } from "./message-pack/serializer.js";

import("@blazetrails/msgpack").catch((error: unknown) => {
  warn(
    "ActiveSupport::MessagePack requires the msgpack gem, version 1.7.0 or later. " +
      'Please add it to your Gemfile: `gem "msgpack", ">= 1.7.0"`',
  );
  throw error;
});

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
