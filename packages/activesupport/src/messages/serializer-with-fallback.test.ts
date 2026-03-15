import { describe, it } from "vitest";

describe("MessagesSerializerWithFallbackTest", () => {
  it.skip(":marshal serializer dumps objects using Marshal format");

  it.skip(":json serializer dumps objects using JSON format");

  it.skip(":message_pack serializer dumps objects using MessagePack format");

  it.skip("every serializer can load every non-Marshal format");

  it.skip("only :marshal and :*_allow_marshal serializers can load Marshal format");

  it.skip(":json serializer recognizes regular JSON");

  it.skip(":json serializer can load irregular JSON");

  it.skip("notifies when serializer falls back to loading an alternate format");

  it.skip("raises on invalid format name");
});
