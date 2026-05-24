import { describe, it, expect } from "vitest";
import { SaxDocument } from "./document.js";
import { SaxParser } from "./parser.js";

describe("Nokogiri::XML::SAX::Parser", () => {
  it("emits start and end document callbacks", () => {
    const events: string[] = [];
    class Handler extends SaxDocument {
      override startDocument() {
        events.push("startDocument");
      }
      override endDocument() {
        events.push("endDocument");
      }
    }
    new SaxParser(new Handler()).parse("<root/>");
    expect(events).toEqual(["startDocument", "endDocument"]);
  });

  it("emits startElement with attribute tuples", () => {
    const captured: [string, [string, string][]][] = [];
    class Handler extends SaxDocument {
      override startElement(name: string, attrs: ReadonlyArray<[string, string]>) {
        captured.push([name, [...attrs]]);
      }
    }
    new SaxParser(new Handler()).parse('<root lang="en"><child/></root>');
    expect(captured[0][0]).toBe("root");
    expect(captured[0][1]).toEqual([["lang", "en"]]);
    expect(captured[1][0]).toBe("child");
  });

  it("emits characters for text nodes", () => {
    const texts: string[] = [];
    class Handler extends SaxDocument {
      override characters(text: string) {
        texts.push(text);
      }
    }
    new SaxParser(new Handler()).parse("<root>hello world</root>");
    expect(texts).toContain("hello world");
  });

  it("emits cdataBlock for CDATA sections", () => {
    const blocks: string[] = [];
    class Handler extends SaxDocument {
      override cdataBlock(text: string) {
        blocks.push(text);
      }
    }
    new SaxParser(new Handler()).parse("<root><![CDATA[raw & data]]></root>");
    expect(blocks).toContain("raw & data");
  });

  it("produces same content as DOM traversal", () => {
    const xml = '<items><item type="a">one</item><item type="b">two</item></items>';
    const saxResult: string[] = [];
    class Handler extends SaxDocument {
      override startElement(name: string, attrs: ReadonlyArray<[string, string]>) {
        saxResult.push(`<${name}${attrs.map(([k, v]) => ` ${k}="${v}"`).join("")}>`);
      }
      override characters(text: string) {
        saxResult.push(text);
      }
      override endElement(name: string) {
        saxResult.push(`</${name}>`);
      }
    }
    new SaxParser(new Handler()).parse(xml);
    expect(saxResult.join("")).toBe(
      '<items><item type="a">one</item><item type="b">two</item></items>',
    );
  });

  it("decodes entities in text content", () => {
    const texts: string[] = [];
    class Handler extends SaxDocument {
      override characters(text: string) {
        texts.push(text);
      }
    }
    new SaxParser(new Handler()).parse("<root>&amp;&lt;&gt;</root>");
    expect(texts.join("")).toBe("&<>");
  });

  it("emits error callback on malformed xml", () => {
    const errors: string[] = [];
    class Handler extends SaxDocument {
      override error(message: string) {
        errors.push(message);
      }
    }
    new SaxParser(new Handler()).parse("<unclosed");
    expect(errors.length).toBeGreaterThan(0);
  });
});
