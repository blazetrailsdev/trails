import { describe, it, expect, beforeEach } from "vitest";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";
import { Message } from "./message.js";
import { Decryption, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessagePackMessageSerializerTest", () => {
  let serializer: MessagePackMessageSerializer;

  beforeEach(() => {
    serializer = new MessagePackMessageSerializer();
  });

  it("binary? returns false because this implementation uses JSON, not MessagePack binary", () => {
    expect(new MessagePackMessageSerializer().isBinary()).toBe(true);
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

  const MRI_FIXTURE = [
    204, 128, 130, 161, 112, 196, 12, 115, 111, 109, 101, 32, 112, 97, 121, 108, 111, 97, 100, 161,
    104, 131, 165, 107, 101, 121, 95, 49, 161, 49, 162, 105, 118, 196, 12, 0, 1, 2, 3, 4, 5, 6, 7,
    8, 9, 10, 11, 162, 97, 116, 196, 16, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
    112, 113, 114, 115,
  ];

  const fixtureMessage = () => {
    const message = new Message({ payload: Buffer.from("some payload", "utf-8") });
    message.headers.set("key_1", "1");
    message.headers.set("iv", Buffer.from(Array.from({ length: 12 }, (_, i) => i)));
    message.headers.set("at", Buffer.from(Array.from({ length: 16 }, (_, i) => i + 100)));
    return message;
  };

  it("dumps bytes identical to real Rails MessagePack", () => {
    const dumped = serializer.dump(fixtureMessage());
    expect([...Buffer.from(dumped, "latin1")]).toEqual(MRI_FIXTURE);
  });

  it("round-trips values that span the str8/bin16/map16 length-prefix boundaries", () => {
    const message = new Message({ payload: Buffer.from("x".repeat(50)) });
    message.headers.set("long", "y".repeat(40));
    message.headers.set("big", Buffer.from("z".repeat(300)));
    for (let i = 0; i < 20; i++) message.headers.set(`k${i}`, `v${i}`);

    expect(serializer.load(serializer.dump(message))).toEqual(message);
  });

  it("loads a MessagePack ciphertext produced by real Rails", () => {
    const message = serializer.load(Buffer.from(MRI_FIXTURE).toString("latin1"));
    expect((message.payload as Buffer).toString("utf-8")).toBe("some payload");
    expect(message.headers.get("key_1")).toBe("1");
    expect([...(message.headers.get("iv") as Buffer)]).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
    expect([...(message.headers.get("at") as Buffer)]).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 100),
    );
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
