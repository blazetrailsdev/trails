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

  it("encodes non-ASCII string headers as UTF-8 bytes, matching Rails", () => {
    // Rails base64-encodes the String's own bytes (Base64.strict_encode64), which
    // for a UTF-8 string are its UTF-8 bytes. Header text values must therefore be
    // UTF-8-encoded — never latin1, which would diverge from Rails for bytes in
    // 0x80..0xFF and silently truncate code points > 0xFF (e.g. emoji).
    const serializer = new MessageSerializer();
    const message = new Message("payload");
    message.addHeader("tag", "café 😀");
    const parsed = JSON.parse(serializer.dump(message)) as { h: { tag: string } };
    expect(parsed.h.tag).toBe(Buffer.from("café 😀", "utf-8").toString("base64"));
    expect(Buffer.from(parsed.h.tag, "base64").toString("utf-8")).toBe("café 😀");
  });

  it("encodes raw Buffer header values with a single base64 hop", () => {
    // Cipher header bytes (iv, at) arrive as Buffers and must be base64-encoded
    // exactly once — base64(raw bytes), the MRI wire format — not re-encoded.
    const serializer = new MessageSerializer();
    const message = new Message("payload");
    const ivBytes = Buffer.from([0x00, 0x80, 0xff, 0x10, 0x20]);
    message.addHeader("iv", ivBytes);
    const parsed = JSON.parse(serializer.dump(message)) as { h: { iv: string } };
    expect(parsed.h.iv).toBe(ivBytes.toString("base64"));
  });

  it("binary? returns false", () => {
    expect(new MessageSerializer().isBinary()).toBe(false);
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
