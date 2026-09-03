import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractBang, sliceBang } from "./hash/slice.js";
import { RuntimeError } from "../rexml/document.js";
import * as XmlMini from "../xml-mini.js";
import * as XmlMini_REXML from "../xml-mini/rexml.js";
import * as XmlMini_Nokogiri from "../xml-mini/nokogiri.js";
import * as XmlMini_NokogiriSAX from "../xml-mini/nokogirisax.js";
import { assertNothingRaised, assertRaises } from "../testing/assertions.js";
import { Date as RubyDate, Temporal } from "@blazetrails/date";
import { BigDecimal } from "./big-decimal/conversions.js";
import { DisallowedType, XMLConverter } from "./hash/conversions.js";

import {
  fromXml,
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  toParam,
  toXml,
  fromTrustedXml,
} from "../hash-utils.js";
import { Hash, except } from "@blazetrails/ruby-compat";

describe("HashExtTest", () => {
  it("methods", () => {
    const h = { a: 1, b: 2 };
    expect(Object.keys(h)).toContain("a");
    expect(Object.keys(h)).toContain("b");
  });

  it("deep transform keys", () => {
    const nested = { a: { b: { c: 3 } } };
    const result = deepTransformKeys(nested, (k) => k.toUpperCase());
    expect(result).toEqual({ A: { B: { C: 3 } } });
  });

  it("deep transform keys not mutates", () => {
    const original = { a: { b: 1 } };
    deepTransformKeys(original, (k) => k.toUpperCase());
    expect(original).toEqual({ a: { b: 1 } });
  });

  it("deep transform keys!", () => {
    const obj: Record<string, unknown> = { a: 1, b: 2 };
    const result = deepTransformKeys(obj, (k) => k.toUpperCase()) as Record<string, unknown>;
    expect(result["A"]).toBe(1);
  });

  it("deep transform keys with bang mutates", () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    const result = deepTransformKeys(obj, (k) => k + "!") as Record<string, unknown>;
    expect(result["a!"]).toEqual({ "b!": 1 });
  });

  it("deep transform values", () => {
    const obj = { a: 1, b: 2 };
    expect(deepTransformValues(obj, (v) => (v as number) * 2)).toEqual({ a: 2, b: 4 });
  });

  it("deep transform values not mutates", () => {
    const original = { a: 1, b: 2 };
    deepTransformValues(original, (v) => (v as number) * 2);
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it("deep transform values!", () => {
    const obj = { a: 1, b: { c: 2 } };
    const result = deepTransformValues(obj, (v) => String(v));
    expect(result).toEqual({ a: "1", b: { c: "2" } });
  });

  it("deep transform values with bang mutates", () => {
    const obj = { a: [1, 2, 3] };
    const result = deepTransformValues(obj, (v) => (v as number) + 10) as Record<string, unknown>;
    expect(result["a"]).toEqual([11, 12, 13]);
  });

  it("symbolize keys", () => {
    const obj = { a: 1, b: 2 };
    expect(symbolizeKeys(obj)).toEqual({ a: 1, b: 2 });
  });

  it("symbolize keys not mutates", () => {
    const obj = { a: 1 };
    symbolizeKeys(obj);
    expect(obj).toEqual({ a: 1 });
  });

  it("deep symbolize keys", () => {
    const nested = { a: { b: { c: 3 } } };
    expect(deepSymbolizeKeys(nested)).toEqual({ a: { b: { c: 3 } } });
  });

  it("deep symbolize keys not mutates", () => {
    const obj = { a: { b: 1 } };
    deepSymbolizeKeys(obj);
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it("symbolize keys!", () => {
    const obj = { a: 1, b: 2 };
    const result = symbolizeKeys(obj);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("symbolize keys with bang mutates", () => {
    const obj = { a: 1 };
    const result = symbolizeKeys(obj);
    expect(result).toEqual({ a: 1 });
  });

  it("deep symbolize keys!", () => {
    const obj = { a: { b: 1 } };
    const result = deepSymbolizeKeys(obj);
    expect(result).toEqual({ a: { b: 1 } });
  });

  it("deep symbolize keys with bang mutates", () => {
    const obj = { outer: { inner: 42 } };
    const result = deepSymbolizeKeys(obj);
    expect(result).toEqual({ outer: { inner: 42 } });
  });

  it("symbolize keys preserves keys that cant be symbolized", () => {
    const obj = { "123": "numeric key", normal: "val" };
    const result = symbolizeKeys(obj);
    expect(result["123"]).toBe("numeric key");
    expect(result["normal"]).toBe("val");
  });

  it("deep symbolize keys preserves keys that cant be symbolized", () => {
    const obj = { "123": { nested: true } };
    const result = deepSymbolizeKeys(obj) as Record<string, unknown>;
    expect(result["123"]).toEqual({ nested: true });
  });

  it("symbolize keys preserves integer keys", () => {
    const obj = { 1: "one", 2: "two" };
    const result = symbolizeKeys(obj as Record<string, unknown>);
    expect(Object.keys(result).length).toBe(2);
  });

  it("deep symbolize keys preserves integer keys", () => {
    const obj = { 1: { 2: "nested" } };
    const result = deepSymbolizeKeys(obj as Record<string, unknown>) as Record<string, unknown>;
    expect(result["1"]).toBeDefined();
  });

  it("stringify keys", () => {
    const obj = { a: 1, b: 2 };
    expect(stringifyKeys(obj)).toEqual({ a: 1, b: 2 });
  });

  it("stringify keys not mutates", () => {
    const obj = { a: 1 };
    stringifyKeys(obj);
    expect(obj).toEqual({ a: 1 });
  });

  it("deep stringify keys", () => {
    const obj = { a: { b: 1 } };
    expect(deepStringifyKeys(obj)).toEqual({ a: { b: 1 } });
  });

  it("deep stringify keys not mutates", () => {
    const obj = { a: { b: 1 } };
    deepStringifyKeys(obj);
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it("stringify keys!", () => {
    const obj = { a: 1 };
    expect(stringifyKeys(obj)).toEqual({ a: 1 });
  });

  it("stringify keys with bang mutates", () => {
    const obj = { a: 1, b: 2 };
    const result = stringifyKeys(obj);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("deep stringify keys!", () => {
    const obj = { a: { b: 1 } };
    expect(deepStringifyKeys(obj)).toEqual({ a: { b: 1 } });
  });

  it("deep stringify keys with bang mutates", () => {
    const obj = { a: { b: { c: 1 } } };
    const result = deepStringifyKeys(obj);
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it("assert valid keys", () => {
    const h = { name: "Alice", age: 30 };
    expect(() => assertValidKeys(h, ["name", "age"])).not.toThrow();
    expect(() => assertValidKeys(h, ["name"])).toThrow(/Unknown key/);
  });

  it("deep merge", () => {
    const a = { x: 1, nested: { y: 2 } };
    const b = { nested: { z: 3 }, w: 4 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ x: 1, nested: { y: 2, z: 3 }, w: 4 });
  });

  it("deep merge with block", () => {
    const a = { x: 1 };
    const b = { x: 2 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(2);
  });

  it("deep merge with falsey values", () => {
    const a = { x: true, y: 1 };
    const b = { x: false, y: 0 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(false);
    expect(result.y).toBe(0);
  });

  it("reverse merge", () => {
    const h = { x: 1 };
    const defaults = { x: 99, y: 2 };
    const result = reverseMerge(h, defaults);
    expect(result.x).toBe(1);
    expect((result as Record<string, unknown>).y).toBe(2);
  });

  it("with defaults aliases reverse merge", () => {
    const h = { a: 1 };
    const result = reverseMerge(h, { a: 100, b: 2 });
    expect(result.a).toBe(1);
    expect((result as Record<string, unknown>).b).toBe(2);
  });

  it("slice inplace", () => {
    const original: Record<string, unknown> = { a: "x", b: "y", c: 10 };
    const expectedReturn = { c: 10 };
    const expectedOriginal = { a: "x", b: "y" };

    expect(sliceBang(original, "a", "b")).toEqual(expectedReturn);

    expect(original).toEqual(expectedOriginal);
  });

  it("slice inplace with an array key", () => {
    const arrayKey = ["a", "b"];
    const original = new Hash<unknown, unknown>();
    original.set("a", "x");
    original.set("b", "y");
    original.set("c", 10);
    original.set(arrayKey, "an array key");
    const expected = new Hash<unknown, unknown>();
    expected.set("a", "x");
    expected.set("b", "y");

    expect(sliceBang(original, arrayKey, "c")).toEqual(expected);
  });

  it("slice bang does not override default", () => {
    const hash = new Hash<string, number>(0);
    hash.set("a", 1);
    hash.set("b", 2);

    sliceBang(hash, "a");

    expect(hash.get("c")).toBe(0);
  });

  it("slice bang does not override default proc", () => {
    const hash = new Hash<string, unknown>((h: Hash<string, unknown>, k: string) => {
      h.set(k, []);
      return h.get(k);
    });
    hash.set("a", 1);
    hash.set("b", 2);

    sliceBang(hash, "a");

    expect(hash.get("c")).toEqual([]);
  });

  it("extract", () => {
    const h = { a: 1, b: 2, c: 3 };
    const extracted = extractBang(h, "a", "b");
    expect(extracted).toEqual({ a: 1, b: 2 });
    expect(h).toEqual({ c: 3 });
  });

  it("extract nils", () => {
    const h = { a: null, b: 2 } as Record<string, unknown>;
    const extracted = extractBang(h, "a");
    expect(extracted).toEqual({ a: null });
  });

  it("except", () => {
    const h = { a: 1, b: 2, c: 3 };
    expect(except(h, "b")).toEqual({ a: 1, c: 3 });
  });

  it("except with more than one argument", () => {
    const h = { a: 1, b: 2, c: 3 };
    expect(except(h, "a", "b")).toEqual({ c: 3 });
  });

  it("except with original frozen", () => {
    const h = Object.freeze({ a: 1, b: 2, c: 3 });
    const result = except(h, "b");
    expect(result).toEqual({ a: 1, c: 3 });
  });
});
class ToParam extends String {
  toParam(): string {
    return `${this}-1`;
  }
}

describe("HashExtToParamTests", () => {
  it("string hash", () => {
    expect(toParam({})).toBe("");
    expect(toParam({ hello: "world" })).toBe("hello=world");
    expect(toParam({ hello: 10 })).toBe("hello=10");
    expect(toParam({ hello: "world", say_bye: true })).toBe("hello=world&say_bye=true");
  });

  it("number hash", () => {
    expect(toParam({ 10: 20, 30: 40, 50: 60 })).toBe("10=20&30=40&50=60");
  });

  it("to param hash", () => {
    const hash = new Hash<ToParam, ToParam>();
    hash.set(new ToParam("custom"), new ToParam("param"));
    hash.set(new ToParam("custom2"), new ToParam("param2"));
    expect(toParam(hash)).toBe("custom-1=param-1&custom2-1=param2-1");
  });

  it("to param hash escapes its keys and values", () => {
    expect(toParam({ "param 1": "A string with / characters & that should be ? escaped" })).toBe(
      "param+1=A+string+with+%2F+characters+%26+that+should+be+%3F+escaped",
    );
  });

  it("to param orders by key in ascending order", () => {
    expect(toParam({ b: "1", c: "0", a: "2" })).toBe("a=2&b=1&c=0");
  });
});

async function runWithGem(
  gemName: string,
  block: (gem: Record<string, any>) => void,
): Promise<void> {
  let gem: Record<string, any>;
  try {
    gem = await import(gemName);
  } catch (e) {
    if (
      !(
        e instanceof Error &&
        (e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
        e.message.includes(gemName)
      )
    ) {
      throw e;
    }
    return;
  }
  block(gem);
}

let nokogiriSyntaxError: (new (...args: any[]) => Error) | undefined;

class IWriteMyOwnXML {
  toXml(options: XmlMini.ToXmlOptions): void {
    options.indent ??= 2;
    const xml = (options.builder ??= new XmlMini.IndentedXmlStringBuilder("", options.indent));
    if (!options.skipInstruct) xml.instruct();
    xml.openTag("level_one");
    xml.tag("second_level", "content");
    xml.closeTag("level_one");
  }
}

function hashToXmlTests(engine: string): void {
  describe("HashToXmlTest", () => {
    let defaultBackend: XmlMini.XmlMiniBackend | null | undefined;
    let xmlOptions: XmlMini.ToXmlOptions;

    beforeEach(() => {
      xmlOptions = { root: "person", skipInstruct: true, indent: 0 };
    });

    beforeEach(async () => {
      defaultBackend = XmlMini.backend();
      await XmlMini.setBackend(engine);
    });

    afterEach(async () => {
      await XmlMini.setBackend(defaultBackend);
    });

    it("one level", () => {
      const xml = toXml({ name: "David", street: "Paulina" }, xmlOptions);
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street>Paulina</street>");
      expect(xml).toContain("<name>David</name>");
    });

    it("one level dasherize false", () => {
      const xml = toXml(
        { name: "David", street_name: "Paulina" },
        { ...xmlOptions, dasherize: false },
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street_name>Paulina</street_name>");
      expect(xml).toContain("<name>David</name>");
    });

    it("one level dasherize true", () => {
      const xml = toXml(
        { name: "David", street_name: "Paulina" },
        { ...xmlOptions, dasherize: true },
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street-name>Paulina</street-name>");
      expect(xml).toContain("<name>David</name>");
    });

    it("one level camelize true", () => {
      const xml = toXml(
        { name: "David", street_name: "Paulina" },
        { ...xmlOptions, camelize: true },
      );
      expect(xml.slice(0, 8)).toBe("<Person>");
      expect(xml).toContain("<StreetName>Paulina</StreetName>");
      expect(xml).toContain("<Name>David</Name>");
    });

    it("one level camelize lower", () => {
      const xml = toXml(
        { name: "David", street_name: "Paulina" },
        { ...xmlOptions, camelize: "lower" },
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<streetName>Paulina</streetName>");
      expect(xml).toContain("<name>David</name>");
    });

    it("one level with types", () => {
      const xml = toXml(
        {
          name: "David",
          street: "Paulina",
          age: 26,
          age_in_millis: 820497600000,
          moved_on: RubyDate.civil(2005, 11, 15),
          resident: ":yes",
        },
        xmlOptions,
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street>Paulina</street>");
      expect(xml).toContain("<name>David</name>");
      expect(xml).toContain('<age type="integer">26</age>');
      expect(xml).toContain('<age-in-millis type="integer">820497600000</age-in-millis>');
      expect(xml).toContain('<moved-on type="date">2005-11-15</moved-on>');
      expect(xml).toContain('<resident type="symbol">yes</resident>');
    });

    it("one level with nils", () => {
      const xml = toXml({ name: "David", street: "Paulina", age: null }, xmlOptions);
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street>Paulina</street>");
      expect(xml).toContain("<name>David</name>");
      expect(xml).toContain('<age nil="true"/>');
    });

    it("one level with skipping types", () => {
      const xml = toXml(
        { name: "David", street: "Paulina", age: null },
        { ...xmlOptions, skipTypes: true },
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street>Paulina</street>");
      expect(xml).toContain("<name>David</name>");
      expect(xml).toContain('<age nil="true"/>');
    });

    it("one level with yielding", () => {
      const xml = toXml({ name: "David", street: "Paulina" }, xmlOptions, (x) => {
        x.tag("creator", "Rails");
      });

      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<street>Paulina</street>");
      expect(xml).toContain("<name>David</name>");
      expect(xml).toContain("<creator>Rails</creator>");
    });

    it("two levels", () => {
      const xml = toXml({ name: "David", address: { street: "Paulina" } }, xmlOptions);
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<address><street>Paulina</street></address>");
      expect(xml).toContain("<name>David</name>");
    });

    it("two levels with second level overriding to xml", () => {
      const xml = toXml(
        { name: "David", address: { street: "Paulina" }, child: new IWriteMyOwnXML() },
        xmlOptions,
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain("<address><street>Paulina</street></address>");
      expect(xml).toContain("<level_one><second_level>content</second_level></level_one>");
    });

    it("two levels with array", () => {
      const xml = toXml(
        { name: "David", addresses: [{ street: "Paulina" }, { street: "Evergreen" }] },
        xmlOptions,
      );
      expect(xml.slice(0, 8)).toBe("<person>");
      expect(xml).toContain('<addresses type="array"><address>');
      expect(xml).toContain("<address><street>Paulina</street></address>");
      expect(xml).toContain("<address><street>Evergreen</street></address>");
      expect(xml).toContain("<name>David</name>");
    });

    it("three levels with array", () => {
      const xml = toXml(
        { name: "David", addresses: [{ streets: [{ name: "Paulina" }, { name: "Paulina" }] }] },
        xmlOptions,
      );
      expect(xml).toContain(
        '<addresses type="array"><address><streets type="array"><street><name>',
      );
    });

    it("multiple records from xml with attributes other than type ignores them without exploding", async () => {
      const topicsXml = `
      <topics type="array" page="1" page-count="1000" per-page="2">
        <topic>
          <title>The First Topic</title>
          <author-name>David</author-name>
          <id type="integer">1</id>
          <approved type="boolean">false</approved>
          <replies-count type="integer">0</replies-count>
          <replies-close-in type="integer">2592000000</replies-close-in>
          <written-on type="date">2003-07-16</written-on>
          <viewed-at type="datetime">2003-07-16T09:28:00+0000</viewed-at>
          <content>Have a nice day</content>
          <author-email-address>david@loudthinking.com</author-email-address>
          <parent-id nil="true"></parent-id>
        </topic>
        <topic>
          <title>The Second Topic</title>
          <author-name>Jason</author-name>
          <id type="integer">1</id>
          <approved type="boolean">false</approved>
          <replies-count type="integer">0</replies-count>
          <replies-close-in type="integer">2592000000</replies-close-in>
          <written-on type="date">2003-07-16</written-on>
          <viewed-at type="datetime">2003-07-16T09:28:00+0000</viewed-at>
          <content>Have a nice day</content>
          <author-email-address>david@loudthinking.com</author-email-address>
          <parent-id></parent-id>
        </topic>
      </topics>
    `;

      const expectedTopicHash = stringifyKeys({
        title: "The First Topic",
        author_name: "David",
        id: 1,
        approved: false,
        replies_count: 0,
        replies_close_in: 2592000000,
        written_on: RubyDate.civil(2003, 7, 16),
        viewed_at: Temporal.Instant.from("2003-07-16T09:28:00Z"),
        content: "Have a nice day",
        author_email_address: "david@loudthinking.com",
        parent_id: null,
      });

      expect(((await fromXml(topicsXml)) as any)["topics"][0]).toEqual(expectedTopicHash);
    });

    it("single record from xml", async () => {
      const topicXml = `
      <topic>
        <title>The First Topic</title>
        <author-name>David</author-name>
        <id type="integer">1</id>
        <approved type="boolean"> true </approved>
        <replies-count type="integer">0</replies-count>
        <replies-close-in type="integer">2592000000</replies-close-in>
        <written-on type="date">2003-07-16</written-on>
        <viewed-at type="datetime">2003-07-16T09:28:00+0000</viewed-at>
        <author-email-address>david@loudthinking.com</author-email-address>
        <parent-id></parent-id>
        <ad-revenue type="decimal">1.5</ad-revenue>
        <optimum-viewing-angle type="float">135</optimum-viewing-angle>
      </topic>
    `;

      const expectedTopicHash = stringifyKeys({
        title: "The First Topic",
        author_name: "David",
        id: 1,
        approved: true,
        replies_count: 0,
        replies_close_in: 2592000000,
        written_on: RubyDate.civil(2003, 7, 16),
        viewed_at: Temporal.Instant.from("2003-07-16T09:28:00Z"),
        author_email_address: "david@loudthinking.com",
        parent_id: null,
        ad_revenue: new BigDecimal("1.50"),
        optimum_viewing_angle: 135.0,
      });

      expect(((await fromXml(topicXml)) as any)["topic"]).toEqual(expectedTopicHash);
    });

    it("single record from xml with nil values", async () => {
      const topicXml = `
      <topic>
        <title></title>
        <id type="integer"></id>
        <approved type="boolean"></approved>
        <written-on type="date"></written-on>
        <viewed-at type="datetime"></viewed-at>
        <parent-id></parent-id>
      </topic>
    `;

      const expectedTopicHash = stringifyKeys({
        title: null,
        id: null,
        approved: null,
        written_on: null,
        viewed_at: null,
        parent_id: null,
      });

      expect(((await fromXml(topicXml)) as any)["topic"]).toEqual(expectedTopicHash);
    });

    it("multiple records from xml", async () => {
      const topicsXml = `
      <topics type="array">
        <topic>
          <title>The First Topic</title>
          <author-name>David</author-name>
          <id type="integer">1</id>
          <approved type="boolean">false</approved>
          <replies-count type="integer">0</replies-count>
          <replies-close-in type="integer">2592000000</replies-close-in>
          <written-on type="date">2003-07-16</written-on>
          <viewed-at type="datetime">2003-07-16T09:28:00+0000</viewed-at>
          <content>Have a nice day</content>
          <author-email-address>david@loudthinking.com</author-email-address>
          <parent-id nil="true"></parent-id>
        </topic>
        <topic>
          <title>The Second Topic</title>
          <author-name>Jason</author-name>
          <id type="integer">1</id>
          <approved type="boolean">false</approved>
          <replies-count type="integer">0</replies-count>
          <replies-close-in type="integer">2592000000</replies-close-in>
          <written-on type="date">2003-07-16</written-on>
          <viewed-at type="datetime">2003-07-16T09:28:00+0000</viewed-at>
          <content>Have a nice day</content>
          <author-email-address>david@loudthinking.com</author-email-address>
          <parent-id></parent-id>
        </topic>
      </topics>
    `;

      const expectedTopicHash = stringifyKeys({
        title: "The First Topic",
        author_name: "David",
        id: 1,
        approved: false,
        replies_count: 0,
        replies_close_in: 2592000000,
        written_on: RubyDate.civil(2003, 7, 16),
        viewed_at: Temporal.Instant.from("2003-07-16T09:28:00Z"),
        content: "Have a nice day",
        author_email_address: "david@loudthinking.com",
        parent_id: null,
      });

      expect(((await fromXml(topicsXml)) as any)["topics"][0]).toEqual(expectedTopicHash);
    });

    it("single record from xml with attributes other than type", async () => {
      const topicXml = `
    <rsp stat="ok">
      <photos page="1" pages="1" perpage="100" total="16">
        <photo id="175756086" owner="55569174@N00" secret="0279bf37a1" server="76" title="Colored Pencil PhotoBooth Fun" ispublic="1" isfriend="0" isfamily="0"/>
      </photos>
    </rsp>
    `;

      const expectedTopicHash = stringifyKeys({
        id: "175756086",
        owner: "55569174@N00",
        secret: "0279bf37a1",
        server: "76",
        title: "Colored Pencil PhotoBooth Fun",
        ispublic: "1",
        isfriend: "0",
        isfamily: "0",
      });

      expect(((await fromXml(topicXml)) as any)["rsp"]["photos"]["photo"]).toEqual(
        expectedTopicHash,
      );
    });

    it("all caps key from xml", async () => {
      const testXml = `
      <ABC3XYZ>
        <TEST>Lorem Ipsum</TEST>
      </ABC3XYZ>
    `;

      const expectedHash = {
        ABC3XYZ: {
          TEST: "Lorem Ipsum",
        },
      };

      expect(await fromXml(testXml)).toEqual(expectedHash);
    });

    it("empty array from xml", async () => {
      const blogXml = `
      <blog>
        <posts type="array"></posts>
      </blog>
    `;
      const expectedBlogHash = { blog: { posts: [] } };
      expect(await fromXml(blogXml)).toEqual(expectedBlogHash);
    });

    it("empty array with whitespace from xml", async () => {
      const blogXml = `
      <blog>
        <posts type="array">
        </posts>
      </blog>
    `;
      const expectedBlogHash = { blog: { posts: [] } };
      expect(await fromXml(blogXml)).toEqual(expectedBlogHash);
    });

    it("array with one entry from xml", async () => {
      const blogXml = `
      <blog>
        <posts type="array">
          <post>a post</post>
        </posts>
      </blog>
    `;
      const expectedBlogHash = { blog: { posts: ["a post"] } };
      expect(await fromXml(blogXml)).toEqual(expectedBlogHash);
    });

    it("array with multiple entries from xml", async () => {
      const blogXml = `
      <blog>
        <posts type="array">
          <post>a post</post>
          <post>another post</post>
        </posts>
      </blog>
    `;
      const expectedBlogHash = { blog: { posts: ["a post", "another post"] } };
      expect(await fromXml(blogXml)).toEqual(expectedBlogHash);
    });

    it("file from xml", async () => {
      const blogXml = `
      <blog>
        <logo type="file" name="logo.png" content_type="image/png">
        </logo>
      </blog>
    `;
      const hash = (await fromXml(blogXml)) as any;
      expect(Object.hasOwn(hash, "blog")).toBe(true);
      expect(Object.hasOwn(hash["blog"], "logo")).toBe(true);

      const file = hash["blog"]["logo"];
      expect(file.originalFilename).toBe("logo.png");
      expect(file.contentType).toBe("image/png");
    });

    it("file from xml with defaults", async () => {
      const blogXml = `
      <blog>
        <logo type="file">
        </logo>
      </blog>
    `;
      const file = ((await fromXml(blogXml)) as any)["blog"]["logo"];
      expect(file.originalFilename).toBe("untitled");
      expect(file.contentType).toBe("application/octet-stream");
    });

    it("tag with attrs and whitespace", async () => {
      const xml = `
      <blog name="bacon is the best">
      </blog>
    `;
      const hash = (await fromXml(xml)) as any;
      expect(hash["blog"]["name"]).toBe("bacon is the best");
    });

    it("empty cdata from xml", async () => {
      const xml = "<data><![CDATA[]]></data>";

      expect(((await fromXml(xml)) as any)["data"]).toBe(
        XmlMini.backend() === XmlMini_NokogiriSAX ? null : "",
      );
    });

    it("xsd like types from xml", async () => {
      const baconXml = `
    <bacon>
      <weight type="double">0.5</weight>
      <price type="decimal">12.50</price>
      <chunky type="boolean"> 1 </chunky>
      <expires-at type="dateTime">2007-12-25T12:34:56+0000</expires-at>
      <notes type="string"></notes>
      <illustration type="base64Binary">YmFiZS5wbmc=</illustration>
      <caption type="binary" encoding="base64">VGhhdCdsbCBkbywgcGlnLg==</caption>
    </bacon>
    `;

      const expectedBaconHash = stringifyKeys({
        weight: 0.5,
        chunky: true,
        price: new BigDecimal("12.50"),
        expires_at: Temporal.Instant.from("2007-12-25T12:34:56Z"),
        notes: "",
        illustration: "babe.png",
        caption: "That'll do, pig.",
      });

      expect(((await fromXml(baconXml)) as any)["bacon"]).toEqual(expectedBaconHash);
    });

    it("type trickles through when unknown", async () => {
      const productXml = `
    <product>
      <weight type="double">0.5</weight>
      <image type="ProductImage"><filename>image.gif</filename></image>

    </product>
    `;

      const expectedProductHash = stringifyKeys({
        weight: 0.5,
        image: { type: "ProductImage", filename: "image.gif" },
      });

      expect(((await fromXml(productXml)) as any)["product"]).toEqual(expectedProductHash);
    });

    it("from xml raises on disallowed type attributes", async () => {
      await assertRaises([DisallowedType], {}, () =>
        fromXml('<product><name type="foo">value</name></product>', ["foo"]),
      );
    });

    it("from xml disallows symbol and yaml types by default", async () => {
      await assertRaises([DisallowedType], {}, () =>
        fromXml('<product><name type="symbol">value</name></product>'),
      );

      await assertRaises([DisallowedType], {}, () =>
        fromXml('<product><name type="yaml">value</name></product>'),
      );
    });

    it("from xml array one", async () => {
      const expected = { numbers: { type: "Array", value: "1" } };
      expect(await fromXml('<numbers type="Array"><value>1</value></numbers>')).toEqual(expected);
    });

    it("from xml array many", async () => {
      const expected = { numbers: { type: "Array", value: ["1", "2"] } };
      expect(
        await fromXml('<numbers type="Array"><value>1</value><value>2</value></numbers>'),
      ).toEqual(expected);
    });

    it("from trusted xml allows symbol and yaml types", async () => {
      const expected = { product: { name: ":value" } };
      expect(await fromTrustedXml('<product><name type="symbol">value</name></product>')).toEqual(
        expected,
      );
      const yamlHash = (await fromTrustedXml(
        '<product><name type="yaml">:value</name></product>',
      )) as any;
      yamlHash["product"]["name"] = await yamlHash["product"]["name"];
      expect(yamlHash).toEqual(expected);
    });

    it("kernel method names to xml", async () => {
      const hash = { throw: { ball: "red" } };
      const expected = "<person><throw><ball>red</ball></throw></person>";

      await assertNothingRaised(() => {
        expect(toXml(hash, xmlOptions)).toBe(expected);
      });
    });

    it("empty string works for typecast xml value", async () => {
      await assertNothingRaised(() => {
        new XMLConverter("").toH();
      });
    });

    it("escaping to xml", () => {
      const hash = stringifyKeys({
        bare_string: "First & Last Name",
        pre_escaped_string: "First &amp; Last Name",
      });

      const expectedXml =
        "<person><bare-string>First &amp; Last Name</bare-string><pre-escaped-string>First &amp;amp; Last Name</pre-escaped-string></person>";
      expect(toXml(hash, xmlOptions)).toBe(expectedXml);
    });

    it("unescaping from xml", async () => {
      const xmlString =
        "<person><bare-string>First &amp; Last Name</bare-string><pre-escaped-string>First &amp;amp; Last Name</pre-escaped-string></person>";
      const expectedHash = stringifyKeys({
        bare_string: "First & Last Name",
        pre_escaped_string: "First &amp; Last Name",
      });
      expect(((await fromXml(xmlString)) as any)["person"]).toEqual(expectedHash);
    });

    it("roundtrip to xml from xml", async () => {
      const hash = stringifyKeys({
        bare_string: "First & Last Name",
        pre_escaped_string: "First &amp; Last Name",
      });

      expect(((await fromXml(toXml(hash, xmlOptions))) as any)["person"]).toEqual(hash);
    });

    it("datetime xml type with utc time", async () => {
      const alertXml = `
      <alert>
        <alert_at type="datetime">2008-02-10T15:30:45Z</alert_at>
      </alert>
    `;
      const alertAt = ((await fromXml(alertXml)) as any)["alert"]["alert_at"];
      expect(alertAt).toBeInstanceOf(Temporal.Instant);
      expect(alertAt).toEqual(Temporal.Instant.from("2008-02-10T15:30:45Z"));
    });

    it("datetime xml type with non utc time", async () => {
      const alertXml = `
      <alert>
        <alert_at type="datetime">2008-02-10T10:30:45-05:00</alert_at>
      </alert>
    `;
      const alertAt = ((await fromXml(alertXml)) as any)["alert"]["alert_at"];
      expect(alertAt).toBeInstanceOf(Temporal.Instant);
      expect(alertAt).toEqual(Temporal.Instant.from("2008-02-10T15:30:45Z"));
    });

    it("datetime xml type with far future date", async () => {
      const alertXml = `
      <alert>
        <alert_at type="datetime">2050-02-10T15:30:45Z</alert_at>
      </alert>
    `;
      const alertAt = ((await fromXml(alertXml)) as any)["alert"]["alert_at"];
      expect(alertAt).toBeInstanceOf(Temporal.Instant);
      const utc = alertAt.toZonedDateTimeISO("UTC");
      expect(utc.year).toBe(2050);
      expect(utc.month).toBe(2);
      expect(utc.day).toBe(10);
      expect(utc.hour).toBe(15);
      expect(utc.minute).toBe(30);
      expect(utc.second).toBe(45);
    });

    it("to xml dups options", () => {
      const options = { skipInstruct: true };
      toXml({}, options);
      expect(options).toEqual({ skipInstruct: true });
    });

    it("expansion count is limited", async () => {
      const backend = XmlMini.backend();
      const expected =
        backend === XmlMini_REXML
          ? RuntimeError
          : backend === XmlMini_Nokogiri
            ? nokogiriSyntaxError
            : backend === XmlMini_NokogiriSAX
              ? RuntimeError
              : undefined;

      await assertRaises([expected!], {}, () => {
        const attackXml = `
      <?xml version="1.0" encoding="UTF-8"?>
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
      `;
        return fromXml(attackXml);
      });
    });
  });
}

hashToXmlTests("REXML");

await runWithGem("@blazetrails/nokogiri", (Nokogiri) => {
  nokogiriSyntaxError = Nokogiri.XML.SyntaxError;
  hashToXmlTests("Nokogiri");
  hashToXmlTests("NokogiriSAX");
});
