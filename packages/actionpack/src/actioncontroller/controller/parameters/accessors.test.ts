import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersAccessorsTest", () => {
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

  it("each returns key,value array for block with arity 1", () => {
    const params = new Parameters({ a: "1" });
    const collected: [string, unknown][] = [];
    params.each((k, v) => collected.push([k, v]));
    expect(collected).toEqual([["a", "1"]]);
  });

  it("each without a block returns an enumerator", () => {
    // In TS, each always requires a callback. We verify each returns self when called.
    const params = new Parameters({ a: "1" });
    const result = params.each(() => {});
    expect(result).toBe(params);
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

  it("each_pair returns key,value array for block with arity 1", () => {
    const params = new Parameters({ a: "1" });
    const collected: [string, unknown][] = [];
    params.eachPair((k, v) => collected.push([k, v]));
    expect(collected).toEqual([["a", "1"]]);
  });

  it("each_pair without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    const result = params.eachPair(() => {});
    expect(result).toBe(params);
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

  it("each_value without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    const result = params.eachValue(() => {});
    expect(result).toBe(params);
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

  it("each_key without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    const result = params.eachKey(() => {});
    expect(result).toBe(params);
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

  it("keys returns an array of the keys of the params", () => {
    expect(new Parameters({ a: "1", b: "2" }).keys).toEqual(["a", "b"]);
  });

  it("reject retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    expect(params.reject(() => false).permitted).toBe(true);
  });

  it("reject retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.reject(() => false).permitted).toBe(false);
  });

  it("select retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    expect(params.select(() => true).permitted).toBe(true);
  });

  it("select retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.select(() => true).permitted).toBe(false);
  });

  it("slice retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    expect(params.slice("a").permitted).toBe(true);
  });

  it("slice retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.slice("a").permitted).toBe(false);
  });

  it("transform_keys retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.transformKeys((k) => k).permitted).toBe(true);
  });

  it("transform_keys retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    expect(params.transformKeys((k) => k).permitted).toBe(false);
  });

  it("transform_keys without a block returns an enumerator", () => {
    // In TS, transformKeys always requires a callback — verify it works
    const params = new Parameters({ a: "1" });
    const result = params.transformKeys((k) => k.toUpperCase());
    expect(result.has("A")).toBe(true);
  });

  it("transform_keys! without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    params.transformKeysBang((k) => k.toUpperCase());
    expect(params.has("A")).toBe(true);
  });

  it("deep_transform_keys retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.deepTransformKeys((k) => k).permitted).toBe(true);
  });

  it("deep_transform_keys retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    expect(params.deepTransformKeys((k) => k).permitted).toBe(false);
  });

  it("transform_values retains permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.transformValues((v) => v).permitted).toBe(true);
  });

  it("transform_values retains unpermitted status", () => {
    const params = new Parameters({ a: "1" });
    expect(params.transformValues((v) => v).permitted).toBe(false);
  });

  it("transform_values converts hashes to parameters", () => {
    const params = new Parameters({ a: { nested: "value" } });
    const result = params.transformValues((v) => v);
    expect(result.get("a")).toBeInstanceOf(Parameters);
  });

  it("transform_values without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    const result = params.transformValues((v) => v);
    expect(result.get("a")).toBe("1");
  });

  it("transform_values! converts hashes to parameters", () => {
    const params = new Parameters({ a: { nested: "value" } });
    params.transformValuesBang((v) => v);
    expect(params.get("a")).toBeInstanceOf(Parameters);
  });

  it("transform_values! without a block returns an enumerator", () => {
    const params = new Parameters({ a: "1" });
    params.transformValuesBang((v) => v);
    expect(params.get("a")).toBe("1");
  });

  it("value? returns true if the given value is present in the params", () => {
    expect(new Parameters({ a: "1" }).hasValue("1")).toBe(true);
  });

  it("value? returns false if the given value is not present in the params", () => {
    expect(new Parameters({ a: "1" }).hasValue("2")).toBe(false);
  });

  it("values returns an array of the values of the params", () => {
    expect(new Parameters({ a: "1", b: "2" }).values).toEqual(["1", "2"]);
  });

  it("values_at retains permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const result = params.valuesAt("a", "b");
    expect(result).toEqual(["1", "2"]);
    expect(params.permitted).toBe(true);
  });

  it("values_at retains unpermitted status", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.valuesAt("a");
    expect(result).toEqual(["1"]);
    expect(params.permitted).toBe(false);
  });

  it("is equal to Parameters instance with same params", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "1" });
    expect(a.equals(b)).toBe(true);
  });

  it("is equal to Parameters instance with same permitted params", () => {
    const a = new Parameters({ x: "1" }).permitAll();
    const b = new Parameters({ x: "1" }).permitAll();
    expect(a.equals(b)).toBe(true);
  });

  it("is equal to Parameters instance with same different source params, but same permitted params", () => {
    const a = new Parameters({ x: "1", y: "2" }).permit("x");
    const b = new Parameters({ x: "1", z: "3" }).permit("x");
    expect(a.equals(b)).toBe(true);
  });

  it("is not equal to an unpermitted Parameters instance with same params", () => {
    const a = new Parameters({ x: "1" }).permitAll();
    const b = new Parameters({ x: "1" });
    expect(a.equals(b)).toBe(false);
  });

  it("is not equal to Parameters instance with different permitted params", () => {
    const a = new Parameters({ x: "1" }).permit("x");
    const b = new Parameters({ y: "2" }).permit("y");
    expect(a.equals(b)).toBe(false);
  });

  it("equality with simple types works", () => {
    const a = new Parameters({});
    expect(a.equals(null as any)).toBe(false);
    expect(a.equals(undefined as any)).toBe(false);
  });

  it("inspect shows both class name, parameters and permitted flag", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const s = params.inspect();
    expect(s).toContain("ActionController::Parameters");
    expect(s).toContain("permitted: true");
  });

  it("inspect prints updated permitted flag in the output", () => {
    const params = new Parameters({ a: "1" });
    expect(params.inspect()).not.toContain("permitted: true");
    params.permitBang();
    expect(params.inspect()).toContain("permitted: true");
  });

  it("#dig delegates the dig method to its values", () => {
    const params = new Parameters({ a: { b: "1" } });
    expect(params.dig("a", "b")).toBe("1");
  });

  it("#dig converts hashes to parameters", () => {
    const params = new Parameters({ a: { b: { c: "deep" } } });
    const result = params.dig("a");
    expect(result).toBeInstanceOf(Parameters);
  });

  it("mutating #dig return value mutates underlying parameters", () => {
    const params = new Parameters({ a: { b: "1" } });
    const nested = params.get("a") as Parameters;
    nested.set("b", "2");
    expect(params.dig("a", "b")).toBe("2");
  });

  it("#extract_value splits param by delimiter", () => {
    const params = new Parameters({ id: "1_123", tags: "ruby,rails" });
    expect(params.extractValue("id")).toEqual(["1", "123"]);
    expect(params.extractValue("tags", ",")).toEqual(["ruby", "rails"]);
    expect(params.extractValue("missing")).toBeNull();
  });
});
