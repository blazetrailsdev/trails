import { describe, it, expect, vi, afterEach } from "vitest";
import { Parameters, ParameterMissing, UnpermittedParameters } from "./parameters.js";

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

// ==========================================================================
// Nested permit tests
// ==========================================================================
describe("ActionController::Parameters::NestedPermit", () => {
  it("permits nested Parameters", () => {
    const inner = new Parameters({ title: "Hello", admin: true });
    const params = new Parameters({ post: inner });
    const permitted = params.permit({ post: ["title"] });
    const post = permitted.get("post") as Parameters;
    expect(post).toBeInstanceOf(Parameters);
    expect(post.get("title")).toBe("Hello");
    expect(post.has("admin")).toBe(false);
  });

  it("permits array of Parameters", () => {
    const items = [
      new Parameters({ name: "a", secret: "x" }),
      new Parameters({ name: "b", secret: "y" }),
    ];
    const params = new Parameters({ items });
    const permitted = params.permit({ items: ["name"] });
    const arr = permitted.get("items") as Parameters[];
    expect(arr).toHaveLength(2);
    expect(arr[0].get("name")).toBe("a");
    expect(arr[0].has("secret")).toBe(false);
  });

  it("permits empty array spec for scalar arrays", () => {
    const params = new Parameters({ tags: ["a", "b", 3, true, { bad: true }] });
    const permitted = params.permit({ tags: [] });
    const tags = permitted.get("tags") as unknown[];
    expect(tags).toEqual(["a", "b", 3, true]);
  });

  it("deeply nested permit", () => {
    const address = new Parameters({ city: "NYC", secret: "x" });
    const person = new Parameters({ name: "John", address });
    const params = new Parameters({ person });
    const permitted = params.permit({ person: ["name", { address: ["city"] }] });
    const p = permitted.get("person") as Parameters;
    expect(p.get("name")).toBe("John");
    const addr = p.get("address") as Parameters;
    expect(addr.get("city")).toBe("NYC");
    expect(addr.has("secret")).toBe(false);
  });
});

// ==========================================================================
// expect() — Rails 8
// ==========================================================================
describe("ActionController::Parameters::Expect", () => {
  it("expect with string key works like require", () => {
    const params = new Parameters({ name: "John" });
    expect(params.expect("name")).toBe("John");
  });

  it("expect with string key raises on missing", () => {
    const params = new Parameters({});
    expect(() => params.expect("name")).toThrow(ParameterMissing);
  });

  it("expect with hash spec requires and permits", () => {
    const inner = new Parameters({ title: "Hello", admin: true });
    const params = new Parameters({ post: inner });
    const result = params.expect({ post: ["title"] }) as Parameters;
    expect(result).toBeInstanceOf(Parameters);
    expect(result.get("title")).toBe("Hello");
    expect(result.has("admin")).toBe(false);
    expect(result.permitted).toBe(true);
  });

  it("expect raises if required key missing", () => {
    const params = new Parameters({});
    expect(() => params.expect({ post: ["title"] })).toThrow(ParameterMissing);
  });

  it("expect raises if value is not Parameters", () => {
    const params = new Parameters({ post: "not a hash" });
    expect(() => params.expect({ post: ["title"] })).toThrow(ParameterMissing);
  });
});

