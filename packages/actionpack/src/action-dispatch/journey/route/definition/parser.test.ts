import { describe, it, expect } from "vitest";
import { Parser } from "../../parser.js";

describe("ActionDispatch::Journey::Parser", () => {
  const parser = new Parser();
  const assertRoundTrip = (str: string) => expect(parser.parse(str)!.toString()).toBe(str);

  it("slash", () => {
    expect(parser.parse("/")!.type).toBe("SLASH");
    assertRoundTrip("/");
  });
  it("segment", () => assertRoundTrip("/foo"));
  it("segments", () => assertRoundTrip("/foo/bar"));
  it("segment symbol", () => assertRoundTrip("/foo/:id"));
  it("symbol", () => assertRoundTrip("/:foo"));
  it("group", () => assertRoundTrip("(/:foo)"));
  it("groups", () => assertRoundTrip("(/:foo)(/:bar)"));
  it("nested groups", () => assertRoundTrip("(/:foo(/:bar))"));
  it("dot symbol", () => assertRoundTrip(".:format"));
  it("dot literal", () => assertRoundTrip(".xml"));
  it("segment dot", () => assertRoundTrip("/foo.:bar"));
  it("segment group dot", () => assertRoundTrip("/foo(.:bar)"));
  it("segment group", () => assertRoundTrip("/foo(/:action)"));
  it("segment groups", () => assertRoundTrip("/foo(/:action)(/:bar)"));
  it("segment nested groups", () => assertRoundTrip("/foo(/:action(/:bar))"));
  it("group followed by path", () => assertRoundTrip("/foo(/:action)/:bar"));
  it("star", () => {
    assertRoundTrip("*foo");
    assertRoundTrip("/*foo");
    assertRoundTrip("/bar/*foo");
    assertRoundTrip("/bar/(*foo)");
  });
  it("or", () => {
    assertRoundTrip("a|b");
    assertRoundTrip("a|b|c");
    assertRoundTrip("(a|b)|c");
    assertRoundTrip("a|(b|c)");
    assertRoundTrip("*a|(b|c)");
    assertRoundTrip("*a|:b|c");
  });
  it("arbitrary", () => assertRoundTrip("/bar/*foo#"));
  it("literal dot paren", () => assertRoundTrip("/sprockets.js(.:format)"));
  it("groups with dot", () => assertRoundTrip("/(:locale)(.:format)"));
});
