import { describe, it, expect } from "vitest";
import { Hash } from "../lib/hash.js";
import { JSON } from "../lib/json.js";

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

  it("parses every object into a new objectClass instance through its []=", () => {
    const set: [unknown, unknown][] = [];
    class Recording extends Hash<string, unknown> {
      override set(key: string, value: unknown): this {
        set.push([key, value]);
        return super.set(key, value);
      }
    }
    const parsed = JSON.parse('[{"a":{"b":1}}]', { objectClass: Recording }) as Recording[];
    expect(parsed[0]).toBeInstanceOf(Recording);
    expect(parsed[0].get("a")).toBeInstanceOf(Recording);
    expect((parsed[0].get("a") as Recording).get("b")).toBe(1);
    expect(set.map(([key]) => key)).toEqual(["b", "a"]);
  });

  it("names an objectClass instance's keys as Symbols under symbolizeNames", () => {
    const parsed = JSON.parse('{"a":1}', { objectClass: Hash, symbolizeNames: true }) as Hash<
      string,
      unknown
    >;
    expect(parsed.get(":a")).toBe(1);
  });
});

describe("JSON.parse comments", () => {
  it("reads a comment as whitespace, so it cannot join two tokens", async () => {
    const { JSON: RbJSON } = await import("../lib/json.js");
    expect(RbJSON.parse("[1, /* x */ 2] // y\n")).toEqual([1, 2]);
    expect(() => RbJSON.parse("[1/*x*/2]")).toThrow(SyntaxError);
    expect(() => RbJSON.parse("1/*")).toThrow(SyntaxError);
  });
});

describe("JSON.prettyGenerate", () => {
  it("answers as MRI's json 2.7.2 does", () => {
    expect(JSON.prettyGenerate({ a: {}, b: [1, { c: [] }], d: "x" })).toBe(
      '{\n  "a": {\n  },\n  "b": [\n    1,\n    {\n      "c": [\n\n      ]\n    }\n  ],\n  "d": "x"\n}',
    );
    expect(JSON.prettyGenerate({ e: "1", f: { g: {} } }, { indent: "  ", objectNl: "\n  " })).toBe(
      '{\n    "e": "1",\n    "f": {\n      "g": {\n      }\n    }\n  }',
    );
  });
});
