import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RuntimeError } from "../rexml/document.js";
import * as XmlMini from "../xml-mini.js";
import * as XmlMini_REXML from "./rexml.js";
import * as XmlMini_Nokogiri from "./nokogiri.js";
import * as XmlMini_NokogiriSAX from "./nokogirisax.js";
import { assertRaises } from "../testing/assertions.js";
import { fromXml } from "../hash-utils.js";
import { FileLike } from "../xml-mini.js";

function isLoadError(e: unknown, gemName: string): boolean {
  return (
    e instanceof Error &&
    (e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
    e.message.includes(gemName)
  );
}

async function runWithGem(
  gemName: string,
  block: (gem: Record<string, any>) => void,
): Promise<void> {
  let gem: Record<string, any>;
  try {
    gem = await import(gemName);
  } catch (e) {
    if (!isLoadError(e, gemName)) throw e;
    return;
  }
  block(gem);
}

interface EngineTestsOptions {
  engine: string;
  backendModule: XmlMini.XmlMiniBackend;
  expansionAttackError: new (...args: any[]) => Error;
}

function engineTests({ engine, backendModule, expansionAttackError }: EngineTestsOptions): void {
  function assertEngineClass(actual: unknown): void {
    expect(actual).toBe(backendModule);
  }

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

    it("file from xml", async () => {
      const hash = (await fromXml(`
        <blog>
          <logo type="file" name="logo.png" content_type="image/png">
          </logo>
        </blog>
    `)) as { blog: { logo: typeof FileLike } };

      expect(Object.hasOwn(hash, "blog")).toBe(true);
      expect(Object.hasOwn(hash.blog, "logo")).toBe(true);

      const file = hash.blog.logo;
      expect(file.originalFilename).toBe("logo.png");
      expect(file.contentType).toBe("image/png");
    });

    it("exception thrown on expansion attack", async () => {
      await assertRaises([expansionAttackError], {}, () =>
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
      );
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
}

engineTests({
  engine: "REXML",
  backendModule: XmlMini_REXML,
  expansionAttackError: RuntimeError,
});

await runWithGem("@blazetrails/nokogiri", (Nokogiri) => {
  engineTests({
    engine: "Nokogiri",
    backendModule: XmlMini_Nokogiri,
    expansionAttackError: Nokogiri.XML.SyntaxError,
  });

  engineTests({
    engine: "NokogiriSAX",
    backendModule: XmlMini_NokogiriSAX,
    expansionAttackError: RuntimeError,
  });
});
