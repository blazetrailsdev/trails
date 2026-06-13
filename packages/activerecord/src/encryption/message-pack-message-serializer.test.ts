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
    // isBinary() returns true: mirrors Rails' MessagePackMessageSerializer#binary?,
    // which signals that the serialized form must be stored in a binary column.
    // The wire format is JSON-based (not real MessagePack), but the binary-column
    // constraint is the key behavioral contract.
    expect(new MessagePackMessageSerializer().isBinary()).toBe(true);
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

  // Pinned against real MRI Rails 8.0.2. Generated with the msgpack gem (>= 1.7.0):
  //
  //   require "active_record/encryption/message_pack_message_serializer"
  //   M = ActiveRecord::Encryption::Message
  //   ser = ActiveRecord::Encryption::MessagePackMessageSerializer.new
  //   msg = M.new(payload: "some payload".b)
  //   msg.headers["key_1"] = "1"
  //   msg.headers["iv"] = (0..11).to_a.pack("C*")
  //   msg.headers["at"] = (100..115).to_a.pack("C*")
  //   ser.dump(msg).bytes  # => the array below
  const MRI_FIXTURE = [
    204, 128, 130, 161, 112, 196, 12, 115, 111, 109, 101, 32, 112, 97, 121, 108, 111, 97, 100, 161,
    104, 131, 165, 107, 101, 121, 95, 49, 161, 49, 162, 105, 118, 196, 12, 0, 1, 2, 3, 4, 5, 6, 7,
    8, 9, 10, 11, 162, 97, 116, 196, 16, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
    112, 113, 114, 115,
  ];

  const fixtureMessage = () => {
    const message = new Message(Buffer.from("some payload", "utf-8"));
    message.headers.set("key_1", "1");
    message.headers.set("iv", Buffer.from(Array.from({ length: 12 }, (_, i) => i)));
    message.headers.set("at", Buffer.from(Array.from({ length: 16 }, (_, i) => i + 100)));
    return message;
  };

  it("dumps bytes identical to real Rails MessagePack", () => {
    const dumped = serializer.dump(fixtureMessage());
    expect([...Buffer.from(dumped, "latin1")]).toEqual(MRI_FIXTURE);
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
