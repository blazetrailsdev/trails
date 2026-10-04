import { describe, it, expect } from "vitest";
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
