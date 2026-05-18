import { afterEach, describe, expect, test } from "vitest";
import { InvalidParameterError, ParameterTypeError, ParamsTooDeepError } from "./param-error.js";
import { ParamBuilder } from "./param-builder.js";

function plain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plain);
  if (v !== null && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto === null || proto === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, plain(vv)]));
    }
  }
  return v;
}

describe("ParamBuilder", () => {
  // Much of the behavioral details are covered by long-standing
  // integration tests in test/request/query_string_parsing_test.rb
  //
  // This test doesn't need to duplicate all of that: it just
  // offers a simple baseline of unit tests.

  const previous = ParamBuilder.ignoreLeadingBrackets;
  afterEach(() => {
    ParamBuilder.ignoreLeadingBrackets = previous;
  });

  test("simple query string", () => {
    const result = ParamBuilder.fromQueryString("foo=bar&baz=quux");
    expect({ ...result }).toEqual({ foo: "bar", baz: "quux" });
  });

  test("nested parameters", () => {
    const result = ParamBuilder.fromQueryString("foo[bar]=baz");
    expect({ ...result, foo: { ...(result.foo as object) } }).toEqual({
      foo: { bar: "baz" },
    });
  });

  test("(rack 3) defaults to retaining leading bracket", () => {
    let result = ParamBuilder.fromQueryString("[foo]=bar");
    expect({ ...result }).toEqual({ "[foo]": "bar" });

    result = ParamBuilder.fromQueryString("[foo][bar]=baz");
    expect({ ...result, "[foo]": { ...(result["[foo]"] as object) } }).toEqual({
      "[foo]": { bar: "baz" },
    });
  });

  test("configured for strict brackets", () => {
    ParamBuilder.ignoreLeadingBrackets = false;

    let result = ParamBuilder.fromQueryString("[foo]=bar");
    expect({ ...result }).toEqual({ "[foo]": "bar" });

    result = ParamBuilder.fromQueryString("[foo][bar]=baz");
    expect({ ...result, "[foo]": { ...(result["[foo]"] as object) } }).toEqual({
      "[foo]": { bar: "baz" },
    });
  });

  test("invalid percent-encoding raises InvalidParameterError", () => {
    expect(() => ParamBuilder.fromQueryString("foo=%E0%A4%A")).toThrow(InvalidParameterError);
  });

  test("deep hash nesting", () => {
    const result = ParamBuilder.fromQueryString("x[y][z]=1");
    expect(plain(result)).toEqual({ x: { y: { z: "1" } } });
  });

  test("hash inside array via [][key]", () => {
    const result = ParamBuilder.fromQueryString("x[][y]=1&x[][y]=2");
    expect(plain(result)).toEqual({ x: [{ y: "1" }, { y: "2" }] });
  });

  test("array of plain values", () => {
    const result = ParamBuilder.fromQueryString("a[]=1&a[]=2");
    expect(plain(result)).toEqual({ a: ["1", "2"] });
  });

  test("hash-vs-scalar type mismatch raises ParameterTypeError", () => {
    expect(() => ParamBuilder.fromQueryString("x=1&x[y]=2")).toThrow(ParameterTypeError);
  });

  test("array-vs-scalar type mismatch raises ParameterTypeError", () => {
    expect(() => ParamBuilder.fromQueryString("x=1&x[]=2")).toThrow(ParameterTypeError);
  });

  test("depth limit raises ParamsTooDeepError", () => {
    const shallow = new ParamBuilder(3);
    expect(() => shallow.fromQueryString("a[b][c][d][e]=1")).toThrow(ParamsTooDeepError);
  });

  test("configured for ignoring leading brackets", () => {
    ParamBuilder.ignoreLeadingBrackets = true;

    let result = ParamBuilder.fromQueryString("[foo]=bar");
    expect({ ...result }).toEqual({ foo: "bar" });

    result = ParamBuilder.fromQueryString("[foo][bar]=baz");
    expect({ ...result, foo: { ...(result.foo as object) } }).toEqual({
      foo: { bar: "baz" },
    });
  });
});
