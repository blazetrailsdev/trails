import { describe, it, expect } from "vitest";
import { MessageSerializer } from "./message-serializer.js";
import { Message } from "./message.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessageSerializerTest", () => {
  it("serializes messages", () => {
    const serializer = new MessageSerializer();
    const message = new Message("hello");
    message.addHeader("iv", "test-iv");
    const serialized = serializer.dump(message);
    const loaded = serializer.load(serialized);
    expect(loaded.payload).toBe("hello");
    expect(loaded.headers.get("iv")).toBe("test-iv");
  });

  it("serializes messages with nested messages in their headers", () => {
    const serializer = new MessageSerializer();
    const inner = new Message("inner-payload");
    inner.addHeader("iv", "inner-iv");

    const outer = new Message("outer-payload");
    outer.headers.set("nested", inner);

    const serialized = serializer.dump(outer);
    const loaded = serializer.load(serialized);
    expect(loaded.payload).toBe("outer-payload");
    const nested = loaded.headers.get("nested") as Message;
    expect(nested).toBeInstanceOf(Message);
    expect(nested.payload).toBe("inner-payload");
  });

  it("won't load classes from JSON", () => {
    const serializer = new MessageSerializer();
    const malicious = JSON.stringify({
      p: Buffer.from("test").toString("base64"),
      h: {},
      __proto__: { admin: true },
    });
    const loaded = serializer.load(malicious);
    expect(loaded.payload).toBe("test");
  });

  it("detects random JSON data and raises a decryption error", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load("[1,2,3]")).toThrow(DecryptionError);
  });

  it("detects random JSON hashes and raises a decryption error", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load('{"foo":"bar"}')).toThrow(DecryptionError);
  });

  it("detects JSON hashes with a 'p' key that is not encoded in base64", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load('{"p":"aGVsbG8$","h":{}}')).toThrow(DecryptionError);
  });

  it("raises a TypeError when trying to deserialize other data types", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load(42 as any)).toThrow(TypeError);
  });

  it("raises ForbiddenClass when trying to serialize other data types", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.dump("not a message" as any)).toThrow(ForbiddenClass);
  });

  it("raises Decryption when trying to parse message with more than one nested message", () => {
    const serializer = new MessageSerializer();
    const data = JSON.stringify({
      p: Buffer.from("payload").toString("base64"),
      h: {
        nested1: { p: Buffer.from("inner1").toString("base64"), h: {} },
        nested2: { p: Buffer.from("inner2").toString("base64"), h: {} },
      },
    });
    expect(() => serializer.load(data)).toThrow(DecryptionError);
  });
});
