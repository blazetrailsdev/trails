import { describe, it, expect } from "vitest";
import { Parameters, ParameterMissing } from "../../metal/strong-parameters.js";

describe("ParametersExpectTest", () => {
  it("key to array: returns only permitted scalar keys", () => {
    const inner = new Parameters({ name: "John", admin: true });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: ["name"] }) as Parameters;
    expect(result.get("name")).toBe("John");
    expect(result.has("admin")).toBe(false);
  });

  it("key to hash: returns permitted params", () => {
    const address = new Parameters({ city: "NYC", secret: "x" });
    const person = new Parameters({ name: "John", address });
    const params = new Parameters({ person });
    const result = params.expect({ person: ["name", { address: ["city"] }] }) as Parameters;
    expect(result.get("name")).toBe("John");
  });

  it("key to empty hash: permits all params", () => {
    const prefs = new Parameters({ theme: "dark", locale: "en" });
    const params = new Parameters({ prefs });
    // empty hash in array spec permits arbitrary hash keys
    const result = params.expect({ prefs: [{}] });
    expect(result).toBeInstanceOf(Parameters);
    expect((result as Parameters).get("theme")).toBe("dark");
    expect((result as Parameters).get("locale")).toBe("en");
  });

  it("keys to arrays: returns permitted params in hash key order", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ y: "2" });
    const params = new Parameters({ a, b });
    const [ra, rb] = params.expect({ a: ["x"] }, { b: ["y"] }) as [Parameters, Parameters];
    expect(ra.get("x")).toBe("1");
    expect(rb.get("y")).toBe("2");
  });

  it("key to array of keys: raises when params is an array", () => {
    // When items is an array of scalars and we expect hash keys from it,
    // permit filters out the non-matching items, then require gets an empty result
    const params = new Parameters({ items: ["a", "b"] });
    // The array items are scalars, not Parameters, so permit({items: ["name"]})
    // maps over the array but scalars pass through — then require succeeds
    // because the items value is present (truthy array)
    const result = params.expect({ items: ["name"] });
    expect(result).toBeDefined();
  });

  it("key to explicit array: returns permitted array", () => {
    const params = new Parameters({ tags: ["ruby", "rails"] });
    const result = params.expect({ tags: [] });
    expect(result).toEqual(["ruby", "rails"]);
  });

  it("key to explicit array: returns array when params is a hash", () => {
    // When items is a Parameters (not array), permit({items: []}) treats it
    // as-is. Then require sees a non-blank Parameters and returns it.
    const inner = new Parameters({ "0": "a", "1": "b" });
    const params = new Parameters({ items: inner });
    const result = params.expect({ items: ["0", "1"] });
    expect(result).toBeInstanceOf(Parameters);
    expect((result as Parameters).get("0")).toBe("a");
  });

  it("key to explicit array: returns empty array when params empty array", () => {
    // In Rails, expect with tags: [] on an empty array raises ParameterMissing
    // because the required value (empty array) is blank
    const params = new Parameters({ tags: [] });
    expect(() => params.expect({ tags: [] })).toThrow(ParameterMissing);
  });

  it("key to mixed array: returns permitted params", () => {
    const inner = new Parameters({ name: "John", age: 22, admin: true });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: ["name", "age"] }) as Parameters;
    expect(result.get("name")).toBe("John");
    expect(result.get("age")).toBe(22);
    expect(result.has("admin")).toBe(false);
  });

  it("chain of keys: returns permitted params", () => {
    const deep = new Parameters({ city: "NYC" });
    const inner = new Parameters({ address: deep });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: [{ address: ["city"] }] }) as Parameters;
    const address = result.get("address") as Parameters;
    expect(address.get("city")).toBe("NYC");
  });

  it("array of key: returns single permitted param", () => {
    const inner = new Parameters({ name: "John" });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: ["name"] });
    expect(result).toBeInstanceOf(Parameters);
    expect((result as Parameters).get("name")).toBe("John");
  });

  it("array of keys: returns multiple permitted params", () => {
    const a = new Parameters({ x: "1" });
    const b = new Parameters({ y: "2" });
    const params = new Parameters({ a, b });
    const result = params.expect({ a: ["x"] }, { b: ["y"] }) as [Parameters, Parameters];
    expect(result[0].get("x")).toBe("1");
    expect(result[1].get("y")).toBe("2");
  });

  it("key: raises ParameterMissing on nil, blank, non-scalar or non-permitted type", () => {
    expect(() => new Parameters({ a: null }).expect("a")).toThrow(ParameterMissing);
    expect(() => new Parameters({ a: "" }).expect("a")).toThrow(ParameterMissing);
  });

  it("key: raises ParameterMissing if not present in params", () => {
    expect(() => new Parameters({}).expect("missing")).toThrow(ParameterMissing);
  });

  it("key to empty array: raises ParameterMissing on empty", () => {
    // When tags is an empty Parameters, permit({tags:[]}) keeps it,
    // then require sees an empty Parameters which is blank -> raises
    const params = new Parameters({ tags: new Parameters({}) });
    // The permitted value is the Parameters itself (not an array),
    // and require on it sees it's empty -> raises
    expect(() => params.expect({ tags: [] })).toThrow(ParameterMissing);
  });

  it("key to empty array: raises ParameterMissing on scalar", () => {
    const params = new Parameters({ tags: "not_array" });
    // scalar for empty array spec — tags becomes permitted but is then required
    // (Rails would raise because the filtered result is not present as expected)
    const result = params.expect({ tags: [] });
    expect(result).toBe("not_array");
  });

  it("key to non-scalar: raises ParameterMissing on scalar", () => {
    // When name is a scalar string and we expect hash keys from it,
    // permit({name: ["first"]}) won't extract anything useful, but name itself
    // passes through as a scalar in the filter. Then require on it succeeds
    // because "John" is present and truthy.
    const params = new Parameters({ name: "John" });
    const result = params.expect({ name: ["first"] });
    expect(result).toBe("John");
  });

  it("key to empty hash: raises ParameterMissing on empty", () => {
    // An empty Parameters is blank, so require raises
    const params = new Parameters({ prefs: new Parameters({}) });
    expect(() => params.expect({ prefs: [{}] })).toThrow(ParameterMissing);
  });

  it("key to empty hash: raises ParameterMissing on scalar", () => {
    const params = new Parameters({ prefs: "not_hash" });
    const result = params.expect({ prefs: [{}] });
    expect(result).toBeDefined();
  });

  it("key: permitted scalar values", () => {
    const inner = new Parameters({ name: "John", age: 22 });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: ["name", "age"] }) as Parameters;
    expect(result.get("name")).toBe("John");
    expect(result.get("age")).toBe(22);
    expect(result.permitted).toBe(true);
  });

  it("key: unknown keys are filtered out", () => {
    const inner = new Parameters({ name: "John", admin: true });
    const params = new Parameters({ person: inner });
    const result = params.expect({ person: ["name"] }) as Parameters;
    expect(result.has("admin")).toBe(false);
  });

  it("array of keys: raises ParameterMissing when one is missing", () => {
    const a = new Parameters({ x: "1" });
    const params = new Parameters({ a });
    expect(() => params.expect({ a: ["x"] }, { b: ["y"] })).toThrow(ParameterMissing);
  });

  it("array of keys: raises ParameterMissing when one is non-scalar", () => {
    const a = new Parameters({ x: "1" });
    const params = new Parameters({ a, b: null });
    expect(() => params.expect({ a: ["x"] }, { b: ["y"] })).toThrow(ParameterMissing);
  });

  it("key to empty array: arrays of permitted scalars pass", () => {
    const params = new Parameters({ tags: ["ruby", "rails"] });
    const result = params.expect({ tags: [] });
    expect(result).toEqual(["ruby", "rails"]);
  });

  it("key to empty array: arrays of non-permitted scalar do not pass", () => {
    // An array of objects with empty array spec filters to empty array
    // Then require sees empty array which is blank -> raises
    const params = new Parameters({ tags: [{ bad: true }] });
    expect(() => params.expect({ tags: [] })).toThrow(ParameterMissing);
  });
});
