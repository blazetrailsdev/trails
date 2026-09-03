import { describe, it, expect, vi, afterEach } from "vitest";
import { YAMLEncoder } from "./yaml-encoder.js";
import { AttributeSetCodecError } from "./codecs/codec.js";
import { jsonCodec } from "./codecs/json.js";
import type { AttributeSetEnvelope } from "./codecs/codec.js";
import { AttributeSet } from "../attribute-set.js";
import { Attribute } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

function makeSet(attrs: Record<string, Attribute>): AttributeSet {
  return new AttributeSet(attrs);
}

function encodeInto(encoder: YAMLEncoder, set: AttributeSet): AttributeSetEnvelope {
  const coder = {} as AttributeSetEnvelope;
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("omits the type of an attribute whose type is the default type", () => {
    const set = makeSet({ name: stringAttr("name", "Alice") });
    expect(encodeInto(encoder, set).types.name).toBeNull();
  });

  it("writes the type of an attribute whose type is not the default type", () => {
    const set = makeSet({ name: intAttr("name", 7) });
    expect(encodeInto(encoder, set).types.name).toBe("integer");
  });

  it("restores the default type for an attribute encoded without one", () => {
    const custom = integerType;
    const localEncoder = new YAMLEncoder({ qty: custom });
    const decoded = localEncoder.decode({ v: 1, types: { qty: null }, values: { qty: 5 } });
    expect(decoded.fetchValue("qty")).toBe(5);
    expect(decoded.castTypes().qty).toBe(custom);
  });

  it("uninitialized attributes round-trip as uninitialized", () => {
    const intType = integerType;
    const localEncoder = new YAMLEncoder({ score: intType });
    const set = makeSet({ score: Attribute.uninitialized("score", intType) });

    const coder = encodeInto(localEncoder, set);
    expect(coder.defaultAttributes).toContain("score");

    const decoded = localEncoder.decode(coder);
    expect(decoded.isKey("score")).toBe(false);
    expect(decoded.castTypes().score).toBe(intType);
  });

  it("unknown type key falls back to value type and warns once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const localEncoder = new YAMLEncoder({});
    const coder: AttributeSetEnvelope = {
      v: 1,
      types: { x: "unknown_type_xyz" },
      values: { x: "hello" },
    };
    const decoded = localEncoder.decode(coder);
    expect(decoded.fetchValue("x")).toBe("hello");
    expect(warnSpy).toHaveBeenCalledOnce();
    localEncoder.decode(coder);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("v mismatch throws AttributeSetCodecError", () => {
    const coder = { v: 2, types: {}, values: {} } as unknown as AttributeSetEnvelope;
    expect(() => encoder.decode(coder)).toThrow(AttributeSetCodecError);
    expect(() => encoder.decode(coder)).toThrow("v=2 not supported");
  });

  it("attr not among the default types is kept with its own type", () => {
    const decoded = encoder.decode({
      v: 1,
      types: { name: null, extra: "string" },
      values: { name: "Bob", extra: "bonus" },
    });
    expect(decoded.fetchValue("extra")).toBe("bonus");
    expect(decoded.fetchValue("name")).toBe("Bob");
  });

  it("uses attr.type.name (registry key) not type() for type storage", () => {
    const immutableType = typeRegistry.lookup("immutable_string");
    const attr = Attribute.fromUser("flag", "t", immutableType);
    const set = makeSet({ flag: attr });
    const coder = encodeInto(encoder, set);
    expect(coder.types.flag).toBe("immutable_string");
    const decoded = encoder.decode(coder);
    expect(decoded.fetchValue("flag")).toBe("t");
  });

  it("a codec round-trips the coder the encoder filled in", () => {
    const set = makeSet({ x: stringAttr("x", "hi") });
    const coder = encodeInto(encoder, set);
    const decoded = encoder.decode(jsonCodec.decode(jsonCodec.encode(coder)));
    expect(decoded.fetchValue("x")).toBe("hi");
  });
});
