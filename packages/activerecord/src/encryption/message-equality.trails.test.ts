import { describe, it, expect } from "vitest";
import { Message } from "./message.js";
import { Properties } from "./properties.js";

/**
 * Trails-only coverage for `Message#==` (message.rb:21) and the `==` that
 * `Properties` delegates to its data hash (properties.rb:20). Rails exercises
 * them only indirectly, through the serializer round trips
 * (`message_serializer_test.rb:14` / `:22`, both `assert_equal message,
 * deserialized_message`) — those assertions are ported in place; the edge cases
 * below have no Rails test to be named after.
 */
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
    // Ruby has one String type for both; trails splits it into `string` and
    // `Buffer`, and a serialize→deserialize round trip returns the Buffer form,
    // so the two must not compare unequal purely on JS type.
    expect(new Message("hello").equals(new Message(Buffer.from("hello")))).toBe(true);
    expect(new Message("hello").equals(new Message(Buffer.from("hellO")))).toBe(false);
  });

  it("is not equal to a non-Message", () => {
    expect(new Message("x").equals(null)).toBe(false);
    expect(new Message("x").equals("x")).toBe(false);
    expect(new Message("x").equals({ payload: "x", headers: new Properties() })).toBe(false);
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

  it("Properties#equals compares raw header bytes on value", () => {
    const withBuffer = new Properties({ iv: Buffer.from("some iv") });
    expect(withBuffer.equals(new Properties({ iv: Buffer.from("some iv") }))).toBe(true);
    expect(withBuffer.equals(new Properties({ iv: Buffer.from("other iv") }))).toBe(false);
    expect(withBuffer.equals(new Properties({ iv: "some iv" }))).toBe(true);
  });
});
