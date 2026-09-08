import { describe, it, expect } from "vitest";
import { Parser } from "../../parser.js";

describe("ActionDispatch::Journey::Parser", () => {
  const parser = new Parser();
  const roundTrip = (str: string) => expect(parser.parse(str).toString()).toBe(str);

  it("slash", () => {
    expect(parser.parse("/").type).toBe("SLASH");
    roundTrip("/");
  });
  it("segment", () => roundTrip("/foo"));
  it("segments", () => roundTrip("/foo/bar"));
  it("segment symbol", () => roundTrip("/foo/:id"));
  it("symbol", () => roundTrip("/:foo"));
  it("group", () => roundTrip("(/:foo)"));
  it("groups", () => roundTrip("(/:foo)(/:bar)"));
  it("nested groups", () => roundTrip("(/:foo(/:bar))"));
  it("dot symbol", () => roundTrip(".:format"));
  it("dot literal", () => roundTrip(".xml"));
  it("segment dot", () => roundTrip("/foo.:bar"));
  it("segment group dot", () => roundTrip("/foo(.:bar)"));
  it("segment group", () => roundTrip("/foo(/:action)"));
  it("segment groups", () => roundTrip("/foo(/:action)(/:bar)"));
  it("segment nested groups", () => roundTrip("/foo(/:action(/:bar))"));
  it("group followed by path", () => roundTrip("/foo(/:action)/:bar"));
  it("star", () => {
    roundTrip("*foo");
    roundTrip("/*foo");
    roundTrip("/bar/*foo");
    roundTrip("/bar/(*foo)");
  });
  it("or", () => {
    roundTrip("a|b");
    roundTrip("a|b|c");
    roundTrip("(a|b)|c");
    roundTrip("a|(b|c)");
    roundTrip("*a|(b|c)");
    roundTrip("*a|:b|c");
  });
  it("arbitrary", () => roundTrip("/bar/*foo#"));
  it("literal dot paren", () => roundTrip("/sprockets.js(.:format)"));
  it("groups with dot", () => roundTrip("/(:locale)(.:format)"));
});
