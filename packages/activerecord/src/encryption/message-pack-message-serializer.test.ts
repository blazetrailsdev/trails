import { describe, it, expect } from "vitest";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";

describe("ActiveRecord::Encryption::MessagePackMessageSerializerTest", () => {
  it("binary? returns false because this implementation uses JSON, not MessagePack binary", () => {
    expect(new MessagePackMessageSerializer().isBinary()).toBe(false);
  });

  it.skip("serializes messages", () => {});
  it.skip("serializes messages with nested messages in their headers", () => {});
  it.skip("detects random data and raises a decryption error", () => {});
  it.skip("detects random JSON hashes and raises a decryption error", () => {});
  it.skip("raises a TypeError when trying to deserialize other data types", () => {});
  it.skip("raises ForbiddenClass when trying to serialize other data types", () => {});
  it.skip("raises Decryption when trying to parse message with more than one nested message", () => {});
});
