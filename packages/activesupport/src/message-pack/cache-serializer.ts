import { extend, Module } from "@blazetrails/ruby-compat/include";
import { Serializer } from "./serializer.js";
import { Extensions, MissingClassError } from "./extensions.js";

export const CacheSerializer = new Module().include(Serializer).include({
  load(this: Serializer, dumped: Uint8Array | string): unknown {
    try {
      return CacheSerializer.superMethod(this, "load")!(dumped);
    } catch (e) {
      if (e instanceof MissingClassError) return undefined;
      throw e;
    }
  },

  /** @internal */
  installUnregisteredTypeHandler(this: Serializer): void {
    Extensions.installUnregisteredTypeFallback(this.messagePackFactory);
  },
}) as Module<Serializer> & Serializer;
extend(CacheSerializer, CacheSerializer);
