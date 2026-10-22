import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { indexWith, pluck, tally } from "./enumerable-utils.js";

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

  it("answers a plain object for an empty collection and a Hash for a mixed one", () => {
    expect(indexWith([], 1)).toEqual({});
    const mixed = indexWith(["a", 1] as unknown[], (e) => e);
    expect(mixed).toBeInstanceOf(Hash);
    expect([...(mixed as Hash<unknown, unknown>)]).toEqual([
      ["a", "a"],
      [1, 1],
    ]);
  });
});

describe("Enumerable#tally keys on element identity", () => {
  it("counts two distinct elements sharing a toString separately", () => {
    const a = { toString: () => "Job" };
    const b = { toString: () => "Job" };
    expect([...tally([a, b, a])]).toEqual([
      [a, 2],
      [b, 1],
    ]);
  });
});
