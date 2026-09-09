import { describe, it, expect } from "vitest";
import { jsonCodec } from "./json.js";
import { AttributeSetCodecError } from "./codec.js";
import type { AttributeSetCoder } from "./codec.js";
import { Attribute } from "../../attribute.js";
import { typeRegistry } from "../../type/registry.js";

const stringType = typeRegistry.lookup("string");
const integerType = typeRegistry.lookup("integer");

describe("jsonCodec", () => {
  const coder: AttributeSetCoder = {
    conciseAttributes: [
      Attribute.fromUser("name", "Alice", stringType),
      Attribute.fromUser("age", 30, integerType),
    ],
  };

  it("encodes a coder to a JSON string", () => {
    const result = jsonCodec.encode(coder);
    expect(typeof result).toBe("string");
    expect(JSON.parse(result)).toEqual({
      v: 1,
      types: { name: "string", age: "integer" },
      values: { name: "Alice", age: 30 },
    });
  });

  it("decodes a JSON string back to a coder", () => {
    const decoded = jsonCodec.decode(jsonCodec.encode(coder));
    expect(decoded.conciseAttributes!.map((attr) => attr.name)).toEqual(["name", "age"]);
    expect(decoded.conciseAttributes![0].type!.type()).toBe("string");
    expect(decoded.conciseAttributes![0].valueBeforeTypeCast).toBe("Alice");
  });

  it("round-trips encode/decode", () => {
    expect(jsonCodec.encode(jsonCodec.decode(jsonCodec.encode(coder)))).toEqual(
      jsonCodec.encode(coder),
    );
  });

  it("carries a nil type through as null", () => {
    const nilTyped: AttributeSetCoder = {
      conciseAttributes: [Attribute.fromUser("name", "Alice", null)],
    };
    expect(JSON.parse(jsonCodec.encode(nilTyped)).types.name).toBeNull();
    expect(jsonCodec.decode(jsonCodec.encode(nilTyped)).conciseAttributes![0].type).toBeNull();
  });

  it("carries an uninitialized attribute through as itself", () => {
    const uninitialized: AttributeSetCoder = {
      conciseAttributes: [Attribute.uninitialized("score", integerType)],
    };
    const encoded = jsonCodec.encode(uninitialized);
    expect(JSON.parse(encoded).defaultAttributes).toEqual(["score"]);
    const decoded = jsonCodec.decode(encoded).conciseAttributes![0];
    expect(decoded.isInitialized()).toBe(false);
    expect(decoded.name).toBe("score");
  });

  it("throws AttributeSetCodecError on an unsupported envelope version", () => {
    expect(() => jsonCodec.decode('{"v":2,"types":{},"values":{}}')).toThrow(
      AttributeSetCodecError,
    );
  });

  it("throws AttributeSetCodecError on malformed input", () => {
    expect(() => jsonCodec.decode("null")).toThrow(AttributeSetCodecError);
    expect(() => jsonCodec.decode("[]")).toThrow(AttributeSetCodecError);
    expect(() => jsonCodec.decode('{"v":1}')).toThrow(AttributeSetCodecError);
    expect(() => jsonCodec.decode('{"v":1,"types":null,"values":{}}')).toThrow(
      AttributeSetCodecError,
    );
  });

  it("encodes bigint values as strings without throwing", () => {
    const bigintCoder: AttributeSetCoder = {
      conciseAttributes: [
        Attribute.fromUser("id", BigInt("9007199254740993"), typeRegistry.lookup("big_integer")),
      ],
    };
    const encoded = jsonCodec.encode(bigintCoder);
    expect(encoded).toContain('"9007199254740993"');
    expect(jsonCodec.decode(encoded).conciseAttributes![0].valueBeforeTypeCast).toBe(
      "9007199254740993",
    );
  });

  it("envelope shape snapshot", () => {
    expect(jsonCodec.encode(coder)).toMatchInlineSnapshot(
      `"{"v":1,"types":{"name":"string","age":"integer"},"values":{"name":"Alice","age":30}}"`,
    );
  });
});
