import { describe, it, expect, afterEach } from "vitest";
import { XmlDocument } from "./document.js";

describe("Nokogiri::XML::Document", () => {
  let doc: XmlDocument | null = null;

  afterEach(() => {
    doc?.dispose();
    doc = null;
  });

  it("parse returns document with root", () => {
    doc = XmlDocument.parse("<root><child/></root>");
    expect(doc.errors).toHaveLength(0);
    expect(doc.root.name).toBe("root");
  });

  it("parse collects errors on malformed input", () => {
    doc = XmlDocument.parse("<unclosed");
    expect(doc.errors.length).toBeGreaterThan(0);
    expect(doc.errors[0].level).toBe("fatal");
  });

  it("root node has children", () => {
    doc = XmlDocument.parse("<root><a/><b/></root>");
    const children = doc.root.children;
    expect(children).toHaveLength(2);
    expect(children[0].name).toBe("a");
    expect(children[1].name).toBe("b");
  });

  it("attributeNodes returns attribute name and value", () => {
    doc = XmlDocument.parse('<root lang="en" version="1"/>');
    const attrs = doc.root.attributeNodes;
    expect(attrs).toHaveLength(2);
    const lang = attrs.find((a) => a.nodeName === "lang");
    expect(lang?.value).toBe("en");
    const version = attrs.find((a) => a.nodeName === "version");
    expect(version?.value).toBe("1");
  });

  it("text node reports isText and content", () => {
    doc = XmlDocument.parse("<root>hello</root>");
    const text = doc.root.children[0];
    expect(text.isText()).toBe(true);
    expect(text.isElement()).toBe(false);
    expect(text.content).toBe("hello");
    expect(text.name).toBe("#text");
  });

  it("cdata node reports isCdata and content", () => {
    doc = XmlDocument.parse("<root><![CDATA[raw data]]></root>");
    const cdata = doc.root.children[0];
    expect(cdata.isCdata()).toBe(true);
    expect(cdata.content).toBe("raw data");
    expect(cdata.name).toBe("#cdata-section");
  });

  it("dispose does not throw", () => {
    const d = XmlDocument.parse("<root/>");
    expect(() => d.dispose()).not.toThrow();
  });
});
