import { describe, it, expect } from "vitest";
import { Parameters, ParameterMissing } from "./parameters.js";

// ==========================================================================
// controller/parameters/accessors_test.rb
// ==========================================================================
describe("ActionController::Parameters::Accessors", () => {
  it("each returns self", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.each(() => {});
    expect(result).toBe(params);
  });

  it("each_pair returns self", () => {
    const params = new Parameters({ a: "1" });
    const result = params.eachPair(() => {});
    expect(result).toBe(params);
  });

  it("each_value returns self", () => {
    const params = new Parameters({ a: "1" });
    const result = params.eachValue(() => {});
    expect(result).toBe(params);
  });

  it("[] retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.permitted).toBe(true);
    expect(params.get("a")).toBe("1");
  });

  it("[] retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    expect(params.permitted).toBe(false);
  });

  it("as_json returns the JSON representation of the parameters hash", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.toJSON()).toEqual({ a: "1", b: "2" });
  });

  it("to_s returns the string representation of the parameters hash", () => {
    const params = new Parameters({ a: "1" });
    expect(params.toString()).toBe('{"a":"1"}');
  });

  it("each carries permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const keys: string[] = [];
    params.each((k) => keys.push(k));
    expect(keys).toEqual(["a"]);
    expect(params.permitted).toBe(true);
  });

  it("each carries unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    params.each(() => {});
    expect(params.permitted).toBe(false);
  });

  it("each_pair carries permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const keys: string[] = [];
    params.eachPair((k) => keys.push(k));
    expect(keys).toEqual(["a"]);
    expect(params.permitted).toBe(true);
  });

  it("each_pair carries unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    params.eachPair(() => {});
    expect(params.permitted).toBe(false);
  });

  it("each_value carries permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const values: unknown[] = [];
    params.eachValue((v) => values.push(v));
    expect(values).toEqual(["1"]);
  });

  it("each_value carries unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    const values: unknown[] = [];
    params.eachValue((v) => values.push(v));
    expect(values).toEqual(["1"]);
    expect(params.permitted).toBe(false);
  });

  it("each_key converts to hash for permitted", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const keys: string[] = [];
    params.eachKey((k) => keys.push(k));
    expect(keys).toEqual(["a", "b"]);
  });

  it("each_key converts to hash for unpermitted", () => {
    const params = new Parameters({ a: "1" });
    const keys: string[] = [];
    params.eachKey((k) => keys.push(k));
    expect(keys).toEqual(["a"]);
    expect(params.permitted).toBe(false);
  });

  it("empty? returns true when params contains no key/value pairs", () => {
    expect(new Parameters({}).empty).toBe(true);
  });

  it("empty? returns false when any params are present", () => {
    expect(new Parameters({ a: "1" }).empty).toBe(false);
  });

  it("except retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const result = params.except("b");
    expect(result.permitted).toBe(true);
    expect(result.toHash()).toEqual({ a: "1" });
  });

  it("except retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.except("b");
    expect(result.permitted).toBe(false);
  });

  it("without retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const result = params.without("b");
    expect(result.permitted).toBe(true);
  });

  it("without retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.without("b");
    expect(result.permitted).toBe(false);
  });

  it("exclude? returns true if the given key is not present in the params", () => {
    const params = new Parameters({ a: "1" });
    expect(params.exclude("b")).toBe(true);
  });

  it("exclude? returns false if the given key is present in the params", () => {
    const params = new Parameters({ a: "1" });
    expect(params.exclude("a")).toBe(false);
  });

  it("fetch retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.fetch("a")).toBe("1");
    expect(params.permitted).toBe(true);
  });

  it("fetch retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    expect(params.fetch("a")).toBe("1");
    expect(params.permitted).toBe(false);
  });

  it("has_key? returns true if the given key is present in the params", () => {
    expect(new Parameters({ a: "1" }).hasKey("a")).toBe(true);
  });

  it("has_key? returns false if the given key is not present in the params", () => {
    expect(new Parameters({ a: "1" }).hasKey("b")).toBe(false);
  });

  it("has_value? returns true if the given value is present in the params", () => {
    expect(new Parameters({ a: "1" }).hasValue("1")).toBe(true);
  });

  it("has_value? returns false if the given value is not present in the params", () => {
    expect(new Parameters({ a: "1" }).hasValue("2")).toBe(false);
  });

  it("include? returns true if the given key is present in the params", () => {
    expect(new Parameters({ a: "1" }).include("a")).toBe(true);
  });

  it("include? returns false if the given key is not present in the params", () => {
    expect(new Parameters({ a: "1" }).include("b")).toBe(false);
  });

  it("key? returns true if the given key is present in the params", () => {
    expect(new Parameters({ a: "1" }).has("a")).toBe(true);
  });

  it("key? returns false if the given key is not present in the params", () => {
    expect(new Parameters({ a: "1" }).has("b")).toBe(false);
  });

  it("member? returns true if the given key is present in the params", () => {
    expect(new Parameters({ a: "1" }).member("a")).toBe(true);
  });

  it("member? returns false if the given key is not present in the params", () => {
    expect(new Parameters({ a: "1" }).member("b")).toBe(false);
  });

  it("keys returns an array of keys", () => {
    expect(new Parameters({ a: "1", b: "2" }).keys).toEqual(["a", "b"]);
  });

  it("values returns an array of values", () => {
    expect(new Parameters({ a: "1", b: "2" }).values).toEqual(["1", "2"]);
  });

  it("to_h returns the hash representation", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.toHash()).toEqual({ a: "1" });
  });

  it("length returns the number of keys", () => {
    expect(new Parameters({ a: "1", b: "2" }).length).toBe(2);
  });

  it("size returns the number of keys", () => {
    expect(new Parameters({ a: "1", b: "2" }).size).toBe(2);
  });

  it("delete removes the key and returns the value", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.delete("a")).toBe("1");
    expect(params.has("a")).toBe(false);
  });

  it("dig retrieves nested values", () => {
    const inner = new Parameters({ c: "3" });
    const params = new Parameters({ a: inner });
    expect(params.dig("a", "c")).toBe("3");
  });

  it("dig returns undefined for missing keys", () => {
    const params = new Parameters({ a: "1" });
    expect(params.dig("b", "c")).toBeUndefined();
  });

  it("merge creates new params with merged data", () => {
    const p1 = new Parameters({ a: "1" });
    const p2 = p1.merge({ b: "2" });
    expect(p2.toHash()).toEqual({ a: "1", b: "2" });
    expect(p1.has("b")).toBe(false); // original unchanged
  });

  it("slice returns only specified keys", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.slice("a", "c");
    expect(result.toHash()).toEqual({ a: "1", c: "3" });
  });

  it("slice retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    expect(params.slice("a").permitted).toBe(true);
  });

  it("extract returns specified keys", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.extract("b");
    expect(result.toHash()).toEqual({ b: "2" });
  });

  it("select filters key/value pairs", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.select((k) => k !== "b");
    expect(result.toHash()).toEqual({ a: "1", c: "3" });
  });

  it("reject excludes key/value pairs", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.reject((k) => k === "b");
    expect(result.toHash()).toEqual({ a: "1", c: "3" });
  });

  it("compact removes nil values", () => {
    const params = new Parameters({ a: "1", b: null, c: undefined });
    const result = params.compact();
    expect(result.toHash()).toEqual({ a: "1" });
  });

  it("compact_blank removes blank values", () => {
    const params = new Parameters({ a: "1", b: "", c: null, d: false });
    const result = params.compactBlank();
    expect(result.toHash()).toEqual({ a: "1" });
  });

  it("transform_values transforms values", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.transformValues((v) => Number(v) * 2);
    expect(result.toHash()).toEqual({ a: 2, b: 4 });
  });

  it("transform_keys transforms keys", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.transformKeys((k) => k.toUpperCase());
    expect(result.toHash()).toEqual({ A: "1", B: "2" });
  });

  it("deep_dup creates independent copy", () => {
    const params = new Parameters({ a: { nested: "value" } });
    const dup = params.deepDup();
    expect(dup.toHash()).toEqual({ a: { nested: "value" } });
    (dup.get("a") as any).nested = "changed";
    expect((params.get("a") as any).nested).toBe("value");
  });

  it("inspect returns formatted string", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.inspect()).toContain("ActionController::Parameters");
    expect(params.inspect()).toContain("permitted: true");
  });

  it("inspect for unpermitted params", () => {
    const params = new Parameters({ a: "1" });
    expect(params.inspect()).toContain("ActionController::Parameters");
    expect(params.inspect()).not.toContain("permitted: true");
  });

  it("fetch with default value", () => {
    const params = new Parameters({ a: "1" });
    expect(params.fetch("b", "default")).toBe("default");
  });

  it("fetch without default throws", () => {
    const params = new Parameters({ a: "1" });
    expect(() => params.fetch("b")).toThrow(/key not found/);
  });
});

