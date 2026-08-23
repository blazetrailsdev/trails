import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  backend,
  renameKey,
  setBackend,
  toTag,
  withBackend,
  PARSING,
  XmlStringBuilder,
  type ToTagOptions,
  type XmlMiniBackend,
} from "./xml-mini.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";
import { Temporal, Date as RubyDate } from "@blazetrails/date";
import { Duration } from "./duration.js";
import { ArgumentError } from "./hash-utils.js";

describe("ParsingTest", () => {
  const parsing = PARSING;

  // `symbol`, `integer`, `float`, `decimal` and `string` each close in Rails
  // with `assert_raises(ArgumentError) { parser.call(Date.new(2013, 11, 12,
  // 02, 11)) }`. That assertion is vacuous: MRI raises from `Date.new` itself
  // — "wrong number of arguments (given 5, expected 0..4)", verified against
  // the `ruby` on PATH — before the parser is ever called, so it pins
  // `Date.new`'s arity rather than anything about PARSING. trails spells
  // `Date.new` as `Date.civil` (date.ts:6037) with four parameters, where a
  // fifth argument is a compile error and not a runtime raise, so the
  // assertion has no faithful counterpart and is dropped rather than restated
  // against a stand-in Rails never exercised.

  it("symbol", () => {
    const parser = parsing["symbol"];
    expect(parser("symbol")).toBe(":symbol");
    expect(parser(":symbol")).toBe(":symbol");
    expect(parser(123)).toBe(":123");
  });

  it("date", () => {
    const parser = parsing["date"];
    expect(parser("2013-11-12T0211Z")).toEqual(RubyDate.parse("2013-11-12"));
    expect(() => parser(1384190018)).toThrow(TypeError);
    expect(() => parser("not really a date")).toThrow();
  });

  it("datetime", () => {
    const parser = parsing["datetime"];
    expect(parser("2013-11-12T02:11:00Z")).toEqual(Temporal.Instant.from("2013-11-12T02:11:00Z"));
    expect(parser("2013-11-12T0211Z")).toEqual(Temporal.Instant.from("2013-11-12T00:00:00Z"));
    expect(parser("2013-11-12T02:11Z")).toEqual(Temporal.Instant.from("2013-11-12T02:11:00Z"));
    expect(parser("2013-11-12T11:11+9")).toEqual(Temporal.Instant.from("2013-11-12T02:11:00Z"));
    expect(() => parser("1384190018")).toThrow();
  });

  it("duration", () => {
    const parser = parsing["duration"];
    expect(parser("PT1S")).toEqual(Duration.parse("PT1S"));
    expect(parser("PT1M")).toEqual(Duration.parse("PT1M"));
    expect(parser("P3Y6M4DT12H30M5S")).toEqual(Duration.parse("P3Y6M4DT12H30M5S"));
    expect(() => parser("not really a duration")).toThrow();
  });

  it("integer", () => {
    const parser = parsing["integer"];
    expect(parser(123)).toBe(123);
    expect(parser(123.003)).toBe(123);
    expect(parser("123")).toBe(123);
    expect(parser("")).toBe(0);
  });

  it("float", () => {
    const parser = parsing["float"];
    expect(parser("123")).toBe(123);
    expect(parser("123.003")).toBe(123.003);
    expect(parser("123,003")).toBe(123.0);
    expect(parser("")).toBe(0.0);
    expect(parser(123)).toBe(123);
    expect(parser(123.05)).toBe(123.05);
  });

  it("decimal", () => {
    const parser = parsing["decimal"];
    expect(String(parser("123"))).toBe(new BigDecimal("123").toString());
    expect(String(parser("123.003"))).toBe(new BigDecimal("123.003").toString());
    expect(String(parser("123,003"))).toBe(new BigDecimal("123").toString());
    expect(String(parser(""))).toBe(new BigDecimal("0").toString());
    expect(String(parser(123))).toBe(new BigDecimal("123").toString());
    expect(() => parser(123.04)).toThrow(ArgumentError);
  });

  it("boolean", () => {
    const parser = parsing["boolean"];
    for (const value of [1, true, "1"]) {
      expect(parser(value)).toBeTruthy();
    }

    for (const value of [0, false, "0"]) {
      expect(parser(value)).toBeFalsy();
    }
  });

  it("string", () => {
    const parser = parsing["string"];
    expect(parser(123)).toBe("123");
    expect(parser("123")).toBe("123");
    expect(parser("[]")).toBe("[]");
    expect(parser([])).toBe("[]");
    expect(parser({})).toBe("{}");
  });

  it("yaml", async () => {
    const yaml = [
      "product:",
      "  - sku         : BL394D",
      "    quantity    : 4",
      "    description : Basketball",
      "",
    ].join("\n");
    const expected = {
      product: [{ sku: "BL394D", quantity: 4, description: "Basketball" }],
    };
    const parser = parsing["yaml"];
    expect(await parser(yaml)).toEqual(expected);
    expect(await parser({ 1: "test" })).toEqual({ 1: "test" });
    expect(await parser("{1 => 'test'}")).toEqual({ "1 => 'test'": null });
  });

  it("hexBinary", () => {
    const expected = "Hello, World!";
    const hexBinary = "48656C6C6F2C20576F726C6421";

    let parser = parsing["hexBinary"];
    expect(parser(hexBinary)).toBe(expected);

    parser = parsing["binary"];
    expect(parser(hexBinary, { encoding: "hexBinary" })).toBe(expected);
    expect(parser(hexBinary, { encoding: "hex" })).toBe(expected);
  });

  it("base64Binary and binary", () => {
    const base64 =
      "TWFuIGlzIGRpc3Rpbmd1aXNoZWQsIG5vdCBvbmx5IGJ5IGhpcyByZWFzb24sIGJ1dCBieSB0aGlz\n" +
      "IHNpbmd1bGFyIHBhc3Npb24gZnJvbSBvdGhlciBhbmltYWxzLCB3aGljaCBpcyBhIGx1c3Qgb2Yg\n" +
      "dGhlIG1pbmQsIHRoYXQgYnkgYSBwZXJzZXZlcmFuY2Ugb2YgZGVsaWdodCBpbiB0aGUgY29udGlu\n" +
      "dWVkIGFuZCBpbmRlZmF0aWdhYmxlIGdlbmVyYXRpb24gb2Yga25vd2xlZGdlLCBleGNlZWRzIHRo\n" +
      "ZSBzaG9ydCB2ZWhlbWVuY2Ugb2YgYW55IGNhcm5hbCBwbGVhc3VyZS4=\n";
    const expectedBase64 =
      "Man is distinguished, not only by his reason, but by this singular passion from\n" +
      "other animals, which is a lust of the mind, that by a perseverance of delight\n" +
      "in the continued and indefatigable generation of knowledge, exceeds the short\n" +
      "vehemence of any carnal pleasure.\n";

    let parser = parsing["base64Binary"];
    expect(parser(base64)).toBe(expectedBase64.replace(/\n/g, " ").trim());
    parser("NON BASE64 INPUT");

    parser = parsing["binary"];
    expect(parser(base64, { encoding: "base64" })).toBe(expectedBase64.replace(/\n/g, " ").trim());
    expect(parser("IGNORED INPUT", {})).toBe("IGNORED INPUT");
  });
});

