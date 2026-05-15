import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersSerializationTest", () => {
  it("YAML serialization", () => {
    // In TS we use JSON serialization as an equivalent
    const params = new Parameters({ name: "John", age: 22 });
    const json = JSON.stringify(params.toJSON());
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("John");
    expect(parsed.age).toBe(22);
  });

  it("YAML deserialization", () => {
    const json = '{"name":"John","age":22}';
    const parsed = JSON.parse(json);
    const params = new Parameters(parsed);
    expect(params.get("name")).toBe("John");
    expect(params.get("age")).toBe(22);
  });

  it("YAML backwardscompatible with psych 2.0.8 format", () => {
    // N/A in TS — verify basic round-trip works
    const params = new Parameters({ key: "value" });
    const data = params.toJSON();
    const restored = new Parameters(data);
    expect(restored.get("key")).toBe("value");
  });

  it("YAML backwardscompatible with psych 2.0.9+ format", () => {
    // N/A in TS — verify basic round-trip works
    const params = new Parameters({ key: "value" }).permitAll();
    const data = params.toJSON();
    const restored = new Parameters(data);
    expect(restored.get("key")).toBe("value");
  });
});
