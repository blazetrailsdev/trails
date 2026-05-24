import { describe, it, expect } from "vitest";
import { parseXmlToHash } from "./nokogiri-engine.js";
import { parseXmlToHashSax } from "./nokogiri-sax-engine.js";

describe("NokogiriSAXEngineTest", () => {
  it("produces same hash as DOM for simple element", () => {
    const xml = "<root/>";
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("produces same hash as DOM for element with attributes", () => {
    const xml = '<root type="integer" name="foo"/>';
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("produces same hash as DOM for element with text content", () => {
    const xml = "<root>hello world</root>";
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("produces same hash as DOM for nested elements", () => {
    const xml = '<products><book type="novel"><title>Dune</title></book></products>';
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("produces same hash as DOM for repeated elements", () => {
    const xml = "<items><item>a</item><item>b</item></items>";
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("children with simple cdata", () => {
    const xml = "<root><![CDATA[cdata text]]></root>";
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("children with text and cdata", () => {
    const xml = "<root>before<![CDATA[middle]]>after</root>";
    expect(parseXmlToHashSax(xml)).toEqual(parseXmlToHash(xml));
  });

  it("decodes entities in content", () => {
    const xml = "<root>&amp;&lt;&gt;</root>";
    const result = parseXmlToHashSax(xml) as { root: { __content__: string } };
    expect(result.root.__content__).toBe("&<>");
  });

  it("throws on malformed xml", () => {
    expect(() => parseXmlToHashSax("<root>")).toThrow();
  });
});
