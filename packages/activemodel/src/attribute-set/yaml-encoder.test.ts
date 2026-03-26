import { describe, it, expect } from "vitest";
import { YAMLEncoder } from "./yaml-encoder.js";
import { AttributeSet } from "./builder.js";
import { Attribute } from "../attribute.js";
import { typeRegistry } from "../type/registry.js";

describe("YAMLEncoder", () => {
  const encoder = new YAMLEncoder();

  function buildSet(values: Record<string, unknown>): AttributeSet {
    const attrs = new Map<string, Attribute>();
    for (const [name, value] of Object.entries(values)) {
      const type =
        typeof value === "number" ? typeRegistry.lookup("integer") : typeRegistry.lookup("string");
      attrs.set(name, Attribute.fromUserWithValue(name, value, value, type));
    }
    return new AttributeSet(attrs);
  }

  it("encodes an AttributeSet to YAML", () => {
    const set = buildSet({ name: "Alice", age: 30 });
    const yaml = encoder.encode(set);
    expect(yaml).toContain("name: Alice");
    expect(yaml).toContain("age: 30");
  });

  it("decodes YAML back to a record", () => {
    const yaml = "name: Alice\nage: 30\n";
    const result = encoder.decode(yaml);
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(30);
  });

  it("round-trips encode/decode", () => {
    const set = buildSet({ title: "Hello", count: 42 });
    const yaml = encoder.encode(set);
    const decoded = encoder.decode(yaml);
    expect(decoded.title).toBe("Hello");
    expect(decoded.count).toBe(42);
  });
});
