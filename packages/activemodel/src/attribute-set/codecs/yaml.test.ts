import { describe, it, expect } from "vitest";
import { yamlCodec } from "@blazetrails/activemodel/yaml";
import { AttributeSetCodecError } from "./codec.js";
import type { AttributeSetCoder } from "./codec.js";
import { Attribute } from "../../attribute.js";
import { typeRegistry } from "../../type/registry.js";

const stringType = typeRegistry.lookup("string");
const integerType = typeRegistry.lookup("integer");

describe("yamlCodec", () => {
  const coder: AttributeSetCoder = {
    conciseAttributes: [
      Attribute.fromUser("name", "Alice", stringType),
      Attribute.fromUser("age", 30, integerType),
    ],
  };

  it("encodes a coder to a YAML string", () => {
    const result = yamlCodec.encode(coder);
    expect(typeof result).toBe("string");
    expect(result).toContain("v: 1");
    expect(result).toContain("name: string");
  });

  it("decodes a YAML string back to a coder", () => {
    const decoded = yamlCodec.decode(yamlCodec.encode(coder));
    expect(decoded.conciseAttributes!.map((attr) => attr.name)).toEqual(["name", "age"]);
    expect(decoded.conciseAttributes![0].type!.name).toBe("string");
    expect(decoded.conciseAttributes![0].valueBeforeTypeCast).toBe("Alice");
  });

  it("round-trips encode/decode", () => {
    expect(yamlCodec.encode(yamlCodec.decode(yamlCodec.encode(coder)))).toEqual(
      yamlCodec.encode(coder),
    );
  });

  it("throws AttributeSetCodecError on an unsupported envelope version", () => {
    expect(() => yamlCodec.decode("v: 2\ntypes: {}\nvalues: {}")).toThrow(AttributeSetCodecError);
  });

  it("throws AttributeSetCodecError on malformed input", () => {
    expect(() => yamlCodec.decode("null")).toThrow(AttributeSetCodecError);
    expect(() => yamlCodec.decode("- item")).toThrow(AttributeSetCodecError);
    expect(() => yamlCodec.decode("v: 1")).toThrow(AttributeSetCodecError);
    expect(() => yamlCodec.decode("v: 1\ntypes: ~\nvalues: {}")).toThrow(AttributeSetCodecError);
  });

  it("round-trips with unknown type key (schema drift)", () => {
    const drifted = "v: 1\ntypes:\n  score: future_type\nvalues:\n  score: 42\n";
    const decoded = yamlCodec.decode(drifted);
    expect(decoded.conciseAttributes![0].type!.name).toBe("value");
    expect(decoded.conciseAttributes![0].valueBeforeTypeCast).toBe(42);
  });

  it("encodes bigint values as strings to preserve precision", () => {
    const bigintCoder: AttributeSetCoder = {
      conciseAttributes: [
        Attribute.fromUser("id", BigInt("9007199254740993"), typeRegistry.lookup("big_integer")),
      ],
    };
    const decoded = yamlCodec.decode(yamlCodec.encode(bigintCoder));
    expect(decoded.conciseAttributes![0].valueBeforeTypeCast).toBe("9007199254740993");
  });

  it("envelope shape snapshot", () => {
    expect(yamlCodec.encode(coder)).toMatchInlineSnapshot(`
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
