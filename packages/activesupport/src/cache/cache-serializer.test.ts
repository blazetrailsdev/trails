import { describe, it } from "vitest";

describe("CacheSerializerWithFallbackTest", () => {
  it.skip(" serializer can load  dump");
  it.skip(" serializer handles unrecognized payloads gracefully");
  it.skip(" serializer logs unrecognized payloads");
  it.skip(" serializer can compress entries");
  it.skip(":message_pack serializer handles missing class gracefully");
  it.skip("raises on invalid format name");
});

describe("MessagePackCacheSerializerTest", () => {
  it.skip("uses #to_msgpack_ext and ::from_msgpack_ext to roundtrip unregistered objects");
  it.skip("uses #as_json and ::json_create to roundtrip unregistered objects");
  it.skip("raises error when unable to serialize an unregistered object");
  it.skip("raises error when serializing an unregistered object with an anonymous class");
  it.skip("handles missing class gracefully");
});
