import { describe, it, expect, vi, afterEach } from "vitest";
import { jsonCodec } from "./json.js";
import { yamlCodec } from "./yaml.js";
import type { AttributeSetCodec, AttributeSetCoder } from "./codec.js";
import { Attribute } from "../../attribute.js";
import { ValueType } from "../../type/value.js";

class UnregisteredType extends ValueType {
  override type(): string {
    return "unregistered";
  }
}

class OtherUnregisteredType extends ValueType {
  override type(): string {
    return "other-unregistered";
  }
}

const codecs: [string, AttributeSetCodec][] = [
  ["jsonCodec", jsonCodec],
  ["yamlCodec", yamlCodec],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(codecs)("%s with a type outside ActiveModel's registry", (_name, codec) => {
  const unregistered: AttributeSetCoder = {
    conciseAttributes: [Attribute.fromUser("name", "Alice", new UnregisteredType())],
  };
  const nilTyped: AttributeSetCoder = {
    conciseAttributes: [Attribute.fromUser("name", "Alice", null)],
  };

  it("encodes distinguishably from an attribute with a nil type", () => {
    expect(codec.encode(unregistered)).not.toEqual(codec.encode(nilTyped));
  });

  it("decodes to the default value type, not a nil type", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const decoded = codec.decode(codec.encode(unregistered));
    expect(decoded.conciseAttributes![0].type).toBeInstanceOf(ValueType);
    expect(decoded.conciseAttributes![0].type!.type()).toBeUndefined();
    expect(decoded.conciseAttributes![0].valueBeforeTypeCast).toBe("Alice");
  });

  it("still decodes a nil type as a nil type", () => {
    const decoded = codec.decode(codec.encode(nilTyped));
    expect(decoded.conciseAttributes![0].type).toBeNull();
  });

  it("keys each unregistered type distinctly, so the one-time warn stays per-type", () => {
    const other: AttributeSetCoder = {
      conciseAttributes: [Attribute.fromUser("name", "Alice", new OtherUnregisteredType())],
    };
    expect(codec.encode(unregistered)).not.toEqual(codec.encode(other));
  });
});