// ==========================================================================
// controller/parameters/parameters_permit_test.rb
// ==========================================================================
describe("ActionController::Parameters::Permit", () => {
  it("permit returns new params with only permitted keys", () => {
    const params = new Parameters({ name: "John", admin: true });
    const permitted = params.permit("name");
    expect(permitted.toHash()).toEqual({ name: "John" });
    expect(permitted.permitted).toBe(true);
  });

  it("permit with missing key omits it", () => {
    const params = new Parameters({ name: "John" });
    const permitted = params.permit("name", "age");
    expect(permitted.toHash()).toEqual({ name: "John" });
  });

  it("permit marks result as permitted", () => {
    const params = new Parameters({ name: "John" });
    expect(params.permitted).toBe(false);
    const permitted = params.permit("name");
    expect(permitted.permitted).toBe(true);
  });

  it("require raises on missing key", () => {
    const params = new Parameters({ name: "John" });
    expect(() => params.require("email")).toThrow(ParameterMissing);
  });

  it("require raises on empty string", () => {
    const params = new Parameters({ name: "" });
    expect(() => params.require("name")).toThrow(ParameterMissing);
  });

  it("require raises on null", () => {
    const params = new Parameters({ name: null });
    expect(() => params.require("name")).toThrow(ParameterMissing);
  });

  it("require returns the value when present", () => {
    const params = new Parameters({ name: "John" });
    expect(params.require("name")).toBe("John");
  });

  it("permit_all marks everything as permitted", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const permitted = params.permitAll();
    expect(permitted.permitted).toBe(true);
    expect(permitted.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("permit does not modify original", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.permit("a");
    expect(params.permitted).toBe(false);
    expect(params.toHash()).toEqual({ a: "1", b: "2" });
  });
});

// ==========================================================================
// controller/parameters/mutators_test.rb
// ==========================================================================
describe("ActionController::Parameters::Mutators", () => {
  it("delete! removes a key", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.delete("a");
    expect(params.toHash()).toEqual({ b: "2" });
  });

  it("set adds a key", () => {
    const params = new Parameters({});
    params.set("a", "1");
    expect(params.get("a")).toBe("1");
  });

  it("merge returns new params", () => {
    const p1 = new Parameters({ a: "1" });
    const p2 = p1.merge({ b: "2" });
    expect(p1.has("b")).toBe(false);
    expect(p2.has("b")).toBe(true);
  });

  it("reverse_merge defaults are overridden", () => {
    const params = new Parameters({ a: "1" });
    const result = params.reversemerge({ a: "default", b: "2" });
    expect(result.get("a")).toBe("1");
    expect(result.get("b")).toBe("2");
  });

  it("compact removes nil values", () => {
    const params = new Parameters({ a: "1", b: null, c: undefined });
    expect(params.compact().keys).toEqual(["a"]);
  });

  it("compact_blank removes blank values", () => {
    const params = new Parameters({ a: "1", b: "", c: null, d: false, e: "keep" });
    const result = params.compactBlank();
    expect(result.keys).toEqual(["a", "e"]);
  });

  it("select filters entries", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.select((k) => k === "a" || k === "c");
    expect(result.toHash()).toEqual({ a: "1", c: "3" });
  });

  it("reject excludes entries", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.reject((k) => k === "a");
    expect(result.toHash()).toEqual({ b: "2" });
  });

  it("transform_values creates new params", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.transformValues((v) => `${v}!`);
    expect(result.toHash()).toEqual({ a: "1!", b: "2!" });
    expect(params.get("a")).toBe("1"); // original unchanged
  });

  it("transform_keys creates new params", () => {
    const params = new Parameters({ a: "1" });
    const result = params.transformKeys((k) => k.toUpperCase());
    expect(result.toHash()).toEqual({ A: "1" });
    expect(params.has("a")).toBe(true); // original unchanged
  });
});
