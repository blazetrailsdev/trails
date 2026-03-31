import { describe, it, expect } from "vitest";

describe("TestJSONDecoding", () => {
  it("JSON decodes ", () => {
    expect(JSON.parse('{"returnTo":{"/categories":"/"}}')).toEqual({
      returnTo: { "/categories": "/" },
    });
    expect(JSON.parse('{"returnTo":{"/categories":1}}')).toEqual({
      returnTo: { "/categories": 1 },
    });
    expect(JSON.parse('{"returnTo":[1,"a"]}')).toEqual({ returnTo: [1, "a"] });
    expect(JSON.parse('{"a": "\'", "b": "5,000"}')).toEqual({ a: "'", b: "5,000" });
    expect(JSON.parse('{"matzue": "松江", "asakusa": "浅草"}')).toEqual({
      matzue: "松江",
      asakusa: "浅草",
    });
    expect(JSON.parse("[]")).toEqual([]);
    expect(JSON.parse("{}")).toEqual({});
    expect(JSON.parse('{"a":1}')).toEqual({ a: 1 });
    expect(JSON.parse('{"a": ""}')).toEqual({ a: "" });
    expect(JSON.parse('{"a": null}')).toEqual({ a: null });
    expect(JSON.parse('{"a": true}')).toEqual({ a: true });
    expect(JSON.parse('{"a": false}')).toEqual({ a: false });
    expect(JSON.parse('{"a": "\\u003cunicode\\u0020escape\\u003e"}')).toEqual({
      a: "<unicode escape>",
    });
    expect(JSON.parse('{"a": "\\u003cbr /\\u003e"}')).toEqual({ a: "<br />" });
    expect(JSON.parse('{"a":"\\n"}')).toEqual({ a: "\n" });
    expect(JSON.parse('{"a":"\\u000a"}')).toEqual({ a: "\n" });
    expect(JSON.parse('{"a":"Line1\\u000aLine2"}')).toEqual({ a: "Line1\nLine2" });
    expect(JSON.parse('"a string"')).toBe("a string");
    expect(JSON.parse("1.1")).toBe(1.1);
    expect(JSON.parse("1")).toBe(1);
    expect(JSON.parse("-1")).toBe(-1);
    expect(JSON.parse("true")).toBe(true);
    expect(JSON.parse("false")).toBe(false);
    expect(JSON.parse("null")).toBe(null);
  });

  it("JSON decodes time JSON with time parsing disabled", () => {
    const result = JSON.parse('{"a": "2007-01-01 01:12:34 Z"}');
    expect(result).toEqual({ a: "2007-01-01 01:12:34 Z" });
  });

  it("failed json decoding", () => {
    expect(() => JSON.parse("undefined")).toThrow();
    expect(() => JSON.parse("{a: 1}")).toThrow();
    expect(() => JSON.parse("{: 1}")).toThrow();
    expect(() => JSON.parse("")).toThrow();
  });

  it("cannot pass unsupported options", () => {
    const decode = (json: string, options?: Record<string, unknown>) => {
      if (options && "create_additions" in options) {
        throw new Error("Unsupported option: create_additions");
      }
      return JSON.parse(json);
    };
    expect(() => decode("", { create_additions: true })).toThrow();
  });
});
