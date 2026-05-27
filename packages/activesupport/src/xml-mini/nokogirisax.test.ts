import { describe, it, expect } from "vitest";
import { parse } from "./nokogirisax.js";
import { parse as parseDom } from "./nokogiri.js";

describe("NokogiriSAXEngineTest", () => {
  it("blank returns empty hash", async () => {
    expect(await parse(null)).toEqual({});
    expect(await parse("")).toEqual({});
  });

  it("one node document as hash", async () => {
    const xml = "<root/>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("one node with attributes document as hash", async () => {
    const xml = '<root type="integer" name="foo"/>';
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("single node with content as hash", async () => {
    const xml = "<root>hello world</root>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("products node with book node as hash", async () => {
    const xml = '<products><book type="novel"><title>Dune</title></book></products>';
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("products node with two book nodes as hash", async () => {
    const xml = "<items><item>a</item><item>b</item></items>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("children with simple cdata", async () => {
    const xml = "<root><![CDATA[cdata text]]></root>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("children with text and cdata", async () => {
    const xml = "<root>before<![CDATA[middle]]>after</root>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("children with blank text", async () => {
    const xml = "<root><products>   </products></root>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("children with blank text and attribute", async () => {
    const xml = '<root><products type="file">   </products></root>';
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("strips blank content between child elements", async () => {
    const xml = "<root>\n  <a/>\n  <b/>\n</root>";
    expect(await parse(xml)).toEqual(await parseDom(xml));
  });

  it("decodes entities in content", async () => {
    const xml = "<root>&amp;&lt;&gt;</root>";
    const result = (await parse(xml)) as { root: { __content__: string } };
    expect(result.root.__content__).toBe("&<>");
  });

  it("throws on malformed xml", async () => {
    await expect(parse("<root>")).rejects.toThrow();
  });
});
