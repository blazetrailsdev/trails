import { describe, it, expect, vi, afterEach } from "vitest";
import { YAMLEncoder } from "./yaml-encoder.js";
import { AttributeSetCodecError } from "./codecs/codec.js";
import type { AttributeSetCodec, AttributeSetEnvelope } from "./codecs/codec.js";
import { AttributeSet } from "../attribute-set.js";
import { Attribute } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

function makeSet(attrs: Map<string, Attribute>): AttributeSet {
  return new AttributeSet(attrs);
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
  const coder = new YAMLEncoder(defaultTypes);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a simple set", () => {
    const attrs = new Map([
      ["name", stringAttr("name", "Alice")],
      ["age", intAttr("age", 30)],
    ]);
    const set = makeSet(attrs);
    const decoded = coder.decode(coder.encode(set));
    expect(decoded.fetchValue("name")).toBe("Alice");
    expect(decoded.fetchValue("age")).toBe(30);
  });

  it("omits the type of an attribute whose type is the default type", () => {
    const set = makeSet(new Map([["name", stringAttr("name", "Alice")]]));
    expect(JSON.parse(coder.encode(set)).types.name).toBeNull();
  });

  it("writes the type of an attribute whose type is not the default type", () => {
    const set = makeSet(new Map([["name", intAttr("name", 7)]]));
    expect(JSON.parse(coder.encode(set)).types.name).toBe("integer");
  });

  it("restores the default type for an attribute encoded without one", () => {
    const custom = integerType;
    const localCoder = new YAMLEncoder({ qty: custom });
    const json = JSON.stringify({ v: 1, types: { qty: null }, values: { qty: 5 } });
    const decoded = localCoder.decode(json);
    expect(decoded.fetchValue("qty")).toBe(5);
    expect(decoded.castTypes().qty).toBe(custom);
  });

  it("uninitialized attributes round-trip as uninitialized", () => {
    const intType = integerType;
    const localCoder = new YAMLEncoder({ score: intType });
    const set = makeSet(new Map([["score", Attribute.uninitialized("score", intType)]]));

    const encoded = localCoder.encode(set);
    expect(JSON.parse(encoded).defaultAttributes).toContain("score");

    const decoded = localCoder.decode(encoded);
    expect(decoded.isKey("score")).toBe(false);
    expect(decoded.castTypes().score).toBe(intType);
  });

  it("unknown type key falls back to value type and warns once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const localCoder = new YAMLEncoder({});
    const json = JSON.stringify({
      v: 1,
      types: { x: "unknown_type_xyz" },
      values: { x: "hello" },
    });
    const decoded = localCoder.decode(json);
    expect(decoded.fetchValue("x")).toBe("hello");
    expect(warnSpy).toHaveBeenCalledOnce();
    localCoder.decode(json);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("silenceDriftWarnings suppresses the console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const silentCoder = new YAMLEncoder({}, { silenceDriftWarnings: true });
    const json = JSON.stringify({
      v: 1,
      types: { y: "completely_unknown_type_abc" },
      values: { y: 1 },
    });
    silentCoder.decode(json);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("v mismatch throws AttributeSetCodecError", () => {
    const json = JSON.stringify({ v: 2, types: {}, values: {} });
    expect(() => coder.decode(json)).toThrow(AttributeSetCodecError);
    expect(() => coder.decode(json)).toThrow("v=2 not supported");
  });

  it("attr not among the default types is kept with its own type", () => {
    const json = JSON.stringify({
      v: 1,
      types: { name: null, extra: "string" },
      values: { name: "Bob", extra: "bonus" },
    });
    const decoded = coder.decode(json);
    expect(decoded.fetchValue("extra")).toBe("bonus");
    expect(decoded.fetchValue("name")).toBe("Bob");
  });

  it("uses attr.type.name (registry key) not type() for type storage", () => {
    const immutableType = typeRegistry.lookup("immutable_string");
    const attr = Attribute.fromUser("flag", "t", immutableType);
    const set = makeSet(new Map([["flag", attr]]));
    const envelope = JSON.parse(coder.encode(set));
    expect(envelope.types.flag).toBe("immutable_string");
    const decoded = coder.decode(coder.encode(set));
    expect(decoded.fetchValue("flag")).toBe("t");
  });

  it("delegates encode/decode through an injected custom codec", () => {
    const encoded: AttributeSetEnvelope[] = [];
    const customCodec: AttributeSetCodec = {
      encode: vi.fn((env: AttributeSetEnvelope) => {
        encoded.push(env);
        return JSON.stringify(env);
      }),
      decode: vi.fn((input: string) => JSON.parse(input) as AttributeSetEnvelope),
    };
    const customCoder = new YAMLEncoder({}, { codec: customCodec });
    const set = makeSet(new Map([["x", stringAttr("x", "hi")]]));
    customCoder.decode(customCoder.encode(set));
    expect(customCodec.encode).toHaveBeenCalledOnce();
    expect(customCodec.decode).toHaveBeenCalledOnce();
    expect(encoded[0].types.x).toBe("string");
  });
});
