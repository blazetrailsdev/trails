import { describe, it, expect } from "vitest";
import { XmlDocument } from "../../lib/xml/document.js";

describe("Nokogiri::XML::Node attribute values", () => {
  it("values lists the attribute values, and value? asks whether one is among them", () => {
    const doc = XmlDocument.parse('<root lang="en" version="1"/>');
    try {
      expect(doc.root.values().sort()).toEqual(["1", "en"]);
      expect(doc.root.isValue("en")).toBe(true);
      expect(doc.root.isValue("lang")).toBe(false);
    } finally {
      doc.dispose();
    }
  });
});
