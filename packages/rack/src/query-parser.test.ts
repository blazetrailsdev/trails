import { it, expect } from "vitest";
import { QueryParser } from "./query-parser.js";

it("can normalize values with missing values", () => {
  const queryParser = QueryParser.makeDefault(8);
  expect(queryParser.parseNestedQuery("a=a")).toEqual({ a: "a" });
  expect(queryParser.parseNestedQuery("a=")).toEqual({ a: "" });
  expect(queryParser.parseNestedQuery("a")).toEqual({ a: null });
});

it("accepts bytesize_limit to specify maximum size of query string to parse", () => {
  const queryParser = QueryParser.makeDefault(32, { bytesizeLimit: 3 });
  expect(queryParser.parseQuery("a=a")).toEqual({ a: "a" });
  expect(queryParser.parseNestedQuery("a=a")).toEqual({ a: "a" });
  expect(queryParser.parseNestedQuery("a=a", "&")).toEqual({ a: "a" });
  expect(() => queryParser.parseQuery("a=aa")).toThrow();
  expect(() => queryParser.parseNestedQuery("a=aa")).toThrow();
  expect(() => queryParser.parseNestedQuery("a=aa", "&")).toThrow();
});

it("accepts params_limit to specify maximum number of query parameters to parse", () => {
  const queryParser = QueryParser.makeDefault(32, { paramsLimit: 2 });
  expect(queryParser.parseQuery("a=a&b=b")).toEqual({ a: "a", b: "b" });
  expect(queryParser.parseNestedQuery("a=a&b=b")).toEqual({ a: "a", b: "b" });
  expect(queryParser.parseNestedQuery("a=a&b=b", "&")).toEqual({ a: "a", b: "b" });
  expect(() => queryParser.parseQuery("a=a&b=b&c=c")).toThrow();
  expect(() => queryParser.parseNestedQuery("a=a&b=b&c=c", "&")).toThrow();
  expect(() => queryParser.parseQuery("b[]=a&b[]=b&b[]=c")).toThrow();
});
