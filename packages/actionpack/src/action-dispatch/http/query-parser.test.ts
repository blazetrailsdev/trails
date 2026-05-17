import { describe, it, expect, afterEach } from "vitest";
import { QueryParser, type QueryPair } from "./query-parser.js";

function parsedPairs(query: string, separator?: string | null): QueryPair[] {
  return Array.from(QueryParser.eachPair(query, separator));
}

describe("QueryParserTest", () => {
  const previousSeparator = QueryParser.strictQueryStringSeparator;
  afterEach(() => {
    QueryParser.strictQueryStringSeparator = previousSeparator;
  });

  it("simple query string", () => {
    expect(parsedPairs("foo=bar&baz=quux")).toEqual([
      ["foo", "bar"],
      ["baz", "quux"],
    ]);
  });

  it("query string with empty and missing values", () => {
    expect(parsedPairs("foo=bar&empty=&missing&baz=quux")).toEqual([
      ["foo", "bar"],
      ["empty", ""],
      ["missing", null],
      ["baz", "quux"],
    ]);
  });

  it("custom separator", () => {
    expect(parsedPairs("foo=bar;baz=quux", ";")).toEqual([
      ["foo", "bar"],
      ["baz", "quux"],
    ]);
  });

  it("non-standard separator", () => {
    expect(parsedPairs("foo=bar/baz=quux", "/")).toEqual([
      ["foo", "bar"],
      ["baz", "quux"],
    ]);
  });

  it("mixed separators", () => {
    expect(parsedPairs("a=aa&b=bb;c=cc", "&;")).toEqual([
      ["a", "aa"],
      ["b", "bb"],
      ["c", "cc"],
    ]);
  });

  it("(rack 3) defaults to ampersand separator only", () => {
    expect(parsedPairs("a=aa&b=bb;c=cc")).toEqual([
      ["a", "aa"],
      ["b", "bb;c=cc"],
    ]);
  });

  it("configured for strict separator", () => {
    QueryParser.strictQueryStringSeparator = true;
    expect(parsedPairs("a=aa&b=bb;c=cc", "&")).toEqual([
      ["a", "aa"],
      ["b", "bb;c=cc"],
    ]);
  });

  it("configured for mixed separator", () => {
    QueryParser.strictQueryStringSeparator = false;
    expect(parsedPairs("a=aa&b=bb;c=cc", "&;")).toEqual([
      ["a", "aa"],
      ["b", "bb"],
      ["c", "cc"],
    ]);
  });
});
