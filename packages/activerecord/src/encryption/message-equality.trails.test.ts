import { describe, it, expect } from "vitest";
import { Message } from "./message.js";
import { Properties } from "./properties.js";

describe("MessageEqualityTrails", () => {
  it("compares payload and headers", () => {
    const build = () => {
      const message = new Message("some payload");
      message.addHeader("key_1", "1");
      return message;
    };
    expect(build().equals(build())).toBe(true);

    const otherPayload = new Message("other payload");
    otherPayload.addHeader("key_1", "1");
    expect(build().equals(otherPayload)).toBe(false);

    const otherHeaderValue = new Message("some payload");
    otherHeaderValue.addHeader("key_1", "2");
    expect(build().equals(otherHeaderValue)).toBe(false);

    expect(build().equals(new Message("some payload"))).toBe(false);
  });

  it("compares string and Buffer payloads on bytes", () => {
    expect(new Message("hello").equals(new Message(Buffer.from("hello")))).toBe(true);
    expect(new Message("hello").equals(new Message(Buffer.from("hellO")))).toBe(false);
  });

  it("compares any message-like object, without a class guard", () => {
    const message = new Message("x");
    message.addHeader("iv", "some iv");
    expect(message.equals({ payload: "x", headers: new Properties({ iv: "some iv" }) })).toBe(true);
    expect(message.equals({ payload: "x", headers: { iv: "some iv" } })).toBe(true);
    expect(message.equals({ payload: "y", headers: { iv: "some iv" } })).toBe(false);
    expect(message.equals({ payload: "x", headers: {} })).toBe(false);
  });

  it("raises on a value that carries no payload, as Ruby's NoMethodError does", () => {
    expect(() => new Message("x").equals(null as never)).toThrow();
    expect(() => new Message("x").equals("x" as never)).toThrow();
  });

  it("compares nested Messages in headers by value", () => {
    const build = () => {
      const message = new Message("outer");
      const nested = new Message("inner");
      nested.addHeader("some_header", "some value");
      message.headers.set("other_message", nested);
      return message;
    };
    expect(build().equals(build())).toBe(true);

    const differentNested = new Message("outer");
    const nested = new Message("inner");
    nested.addHeader("some_header", "other value");
    differentNested.headers.set("other_message", nested);
    expect(build().equals(differentNested)).toBe(false);
  });

  it("Properties#equals is Hash equality — same size and same per-key values", () => {
    expect(new Properties({ a: "1" }).equals(new Properties({ a: "1" }))).toBe(true);
    expect(new Properties({ a: "1" }).equals(new Properties({ a: "2" }))).toBe(false);
    expect(new Properties({ a: "1" }).equals(new Properties({ b: "1" }))).toBe(false);
    expect(new Properties({ a: "1" }).equals(new Properties({ a: "1", b: "2" }))).toBe(false);
    expect(new Properties({ a: "1", b: "2" }).equals(new Properties({ a: "1" }))).toBe(false);
    expect(new Properties().equals(new Properties())).toBe(true);
    expect(new Properties().equals(null)).toBe(false);
  });

  it("Properties#equals compares against the backing hash, not just a wrapper", () => {
    expect(new Properties({ a: "1" }).equals({ a: "1" })).toBe(true);
    expect(new Properties({ a: "1" }).equals({ a: "2" })).toBe(false);
    expect(new Properties({ a: "1" }).equals({ b: "1" })).toBe(false);
    expect(new Properties({ a: "1" }).equals({ a: "1", b: "2" })).toBe(false);
    expect(new Properties({ a: "1", b: "2" }).equals({ a: "1" })).toBe(false);
    expect(new Properties().equals({})).toBe(true);
    expect(new Properties({ a: "1" }).equals(new Map([["a", "1"]]))).toBe(true);
  });

  it("Properties#equals is false for a value Ruby's Hash#== rejects outright", () => {
    expect(new Properties({ a: "1" }).equals("a")).toBe(false);
    expect(new Properties({ a: "1" }).equals(5)).toBe(false);
    expect(new Properties({ a: "1" }).equals(new Message("a"))).toBe(false);
  });

  it("Properties#equals compares raw header bytes on value", () => {
    const withBuffer = new Properties({ iv: Buffer.from("some iv") });
    expect(withBuffer.equals(new Properties({ iv: Buffer.from("some iv") }))).toBe(true);
    expect(withBuffer.equals(new Properties({ iv: Buffer.from("other iv") }))).toBe(false);
    expect(withBuffer.equals(new Properties({ iv: "some iv" }))).toBe(true);
  });
});
