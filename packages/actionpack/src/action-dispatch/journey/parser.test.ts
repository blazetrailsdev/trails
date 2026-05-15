import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";

describe("ActionDispatch::Journey::Parser", () => {
  const parser = new Parser();
  const roundTrip = (str: string) => expect(parser.parse(str).toString()).toBe(str);

  it("test_slash", () => {
    expect(parser.parse("/").type).toBe("SLASH");
    roundTrip("/");
  });
  it("test_segment", () => roundTrip("/foo"));
  it("test_segments", () => roundTrip("/foo/bar"));
  it("test_segment_symbol", () => roundTrip("/foo/:id"));
  it("test_symbol", () => roundTrip("/:foo"));
  it("test_group", () => roundTrip("(/:foo)"));
  it("test_groups", () => roundTrip("(/:foo)(/:bar)"));
  it("test_nested_groups", () => roundTrip("(/:foo(/:bar))"));
  it("test_dot_symbol", () => roundTrip(".:format"));
  it("test_dot_literal", () => roundTrip(".xml"));
  it("test_segment_dot", () => roundTrip("/foo.:bar"));
  it("test_segment_group_dot", () => roundTrip("/foo(.:bar)"));
  it("test_segment_group", () => roundTrip("/foo(/:action)"));
  it("test_segment_groups", () => roundTrip("/foo(/:action)(/:bar)"));
  it("test_segment_nested_groups", () => roundTrip("/foo(/:action(/:bar))"));
  it("test_group_followed_by_path", () => roundTrip("/foo(/:action)/:bar"));
  it("test_star *foo", () => roundTrip("*foo"));
  it("test_star /*foo", () => roundTrip("/*foo"));
  it("test_star /bar/*foo", () => roundTrip("/bar/*foo"));
  it("test_star /bar/(*foo)", () => roundTrip("/bar/(*foo)"));
  it("test_or a|b", () => roundTrip("a|b"));
  it("test_or a|b|c", () => roundTrip("a|b|c"));
  it("test_or (a|b)|c", () => roundTrip("(a|b)|c"));
  it("test_or a|(b|c)", () => roundTrip("a|(b|c)"));
  it("test_or *a|(b|c)", () => roundTrip("*a|(b|c)"));
  it("test_or *a|:b|c", () => roundTrip("*a|:b|c"));
  it("test_arbitrary", () => roundTrip("/bar/*foo#"));
  it("test_literal_dot_paren", () => roundTrip("/sprockets.js(.:format)"));
  it("test_groups_with_dot", () => roundTrip("/(:locale)(.:format)"));
});
