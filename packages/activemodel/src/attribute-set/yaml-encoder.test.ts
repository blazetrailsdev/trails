import { describe, it, expect } from "vitest";
import { YAMLEncoder } from "./yaml-encoder.js";
import { jsonCodec } from "./codecs/json.js";
import type { AttributeSetCoder } from "./codecs/codec.js";
import { AttributeSet } from "../attribute-set.js";
import { Attribute, Uninitialized } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

function makeSet(attrs: Record<string, Attribute>): AttributeSet {
  return new AttributeSet(attrs);
}

function encodeInto(encoder: YAMLEncoder, set: AttributeSet): AttributeSetCoder {
  const coder: AttributeSetCoder = {};
  encoder.encode(set, coder);
  return coder;
}

const stringType = typeRegistry.lookup("string");
const integerType = typeRegistry.lookup("integer");

function stringAttr(name: string, value: string): Attribute {
  return Attribute.fromUser(name, value, stringType);
}

function intAttr(name: string, value: number): Attribute {
  return Attribute.fromUser(name, value, integerType);
}

describe("YAMLEncoder", () => {
  const defaultTypes = { name: stringType, age: integerType };
  const encoder = new YAMLEncoder(defaultTypes);

  it("round-trips a simple set", () => {
    const attrs = {
      name: stringAttr("name", "Alice"),
      age: intAttr("age", 30),
    };
    const set = makeSet(attrs);
    const decoded = encoder.decode(encodeInto(encoder, set));
    expect(decoded.fetchValue("name")).toBe("Alice");
    expect(decoded.fetchValue("age")).toBe(30);
  });

  it("nils out the type of an attribute whose type is the default type", () => {
    const set = makeSet({ name: stringAttr("name", "Alice") });
    expect(encodeInto(encoder, set).conciseAttributes![0].type).toBeNull();
  });

  it("keeps the attribute whose type is not the default type", () => {
    const attr = intAttr("name", 7);
    const set = makeSet({ name: attr });
    expect(encodeInto(encoder, set).conciseAttributes![0]).toBe(attr);
  });

  it("returns the attributes key when the coder carries one", () => {
    const attributes = makeSet({ name: stringAttr("name", "Alice") });
    expect(encoder.decode({ attributes })).toBe(attributes);
  });

  it("restores the default type for an attribute encoded without one", () => {
    const custom = integerType;
    const localEncoder = new YAMLEncoder({ qty: custom });
    const decoded = localEncoder.decode({
      conciseAttributes: [Attribute.fromUser("qty", 5, null)],
    });
    expect(decoded.fetchValue("qty")).toBe(5);
    expect(decoded.castTypes().qty).toBe(custom);
  });

  it("uninitialized attributes round-trip as uninitialized", () => {
    const intType = integerType;
    const localEncoder = new YAMLEncoder({ score: intType });
    const set = makeSet({ score: Attribute.uninitialized("score", intType) });

    const coder = encodeInto(localEncoder, set);
    expect(coder.conciseAttributes![0]).toBeInstanceOf(Uninitialized);

    const decoded = localEncoder.decode(coder);
    expect(decoded.isKey("score")).toBe(false);
    expect(decoded.castTypes().score).toBe(intType);
  });

  it("attr not among the default types is kept with its own type", () => {
    const decoded = encoder.decode({
      conciseAttributes: [
        Attribute.fromUser("name", "Bob", null),
        Attribute.fromUser("extra", "bonus", stringType),
      ],
    });
    expect(decoded.fetchValue("extra")).toBe("bonus");
    expect(decoded.fetchValue("name")).toBe("Bob");
  });

  it("a codec round-trips the coder the encoder filled in", () => {
    const immutableType = typeRegistry.lookup("immutable_string");
    const set = makeSet({
      name: stringAttr("name", "Alice"),
      flag: Attribute.fromUser("flag", "t", immutableType),
      score: Attribute.uninitialized("score", integerType),
    });
    const coder = encodeInto(encoder, set);

    const envelope = JSON.parse(jsonCodec.encode(coder));
    expect(envelope.types.name).toBeNull();
    expect(envelope.types.flag).toBe("immutable_string");
    expect(envelope.defaultAttributes).toContain("score");

    const decoded = encoder.decode(jsonCodec.decode(jsonCodec.encode(coder)));
    expect(decoded.fetchValue("name")).toBe("Alice");
    expect(decoded.fetchValue("flag")).toBe("t");
    expect(decoded.isKey("score")).toBe(false);
  });
});
