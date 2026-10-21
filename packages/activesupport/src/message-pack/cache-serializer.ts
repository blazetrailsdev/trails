import { extend, include } from "@blazetrails/ruby-compat/include";
import { Serializer } from "./serializer.js";
import { Extensions } from "./extensions.js";
import { ActiveSupport } from "../namespaces.js";

export const CacheSerializer = {
  load(this: Serializer, dumped: Uint8Array | string): unknown {
    try {
      return Serializer.load.call(this as never, dumped);
    } catch (e) {
      if (e instanceof ActiveSupport.MessagePack!.MissingClassError) return undefined;
      throw e;
    }
  },

  /** @internal */
  installUnregisteredTypeHandler(this: Serializer): void {
    Extensions.installUnregisteredTypeFallback(this.messagePackFactory);
  },
};
include(CacheSerializer, Serializer);
extend(CacheSerializer, CacheSerializer);