// ==========================================================================
// toQuery, equals, toUnsafeHash
// ==========================================================================
describe("ActionController::Parameters::Serialization", () => {
  it("toQuery encodes key/value pairs", () => {
    const params = new Parameters({ a: "1", b: "hello world" });
    const q = params.toQuery();
    expect(q).toContain("a=1");
    expect(q).toContain("b=hello%20world");
  });

  it("toQuery with prefix", () => {
    const params = new Parameters({ title: "Hi" });
    expect(params.toQuery("post")).toBe("post%5Btitle%5D=Hi");
  });

  it("equals compares by data", () => {
    const a = new Parameters({ x: "1", y: "2" });
    const b = new Parameters({ x: "1", y: "2" });
    const c = new Parameters({ x: "1" });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("toUnsafeHash deeply unwraps Parameters", () => {
    const inner = new Parameters({ c: "3" });
    const params = new Parameters({ a: "1", b: inner });
    const hash = params.toUnsafeHash();
    expect(hash).toEqual({ a: "1", b: { c: "3" } });
  });

  it("toUnsafeHash unwraps arrays of Parameters", () => {
    const items = [new Parameters({ x: "1" }), new Parameters({ x: "2" })];
    const params = new Parameters({ items });
    const hash = params.toUnsafeHash();
    expect(hash).toEqual({ items: [{ x: "1" }, { x: "2" }] });
  });
});

// ==========================================================================
// Require edge cases
// ==========================================================================
describe("ActionController::Parameters::RequireEdgeCases", () => {
  it("require raises on undefined", () => {
    const params = new Parameters({ name: undefined });
    expect(() => params.require("name")).toThrow(ParameterMissing);
  });

  it("require returns nested Parameters", () => {
    const inner = new Parameters({ title: "Hi" });
    const params = new Parameters({ post: inner });
    expect(params.require("post")).toBe(inner);
  });

  it("require returns array values", () => {
    const params = new Parameters({ ids: [1, 2, 3] });
    expect(params.require("ids")).toEqual([1, 2, 3]);
  });

  it("require returns numeric zero", () => {
    const params = new Parameters({ count: 0 });
    expect(params.require("count")).toBe(0);
  });

  it("require returns false", () => {
    const params = new Parameters({ active: false });
    expect(params.require("active")).toBe(false);
  });
});

// ==========================================================================
// Mutators extended
// ==========================================================================
describe("ActionController::Parameters::MutatorsExtended", () => {
  it("delete returns default for missing key", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("missing", "fallback")).toBe("fallback");
    expect(params.has("a")).toBe(true);
  });

  it("delete returns undefined for missing key without default", () => {
    const params = new Parameters({ a: "1" });
    expect(params.delete("missing")).toBeUndefined();
  });

  it("merge with Parameters instance", () => {
    const p1 = new Parameters({ a: "1" });
    const p2 = new Parameters({ b: "2" });
    const merged = p1.merge(p2);
    expect(merged.toHash()).toEqual({ a: "1", b: "2" });
  });

  it("reversemerge with Parameters instance", () => {
    const p1 = new Parameters({ a: "1" });
    const p2 = new Parameters({ a: "default", b: "2" });
    const merged = p1.reversemerge(p2);
    expect(merged.get("a")).toBe("1");
    expect(merged.get("b")).toBe("2");
  });

  it("transform transforms both key and value", () => {
    const params = new Parameters({ count: "5" });
    const result = params.transform((_k, v) => Number(v) * 10);
    expect(result.get("count")).toBe(50);
  });
});

// ==========================================================================
// Nested dig
// ==========================================================================
describe("ActionController::Parameters::NestedDig", () => {
  it("dig through nested Parameters", () => {
    const c = new Parameters({ val: "deep" });
    const b = new Parameters({ c });
    const a = new Parameters({ b });
    expect(a.dig("b", "c", "val")).toBe("deep");
  });

  it("dig through plain objects", () => {
    const params = new Parameters({ a: { b: { c: "found" } } });
    expect(params.dig("a", "b", "c")).toBe("found");
  });

  it("dig returns undefined for broken chain", () => {
    const params = new Parameters({ a: "string" });
    expect(params.dig("a", "b")).toBeUndefined();
  });
});

