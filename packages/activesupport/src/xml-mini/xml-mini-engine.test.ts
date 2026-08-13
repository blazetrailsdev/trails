/**
 * Mirrors: `activesupport/test/xml_mini/xml_mini_engine_test.rb` — the shared
 * engine suite every backend test inherits (`XMLMiniEngineTest.inherited`
 * mixes `EngineTests` into the subclass, `xml_mini_engine_test.rb:19-22`).
 * Rails runs it once per backend; it runs here against `XmlMini_REXML`, whose
 * own subclass cases live in `rexml-engine.test.ts` (`REXMLEngineTest <
 * XMLMiniEngineTest`, `rexml_engine_test.rb:5`).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RuntimeError } from "../rexml/document.js";
import * as XmlMini from "../xml-mini.js";
import * as XmlMini_REXML from "./rexml.js";

/**
 * `REXMLEngineTest#engine` (`rexml_engine_test.rb:20-22`), which Ruby uses
 * both as the `XmlMini.backend=` argument and to name the constant. The
 * backend module namespace object is what `cast_backend_name_to_module`
 * (`xml_mini.rb:200-206`) resolves the name to, and the value passed here:
 * under vitest the name arm's `import("./xml-mini/rexml.js")` has no `.js`
 * file to glob, so the name is only spelled where it is compared.
 */
const engine = XmlMini_REXML;

/** `REXMLEngineTest#expansion_attack_error` (`rexml_engine_test.rb:24-26`). */
const expansionAttackError = RuntimeError;

/**
 * `XMLMiniEngineTest::EngineTests#assert_engine_class`
 * (`xml_mini_engine_test.rb:212-214`): Ruby reads the
 * `ActiveSupport::XmlMini_#{engine}` constant out of `ActiveSupport`, where a
 * trails backend is the module namespace object of `xml-mini/<name>.js`.
 */
function assertEngineClass(actual: unknown): void {
  expect(actual).toBe(XmlMini_REXML);
}

/**
 * `XMLMiniEngineTest::EngineTests#assert_equal_rexml`
 * (`xml_mini_engine_test.rb:216-221`) — the engine's own parse against the
 * REXML one. `xml.rewind` has no analog: a trails backend takes a string
 * (`XmlMiniBackend` in `xml-mini.ts`), so there is no IO to rewind.
 */
async function assertEqualRexml(xml: string): Promise<void> {
  const parsedXml = await XmlMini.parse(xml);
  const hash = await XmlMini.withBackend(XmlMini_REXML, () => XmlMini.parse(xml));
  expect(hash).toEqual(parsedXml);
}

describe("XMLMiniEngineTest", () => {
  let defaultBackend: XmlMini.XmlMiniBackend | null | undefined;

  beforeEach(async () => {
    defaultBackend = XmlMini.backend();
    await XmlMini.setBackend(engine);
  });

  afterEach(async () => {
    await XmlMini.setBackend(defaultBackend);
  });

  // `Hash.from_xml`, which this test reaches `_parse_file` through, is
  // unported; tracked by the `port-hash-from-xml` story. (`XmlMini::PARSING`
  // itself landed in #6465.)
  it.skip("file from xml");

  it("exception thrown on expansion attack", async () => {
    // Rails goes through `Hash.from_xml`, which is unported; the raise is
    // `XmlMini.parse`'s either way (`xml_mini_engine_test.rb:51-68`).
    await expect(
      XmlMini.parse(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE member [
  <!ENTITY a "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
  <!ENTITY b "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
  <!ENTITY c "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;">
  <!ENTITY d "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">
  <!ENTITY e "&f;&f;&f;&f;&f;&f;&f;&f;&f;&f;">
  <!ENTITY f "&g;&g;&g;&g;&g;&g;&g;&g;&g;&g;">
  <!ENTITY g "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
]>
<member>
  &a;
</member>
`),
    ).rejects.toBeInstanceOf(expansionAttackError);
  });

  it("setting backend", () => {
    assertEngineClass(XmlMini.backend());
  });

  it("blank returns empty hash", async () => {
    expect(await XmlMini.parse(null)).toEqual({});
    expect(await XmlMini.parse("")).toEqual({});
  });

  it("parse from frozen string", async () => {
    const xmlString = "<root/>";
    expect(await XmlMini.parse(xmlString)).toEqual({ root: {} });
  });

  it("array type makes an array", async () => {
    await assertEqualRexml(`
      <blog>
        <posts type="array">
          <post>a post</post>
          <post>another post</post>
        </posts>
      </blog>
    `);
  });

  it("one node document as hash", async () => {
    await assertEqualRexml(`
      <products/>
    `);
  });

  it("one node with attributes document as hash", async () => {
    await assertEqualRexml(`
      <products foo="bar"/>
    `);
  });

  it("products node with book node as hash", async () => {
    await assertEqualRexml(`
      <products>
        <book name="awesome" id="12345" />
      </products>
    `);
  });

  it("products node with two book nodes as hash", async () => {
    await assertEqualRexml(`
      <products>
        <book name="awesome" id="12345" />
        <book name="america" id="67890" />
      </products>
    `);
  });

  it("single node with content as hash", async () => {
    await assertEqualRexml(`
      <products>
        hello world
      </products>
    `);
  });

  it("children with children", async () => {
    await assertEqualRexml(`
      <root>
        <products>
          <book name="america" id="67890" />
        </products>
      </root>
    `);
  });

  it("children with text", async () => {
    await assertEqualRexml(`
      <root>
        <products>
          hello everyone
        </products>
      </root>
    `);
  });

  it("children with non adjacent text", async () => {
    await assertEqualRexml(`
      <root>
        good
        <products>
          hello everyone
        </products>
        morning
      </root>
    `);
  });

  it("parse from io", async () => {
    // Rails wraps the document in a `StringIO` (`xml_mini_engine_test.rb:154`);
    // a trails backend's `parse` takes a string (`XmlMiniBackend` in
    // `xml-mini.ts`), so the string arm is the trails analog.
    await assertEqualRexml(`
      <root>
        good
        <products>
          hello everyone
        </products>
        morning
      </root>
    `);
  });

  it("children with simple cdata", async () => {
    await assertEqualRexml(`
      <root>
        <products>
           <![CDATA[cdatablock]]>
        </products>
      </root>
    `);
  });

  it("children with multiple cdata", async () => {
    await assertEqualRexml(`
      <root>
        <products>
           <![CDATA[cdatablock1]]><![CDATA[cdatablock2]]>
        </products>
      </root>
    `);
  });

  it("children with text and cdata", async () => {
    await assertEqualRexml(`
      <root>
        <products>
          hello <![CDATA[cdatablock]]>
          morning
        </products>
      </root>
    `);
  });

  it("children with blank text", async () => {
    await assertEqualRexml(`
      <root>
        <products>   </products>
      </root>
    `);
  });

  it("children with blank text and attribute", async () => {
    await assertEqualRexml(`
      <root>
        <products type="file">   </products>
      </root>
    `);
  });
});
