import { describe, it, expect } from "vitest";
import { decodeLineMappings, encodeVlq, generateSourceMap } from "./source-map.js";

describe("encodeVlq", () => {
  it("encodes known values", () => {
    expect(encodeVlq(0)).toBe("A");
    expect(encodeVlq(1)).toBe("C");
    expect(encodeVlq(-1)).toBe("D");
    expect(encodeVlq(16)).toBe("gB");
  });
});

describe("generateSourceMap", () => {
  it("produces valid V3 map with line-level mappings", () => {
    const map = generateSourceMap("out.js", "src.tse", "hello\nworld", [
      { genLine: 1, srcLine: 0 },
      { genLine: 3, srcLine: 1 },
    ]);
    expect(map.version).toBe(3);
    expect(map.file).toBe("out.js");
    expect(map.sources).toEqual(["src.tse"]);
    expect(map.sourcesContent).toEqual(["hello\nworld"]);
    const lines = map.mappings.split(";");
    expect(lines[0]).toBe("");
    expect(lines[1]).not.toBe("");
    expect(lines[2]).toBe("");
    expect(lines[3]).not.toBe("");
  });
});

describe("decodeLineMappings", () => {
  it("round-trips generateSourceMap's line mappings", () => {
    const mappings = [
      { genLine: 1, srcLine: 0, genCol: 13, srcCol: 4 },
      { genLine: 3, srcLine: 17, genCol: 2, srcCol: 0 },
      { genLine: 4, srcLine: 2, genCol: 0, srcCol: 30 },
    ];
    const map = generateSourceMap("out.js", "src.tse", null, mappings);
    expect(decodeLineMappings(map.mappings)).toEqual(mappings);
  });
});