// ==========================================================================
// Unpermitted parameters action
// ==========================================================================
describe("ActionController::Parameters::UnpermittedParametersAction", () => {
  afterEach(() => {
    Parameters.actionOnUnpermittedParameters = false;
  });

  it("raise mode throws UnpermittedParameters", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const params = new Parameters({ name: "John", admin: true });
    expect(() => params.permit("name")).toThrow(UnpermittedParameters);
  });

  it("raise mode includes unpermitted param names", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const params = new Parameters({ name: "John", admin: true, secret: "x" });
    try {
      params.permit("name");
    } catch (e: unknown) {
      expect((e as UnpermittedParameters).params).toContain("admin");
      expect((e as UnpermittedParameters).params).toContain("secret");
    }
  });

  it("log mode warns but does not throw", () => {
    Parameters.actionOnUnpermittedParameters = "log";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const params = new Parameters({ name: "John", admin: true });
    const permitted = params.permit("name");
    expect(permitted.get("name")).toBe("John");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("admin"));
    spy.mockRestore();
  });

  it("false mode does nothing", () => {
    Parameters.actionOnUnpermittedParameters = false;
    const params = new Parameters({ name: "John", admin: true });
    const permitted = params.permit("name");
    expect(permitted.get("name")).toBe("John");
  });

  it("no error when all params are permitted", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const params = new Parameters({ name: "John" });
    expect(() => params.permit("name")).not.toThrow();
  });
});

// ==========================================================================
// controller/parameters/slice_test.rb
// ==========================================================================
describe("ActionController::Parameters::Slice", () => {
  it("returns Parameters with only specified keys", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const sliced = params.slice("a", "c");
    expect(sliced.get("a")).toBe("1");
    expect(sliced.get("c")).toBe("3");
    expect(sliced.has("b")).toBe(false);
  });

  it("ignores keys that do not exist", () => {
    const params = new Parameters({ a: "1" });
    const sliced = params.slice("a", "z");
    expect(sliced.keys).toEqual(["a"]);
  });

  it("preserves permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    const sliced = params.slice("a");
    expect(sliced.permitted).toBe(true);
  });

  it("returns empty Parameters when no keys match", () => {
    const params = new Parameters({ a: "1" });
    const sliced = params.slice("z");
    expect(sliced.empty).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/except_test.rb
// ==========================================================================
describe("ActionController::Parameters::Except", () => {
  it("excludes specified keys", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.except("b");
    expect(result.has("a")).toBe(true);
    expect(result.has("c")).toBe(true);
    expect(result.has("b")).toBe(false);
  });

  it("excludes multiple keys", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.except("a", "c");
    expect(result.keys).toEqual(["b"]);
  });

  it("without is alias for except", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const e = params.except("b");
    const w = params.without("b");
    expect(e.toHash()).toEqual(w.toHash());
  });

  it("preserves permitted status", () => {
    const params = new Parameters({ a: "1", b: "2" }).permitAll();
    expect(params.except("b").permitted).toBe(true);
  });

  it("does not modify original", () => {
    const params = new Parameters({ a: "1", b: "2" });
    params.except("b");
    expect(params.has("b")).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/extract_test.rb
// ==========================================================================
describe("ActionController::Parameters::Extract", () => {
  it("extract is alias for slice", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const extracted = params.extract("a", "c");
    expect(extracted.toHash()).toEqual({ a: "1", c: "3" });
  });
});

// ==========================================================================
// controller/parameters/merge_test.rb
// ==========================================================================
describe("ActionController::Parameters::Merge", () => {
  it("merges another Parameters", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ y: "2" });
    const merged = a.merge(b);
    expect(merged.get("x")).toBe("1");
    expect(merged.get("y")).toBe("2");
  });

  it("merges a plain object", () => {
    const params = new Parameters({ x: "1" });
    const merged = params.merge({ y: "2" });
    expect(merged.get("y")).toBe("2");
  });

  it("later values win on conflict", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "2" });
    expect(a.merge(b).get("x")).toBe("2");
  });

  it("preserves permitted status of receiver", () => {
    const a = new Parameters({ x: "1" }).permitAll();
    const b = new Parameters({ y: "2" });
    expect(a.merge(b).permitted).toBe(true);
  });

  it("does not modify original", () => {
    const a = new Parameters({ x: "1" });
    a.merge({ y: "2" });
    expect(a.has("y")).toBe(false);
  });

  it("reverse_merge gives priority to receiver", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "2", y: "3" });
    const result = a.reversemerge(b);
    expect(result.get("x")).toBe("1");
    expect(result.get("y")).toBe("3");
  });
});

