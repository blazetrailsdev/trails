import { describe, it, expect } from "vitest";
import { parseXmlToHash } from "./nokogiri-engine.js";

describe("NokogiriEngineTest", () => {
  it("one node document as hash", () => {
    expect(parseXmlToHash("<root/>")).toEqual({ root: {} });
  });

  it("one node with attributes document as hash", () => {
    expect(parseXmlToHash('<root type="integer"/>')).toEqual({ root: { type: "integer" } });
  });

  it("single node with content as hash", () => {
    expect(parseXmlToHash("<root>hello</root>")).toEqual({ root: { __content__: "hello" } });
  });

  it("products node with book node as hash", () => {
    const result = parseXmlToHash("<products><book/></products>");
    expect(result).toEqual({ products: { book: {} } });
  });

  it("products node with two book nodes as hash", () => {
    const result = parseXmlToHash("<products><book/><book/></products>");
    expect(result).toEqual({ products: { book: [{}, {}] } });
  });

  it("children with children", () => {
    const xml = "<root><child><grandchild/></child></root>";
    expect(parseXmlToHash(xml)).toEqual({ root: { child: { grandchild: {} } } });
  });

  it("children with simple cdata", () => {
    const xml = "<root><![CDATA[simple]]></root>";
    expect(parseXmlToHash(xml)).toEqual({ root: { __content__: "simple" } });
  });

  it("children with text and cdata", () => {
    const xml = "<root>before<![CDATA[cdata]]>after</root>";
    const result = parseXmlToHash(xml) as { root: { __content__: string } };
    expect(result.root.__content__).toContain("cdata");
  });

  it("throws on malformed xml", () => {
    expect(() => parseXmlToHash("<root>")).toThrow();
  });

  it("decodes entities in content", () => {
    const result = parseXmlToHash("<root>&amp;&lt;&gt;</root>") as {
      root: { __content__: string };
    };
    expect(result.root.__content__).toBe("&<>");
  });
});
