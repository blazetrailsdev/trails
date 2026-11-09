import { describe, it, expect } from "vitest";

import { XmlDocument } from "../../lib/xml/document.js";
import { DocumentFragment } from "../../lib/xml/document-fragment.js";

describe("Nokogiri::XML::DocumentFragment (trails)", () => {
  it("Node#fragment parses tags into the fragment's children", () => {
    const doc = XmlDocument.parse("<root><a1/></root>");
    const fragment = doc.atXpath("/root/a1")!.fragment("<b1>foo</b1><b2/>");
    expect(fragment).toBeInstanceOf(DocumentFragment);
    expect(fragment.children.map((n) => n.name)).toEqual(["b1", "b2"]);
  });

  it("an empty fragment has no children", () => {
    expect(new DocumentFragment(XmlDocument.parse("<root/>")).children).toEqual([]);
  });

  it("children= given a DocumentFragment inserts its children", () => {
    const doc = XmlDocument.parse("<root><a1/></root>");
    const a1 = doc.atXpath("/root/a1")!;
    a1.children = a1.fragment("<b1/><b2/>");
    expect(doc.xpath("/root/a1/node()").map((n) => n.name)).toEqual(["b1", "b2"]);
  });
});
