import { describe, it, expect } from "vitest";
import { rbInspect as inspect, rbObjAsString as toS } from "./object.js";

describe("Object#inspect", () => {
  it("renders nested arrays, hashes, nil, strings and numbers as MRI does", () => {
    expect(inspect([1, [2, "a"], { ":b": 3 }, null])).toBe('[1, [2, "a"], {:b=>3}, nil]');
    expect(inspect({ a: [1, null] })).toBe('{"a"=>[1, nil]}');
    expect(inspect(["x", ":y", 2.5, true])).toBe('["x", :y, 2.5, true]');
  });

  it("renders empty collections and nil", () => {
    expect(inspect([])).toBe("[]");
    expect(inspect({})).toBe("{}");
    expect(inspect(null)).toBe("nil");
    expect(inspect(undefined)).toBe("nil");
  });

  it("escapes a quote inside a string", () => {
    expect(inspect('q"u')).toBe('"q\\"u"');
  });
});

describe("Object#to_s", () => {
  it("is inspect for Array and Hash and the value's own to_s otherwise", () => {
    expect(toS(3)).toBe("3");
    expect(toS(null)).toBe("");
    expect(toS("hi")).toBe("hi");
    expect(toS([{ a: 1 }])).toBe('[{"a"=>1}]');
  });
});