// ==========================================================================
// controller/parameters/transform_test.rb
// ==========================================================================
describe("ActionController::Parameters::Transform", () => {
  it("transform applies fn to each value", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const result = params.transform((_k, v) => Number(v));
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("transform passes key to fn", () => {
    const params = new Parameters({ name: "dean" });
    const result = params.transform((k, v) => `${k}=${v}`);
    expect(result.get("name")).toBe("name=dean");
  });

  it("transformKeys applies fn to each key", () => {
    const params = new Parameters({ first_name: "Dean" });
    const result = params.transformKeys((k) => k.replace(/_/g, "-"));
    expect(result.has("first-name")).toBe(true);
    expect(result.get("first-name")).toBe("Dean");
  });

  it("transformValues applies fn to each value", () => {
    const params = new Parameters({ a: "hello", b: "world" });
    const result = params.transformValues((v) => (v as string).toUpperCase());
    expect(result.get("a")).toBe("HELLO");
    expect(result.get("b")).toBe("WORLD");
  });

  it("transform preserves permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.transform((_k, v) => v).permitted).toBe(true);
    expect(params.transformKeys((k) => k).permitted).toBe(true);
    expect(params.transformValues((v) => v).permitted).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/select_reject_test.rb
// ==========================================================================
describe("ActionController::Parameters::SelectReject", () => {
  it("select filters by predicate", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.select((_k, v) => Number(v) > 1);
    expect(result.keys).toEqual(["b", "c"]);
  });

  it("reject removes matching entries", () => {
    const params = new Parameters({ a: "1", b: "2", c: "3" });
    const result = params.reject((_k, v) => Number(v) > 1);
    expect(result.keys).toEqual(["a"]);
  });

  it("select can filter by key", () => {
    const params = new Parameters({ name: "x", admin: "y", secret: "z" });
    const safe = params.select((k) => k === "name");
    expect(safe.keys).toEqual(["name"]);
  });

  it("select preserves permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.select(() => true).permitted).toBe(true);
  });

  it("reject preserves permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.reject(() => false).permitted).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/compact_test.rb
// ==========================================================================
describe("ActionController::Parameters::Compact", () => {
  it("compact removes null and undefined", () => {
    const params = new Parameters({ a: "1", b: null, c: undefined, d: "4" });
    const result = params.compact();
    expect(result.keys).toEqual(["a", "d"]);
  });

  it("compact keeps empty strings and false", () => {
    const params = new Parameters({ a: "", b: false, c: 0 });
    const result = params.compact();
    expect(result.keys).toEqual(["a", "b", "c"]);
  });

  it("compactBlank removes null, undefined, empty string, and false", () => {
    const params = new Parameters({ a: "1", b: null, c: "", d: false, e: 0 });
    const result = params.compactBlank();
    expect(result.keys).toEqual(["a", "e"]);
  });

  it("compact preserves permitted status", () => {
    const params = new Parameters({ a: "1", b: null }).permitAll();
    expect(params.compact().permitted).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/fetch_test.rb
// ==========================================================================
describe("ActionController::Parameters::Fetch", () => {
  it("fetch returns value for existing key", () => {
    const params = new Parameters({ a: "1" });
    expect(params.fetch("a")).toBe("1");
  });

  it("fetch returns default for missing key", () => {
    const params = new Parameters({});
    expect(params.fetch("a", "default")).toBe("default");
  });

  it("fetch throws when key missing and no default", () => {
    const params = new Parameters({});
    expect(() => params.fetch("a")).toThrow(/key not found/);
  });

  it("fetch returns null if value is null (key exists)", () => {
    const params = new Parameters({ a: null });
    expect(params.fetch("a")).toBeNull();
  });
});

// ==========================================================================
// controller/parameters/deep_dup_test.rb
// ==========================================================================
describe("ActionController::Parameters::DeepDup", () => {
  it("creates independent copy", () => {
    const params = new Parameters({ a: "1" });
    const dup = params.deepDup();
    dup.set("a", "2");
    expect(params.get("a")).toBe("1");
  });

  it("deep copies nested objects", () => {
    const params = new Parameters({ a: { nested: "value" } });
    const dup = params.deepDup();
    (dup.get("a") as any).nested = "changed";
    expect((params.get("a") as any).nested).toBe("value");
  });

  it("preserves permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.deepDup().permitted).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/to_query_test.rb
// ==========================================================================
describe("ActionController::Parameters::ToQuery", () => {
  it("encodes simple params", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.toQuery()).toBe("a=1&b=2");
  });

  it("encodes with prefix", () => {
    const params = new Parameters({ name: "Dean" });
    expect(params.toQuery("user")).toBe("user%5Bname%5D=Dean");
  });

  it("URL-encodes special characters", () => {
    const params = new Parameters({ q: "hello world" });
    expect(params.toQuery()).toBe("q=hello%20world");
  });
});

// ==========================================================================
// controller/parameters/equality_test.rb
// ==========================================================================
describe("ActionController::Parameters::Equality", () => {
  it("equals returns true for same content", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "1" });
    expect(a.equals(b)).toBe(true);
  });

  it("equals returns false for different content", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "2" });
    expect(a.equals(b)).toBe(false);
  });

  it("equals ignores permitted status", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "1" }).permitAll();
    expect(a.equals(b)).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/conversion_test.rb
// ==========================================================================
describe("ActionController::Parameters::Conversion", () => {
  it("toHash returns plain object copy", () => {
    const params = new Parameters({ a: "1" });
    const hash = params.toHash();
    hash.a = "changed";
    expect(params.get("a")).toBe("1");
  });

  it("toJSON returns same as toHash", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.toJSON()).toEqual(params.toHash());
  });

  it("toUnsafeHash unwraps nested Parameters", () => {
    const inner = new Parameters({ city: "NYC" });
    const params = new Parameters({ address: inner });
    const hash = params.toUnsafeHash();
    expect(hash.address).toEqual({ city: "NYC" });
    expect(hash.address).not.toBeInstanceOf(Parameters);
  });

  it("toUnsafeHash unwraps arrays of Parameters", () => {
    const items = [new Parameters({ id: "1" }), new Parameters({ id: "2" })];
    const params = new Parameters({ items });
    const hash = params.toUnsafeHash();
    expect((hash.items as any[])[0]).toEqual({ id: "1" });
    expect((hash.items as any[])[0]).not.toBeInstanceOf(Parameters);
  });

  it("toString returns JSON string", () => {
    const params = new Parameters({ a: "1" });
    expect(params.toString()).toBe('{"a":"1"}');
  });

  it("inspect includes class name and data", () => {
    const params = new Parameters({ a: "1" });
    const s = params.inspect();
    expect(s).toContain("ActionController::Parameters");
    expect(s).toContain('"a":"1"');
  });

  it("inspect shows permitted status", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    expect(params.inspect()).toContain("permitted: true");
  });
});

// ==========================================================================
// controller/parameters/hash_methods_test.rb
// ==========================================================================
describe("ActionController::Parameters::HashMethods", () => {
  it("has returns true for existing key", () => {
    const params = new Parameters({ a: "1" });
    expect(params.has("a")).toBe(true);
    expect(params.has("b")).toBe(false);
  });

  it("hasKey is alias for has", () => {
    const params = new Parameters({ a: "1" });
    expect(params.hasKey("a")).toBe(true);
  });

  it("hasValue checks values", () => {
    const params = new Parameters({ a: "1" });
    expect(params.hasValue("1")).toBe(true);
    expect(params.hasValue("2")).toBe(false);
  });

  it("include is alias for has", () => {
    const params = new Parameters({ a: "1" });
    expect(params.include("a")).toBe(true);
  });

  it("member is alias for has", () => {
    const params = new Parameters({ a: "1" });
    expect(params.member("a")).toBe(true);
  });

  it("exclude is inverse of has", () => {
    const params = new Parameters({ a: "1" });
    expect(params.exclude("a")).toBe(false);
    expect(params.exclude("b")).toBe(true);
  });

  it("keys returns all keys", () => {
    const params = new Parameters({ x: "1", y: "2" });
    expect(params.keys).toEqual(["x", "y"]);
  });

  it("values returns all values", () => {
    const params = new Parameters({ x: "1", y: "2" });
    expect(params.values).toEqual(["1", "2"]);
  });

  it("empty returns true for empty params", () => {
    expect(new Parameters().empty).toBe(true);
    expect(new Parameters({ a: "1" }).empty).toBe(false);
  });

  it("length returns count of keys", () => {
    expect(new Parameters({ a: "1", b: "2" }).length).toBe(2);
  });

  it("size is alias for length", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.size).toBe(params.length);
  });
});

