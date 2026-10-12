import { describe, it, expect, beforeEach } from "vitest";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";
import { Message } from "./message.js";
import { Decryption, ForbiddenClass } from "./errors.js";
import { TypeError } from "@blazetrails/ruby-compat";

describe("ActiveRecord::Encryption::MessagePackMessageSerializerTest", () => {
  let serializer: MessagePackMessageSerializer;

  beforeEach(() => {
    serializer = new MessagePackMessageSerializer();
  });

  it("serializes messages", () => {
    const message = new Message({ payload: "some payload" });
    message.headers.set("key_1", "1");

    const deserialized = serializer.load(serializer.dump(message));
    expect(message.equals(deserialized)).toBe(true);
  });

  it("serializes messages with nested messages in their headers", () => {
    const message = new Message({ payload: "some payload" });
    message.headers.set("key_1", "1");
    const nested = new Message({ payload: "some other secret payload" });
    nested.headers.set("some_header", "some other value");
    message.headers.set("other_message", nested);

    const deserialized = serializer.load(serializer.dump(message));
    expect(message.equals(deserialized)).toBe(true);
  });

  it("detects random data and raises a decryption error", () => {
    expect(() => serializer.load("hey there")).toThrow(Decryption);
  });

  it("detects random JSON hashes and raises a decryption error", () => {
    expect(() => serializer.load(JSON.stringify({ some: "other data" }))).toThrow(Decryption);
  });

  it("raises a TypeError when trying to deserialize other data types", () => {
    expect(() => serializer.load(42 as any)).toThrow(TypeError);
  });

  it("raises ForbiddenClass when trying to serialize other data types", () => {
    expect(() => serializer.dump("it can only serialize messages!" as any)).toThrow(ForbiddenClass);
  });

  it("raises Decryption when trying to parse message with more than one nested message", () => {
    const message = new Message({ payload: "some payload" });
    message.headers.set("key_1", "1");
    const nested = new Message({ payload: "some other secret payload" });
    nested.headers.set("some_header", "some other value");
    const deepNested = new Message({ payload: "yet some other secret payload" });
    deepNested.headers.set("some_header", "yet some other value");
    nested.headers.set("yet_another_message", deepNested);
    message.headers.set("other_message", nested);

    expect(() => serializer.load(serializer.dump(message))).toThrow(Decryption);
  });
});
