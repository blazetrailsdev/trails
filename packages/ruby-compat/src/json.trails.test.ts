import { describe, it, expect } from "vitest";
import { Hash } from "./hash.js";
import { JSON } from "./json.js";

describe("JSON.parse", () => {
  it("parses a string source", () => {
    expect(JSON.parse('{"p":"café"}')).toEqual({ p: "café" });
  });

  it("reads a source held as its bytes as UTF-8", () => {
    expect(JSON.parse(new TextEncoder().encode('{"p":"café"}'))).toEqual({ p: "café" });
  });

  it("raises TypeError for a source that is not a String", () => {
    expect(() => JSON.parse(42 as never)).toThrow(TypeError);
  });

  it("raises SyntaxError for a malformed source", () => {
    expect(() => JSON.parse("not json")).toThrow(SyntaxError);
  });

  it("raises SyntaxError for a byte source that is not valid UTF-8", () => {
    expect(() => JSON.parse(Uint8Array.of(0x22, 0xff, 0x22))).toThrow(SyntaxError);
  });
});

describe("JSON.parse options", () => {
  it("parses an object into a Hash with Symbol names, frozen", () => {
    const parsed = JSON.parse('{"en":{"foo":["bar"]}}', { symbolizeNames: true, freeze: true });
    expect(parsed).toBeInstanceOf(Hash);
    const en = (parsed as Hash<unknown, Hash<unknown, unknown>>).get(":en")!;
    expect(en.get(":foo")).toEqual(["bar"]);
    expect(en.isFrozen()).toBe(true);
    expect(Object.isFrozen(en.get(":foo"))).toBe(true);
  });
});

describe("JSON.parse comments", () => {
  it("reads a comment as whitespace, so it cannot join two tokens", async () => {
    const { JSON: RbJSON } = await import("./json.js");
    expect(RbJSON.parse("[1, /* x */ 2] // y\n")).toEqual([1, 2]);
    expect(() => RbJSON.parse("[1/*x*/2]")).toThrow(SyntaxError);
    expect(() => RbJSON.parse("1/*")).toThrow(SyntaxError);
  });
});
