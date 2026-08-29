import { describe, it, expect } from "vitest";
import { Message } from "./message.js";
import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::Encryption::MessageTest", () => {
  it("add_header lets you add headers", () => {
    const message = new Message();
    message.headers.set("header_1", "value 1");
    expect(message.headers.get("header_1")).toBe("value 1");
  });

  it("add_headers lets you add multiple headers", () => {
    const message = new Message();
    message.headers.add({ header_1: "value 1", header_2: "value 2" });
    expect(message.headers.get("header_1")).toBe("value 1");
    expect(message.headers.get("header_2")).toBe("value 2");
  });

  it("headers can't be overridden", () => {
    const message = new Message();
    message.headers.add({ header_1: "value 1" });
    expect(() => message.headers.add({ header_1: "value 1" })).toThrow(EncryptedContentIntegrity);
    expect(() => message.headers.add({ header_1: "value 1" })).toThrow(EncryptedContentIntegrity);
  });

  it("validates that payloads are either nil or strings", () => {
    expect(() => new Message({ payload: [] as any })).toThrow(ForbiddenClass);

    new Message();
    new Message({ payload: "" });
    new Message({ payload: "Some payload" });
  });
});
