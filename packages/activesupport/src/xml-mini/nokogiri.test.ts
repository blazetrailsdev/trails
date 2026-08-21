import { describe, it, expect, beforeAll } from "vitest";
import { parse, _require } from "./nokogiri.js";

// Rails' engine tests load the gem before the suite runs, via
// `XMLMiniEngineTest.run_with_gem("nokogiri")` (xml_mini_engine_test.rb:8-13).
beforeAll(async () => {
  await _require();
});

describe("NokogiriEngineTest", () => {
  it("blank returns empty hash", async () => {
    expect(await parse(null)).toEqual({});
    expect(await parse("")).toEqual({});
  });

  it("one node document as hash", async () => {
    expect(await parse("<root/>")).toEqual({ root: {} });
  });

  it("one node with attributes document as hash", async () => {
    expect(await parse('<root type="integer"/>')).toEqual({ root: { type: "integer" } });
  });

  it("single node with content as hash", async () => {
    expect(await parse("<root>hello</root>")).toEqual({ root: { __content__: "hello" } });
  });

  it("products node with book node as hash", async () => {
    const result = await parse("<products><book/></products>");
    expect(result).toEqual({ products: { book: {} } });
  });

  it("products node with two book nodes as hash", async () => {
    const result = await parse("<products><book/><book/></products>");
    expect(result).toEqual({ products: { book: [{}, {}] } });
  });

  it("children with children", async () => {
    const xml = "<root><child><grandchild/></child></root>";
    expect(await parse(xml)).toEqual({ root: { child: { grandchild: {} } } });
  });

  it("children with simple cdata", async () => {
    const xml = "<root><![CDATA[simple]]></root>";
    expect(await parse(xml)).toEqual({ root: { __content__: "simple" } });
  });

  it("children with text and cdata", async () => {
    const xml = "<root>before<![CDATA[cdata]]>after</root>";
    const result = (await parse(xml)) as { root: { __content__: string } };
    expect(result.root.__content__).toContain("cdata");
  });

  it("children with blank text", async () => {
    // Whitespace-only leaf text is kept; stripping only fires when child elements are also present.
    const xml = "<root><products>   </products></root>";
    const result = (await parse(xml)) as { root: { products: Record<string, unknown> } };
    expect(result.root.products.__content__).toBe("   ");
  });

  it("children with blank text and attribute", async () => {
    const xml = '<root><products type="file">   </products></root>';
    const result = (await parse(xml)) as { root: { products: Record<string, unknown> } };
    expect(result.root.products.__content__).toBe("   ");
    expect(result.root.products.type).toBe("file");
  });

  it("strips blank content between child elements", async () => {
    const xml = "<root>\n  <a/>\n  <b/>\n</root>";
    const result = (await parse(xml)) as { root: Record<string, unknown> };
    expect(result.root).not.toHaveProperty("__content__");
  });

  it("throws on malformed xml", async () => {
    expect(() => parse("<root>")).toThrow();
  });

  it("decodes entities in content", async () => {
    const result = (await parse("<root>&amp;&lt;&gt;</root>")) as {
      root: { __content__: string };
    };
    expect(result.root.__content__).toBe("&<>");
  });
});
