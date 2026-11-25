import { describe, it, expect } from "vitest";

import { XML } from "../../lib/namespaces.js";
import { XmlDocument } from "../../lib/xml/document.js";
import { DocumentFragment } from "../../lib/xml/document-fragment.js";

describe("Nokogiri::XML::DocumentFragment", () => {
  const xml = XmlDocument.parse("<root><a1>First</a1></root>");

  it("new", () => {
    expect(new DocumentFragment(xml)).toBeTruthy();
  });

  it("fragment should have document", () => {
    const fragment = new DocumentFragment(xml);
    expect(fragment.document).toBe(xml);
  });

  it("name", () => {
    const fragment = new DocumentFragment(xml);
    expect(fragment.name).toBe("#document-fragment");
  });

  it("static method", () => {
    const fragment = DocumentFragment.parse("<div>a</div>");
    expect(fragment).toBeInstanceOf(DocumentFragment);
  });

  it("xml fragment has multiple toplevel children", () => {
    const doc = "<div>b</div><div>e</div>";
    const fragment = new XmlDocument().fragment(doc);
    expect(fragment.toString()).toBe("<div>b</div><div>e</div>");
  });

  it("xml fragment has outer text", () => {
    let doc = "a<div>b</div>";
    let fragment = new XmlDocument().fragment(doc);
    expect(fragment.toString()).toBe("a<div>b</div>");

    doc = "<div>b</div>c";
    fragment = new XmlDocument().fragment(doc);
    expect(fragment.toString()).toBe("<div>b</div>c");
  });

  it("fragment search three ways", () => {
    const frag = new XmlDocument().fragment('<p id="content">foo</p><p id="content">bar</p>');
    const expected = frag.xpath('./*[@id = "content"]');
    expect(expected.length).toBe(2);

    for (const [method, query] of [
      ["css", "#content"],
      ["search", "#content"],
      ["search", "./*[@id = 'content']"],
    ] as const) {
      const result = frag[method](query);
      expect(result.toA()).toEqual(expected.toA());
    }
  });

  it("fragment search with multiple queries", () => {
    const xml = `<thing>
  <div class="title">important thing</div>
</thing>
<thing>
  <div class="content">stuff</div>
</thing>
<thing>
  <p class="blah">more stuff</div>
</thing>
`;
    const fragment = XML.fragment(xml);
    expect(fragment).toBeInstanceOf(DocumentFragment);

    expect(fragment.xpath(".//div", ".//p").length).toBe(3);
    expect(fragment.css(".title", ".content", "p").length).toBe(3);
    expect(fragment.search(".//div", "p.blah").length).toBe(3);
  });
});
