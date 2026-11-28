import { describe, it, expect } from "vitest";
import { XmlDocument } from "../../lib/xml/document.js";

describe("Nokogiri::XML::Node attribute values", () => {
  it("values lists the attribute values, and value? asks whether one is among them", () => {
    const doc = XmlDocument.parse('<root lang="en" version="1"/>');
    try {
      expect(doc.root!.values().sort()).toEqual(["1", "en"]);
      expect(doc.root!.isValue("en")).toBe(true);
      expect(doc.root!.isValue("lang")).toBe(false);
    } finally {
      doc.dispose();
    }
  });
});

describe("Nokogiri::XML::Node serialization", () => {
  it("to_xml serializes a text node and to_s follows the document type", () => {
    const doc = XmlDocument.parse("<root>a &amp; b<c/></root>");
    try {
      const text = doc.root!.children.first()!;
      expect(text.toXml()).toBe("a &amp; b");
      expect(text.toString()).toBe("a &amp; b");
      expect(doc.isXml()).toBe(true);
    } finally {
      doc.dispose();
    }
  });

  it("to_xml indents nested elements under FORMAT", () => {
    const doc = XmlDocument.parse("<root><a><b/></a></root>");
    try {
      expect(doc.root!.toXml({ indent: 2 })).toBe("<root>\n  <a>\n    <b/>\n  </a>\n</root>");
    } finally {
      doc.dispose();
    }
  });
});

describe("Nokogiri::XML::Node wrapper identity", () => {
  it("answers the same wrapper for the same C node on every read", () => {
    const doc = XmlDocument.parse("<root><a/></root>");
    try {
      const a = doc.root!.children.first()!;
      expect(doc.root!.children.first()).toBe(a);
      expect(a.parent).toBe(doc.root);
      expect(doc.root!.parent).toBe(doc);
      const b = doc.createElement("b");
      doc.root!.addChild(b);
      expect(doc.root!.children.toA()[1]).toBe(b);
    } finally {
      doc.dispose();
    }
  });
});
