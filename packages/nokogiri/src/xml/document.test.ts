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

describe("Nokogiri::XML::Searchable", () => {
  const xml = `<root><a id="x" class="one two" lang="en-US">1</a><b href="http://e.com/p.xml">2</b><c>3</c><d><e/></d></root>`;

  it("css on document searches from the root and on a node searches descendants", () => {
    const doc = XmlDocument.parse(xml);
    expect(doc.css("root").size).toBe(1);
    expect(doc.root.css("root").size).toBe(0);
    expect(doc.root.css("e").size).toBe(1);
    expect(doc.atCss("c")?.content).toBe("3");
  });

  it("css combinators and groups", () => {
    const doc = XmlDocument.parse(xml);
    expect(doc.css("root > a").size).toBe(1);
    expect(doc.css("root > e").size).toBe(0);
    expect(doc.css("a + b").size).toBe(1);
    expect(doc.css("a ~ c").size).toBe(1);
    expect(doc.css("a, c, e").size).toBe(3);
  });

  it("css attribute operators", () => {
    const doc = XmlDocument.parse(xml);
    expect(doc.css("#x.two").size).toBe(1);
    expect(doc.css("[href^=http]").size).toBe(1);
    expect(doc.css("[href$='.xml']").size).toBe(1);
    expect(doc.css("[href*='e.com']").size).toBe(1);
    expect(doc.css("[class~=one]").size).toBe(1);
    expect(doc.css("[lang|=en]").size).toBe(1);
    expect(doc.css("root > [id!=x]").size).toBe(3);
  });

  it("css pseudo classes", () => {
    const doc = XmlDocument.parse(xml);
    expect(doc.css("root > :first-child").first()?.name).toBe("a");
    expect(doc.css("root > :nth-child(2)").first()?.name).toBe("b");
    expect(doc.css("root > :not(a)").size).toBe(3);
    expect(doc.css("e:empty").size).toBe(1);
  });

  it("blank? answers true only for whitespace text", () => {
    const doc = XmlDocument.parse("<root> <a/>x</root>");
    const [space, a, text] = doc.root.children;
    expect(space.isBlank()).toBe(true);
    expect(a.isBlank()).toBe(false);
    expect(text.isBlank()).toBe(false);
  });
});