// ==========================================================================
// controller/parameters/iteration_test.rb
// ==========================================================================
describe("ActionController::Parameters::Iteration", () => {
  it("each iterates key-value pairs", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const collected: [string, unknown][] = [];
    params.each((k, v) => collected.push([k, v]));
    expect(collected).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("eachPair is alias for each", () => {
    const params = new Parameters({ a: "1" });
    const collected: string[] = [];
    params.eachPair((k) => collected.push(k));
    expect(collected).toEqual(["a"]);
  });

  it("eachValue iterates values only", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const collected: unknown[] = [];
    params.eachValue((v) => collected.push(v));
    expect(collected).toEqual(["1", "2"]);
  });

  it("eachKey iterates keys only", () => {
    const params = new Parameters({ a: "1", b: "2" });
    const collected: string[] = [];
    params.eachKey((k) => collected.push(k));
    expect(collected).toEqual(["a", "b"]);
  });

  it("each returns self for chaining", () => {
    const params = new Parameters({ a: "1" });
    expect(params.each(() => {})).toBe(params);
  });

  it("eachValue returns self for chaining", () => {
    const params = new Parameters({ a: "1" });
    expect(params.eachValue(() => {})).toBe(params);
  });

  it("eachKey returns self for chaining", () => {
    const params = new Parameters({ a: "1" });
    expect(params.eachKey(() => {})).toBe(params);
  });
});

