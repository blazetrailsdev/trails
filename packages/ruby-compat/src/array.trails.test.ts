import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { compact, pack, uniq } from "./array.js";

describe("Array#pack", () => {
  const long = "a".repeat(100);

  it("m0 is strict Base64 with no line breaks", () => {
    expect(pack([long], "m0")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ==",
    );
  });

  it("m wraps at 60 characters and ends with a newline", () => {
    expect(pack([long], "m")).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\n" +
        "YWFhYWFhYWFhYQ==\n",
    );
  });

  it("m6 wraps at the given input width rounded down to a multiple of three", () => {
    expect(pack(["abcdefghi"], "m6")).toBe("YWJjZGVm\nZ2hp\n");
  });

  it("m* is m, not m0", () => {
    expect(pack([long], "m*")).toBe(pack([long], "m"));
  });

  it("pads a partial trailing group", () => {
    expect(pack(["ab"], "m0")).toBe("YWI=");
    expect(pack(["a"], "m0")).toBe("YQ==");
    expect(pack(["abc"], "m0")).toBe("YWJj");
  });

  it("encodes the empty string as the empty string", () => {
    expect(pack([""], "m")).toBe("");
    expect(pack([""], "m0")).toBe("");
  });

  it("packs the HTTP Basic credential Rack::Test builds", () => {
    expect(pack(["user:pass"], "m0")).toBe("dXNlcjpwYXNz");
  });

  it("raises on an unknown directive", () => {
    expect(() => pack(["a"], "Y")).toThrow(new ArgumentError("unknown pack directive 'Y' in 'Y'"));
  });

  it("raises when the array runs out", () => {
    expect(() => pack([], "m0")).toThrow(new ArgumentError("too few arguments"));
  });

  it("skips whitespace and # comments in the format", () => {
    expect(pack(["ab"], " m0")).toBe("YWI=");
    expect(pack(["ab"], "#skip\nm0")).toBe("YWI=");
  });
});

describe("Array#compact and Array#uniq", () => {
  it("drops every nil element and keeps the rest in order", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    expect(compact([0, "", false])).toEqual([0, "", false]);
  });

  it("dedups by eql?, not identity, keeping the first of each", () => {
    expect(uniq([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    expect(
      uniq([
        [1, 2],
        [1, 2],
        [1, 3],
      ]),
    ).toEqual([
      [1, 2],
      [1, 3],
    ]);
    expect(uniq([{ a: 1 }, { a: 1 }])).toEqual([{ a: 1 }]);
    expect(uniq([new Map([["a", 1]]), new Map([["a", 1]]), { a: 1 }])).toEqual([
      new Map([["a", 1]]),
    ]);
  });

  it("collapses the two JS seats of one Ruby Integer", () => {
    expect(uniq([1, 1n])).toEqual([1]);
    expect(
      uniq([
        [1n, 3],
        [1, 3],
      ]),
    ).toEqual([[1n, 3]]);
  });
});
