import { describe, it, expect } from "vitest";
import { yamlCodec } from "@blazetrails/activemodel/yaml";
import { AttributeSetCoderError } from "../coder.js";
import type { AttributeSetEnvelope } from "../coder.js";

describe("yamlCodec", () => {
  const envelope: AttributeSetEnvelope = {
    v: 1,
    types: { name: "string", age: "integer" },
    values: { name: "Alice", age: 30 },
  };

  it("encodes an envelope to a YAML string", () => {
    const result = yamlCodec.encode(envelope);
    expect(typeof result).toBe("string");
    expect(result).toContain("v: 1");
    expect(result).toContain("name: string");
  });

  it("decodes a YAML string back to an envelope", () => {
    const yaml = yamlCodec.encode(envelope);
    expect(yamlCodec.decode(yaml)).toEqual(envelope);
  });

  it("round-trips encode/decode", () => {
    expect(yamlCodec.decode(yamlCodec.encode(envelope))).toEqual(envelope);
  });

  it("throws AttributeSetCoderError on malformed input", () => {
    expect(() => yamlCodec.decode("null")).toThrow(AttributeSetCoderError);
    expect(() => yamlCodec.decode("- item")).toThrow(AttributeSetCoderError);
    expect(() => yamlCodec.decode("v: 1")).toThrow(AttributeSetCoderError);
    expect(() => yamlCodec.decode("v: 1\ntypes: ~\nvalues: {}")).toThrow(AttributeSetCoderError);
  });

  it("round-trips with unknown type key (schema drift)", () => {
    const driftEnvelope: AttributeSetEnvelope = {
      v: 1,
      types: { score: "future_type" },
      values: { score: 42 },
    };
    expect(yamlCodec.decode(yamlCodec.encode(driftEnvelope))).toEqual(driftEnvelope);
  });

  it("encodes bigint values as strings to preserve precision", () => {
    const bigintEnvelope: AttributeSetEnvelope = {
      v: 1,
      types: { id: "big_integer" },
      values: { id: BigInt("9007199254740993") as unknown },
    };
    const decoded = yamlCodec.decode(yamlCodec.encode(bigintEnvelope));
    expect(decoded.values.id).toBe("9007199254740993");
  });

  it("envelope shape snapshot", () => {
    expect(yamlCodec.encode(envelope)).toMatchInlineSnapshot(`
      "v: 1
      types:
        name: string
        age: integer
      values:
        name: Alice
        age: 30
      "
    `);
  });
});
