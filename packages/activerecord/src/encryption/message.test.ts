import { describe, it, expect } from "vitest";
import { Message } from "./message.js";
import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessageTest", () => {
  it("add_header lets you add headers", () => {
    const message = new Message("payload");
    message.addHeader("key", "value");
    expect(message.headers.get("key")).toBe("value");
  });

  it("add_headers lets you add multiple headers", () => {
    const message = new Message("payload");
    message.addHeaders({ a: "1", b: "2" });
    expect(message.headers.get("a")).toBe("1");
    expect(message.headers.get("b")).toBe("2");
  });

  it("headers can't be overridden", () => {
    const message = new Message("payload");
    message.addHeader("key", "value");
    expect(() => message.addHeader("key", "other")).toThrow(EncryptedContentIntegrity);
  });

  it("validates that payloads are either nil or strings", () => {
    expect(() => new Message(42 as any)).toThrow(ForbiddenClass);
    expect(() => new Message(null)).not.toThrow();
    expect(() => new Message(undefined)).not.toThrow();
    expect(() => new Message("hello")).not.toThrow();
  });
});
