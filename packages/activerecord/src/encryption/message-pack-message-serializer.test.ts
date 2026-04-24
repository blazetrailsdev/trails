import { describe, it, expect, beforeEach } from "vitest";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";
import { Message } from "./message.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessagePackMessageSerializerTest", () => {
  let serializer: MessagePackMessageSerializer;

  beforeEach(() => {
    serializer = new MessagePackMessageSerializer();
  });

  it("binary? returns false because this implementation uses JSON, not MessagePack binary", () => {
    expect(new MessagePackMessageSerializer().isBinary()).toBe(false);
  });

  it("serializes messages", () => {
    const message = new Message("some payload");
    message.headers.set("key_1", "1");

    const deserialized = serializer.load(serializer.dump(message));
    expect(deserialized).toEqual(message);
  });

  it("serializes messages with nested messages in their headers", () => {
    const message = new Message("some payload");
    message.headers.set("key_1", "1");
    const nested = new Message("some other secret payload");
    nested.headers.set("some_header", "some other value");
    message.headers.set("other_message", nested);

    const deserialized = serializer.load(serializer.dump(message));
    expect(deserialized).toEqual(message);
  });

  it("detects random data and raises a decryption error", () => {
    expect(() => serializer.load("hey there")).toThrow(DecryptionError);
  });

  it("detects random JSON hashes and raises a decryption error", () => {
    expect(() => serializer.load(JSON.stringify({ some: "other data" }))).toThrow(DecryptionError);
  });

  it("raises a TypeError when trying to deserialize other data types", () => {
    expect(() => serializer.load(42 as any)).toThrow(TypeError);
  });

  it("raises ForbiddenClass when trying to serialize other data types", () => {
    expect(() => serializer.dump("it can only serialize messages!" as any)).toThrow(ForbiddenClass);
  });

  it("raises Decryption when trying to parse message with more than one nested message", () => {
    const message = new Message("some payload");
    message.headers.set("key_1", "1");
    const nested = new Message("some other secret payload");
    nested.headers.set("some_header", "some other value");
    const deepNested = new Message("yet some other secret payload");
    deepNested.headers.set("some_header", "yet some other value");
    nested.headers.set("yet_another_message", deepNested);
    message.headers.set("other_message", nested);

    expect(() => serializer.load(serializer.dump(message))).toThrow(DecryptionError);
  });
});