// ==========================================================================
// controller/parameters/delete_test.rb
// ==========================================================================
describe("ActionController::Parameters::Delete", () => {
  it("delete removes key and returns value", () => {
    const params = new Parameters({ a: "1", b: "2" });
    expect(params.delete("a")).toBe("1");
    expect(params.has("a")).toBe(false);
  });

  it("delete returns default when key missing", () => {
    const params = new Parameters({});
    expect(params.delete("a", "default")).toBe("default");
  });

  it("delete returns undefined when key missing and no default", () => {
    const params = new Parameters({});
    expect(params.delete("a")).toBeUndefined();
  });
});

// ==========================================================================
// controller/parameters/set_test.rb
// ==========================================================================
describe("ActionController::Parameters::Set", () => {
  it("set adds a new key", () => {
    const params = new Parameters({});
    params.set("a", "1");
    expect(params.get("a")).toBe("1");
  });

  it("set overwrites existing key", () => {
    const params = new Parameters({ a: "1" });
    params.set("a", "2");
    expect(params.get("a")).toBe("2");
  });
});

// ==========================================================================
// controller/parameters/static_test.rb
// ==========================================================================
describe("ActionController::Parameters::Static", () => {
  it("Parameters.create creates new instance", () => {
    const params = Parameters.create({ a: "1" });
    expect(params).toBeInstanceOf(Parameters);
    expect(params.get("a")).toBe("1");
  });

  it("Parameters.create with no args creates empty", () => {
    const params = Parameters.create();
    expect(params.empty).toBe(true);
  });
});

