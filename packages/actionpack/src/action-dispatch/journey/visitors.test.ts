import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Cat, Symbol as SymbolNode } from "./nodes/node.js";
import { Each, StringVisitor, FormatBuilder, Format, Parameter, DotVisitor } from "./visitors.js";

// ==========================================================================
// Rails has no visitors_test.rb — these tests lock down the contracts that
// upstream Visitors::String, Visitors::FormatBuilder, Visitors::Each, and
// Visitors::Dot rely on, so PR 5+ (Path::Pattern) and beyond can use them
// without surprises.
// ==========================================================================

describe("ActionDispatch::Journey::Visitors::String", () => {
  const roundTrip = (str: string) =>
    expect(StringVisitor.INSTANCE.accept(new Parser().parse(str), "")).toBe(str);

  it("round-trips slash", () => roundTrip("/"));
  it("round-trips segment", () => roundTrip("/foo"));
  it("round-trips symbol", () => roundTrip("/:foo"));
  it("round-trips group", () => roundTrip("(/:foo)"));
  it("round-trips nested groups", () => roundTrip("(/:foo(/:bar))"));
  it("round-trips dot symbol", () => roundTrip(".:format"));
  it("round-trips star", () => roundTrip("/*foo"));
  it("round-trips or", () => roundTrip("a|b|c"));
  it("round-trips complex", () => roundTrip("/sprockets.js(.:format)"));
});

describe("ActionDispatch::Journey::Visitors::Each", () => {
  it("visits every node pre-order", () => {
    const tree = new Parser().parse("/:foo");
    const seen: string[] = [];
    Each.INSTANCE.accept(tree, (n) => seen.push(n.type));
    expect(seen).toContain("CAT");
    expect(seen).toContain("SLASH");
    expect(seen).toContain("SYMBOL");
  });
});

describe("ActionDispatch::Journey::Visitors::FormatBuilder", () => {
  it("builds a Format whose evaluate substitutes values", () => {
    const tree = new Parser().parse("/posts/:id");
    const format = new FormatBuilder().accept(tree);
    expect(format).toBeInstanceOf(Format);
    expect(format.evaluate({ id: "42" })).toBe("/posts/42");
  });

  it("returns empty string when a required value is missing", () => {
    const tree = new Parser().parse("/posts/:id");
    const format = new FormatBuilder().accept(tree);
    expect(format.evaluate({})).toBe("");
  });

  it("uses required_path escaping for controller", () => {
    const tree = new Parser().parse("/:controller");
    const format = new FormatBuilder().accept(tree);
    // ESCAPE_PATH keeps `/` literal, while ESCAPE_SEGMENT would encode it.
    expect(format.evaluate({ controller: "admin/posts" })).toBe("/admin/posts");
  });

  it("escapes segment values (not paths) for non-controller symbols", () => {
    const tree = new Parser().parse("/:slug");
    const format = new FormatBuilder().accept(tree);
    expect(format.evaluate({ slug: "a/b" })).toBe("/a%2Fb");
  });

  it("emits required_path for stars", () => {
    const tree = new Parser().parse("/*path");
    const format = new FormatBuilder().accept(tree);
    expect(format.evaluate({ path: "a/b/c" })).toBe("/a/b/c");
  });
});

describe("ActionDispatch::Journey::Format", () => {
  it("Parameter#escape delegates to its escaper", () => {
    const p = Format.requiredSegment("name");
    expect(p).toBeInstanceOf(Parameter);
    expect(p.escape("hello world")).toBe("hello%20world");
  });

  it("required_path keeps slashes literal", () => {
    expect(Format.requiredPath("path").escape("a/b")).toBe("a/b");
  });

  it("required_segment escapes slashes", () => {
    expect(Format.requiredSegment("seg").escape("a/b")).toBe("a%2Fb");
  });
});

describe("ActionDispatch::Journey::Visitors::Dot", () => {
  it("emits a digraph string with node and edge labels", () => {
    const tree = new Cat(new SymbolNode(":a"), new SymbolNode(":b"));
    const dot = DotVisitor.INSTANCE.render(tree);
    expect(dot).toContain("digraph parse_tree");
    expect(dot).toContain('label="○"'); // CAT marker
    expect(dot).toContain('label=":a"');
    expect(dot).toContain('label=":b"');
    expect(dot).toMatch(/-> /); // an edge
  });
});