describe("RenameKeyTest", () => {
  it("rename key dasherizes by default", () => {
    expect(renameKey("my_key")).toBe("my-key");
  });

  it("rename key dasherizes with dasherize true", () => {
    expect(renameKey("my_key", { dasherize: true })).toBe("my-key");
  });

  it("rename key does nothing with dasherize false", () => {
    expect(renameKey("my_key", { dasherize: false })).toBe("my_key");
  });

  it("rename key camelizes with camelize true", () => {
    expect(renameKey("my_key", { camelize: true })).toBe("MyKey");
  });

  it("rename key lower camelizes with camelize lower", () => {
    expect(renameKey("my_key", { camelize: "lower" })).toBe("myKey");
  });

  it("rename key lower camelizes with camelize upper", () => {
    expect(renameKey("my_key", { camelize: "upper" })).toBe("MyKey");
  });

  it("rename key does not dasherize leading underscores", () => {
    expect(renameKey("_id")).toBe("_id");
  });

  it("rename key with leading underscore dasherizes interior underscores", () => {
    expect(renameKey("_my_key")).toBe("_my-key");
  });

  it("rename key does not dasherize trailing underscores", () => {
    expect(renameKey("id_")).toBe("id_");
  });

  it("rename key with trailing underscore dasherizes interior underscores", () => {
    expect(renameKey("my_key_")).toBe("my-key_");
  });

  it("rename key does not dasherize multiple leading underscores", () => {
    expect(renameKey("__id")).toBe("__id");
  });

  it("rename key does not dasherize multiple trailing underscores", () => {
    expect(renameKey("id__")).toBe("id__");
  });
});