// ==========================================================================
// controller/parameters/permit_nested_test.rb
// ==========================================================================
describe("ActionController::Parameters::PermitDeepNested", () => {
  it("permit with nested Parameters", () => {
    const inner = new Parameters({ title: "Hello", admin: true });
    const params = new Parameters({ post: inner });
    const permitted = params.permit({ post: ["title"] });
    const post = permitted.get("post") as Parameters;
    expect(post.get("title")).toBe("Hello");
    expect(post.has("admin")).toBe(false);
  });

  it("permit with array of scalars via empty array", () => {
    const params = new Parameters({ tags: ["ruby", "js", "ts"] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual(["ruby", "js", "ts"]);
  });

  it("permit with array of scalars filters non-scalars", () => {
    const params = new Parameters({ tags: ["ruby", { nested: true }, 42] });
    const permitted = params.permit({ tags: [] });
    const tags = permitted.get("tags") as unknown[];
    expect(tags).toEqual(["ruby", 42]);
  });

  it("permit with array of Parameters", () => {
    const items = [
      new Parameters({ name: "A", secret: "x" }),
      new Parameters({ name: "B", secret: "y" }),
    ];
    const params = new Parameters({ items });
    const permitted = params.permit({ items: ["name"] });
    const result = permitted.get("items") as Parameters[];
    expect(result[0].get("name")).toBe("A");
    expect(result[0].has("secret")).toBe(false);
    expect(result[1].get("name")).toBe("B");
  });

  it("permitted Parameters has permitted flag set", () => {
    const params = new Parameters({ name: "Dean" });
    const permitted = params.permit("name");
    expect(permitted.permitted).toBe(true);
  });

  it("unpermitted params are excluded", () => {
    const params = new Parameters({ name: "Dean", admin: true });
    const permitted = params.permit("name");
    expect(permitted.has("admin")).toBe(false);
  });
});

// ==========================================================================
// controller/parameters/require_test.rb
// ==========================================================================
describe("ActionController::Parameters::RequireDeep", () => {
  it("require returns nested Parameters", () => {
    const inner = new Parameters({ title: "Hello" });
    const params = new Parameters({ post: inner });
    const result = params.require("post");
    expect(result).toBeInstanceOf(Parameters);
    expect((result as Parameters).get("title")).toBe("Hello");
  });

  it("require throws on missing key", () => {
    const params = new Parameters({});
    expect(() => params.require("post")).toThrow(ParameterMissing);
  });

  it("require throws on null value", () => {
    const params = new Parameters({ post: null });
    expect(() => params.require("post")).toThrow(ParameterMissing);
  });

  it("require throws on empty string", () => {
    const params = new Parameters({ post: "" });
    expect(() => params.require("post")).toThrow(ParameterMissing);
  });

  it("require returns scalar values", () => {
    const params = new Parameters({ name: "Dean" });
    expect(params.require("name")).toBe("Dean");
  });

  it("ParameterMissing has param property", () => {
    const params = new Parameters({});
    try {
      params.require("post");
    } catch (e) {
      expect((e as any).param).toBe("post");
    }
  });
});

// ==========================================================================
// controller/parameters/dig_deep_test.rb
// ==========================================================================
describe("ActionController::Parameters::DigDeep", () => {
  it("dig into nested Parameters", () => {
    const inner = new Parameters({ city: "NYC" });
    const params = new Parameters({ address: inner });
    expect(params.dig("address", "city")).toBe("NYC");
  });

  it("dig into nested plain objects", () => {
    const params = new Parameters({ meta: { tags: { primary: "ruby" } } });
    expect(params.dig("meta", "tags", "primary")).toBe("ruby");
  });

  it("dig returns undefined for missing path", () => {
    const params = new Parameters({ a: { b: "c" } });
    expect(params.dig("a", "z")).toBeUndefined();
  });

  it("dig returns undefined for null in path", () => {
    const params = new Parameters({ a: null });
    expect(params.dig("a", "b")).toBeUndefined();
  });

  it("dig with single key acts like get", () => {
    const params = new Parameters({ a: "1" });
    expect(params.dig("a")).toBe("1");
  });
});
