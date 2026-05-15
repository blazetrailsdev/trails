import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("NestedParametersPermitTest", () => {
  it("permitted nested parameters", () => {
    const inner = new Parameters({ title: "Hello", admin: true });
    const params = new Parameters({ post: inner });
    const permitted = params.permit({ post: ["title"] });
    const post = permitted.get("post") as Parameters;
    expect(post).toBeInstanceOf(Parameters);
    expect(post.get("title")).toBe("Hello");
    expect(post.has("admin")).toBe(false);
  });

  it("permitted nested parameters with a string or a symbol as a key", () => {
    const inner = new Parameters({ title: "Hello" });
    const params = new Parameters({ post: inner });
    const permitted = params.permit({ post: ["title"] });
    expect((permitted.get("post") as Parameters).get("title")).toBe("Hello");
  });

  it("nested arrays with strings", () => {
    const params = new Parameters({ tags: ["ruby", "rails"] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual(["ruby", "rails"]);
  });

  it("permit may specify symbols or strings", () => {
    const params = new Parameters({ name: "John", age: 22 });
    const permitted = params.permit("name", "age");
    expect(permitted.get("name")).toBe("John");
    expect(permitted.get("age")).toBe(22);
  });

  it("nested array with strings that should be hashes", () => {
    const params = new Parameters({ items: ["not_a_hash", "also_not"] });
    const permitted = params.permit({ items: [] });
    expect(permitted.get("items")).toEqual(["not_a_hash", "also_not"]);
  });

  it("nested array with strings that should be hashes and additional values", () => {
    const params = new Parameters({ tags: ["ruby", 42, true, { bad: true }] });
    const permitted = params.permit({ tags: [] });
    expect(permitted.get("tags")).toEqual(["ruby", 42, true]);
  });

  it("nested string that should be a hash", () => {
    const params = new Parameters({ person: "not_a_hash" });
    const permitted = params.permit({ person: ["name"] });
    expect(permitted.has("person")).toBe(true);
  });

  it("nested params with numeric keys", () => {
    const inner = new Parameters({
      "0": new Parameters({ name: "a" }),
      "1": new Parameters({ name: "b" }),
    });
    const params = new Parameters({ items: inner });
    const permitted = params.permit({ items: ["name"] });
    expect(permitted.has("items")).toBe(true);
  });

  it("nested params with non_numeric keys", () => {
    const inner = new Parameters({ x: new Parameters({ name: "a" }) });
    const params = new Parameters({ items: inner });
    const permitted = params.permit({ items: ["name"] });
    expect(permitted.has("items")).toBe(true);
  });

  it("nested params with negative numeric keys", () => {
    const inner = new Parameters({ "-1": new Parameters({ name: "a" }) });
    const params = new Parameters({ items: inner });
    const permitted = params.permit({ items: ["name"] });
    expect(permitted.has("items")).toBe(true);
  });

  it("nested params with numeric keys addressing individual numeric keys", () => {
    const inner = new Parameters({ "0": new Parameters({ name: "a" }) });
    const params = new Parameters({ items: inner });
    expect(params.get("items")).toBeInstanceOf(Parameters);
  });

  it("nested params with numeric keys addressing individual numeric keys using require first", () => {
    const inner = new Parameters({ name: "a" });
    const params = new Parameters({ item: inner });
    const required = params.require("item") as Parameters;
    const permitted = required.permit("name");
    expect(permitted.get("name")).toBe("a");
  });

  it("nested params with numeric keys addressing individual numeric keys to arrays", () => {
    const params = new Parameters({ items: [new Parameters({ name: "a" })] });
    const permitted = params.permit({ items: ["name"] });
    expect(permitted.has("items")).toBe(true);
  });

  it("nested params with numeric keys addressing individual numeric keys to more nested params", () => {
    const deep = new Parameters({ city: "NYC" });
    const inner = new Parameters({ name: "a", address: deep });
    const params = new Parameters({ person: inner });
    const permitted = params.permit({ person: ["name", { address: ["city"] }] });
    const person = permitted.get("person") as Parameters;
    expect(person.get("name")).toBe("a");
    const address = person.get("address") as Parameters;
    expect(address.get("city")).toBe("NYC");
  });

  it("nested number as key", () => {
    const params = new Parameters({ "123": "value" });
    expect(params.get("123")).toBe("value");
  });
});
