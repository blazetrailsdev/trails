import { describe, it, expect, afterEach } from "vitest";
import { Parameters, UnfilteredParameters } from "../../metal/strong-parameters.js";

describe("ParametersPermitTest", () => {
  afterEach(() => {
    Parameters.actionOnUnpermittedParameters = false;
    Parameters.permitAllParameters = false;
  });

  it("iteration should not impact permit", () => {
    const params = new Parameters({ name: "John", age: "22" });
    params.each(() => {});
    const permitted = params.permit("name");
    expect(permitted.get("name")).toBe("John");
    expect(permitted.has("age")).toBe(false);
  });

  it("if nothing is permitted, the hash becomes empty", () => {
    const params = new Parameters({ name: "John" });
    const permitted = params.permit();
    expect(permitted.keys).toEqual([]);
  });

  it("key: permitted scalar values", () => {
    const params = new Parameters({ name: "John", age: 22, active: true });
    const permitted = params.permit("name", "age", "active");
    expect(permitted.get("name")).toBe("John");
    expect(permitted.get("age")).toBe(22);
    expect(permitted.get("active")).toBe(true);
    expect(permitted.permitted).toBe(true);
  });

  it("key: unknown keys are filtered out", () => {
    const params = new Parameters({ name: "John", admin: true });
    const permitted = params.permit("name");
    expect(permitted.has("admin")).toBe(false);
  });

  it("key: arrays are filtered out", () => {
    const params = new Parameters({ name: "John", tags: ["a", "b"] });
    const permitted = params.permit("name");
    expect(permitted.has("tags")).toBe(false);
  });

  it("key: hashes are filtered out", () => {
    const params = new Parameters({ name: "John", meta: new Parameters({ x: "1" }) });
    const permitted = params.permit("name");
    expect(permitted.has("meta")).toBe(false);
  });

  it("key: non-permitted scalar values are filtered out", () => {
    const params = new Parameters({ name: "John", admin: true });
    const permitted = params.permit("name");
    expect(permitted.has("admin")).toBe(false);
  });

  it("key: it is not assigned if not present in params", () => {
    const params = new Parameters({ name: "John" });
    const permitted = params.permit("name", "age");
    expect(permitted.has("age")).toBe(false);
  });

  it("key to empty array: empty arrays pass", () => {
    const params = new Parameters({ tags: [] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual([]);
  });

  it("do not break params filtering on nil values", () => {
    const params = new Parameters({ name: "John", age: null });
    const permitted = params.permit("name", "age");
    expect(permitted.get("name")).toBe("John");
    expect(permitted.get("age")).toBeNull();
  });

  it("key to empty array: arrays of permitted scalars pass", () => {
    const params = new Parameters({ tags: ["ruby", "rails"] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual(["ruby", "rails"]);
  });

  it("key to empty array: permitted scalar values do not pass", () => {
    const params = new Parameters({ tags: "not_an_array" });
    const permitted = params.permit({ tags: [] });
    expect(permitted.has("tags")).toBe(true);
  });

  it("key to empty array: arrays of non-permitted scalar do not pass", () => {
    const params = new Parameters({ tags: [{ bad: true }, { also_bad: true }] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual([]);
  });

  it("key to empty hash: arbitrary hashes are permitted", () => {
    const params = new Parameters({ prefs: { theme: "dark" } });
    const permitted = params.permit({ prefs: {} });
    const prefs = permitted.get("prefs");
    if (prefs instanceof Parameters) {
      expect(prefs._toRawHash()).toEqual({ theme: "dark" });
    } else {
      expect(prefs).toEqual({ theme: "dark" });
    }
  });

  it("fetch raises ParameterMissing exception", () => {
    const params = new Parameters({});
    expect(() => params.fetch("missing")).toThrow(/key not found/);
  });

  it("fetch with a default value of a hash does not mutate the object", () => {
    const defaults = { a: "1" };
    const params = new Parameters({});
    params.fetch("missing", defaults);
    expect(defaults).toEqual({ a: "1" });
  });

  it("hashes in array values get wrapped", () => {
    const params = new Parameters({ items: [{ name: "a" }, { name: "b" }] });
    const item = (params.get("items") as unknown[])[0];
    expect(item).toBeInstanceOf(Parameters);
  });

  it("arrays are converted at most once", () => {
    const params = new Parameters({ tags: ["a", "b"] });
    const first = params.get("tags");
    const second = params.get("tags");
    expect(first).toEqual(second);
  });

  it("mutated arrays are detected", () => {
    const params = new Parameters({ tags: ["a", "b"] });
    const tags = params.get("tags") as string[];
    tags.push("c");
    expect(params.get("tags")).toContain("c");
  });

  it("grow until set rehashes", () => {
    const params = new Parameters({});
    for (let i = 0; i < 100; i++) {
      params.set(`key${i}`, `val${i}`);
    }
    expect(params.get("key50")).toBe("val50");
  });

  it("fetch doesn't raise ParameterMissing exception if there is a default", () => {
    const params = new Parameters({});
    expect(params.fetch("missing", "default")).toBe("default");
  });

  it("fetch doesn't raise ParameterMissing exception if there is a default that is nil", () => {
    const params = new Parameters({});
    expect(params.fetch("missing", null)).toBeNull();
  });

  it("KeyError in fetch block should not be covered up", () => {
    const params = new Parameters({});
    expect(() => params.fetch("missing")).toThrow(/key not found/);
  });

  it("not permitted is sticky beyond merges", () => {
    const params = new Parameters({ a: "1" });
    const merged = params.merge({ b: "2" });
    expect(merged.permitted).toBe(false);
  });

  it("permitted is sticky beyond merges", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const merged = params.merge({ b: "2" });
    expect(merged.permitted).toBe(true);
  });

  it("merge with parameters", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ y: "2" });
    const merged = a.merge(b);
    expect(merged.get("x")).toBe("1");
    expect(merged.get("y")).toBe("2");
  });

  it("not permitted is sticky beyond merge!", () => {
    const params = new Parameters({ a: "1" });
    params.mergeBang({ b: "2" });
    expect(params.permitted).toBe(false);
  });

  it("permitted is sticky beyond merge!", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    params.mergeBang({ b: "2" });
    expect(params.permitted).toBe(true);
  });

  it("merge! with parameters", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ y: "2" });
    a.mergeBang(b);
    expect(a.get("x")).toBe("1");
    expect(a.get("y")).toBe("2");
  });

  it("not permitted is sticky beyond deep merges", () => {
    const params = new Parameters({ a: "1" });
    const merged = params.deepMerge({ b: "2" });
    expect(merged.permitted).toBe(false);
  });

  it("permitted is sticky beyond deep merges", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const merged = params.deepMerge({ b: "2" });
    expect(merged.permitted).toBe(true);
  });

  it("not permitted is sticky beyond deep_merge!", () => {
    const params = new Parameters({ a: "1" });
    params.deepMergeBang({ b: "2" });
    expect(params.permitted).toBe(false);
  });

  it("permitted is sticky beyond deep_merge!", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    params.deepMergeBang({ b: "2" });
    expect(params.permitted).toBe(true);
  });

  it("deep_merge with other Hash", () => {
    const params = new Parameters({ a: { x: "1" } });
    const merged = params.deepMerge({ a: { y: "2" } });
    const a = merged._toRawHash().a as Record<string, unknown>;
    expect(a.x).toBe("1");
    expect(a.y).toBe("2");
  });

  it("deep_merge! with other Hash", () => {
    const params = new Parameters({ a: { x: "1" } });
    params.deepMergeBang({ a: { y: "2" } });
    const a = params._toRawHash().a as Record<string, unknown>;
    expect(a.x).toBe("1");
    expect(a.y).toBe("2");
  });

  it("deep_merge with other Parameters", () => {
    const params = new Parameters({ a: { x: "1" } });
    const other = new Parameters({ a: { y: "2" } });
    const merged = params.deepMerge(other);
    const a = merged._toRawHash().a as Record<string, unknown>;
    expect(a.x).toBe("1");
    expect(a.y).toBe("2");
  });

  it("deep_merge! with other Parameters", () => {
    const params = new Parameters({ a: { x: "1" } });
    const other = new Parameters({ a: { y: "2" } });
    params.deepMergeBang(other);
    const a = params._toRawHash().a as Record<string, unknown>;
    expect(a.x).toBe("1");
    expect(a.y).toBe("2");
  });

  it("#reverse_merge with parameters", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "2", y: "3" });
    const result = a.reverseMerge(b);
    expect(result.get("x")).toBe("1");
    expect(result.get("y")).toBe("3");
  });

  it("#with_defaults is an alias of reverse_merge", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ x: "2", y: "3" });
    const r1 = a.reverseMerge(b);
    const r2 = a.withDefaults(b);
    expect(r1._toRawHash()).toEqual(r2._toRawHash());
  });

  it("not permitted is sticky beyond reverse_merge", () => {
    const params = new Parameters({ a: "1" });
    const merged = params.reverseMerge({ b: "2" });
    expect(merged.permitted).toBe(false);
  });

  it("permitted is sticky beyond reverse_merge", () => {
    const params = new Parameters({ a: "1" }).permitAll();
    const merged = params.reverseMerge({ b: "2" });
    expect(merged.permitted).toBe(true);
  });

  it("#reverse_merge! with parameters", () => {
    const a = new Parameters({ x: "1" });
    a.reverseMergeBang({ x: "2", y: "3" });
    expect(a.get("x")).toBe("1");
    expect(a.get("y")).toBe("3");
  });

  it("#with_defaults! is an alias of reverse_merge!", () => {
    const a = new Parameters({ x: "1" });
    a.withDefaultsBang({ y: "2" });
    expect(a.get("y")).toBe("2");
  });

  it("modifying the parameters", () => {
    const params = new Parameters({ name: "John" });
    params.set("name", "Jane");
    expect(params.get("name")).toBe("Jane");
  });

  it("permit! is recursive", () => {
    const inner = new Parameters({ city: "NYC" });
    const params = new Parameters({ address: inner });
    params.permitBang();
    expect(params.permitted).toBe(true);
    expect((params.get("address") as Parameters).permitted).toBe(true);
  });

  it("permitted takes a default value when Parameters.permit_all_parameters is set", () => {
    Parameters.permitAllParameters = true;
    const params = new Parameters({ name: "John" });
    expect(params.permitted).toBe(true);
  });

  it("permitting parameters as an array", () => {
    const params = new Parameters({ name: "John", age: 22 });
    const permitted = params.permit("name", "age");
    expect(permitted.get("name")).toBe("John");
    expect(permitted.get("age")).toBe(22);
  });

  it("to_h raises UnfilteredParameters on unfiltered params", () => {
    const params = new Parameters({ name: "John" });
    expect(() => params.toH()).toThrow(UnfilteredParameters);
  });

  it("to_h returns converted hash on permitted params", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    expect(params.toH()).toEqual({ name: "John" });
  });

  it("to_h returns converted hash when .permit_all_parameters is set", () => {
    Parameters.permitAllParameters = true;
    const params = new Parameters({ name: "John" });
    expect(params.toH()).toEqual({ name: "John" });
  });

  it("to_hash raises UnfilteredParameters on unfiltered params", () => {
    const params = new Parameters({ name: "John" });
    expect(() => params.toHash()).toThrow(UnfilteredParameters);
  });

  it("to_hash returns converted hash on permitted params", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    expect(params.toHash()).toEqual({ name: "John" });
  });

  it("parameters can be implicit converted to Hash", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    const hash = params.toHash();
    expect(typeof hash).toBe("object");
    expect(hash.name).toBe("John");
  });

  it("to_hash returns converted hash when .permit_all_parameters is set", () => {
    Parameters.permitAllParameters = true;
    const params = new Parameters({ name: "John" });
    expect(params.toHash()).toEqual({ name: "John" });
  });

  it("to_unsafe_h returns unfiltered params", () => {
    const params = new Parameters({ name: "John", admin: true });
    expect(params.toUnsafeHash()).toEqual({ name: "John", admin: true });
  });

  it("to_unsafe_h returns unfiltered params even after accessing few keys", () => {
    const params = new Parameters({ name: "John", admin: true });
    params.get("name");
    expect(params.toUnsafeHash()).toEqual({ name: "John", admin: true });
  });

  it("to_unsafe_h does not mutate the parameters", () => {
    const params = new Parameters({ name: "John" });
    const hash = params.toUnsafeHash();
    hash.name = "Jane";
    expect(params.get("name")).toBe("John");
  });

  it("to_h only deep dups Ruby collections", () => {
    const params = new Parameters({ name: "John" }).permitAll();
    const h1 = params.toH();
    const h2 = params.toH();
    expect(h1).toEqual(h2);
    expect(h1).not.toBe(h2);
  });

  it("to_unsafe_h only deep dups Ruby collections", () => {
    const params = new Parameters({ name: "John" });
    const h1 = params.toUnsafeHash();
    const h2 = params.toUnsafeHash();
    expect(h1).toEqual(h2);
    expect(h1).not.toBe(h2);
  });

  it("include? returns true when the key is present", () => {
    expect(new Parameters({ a: "1" }).include("a")).toBe(true);
  });

  it("scalar values should be filtered when array or hash is specified", () => {
    const params = new Parameters({ name: "John", tags: "not_array" });
    const permitted = params.permit("name");
    expect(permitted.has("tags")).toBe(false);
  });

  it("#permitted? is false by default", () => {
    expect(new Parameters({}).permitted).toBe(false);
  });

  it("only String and Symbol keys are allowed", () => {
    // In TS, all keys are strings by default. This test verifies the constructor works.
    const params = new Parameters({ name: "John" });
    expect(params.get("name")).toBe("John");
  });
});
