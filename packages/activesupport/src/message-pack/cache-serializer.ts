import { RuntimeError } from "@blazetrails/ruby-compat";
import { extend, include } from "@blazetrails/ruby-compat/include";
import { SIGNATURE_INT, Serializer, type SerializerHost } from "./serializer.js";
import { Extensions } from "./extensions.js";
import { ActiveSupport } from "../namespaces.js";

export const CacheSerializer = {
  load(this: Serializer, dumped: Uint8Array | string): unknown {
    try {
      return (this as unknown as SerializerHost).messagePackPool().unpacker((unpacker) => {
        unpacker.feedReference(dumped);
        if (!(unpacker.read() === SIGNATURE_INT))
          throw new RuntimeError("Invalid serialization format");
        return unpacker.fullUnpack();
      });
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
