import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { indexWith, pluck } from "./enumerable-utils.js";

describe("Enumerable#pluck sends each element []", () => {
  class Row {
    readonly id = "composite";
    get(key: string): unknown {
      return { id: 1, name: "a" }[key];
    }
  }

  it("reads through the element's own [] where it defines one", () => {
    expect(pluck([new Row()] as never[], "id" as never)).toEqual([1]);
    expect(pluck([new Row()] as never[], "id" as never, "name" as never)).toEqual([[1, "a"]]);
  });

  it("reads a hash's key", () => {
    expect(pluck([{ name: "a" }, { name: "b" }], "name")).toEqual(["a", "b"]);
  });
});

describe("Enumerable#index_with answers a plain object for String elements", () => {
  it("answers a plain object when every element is a String", () => {
    expect(indexWith(["title", "body"], null)).toEqual({ title: null, body: null });
  });

  it("answers a Hash for an empty or mixed collection", () => {
    expect(indexWith([], 1)).toBeInstanceOf(Hash);
    const mixed = indexWith(["a", 1] as unknown[], (e) => e);
    expect(mixed).toBeInstanceOf(Hash);
    expect([...mixed]).toEqual([
      ["a", "a"],
      [1, 1],
    ]);
  });
});
