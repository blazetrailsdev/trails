import { describe, it, expect } from "vitest";
import { MessageSerializer } from "./message-serializer.js";
import { Message } from "./message.js";
import { ArgumentError, JSON as RubyJSON } from "@blazetrails/ruby-compat";
import { Decryption, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessageSerializerTest", () => {
  it("serializes messages", () => {
    const serializer = new MessageSerializer();
    const message = new Message({ payload: "some payload", headers: { key_1: "1" } });
    const deserialized_message = serializer.load(serializer.dump(message));
    expect(deserialized_message.equals(message)).toEqual(true);
  });

  it("serializes messages with nested messages in their headers", () => {
    const serializer = new MessageSerializer();
    const message = new Message({ payload: "some payload", headers: { key_1: "1" } });
    message.headers.set(
      "other_message",
      new Message({
        payload: "some other secret payload",
        headers: { some_header: "some other value" },
      }),
    );

    const deserialized_message = serializer.load(serializer.dump(message));
    expect(deserialized_message.equals(message)).toEqual(true);
  });

  it.skip("won't load classes from JSON", () => {
    // BLOCKED: ruby-compat-json-load-create-additions-argument-error
    const serializer = new MessageSerializer();
    const class_loading_payload = RubyJSON.dump({
      p: Buffer.from("Some payload").toString("base64"),
      json_class: "MessageSerializerTest::SomeClassThatWillNeverExist",
    });

    expect(() => RubyJSON.load(class_loading_payload)).toThrow(ArgumentError);
    expect(() => serializer.load(class_loading_payload)).not.toThrow();
  });

  it("detects random JSON data and raises a decryption error", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load("[1,2,3]")).toThrow(Decryption);
  });

  it("detects random JSON hashes and raises a decryption error", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load('{"foo":"bar"}')).toThrow(Decryption);
  });

  it("detects JSON hashes with a 'p' key that is not encoded in base64", () => {
    const serializer = new MessageSerializer();
    expect(() => serializer.load('{"p":"aGVsbG8$","h":{}}')).toThrow(Decryption);
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
    const serializer = new MessageSerializer();
    const message = new Message({ payload: "payload" });
    message.headers.set("tag", "café 😀");
    const dumped = serializer.dump(message);
    const parsed = JSON.parse(dumped) as { h: { tag: string } };
    expect(parsed.h.tag).toBe(Buffer.from("café 😀", "utf-8").toString("base64"));
    const loaded = serializer.load(dumped);
    expect((loaded.headers.get("tag") as Buffer).toString("utf-8")).toBe("café 😀");
  });

  it("binary? returns false", () => {
    expect(new MessageSerializer().isBinary()).toBe(false);
  });

  it("raises Decryption when trying to parse message with more than one nested message", () => {
    const serializer = new MessageSerializer();
    const message = new Message({ payload: "some payload", headers: { key_1: "1" } });
    const otherMessage = new Message({
      payload: "some other secret payload",
      headers: { some_header: "some other value" },
    });
    otherMessage.headers.set(
      "yet_another_message",
      new Message({
        payload: "yet some other secret payload",
        headers: { some_header: "yet some other value" },
      }),
    );
    message.headers.set("other_message", otherMessage);

    expect(() => serializer.load(serializer.dump(message))).toThrow(Decryption);
  });
});
