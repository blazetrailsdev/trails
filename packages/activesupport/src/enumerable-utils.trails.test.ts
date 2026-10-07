import { describe, expect, it } from "vitest";
import { pluck } from "./enumerable-utils.js";

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
