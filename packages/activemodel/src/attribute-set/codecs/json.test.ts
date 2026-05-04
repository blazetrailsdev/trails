import { describe, it, expect } from "vitest";
import { jsonCodec } from "./json.js";
import { AttributeSetCoderError } from "../coder.js";
import type { AttributeSetEnvelope } from "../coder.js";

describe("jsonCodec", () => {
  const envelope: AttributeSetEnvelope = {
    v: 1,
    types: { name: "string", age: "integer" },
    values: { name: "Alice", age: 30 },
  };

  it("encodes an envelope to a JSON string", () => {
    const result = jsonCodec.encode(envelope);
    expect(typeof result).toBe("string");
    expect(JSON.parse(result)).toEqual(envelope);
  });

  it("decodes a JSON string back to an envelope", () => {
    const json = JSON.stringify(envelope);
    expect(jsonCodec.decode(json)).toEqual(envelope);
  });

  it("round-trips encode/decode", () => {
    expect(jsonCodec.decode(jsonCodec.encode(envelope))).toEqual(envelope);
  });

  it("throws AttributeSetCoderError on malformed input", () => {
    expect(() => jsonCodec.decode("null")).toThrow(AttributeSetCoderError);
    expect(() => jsonCodec.decode("[]")).toThrow(AttributeSetCoderError);
    expect(() => jsonCodec.decode('{"v":1}')).toThrow(AttributeSetCoderError);
  });

  it("envelope shape snapshot", () => {
    expect(jsonCodec.encode(envelope)).toMatchInlineSnapshot(
      `"{"v":1,"types":{"name":"string","age":"integer"},"values":{"name":"Alice","age":30}}"`,
    );
  });
});
