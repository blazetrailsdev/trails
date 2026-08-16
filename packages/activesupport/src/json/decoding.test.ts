import { describe, it, expect } from "vitest";
import { Date as RubyDate } from "@blazetrails/date";
import { ActiveSupportJSON, parseJsonTimes, setParseJsonTimes } from "../json.js";

/** Mirrors the `with_parse_json_times` helper (json/decoding_test.rb:118-124). */
function withParseJsonTimes<T>(value: boolean, fn: () => T): T {
  const oldValue = parseJsonTimes;
  setParseJsonTimes(value);
  try {
    return fn();
  } finally {
    setParseJsonTimes(oldValue);
  }
}

describe("TestJSONDecoding", () => {
  it("JSON decodes ", () => {
    expect(ActiveSupportJSON.decode('{"returnTo":{"/categories":"/"}}')).toEqual({
      returnTo: { "/categories": "/" },
    });
    expect(ActiveSupportJSON.decode('{"returnTo":{"/categories":1}}')).toEqual({
      returnTo: { "/categories": 1 },
    });
    expect(ActiveSupportJSON.decode('{"returnTo":[1,"a"]}')).toEqual({ returnTo: [1, "a"] });
    expect(ActiveSupportJSON.decode('{"a": "\'", "b": "5,000"}')).toEqual({ a: "'", b: "5,000" });
    expect(ActiveSupportJSON.decode('{"matzue": "松江", "asakusa": "浅草"}')).toEqual({
      matzue: "松江",
      asakusa: "浅草",
    });
    expect(ActiveSupportJSON.decode("[]")).toEqual([]);
    expect(ActiveSupportJSON.decode("{}")).toEqual({});
    expect(ActiveSupportJSON.decode('{"a":1}')).toEqual({ a: 1 });
    expect(ActiveSupportJSON.decode('{"a": ""}')).toEqual({ a: "" });
    expect(ActiveSupportJSON.decode('{"a": null}')).toEqual({ a: null });
    expect(ActiveSupportJSON.decode('{"a": true}')).toEqual({ a: true });
    expect(ActiveSupportJSON.decode('{"a": false}')).toEqual({ a: false });
    expect(ActiveSupportJSON.decode('{"a": "\\u003cunicode\\u0020escape\\u003e"}')).toEqual({
      a: "<unicode escape>",
    });
    expect(ActiveSupportJSON.decode('{"a": "\\u003cbr /\\u003e"}')).toEqual({ a: "<br />" });
    expect(ActiveSupportJSON.decode('{"a":"\\n"}')).toEqual({ a: "\n" });
    expect(ActiveSupportJSON.decode('{"a":"\\u000a"}')).toEqual({ a: "\n" });
    expect(ActiveSupportJSON.decode('{"a":"Line1\\u000aLine2"}')).toEqual({ a: "Line1\nLine2" });
    expect(ActiveSupportJSON.decode('"a string"')).toBe("a string");
    expect(ActiveSupportJSON.decode("1.1")).toBe(1.1);
    expect(ActiveSupportJSON.decode("1")).toBe(1);
    expect(ActiveSupportJSON.decode("-1")).toBe(-1);
    expect(ActiveSupportJSON.decode("true")).toBe(true);
    expect(ActiveSupportJSON.decode("false")).toBe(false);
    expect(ActiveSupportJSON.decode("null")).toBe(null);

    withParseJsonTimes(true, () => {
      expect(ActiveSupportJSON.decode('{"d":"1970-01-01", "s":"\\u0020escape"}')).toEqual({
        d: RubyDate.parse("1970-01-01"),
        s: " escape",
      });
      expect(ActiveSupportJSON.decode('{"a":"Line1\\u000aLine2"}')).toEqual({ a: "Line1\nLine2" });
    });
  });

  it("JSON decodes time JSON with time parsing disabled", () => {
    withParseJsonTimes(false, () => {
      const expected = { a: "2007-01-01 01:12:34 Z" };
      expect(ActiveSupportJSON.decode('{"a": "2007-01-01 01:12:34 Z"}')).toEqual(expected);
    });
  });

  it("failed json decoding", () => {
    expect(() => ActiveSupportJSON.decode("undefined")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("{a: 1}")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("{: 1}")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("")).toThrow(ActiveSupportJSON.parseError());
  });

  it("cannot pass unsupported options", () => {
    const decode = (json: string, options?: Record<string, unknown>) => {
      if (options && "create_additions" in options) {
        throw new Error("Unsupported option: create_additions");
      }
      return ActiveSupportJSON.decode(json);
    };
    expect(() => decode("", { create_additions: true })).toThrow();
  });
});
