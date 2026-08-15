import { describe, it, expect } from "vitest";
import { inspect, toS } from "./inspect.js";

// Every expectation below is the output of the quoted `ruby -e` on MRI 3.3.
describe("Object#inspect", () => {
  it("renders nested arrays, hashes, nil, strings and numbers as MRI does", () => {
    // ruby -e 'p [1, [2, "a"], {b: 3}, nil].to_s' => "[1, [2, \"a\"], {:b=>3}, nil]"
    expect(inspect([1, [2, "a"], { ":b": 3 }, null])).toBe('[1, [2, "a"], {:b=>3}, nil]');
    // ruby -e 'p({"a"=>[1,nil]}.to_s)' => "{\"a\"=>[1, nil]}"
    expect(inspect({ a: [1, null] })).toBe('{"a"=>[1, nil]}');
    // ruby -e 'p ["x", :y, 2.5, true].to_s' => "[\"x\", :y, 2.5, true]"
    expect(inspect(["x", ":y", 2.5, true])).toBe('["x", :y, 2.5, true]');
  });

  it("renders empty collections and nil", () => {
    // ruby -e 'p [].inspect, ({}).inspect, nil.inspect' => "[]", "{}", "nil"
    expect(inspect([])).toBe("[]");
    expect(inspect({})).toBe("{}");
    expect(inspect(null)).toBe("nil");
    expect(inspect(undefined)).toBe("nil");
  });

  it("escapes a quote inside a string", () => {
    // ruby -e 'p "q\"u".inspect' => "\"q\\\"u\""
    expect(inspect('q"u')).toBe('"q\\"u"');
  });
});

describe("Object#to_s", () => {
  it("is inspect for Array and Hash and the value's own to_s otherwise", () => {
    // ruby -e 'p 3.to_s, nil.to_s, "hi".to_s, [{"a"=>1}].to_s'
    expect(toS(3)).toBe("3");
    expect(toS(null)).toBe("");
    expect(toS("hi")).toBe("hi");
    expect(toS([{ a: 1 }])).toBe('[{"a"=>1}]');
  });
});
