import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoadError } from "@blazetrails/ruby-compat";
import { ActiveSupport } from "../namespaces.js";
import { SerializerWithFallback as CacheSerializerWithFallback } from "../cache/serializer-with-fallback.js";
import { SerializerWithFallback } from "./serializer-with-fallback.js";

describe("MessagesSerializerWithFallbackTrailsTest", () => {
  let messagePack: typeof ActiveSupport.MessagePack;

  beforeEach(async () => {
    await ActiveSupport.loadPath["active_support/message_pack"]();
    messagePack = ActiveSupport.MessagePack;
  });

  afterEach(() => {
    ActiveSupport.MessagePack = messagePack;
  });

  it("the load path seats ActiveSupport::MessagePack", () => {
    expect(messagePack).toBeDefined();
    expect(SerializerWithFallback.get("message_pack").format()).toBe("message_pack");
  });

  it("[] raises LoadError for a message_pack format while ActiveSupport::MessagePack is not loaded", () => {
    ActiveSupport.MessagePack = undefined;

    for (const format of ["message_pack", "message_pack_allow_marshal"]) {
      expect(() => SerializerWithFallback.get(format)).toThrow(LoadError);
    }
    expect(() => CacheSerializerWithFallback.get("message_pack")).toThrow(
      "cannot load such file -- active_support/message_pack",
    );
    expect(SerializerWithFallback.get("json").format()).toBe("json");
  });

  it("a MessagePack dump is not detected while ActiveSupport::MessagePack is not loaded", () => {
    const dumped = SerializerWithFallback.get("message_pack").dump({ a: 1 });
    const cacheDumped = CacheSerializerWithFallback.get("message_pack").dump("value");
    ActiveSupport.MessagePack = undefined;

    expect(SerializerWithFallback.SERIALIZERS.message_pack.dumped(dumped)).toBe(false);
    expect(CacheSerializerWithFallback.SERIALIZERS.message_pack.dumped(cacheDumped)).toBe(false);
  });
});
