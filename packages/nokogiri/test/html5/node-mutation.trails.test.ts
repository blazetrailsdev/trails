import { describe, expect, it } from "vitest";
import { HTML5, SaveOptions } from "../../lib/index.js";

const { Document, DocumentFragment } = HTML5;

describe("HTML5 node mutation", () => {
  it("creates an element with attributes and content", () => {
    const doc = new Document();
    doc.encoding = "UTF-8";
    const node = doc.createElement("div", { class: "container" }, "contents");
    expect(node.toHtml()).toBe('<div class="container">contents</div>');
  });

  it("yields the new element to a block", () => {
    const node = new Document().createElement("div", (n: { set(k: string, v: string): void }) =>
      n.set("class", "blue"),
    );
    expect(node.toHtml()).toBe('<div class="blue"></div>');
  });

  it("yields before applying attributes", () => {
    const node = new Document().createElement(
      "div",
      { class: "attr" },
      (n: { set(k: string, v: string): void }) => n.set("class", "block"),
    );
    expect(node.get("class")).toBe("attr");
  });

  it("round-trips a pre's leading newline through to_html", () => {
    const pre = DocumentFragment.parse("<pre>\n\nx</pre>").atCss("pre")!;
    expect(pre.serialize({ preserveNewline: true, saveWith: SaveOptions.AS_HTML })).toBe(
      "<pre>\n\nx</pre>",
    );
  });

  it("chains save options and answers their predicates", () => {
    const config = new SaveOptions().format().asHtml();
    expect(config.toI()).toBe(SaveOptions.FORMAT | SaveOptions.AS_HTML);
    expect(config.isAsHtml()).toBe(true);
    expect(config.isAsXml()).toBe(false);
    expect(new SaveOptions().noEmptyTags().isNoEmptyTags()).toBe(true);
  });

  it("sets and checks attributes", () => {
    const node = new Document().createElement("figure");
    expect(node.isKey("data-x")).toBe(false);
    node.set("data-x", 1);
    node.set("data-x", "2");
    expect(node.isKey("data-x")).toBe(true);
    expect(node.get("data-x")).toBe("2");
  });

  it("parses a fragment from a document", () => {
    const fragment = new Document().fragment("<p>a</p><p>b</p>");
    expect(fragment.children.map((c) => c.name)).toEqual(["p", "p"]);
    expect(new Document().fragment().children).toEqual([]);
  });

  it("reads and writes inner_html", () => {
    const fragment = DocumentFragment.parse("<div><b>x</b></div>");
    const div = fragment.atCss("div")!;
    expect(div.innerHtml()).toBe("<b>x</b>");
    expect(div.setInnerHtml("<i>y</i>z")).toBe("<i>y</i>z");
    expect(div.toHtml({ saveWith: SaveOptions.AS_HTML })).toBe("<div><i>y</i>z</div>");
  });

  it("preserves a leading newline in pre when asked", () => {
    const pre = DocumentFragment.parse("<pre>\n\nx</pre>").atCss("pre")!;
    expect(pre.innerHtml({ preserveNewline: true })).toBe("\n\nx");
  });

  it("replaces a node with markup and answers the new nodes", () => {
    const fragment = DocumentFragment.parse("<p>a</p><span>b</span>");
    const result = fragment.atCss("span")!.replace("<em>c</em>");
    expect([...(result as Iterable<{ name: string }>)].map((n) => n.name)).toEqual(["em"]);
    expect(fragment.toHtml()).toBe("<p>a</p><em>c</em>");
  });

  it("replaces a text node", () => {
    const fragment = DocumentFragment.parse("<p>a</p>");
    fragment.atCss("p")!.children[0].replace("<b>b</b>");
    expect(fragment.toHtml()).toBe("<p><b>b</b></p>");
  });

  it("raises replacing a node with no parent", () => {
    const node = new Document().createElement("p");
    expect(() => node.replace("x")).toThrow("Cannot replace a node with no parent");
  });

  it("lists ancestors, optionally filtered by selector", () => {
    const fragment = DocumentFragment.parse("<blockquote><ul><li><b>x</b></li></ul></blockquote>");
    const b = fragment.atCss("b")!;
    expect(b.ancestors().map((n) => n.name)).toEqual([
      "li",
      "ul",
      "blockquote",
      "#document-fragment",
    ]);
    expect(b.ancestors("blockquote").map((n) => n.name)).toEqual(["blockquote"]);
  });

  it("matches a selector", () => {
    const fragment = DocumentFragment.parse('<div class="g"><p>x</p></div>');
    expect(fragment.atCss("div")!.isMatches("div.g")).toBe(true);
    expect(fragment.atCss("p")!.isMatches("div.g")).toBe(false);
  });

  it("compares nodes by identity of the underlying node", () => {
    const fragment = DocumentFragment.parse("<p>x</p>");
    expect(fragment.atCss("p")!.equals(fragment.css("p").first())).toBe(true);
    expect(fragment.atCss("p")!.equals(null)).toBe(false);
  });

  it("dups a fragment deeply", () => {
    const fragment = DocumentFragment.parse('<div class="a"><p>x</p></div>');
    const copy = fragment.dup();
    copy.atCss("div")!.set("class", "b");
    copy.atCss("p")!.setInnerHtml("y");
    expect(fragment.toHtml()).toBe('<div class="a"><p>x</p></div>');
    expect(copy.toHtml()).toBe('<div class="b"><p>y</p></div>');
    expect(copy.document).not.toBe(fragment.document);
  });

  it("dups a node shallowly at level 0", () => {
    const div = DocumentFragment.parse("<div><p>x</p></div>").atCss("div")!;
    expect(div.dup(0).toHtml()).toBe("<div></div>");
    expect(div.dup().toHtml()).toBe("<div><p>x</p></div>");
  });

  it("iterates a css result", () => {
    const fragment = DocumentFragment.parse("<p>a</p><p>b</p>");
    fragment.css("p").each((node) => node.replace(`<b>${node.text}</b>`));
    expect(fragment.toHtml()).toBe("<b>a</b><b>b</b>");
  });
});