describe("ToTagTest", () => {
  let builder: XmlStringBuilder;
  let options: ToTagOptions;

  /** Mirrors `assert_xml` (xml_mini_test.rb:64-66). */
  function assertXml(xml: string): void {
    expect(builder.target()).toBe(xml);
  }

  beforeEach(() => {
    builder = new XmlStringBuilder();
    options = { skipInstruct: true, builder };
  });

  it("#to_tag accepts a callable object and passes options with the builder", () => {
    toTag("some_tag", (o: ToTagOptions) => o.builder.tag("br"), options);
    assertXml("<br/>");
  });

  it("#to_tag accepts a callable object and passes options and tag name", () => {
    toTag("tag", (o: ToTagOptions, t: string) => o.builder.tag("b", t), options);
    assertXml("<b>tag</b>");
  });

  it("#to_tag accepts an object responding to #to_xml and passes the options, where :root is key", () => {
    const obj = {
      toXml(o: ToTagOptions) {
        o.builder.tag("yo", String(o.root));
      },
    };
    toTag("tag", obj, options);
    assertXml("<yo>tag</yo>");
  });

  it("#to_tag accepts arbitrary objects responding to #to_str", () => {
    toTag("b", "Howdy", options);
    assertXml("<b>Howdy</b>");
  });

  it("#to_tag should use the type value in the options hash", () => {
    toTag("b", "blue", { ...options, type: "color" });
    assertXml('<b type="color">blue</b>');
  });

  it("#to_tag accepts symbol types", () => {
    toTag("b", ":name", options);
    assertXml('<b type="symbol">name</b>');
  });

  it("#to_tag accepts boolean types", () => {
    toTag("b", true, options);
    assertXml('<b type="boolean">true</b>');
  });

  it("#to_tag accepts float types", () => {
    toTag("b", 3.14, options);
    assertXml('<b type="float">3.14</b>');
  });

  it("#to_tag accepts decimal types", () => {
    toTag("b", new BigDecimal("1.2"), options);
    assertXml('<b type="decimal">1.2</b>');
  });

  it("#to_tag accepts date types", () => {
    toTag("b", Temporal.PlainDate.from("2001-02-03"), options);
    assertXml('<b type="date">2001-02-03</b>');
  });

  it("#to_tag accepts datetime types", () => {
    toTag("b", Temporal.ZonedDateTime.from("2001-02-03T04:05:06+07:00[+07:00]"), options);
    assertXml('<b type="dateTime">2001-02-03T04:05:06+07:00</b>');
  });

  it("#to_tag accepts time types", () => {
    toTag("b", Temporal.ZonedDateTime.from("1993-02-24T12:00:00+09:00[+09:00]"), options);
    assertXml('<b type="dateTime">1993-02-24T12:00:00+09:00</b>');
  });

  it("#to_tag accepts ActiveSupport::TimeWithZone types", () => {
    // A zoned wall-clock exposing #xmlschema (the TimeWithZone contract): its
    // local offset is preserved, matching Rails' `time.xmlschema`. Modeled as a
    // class instance (like the real TimeWithZone), so it is a leaf, not a hash.
    class TimeWithZone {
      xmlschema() {
        return "1993-02-24T13:00:00+01:00";
      }
    }
    toTag("b", new TimeWithZone(), options);
    assertXml('<b type="dateTime">1993-02-24T13:00:00+01:00</b>');
  });

  it("#to_tag accepts duration types", () => {
    toTag(
      "b",
      Temporal.Duration.from({ years: 3, months: 6, days: 4, hours: 12, minutes: 30, seconds: 5 }),
      options,
    );
    assertXml('<b type="duration">P3Y6M4DT12H30M5S</b>');
  });

  it("#to_tag accepts array types", () => {
    toTag("b", ["first_name", "last_name"], options);
    assertXml('<b type="array"><b>first_name</b><b>last_name</b></b>');
  });

  it("#to_tag accepts hash types", () => {
    toTag("b", { first_name: "Bob", last_name: "Marley" }, options);
    assertXml("<b><first-name>Bob</first-name><last-name>Marley</last-name></b>");
  });

  it("#to_tag should not add type when skip types option is set", () => {
    toTag("b", "Bob", { ...options, skipTypes: 1 });
    assertXml("<b>Bob</b>");
  });

  it("#to_tag should dasherize the space when passed a string with spaces as a key", () => {
    toTag("New   York", 33, options);
    assertXml('<New---York type="integer">33</New---York>');
  });

  it("#to_tag should dasherize the space when passed a symbol with spaces as a key", () => {
    toTag(Symbol("New   York"), 33, options);
    assertXml('<New---York type="integer">33</New---York>');
  });

  // trails coverage beyond Rails' ToTagTest, exercising the XmlMini `binary`
  // formatter/encoding and the empty-array self-closing form.
  it("#to_tag base64-encodes binary types and sets the encoding attribute", () => {
    toTag("b", "hello", { ...options, type: "binary" });
    assertXml('<b type="binary" encoding="base64">aGVsbG8=\n</b>');
  });

  it("#to_tag emits an empty array as a self-closing tag", () => {
    toTag("b", [], options);
    assertXml('<b type="array"/>');
  });
});

