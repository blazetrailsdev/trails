import { describe, it, expect } from "vitest";

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
});
