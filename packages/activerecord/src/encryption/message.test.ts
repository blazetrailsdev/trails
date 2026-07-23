import { describe, it, expect } from "vitest";
import { Message } from "./message.js";
import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessageTest", () => {
  it("add_header lets you add headers", () => {
    const message = new Message();
    message.addHeader("header_1", "value 1");
    expect(message.headers.get("header_1")).toBe("value 1");
  });

  it("add_headers lets you add multiple headers", () => {
    const message = new Message();
    message.addHeaders({ header_1: "value 1", header_2: "value 2" });
    expect(message.headers.get("header_1")).toBe("value 1");
    expect(message.headers.get("header_2")).toBe("value 2");
  });

  it("headers can't be overridden", () => {
    const message = new Message();
    message.addHeaders({ header_1: "value 1" });
    expect(() => message.addHeaders({ header_1: "value 1" })).toThrow(EncryptedContentIntegrity);
    expect(() => message.addHeaders({ header_1: "value 1" })).toThrow(EncryptedContentIntegrity);
  });

  it("validates that payloads are either nil or strings", () => {
    // Rails uses Date.new / []; Temporal.PlainDate has no zero-arg analogue, so
    // an array stands in for the non-string payload.
    expect(() => new Message([] as any)).toThrow(ForbiddenClass);
    expect(() => new Message()).not.toThrow();
    expect(() => new Message("")).not.toThrow();
    expect(() => new Message("Some payload")).not.toThrow();
  });
});