// Rails' `module REXML end` stand-ins: a backend is anything answering #parse,
// and these are only ever compared by identity.
const REXML: XmlMiniBackend = { parse: () => ({}) };
const LibXML: XmlMiniBackend = { parse: () => ({}) };
const Nokogiri: XmlMiniBackend = { parse: () => ({}) };

describe("WithBackendTest", () => {
  let defaultBackend: XmlMiniBackend | null | undefined;

  beforeEach(() => {
    defaultBackend = backend();
  });

  afterEach(async () => {
    await setBackend(defaultBackend);
  });

  it("#with_backend should switch backend and then switch back", async () => {
    await setBackend(REXML);
    await withBackend(LibXML, async () => {
      expect(backend()).toBe(LibXML);
      await withBackend(Nokogiri, () => {
        expect(backend()).toBe(Nokogiri);
      });
      expect(backend()).toBe(LibXML);
    });
    expect(backend()).toBe(REXML);
  });

  it("backend switch inside #with_backend block", async () => {
    await withBackend(LibXML, async () => {
      await setBackend(REXML);
      expect(backend()).toBe(REXML);
    });
    expect(backend()).toBe(REXML);
  });
});

describe("ThreadSafetyTest", () => {
  let defaultBackend: XmlMiniBackend | null | undefined;

  beforeEach(() => {
    defaultBackend = backend();
  });

  afterEach(async () => {
    await setBackend(defaultBackend);
  });

  /**
   * The Rails tests spawn a Thread and `sleep 0.1 while t.status != "sleep"`.
   * The trails analog of a thread is an isolated execution state
   * (AsyncLocalStorage), and the analog of waiting for it to park is awaiting
   * the signal it sends from inside the block.
   */
  function spawn(name: XmlMiniBackend): { entered: Promise<void>; join: () => Promise<void> } {
    let signalEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => (signalEntered = resolve));
    const sleep = new Promise<void>((resolve) => (release = resolve));
    const thread = IsolatedExecutionState.run(() =>
      withBackend(name, () => {
        signalEntered();
        return sleep;
      }),
    );
    return {
      entered,
      join: async () => {
        release();
        await thread;
      },
    };
  }

  it("#with_backend should be thread-safe", async () => {
    await setBackend(REXML);
    const t = spawn(LibXML);
    await t.entered;

    // We should get `old_backend` here even while another
    // execution state is using `new_backend`.
    expect(backend()).toBe(REXML);
    await t.join();
  });

  it("nested #with_backend should be thread-safe", async () => {
    await withBackend(REXML, async () => {
      const t = spawn(LibXML);
      await t.entered;

      expect(backend()).toBe(REXML);
      await t.join();
    });
  });
});
