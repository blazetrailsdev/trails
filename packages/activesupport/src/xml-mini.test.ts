import { describe, it, expect, beforeEach } from "vitest";
import { renameKey, toTag, XmlStringBuilder, type ToTagOptions } from "./xml-mini.js";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";
import { Temporal } from "./temporal.js";

describe("ParsingTest", () => {
  it.skip("symbol");
  it.skip("date");
  it.skip("datetime");
  it.skip("duration");
  it.skip("integer");
  it.skip("float");
  it.skip("decimal");
  it.skip("boolean");
  it.skip("string");
  it.skip("yaml");
  it.skip("hexBinary");
  it.skip("base64Binary and binary");
});

describe("RenameKeyTest", () => {
  it("rename key dasherizes by default", () => {
    expect(renameKey("hello_world")).toBe("hello-world");
  });

  it("rename key dasherizes with dasherize true", () => {
    expect(renameKey("hello_world", { dasherize: true })).toBe("hello-world");
  });

  it("rename key does nothing with dasherize false", () => {
    expect(renameKey("hello_world", { dasherize: false })).toBe("hello_world");
  });

  it("rename key camelizes with camelize true", () => {
    expect(renameKey("hello_world", { camelize: true })).toBe("HelloWorld");
  });

  it("rename key lower camelizes with camelize lower", () => {
    expect(renameKey("hello_world", { camelize: "lower" })).toBe("helloWorld");
  });

  it("rename key lower camelizes with camelize upper", () => {
    expect(renameKey("hello_world", { camelize: "upper" })).toBe("HelloWorld");
  });

  it("rename key does not dasherize leading underscores", () => {
    expect(renameKey("__hello_world")).toBe("__hello-world");
  });

  it("rename key with leading underscore dasherizes interior underscores", () => {
    expect(renameKey("_hello_world")).toBe("_hello-world");
  });

  it("rename key does not dasherize trailing underscores", () => {
    expect(renameKey("hello_world__")).toBe("hello-world__");
  });

  it("rename key with trailing underscore dasherizes interior underscores", () => {
    expect(renameKey("hello_world_")).toBe("hello-world_");
  });

  it("rename key does not dasherize multiple leading underscores", () => {
    expect(renameKey("___hello_world")).toBe("___hello-world");
  });

  it("rename key does not dasherize multiple trailing underscores", () => {
    expect(renameKey("hello_world___")).toBe("hello-world___");
  });
});

describe("ToTagTest", () => {
  let builder: XmlStringBuilder;
  let options: ToTagOptions;

  beforeEach(() => {
    builder = new XmlStringBuilder();
    options = { skipInstruct: true, builder };
  });

  it("#to_tag accepts a callable object and passes options with the builder", () => {
    toTag("some_tag", (o: ToTagOptions) => o.builder.tag("br"), options);
    expect(builder.target()).toBe("<br/>");
  });

  it("#to_tag accepts a callable object and passes options and tag name", () => {
    toTag("tag", (o: ToTagOptions, t: string) => o.builder.tag("b", t), options);
    expect(builder.target()).toBe("<b>tag</b>");
  });

  it("#to_tag accepts an object responding to #to_xml and passes the options, where :root is key", () => {
    const obj = {
      toXml(o: ToTagOptions) {
        o.builder.tag("yo", String(o.root));
      },
    };
    toTag("tag", obj, options);
    expect(builder.target()).toBe("<yo>tag</yo>");
  });

  it("#to_tag accepts arbitrary objects responding to #to_str", () => {
    toTag("b", "Howdy", options);
    expect(builder.target()).toBe("<b>Howdy</b>");
  });

  it("#to_tag should use the type value in the options hash", () => {
    toTag("b", "blue", { ...options, type: "color" });
    expect(builder.target()).toBe('<b type="color">blue</b>');
  });

  it("#to_tag accepts symbol types", () => {
    toTag("b", Symbol("name"), options);
    expect(builder.target()).toBe('<b type="symbol">name</b>');
  });

  it("#to_tag accepts boolean types", () => {
    toTag("b", true, options);
    expect(builder.target()).toBe('<b type="boolean">true</b>');
  });

  it("#to_tag accepts float types", () => {
    toTag("b", 3.14, options);
    expect(builder.target()).toBe('<b type="float">3.14</b>');
  });

  it("#to_tag accepts decimal types", () => {
    toTag("b", new BigDecimal("1.2"), options);
    expect(builder.target()).toBe('<b type="decimal">1.2</b>');
  });

  it("#to_tag accepts date types", () => {
    toTag("b", Temporal.PlainDate.from("2001-02-03"), options);
    expect(builder.target()).toBe('<b type="date">2001-02-03</b>');
  });

  it("#to_tag accepts datetime types", () => {
    toTag("b", Temporal.ZonedDateTime.from("2001-02-03T04:05:06+07:00[+07:00]"), options);
    expect(builder.target()).toBe('<b type="dateTime">2001-02-03T04:05:06+07:00</b>');
  });

  it("#to_tag accepts time types", () => {
    toTag("b", Temporal.ZonedDateTime.from("1993-02-24T12:00:00+09:00[+09:00]"), options);
    expect(builder.target()).toBe('<b type="dateTime">1993-02-24T12:00:00+09:00</b>');
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
    expect(builder.target()).toBe('<b type="dateTime">1993-02-24T13:00:00+01:00</b>');
  });

  it("#to_tag accepts duration types", () => {
    toTag(
      "b",
      Temporal.Duration.from({ years: 3, months: 6, days: 4, hours: 12, minutes: 30, seconds: 5 }),
      options,
    );
    expect(builder.target()).toBe('<b type="duration">P3Y6M4DT12H30M5S</b>');
  });

  it("#to_tag accepts array types", () => {
    toTag("b", ["first_name", "last_name"], options);
    expect(builder.target()).toBe('<b type="array"><b>first_name</b><b>last_name</b></b>');
  });

  it("#to_tag accepts hash types", () => {
    toTag("b", { first_name: "Bob", last_name: "Marley" }, options);
    expect(builder.target()).toBe(
      "<b><first-name>Bob</first-name><last-name>Marley</last-name></b>",
    );
  });

  it("#to_tag should not add type when skip types option is set", () => {
    toTag("b", "Bob", { ...options, skipTypes: 1 });
    expect(builder.target()).toBe("<b>Bob</b>");
  });

  it("#to_tag should dasherize the space when passed a string with spaces as a key", () => {
    toTag("New   York", 33, options);
    expect(builder.target()).toBe('<New---York type="integer">33</New---York>');
  });

  it("#to_tag should dasherize the space when passed a symbol with spaces as a key", () => {
    toTag(Symbol("New   York"), 33, options);
    expect(builder.target()).toBe('<New---York type="integer">33</New---York>');
  });
});
