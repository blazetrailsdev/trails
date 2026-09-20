import { describe, it, expect } from "vitest";

import { toFormattedS, toFs, toSentence, toXml } from "../../array-utils.js";
import { BigDecimal } from "../big-decimal/conversions.js";
import { ArgumentError } from "../../hash-utils.js";
import { SafeBuffer } from "../string/output-safety.js";

describe("ToSentenceTest", () => {
  it("plain array to sentence", () => {
    expect(toSentence([])).toBe("");
    expect(toSentence(["one"])).toBe("one");
    expect(toSentence(["one", "two"])).toBe("one and two");
    expect(toSentence(["one", "two", "three"])).toBe("one, two, and three");
  });

  it.skip("to sentence with words connector", () => {
    // BLOCKED: to-sentence-does-not-stringify-elements-or-nil-connectors
    expect(toSentence(["one", "two", "three"], { wordsConnector: " " })).toBe("one two, and three");
    expect(toSentence(["one", "two", "three"], { wordsConnector: " & " })).toBe(
      "one & two, and three",
    );
    expect(toSentence(["one", "two", "three"], { wordsConnector: null as never })).toBe(
      "onetwo, and three",
    );
  });

  it.skip("to sentence with last word connector", () => {
    // BLOCKED: to-sentence-does-not-stringify-elements-or-nil-connectors
    expect(toSentence(["one", "two", "three"], { lastWordConnector: ", and also " })).toBe(
      "one, two, and also three",
    );
    expect(toSentence(["one", "two", "three"], { lastWordConnector: null as never })).toBe(
      "one, twothree",
    );
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " " })).toBe("one, two three");
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " and " })).toBe(
      "one, two and three",
    );
  });

  it("two elements", () => {
    expect(toSentence(["one", "two"])).toBe("one and two");
    expect(toSentence(["one", "two"], { twoWordsConnector: " " })).toBe("one two");
  });

  it("one element", () => {
    expect(toSentence(["one"])).toBe("one");
  });

  it("one element not same object", () => {
    const elements = ["one"];
    expect(Object(toSentence(elements))).not.toBe(elements[0]);
  });

  it.skip("one non string element", () => {
    // BLOCKED: to-sentence-does-not-stringify-elements-or-nil-connectors
    expect(toSentence([1] as never)).toBe("1");
  });

  it("does not modify given hash", () => {
    const options = { wordsConnector: " " };
    expect(toSentence(["one", "two", "three"], options)).toBe("one two, and three");
    expect(options).toEqual({ wordsConnector: " " });
  });

  it("with blank elements", () => {
    expect(toSentence([null, "one", "", "two", "three"] as never)).toBe(", one, , two, and three");
  });

  it("with invalid options", () => {
    let exception!: ArgumentError;
    expect(() => {
      try {
        toSentence(["one", "two"], { passing: "invalid option" } as never);
      } catch (e) {
        exception = e as ArgumentError;
        throw e;
      }
    }).toThrow(ArgumentError);

    expect(exception.message).toBe(
      "Unknown key: :passing. Valid keys are: :wordsConnector, :twoWordsConnector, :lastWordConnector, :locale",
    );
  });

  it.skip("always returns string", () => {
    // BLOCKED: to-sentence-does-not-stringify-elements-or-nil-connectors
    expect(Object(toSentence([new SafeBuffer("one")] as never))).toBeInstanceOf(String);
    expect(Object(toSentence([new SafeBuffer("one"), "two"] as never))).toBeInstanceOf(String);
    expect(Object(toSentence([new SafeBuffer("one"), "two", "three"] as never))).toBeInstanceOf(
      String,
    );
  });

  it("returns no frozen string", () => {
    expect(Object.isFrozen(Object(toSentence([])))).toBeFalsy();
    expect(Object.isFrozen(Object(toSentence(["one"])))).toBeFalsy();
    expect(Object.isFrozen(Object(toSentence(["one", "two"])))).toBeFalsy();
    expect(Object.isFrozen(Object(toSentence(["one", "two", "three"])))).toBeFalsy();
  });
});

describe("ToFsTest", () => {
  it("to fs db", () => {
    const collection = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(toFs([], "db")).toBe("null");
    expect(toFs(collection, "db")).toBe("1,2,3");
    expect(toFormattedS([], "db")).toBe("null");
    expect(toFormattedS([{ id: 4 }, { id: 5 }, { id: 6 }], "db")).toBe("4,5,6");
  });
});

describe("ToXmlTest", () => {
  it("to xml with hash elements", () => {
    const xml = toXml(
      [
        { name: "David", age: 26, age_in_millis: 820497600000 },
        { name: "Jason", age: 31, age_in_millis: new BigDecimal("1.0") },
      ],
      { skipInstruct: true, indent: 0 },
    );

    expect(xml.slice(0, 30)).toBe('<objects type="array"><object>');
    expect(xml).toContain('<age type="integer">26</age>');
    expect(xml).toContain('<age-in-millis type="integer">820497600000</age-in-millis>');
    expect(xml).toContain("<name>David</name>");
    expect(xml).toContain('<age type="integer">31</age>');
    expect(xml).toContain('<age-in-millis type="decimal">1.0</age-in-millis>');
    expect(xml).toContain("<name>Jason</name>");
  });

  it("to xml with non hash elements", () => {
    const xml = toXml(["1", "2", "3"], { skipInstruct: true, indent: 0 });

    expect(xml.slice(0, 29)).toBe('<strings type="array"><string');
    expect(xml).toContain("<string>2</string>");
  });

  it("to xml with dedicated name", () => {
    const xml = toXml(
      [
        { name: "David", age: 26, age_in_millis: 820497600000 },
        { name: "Jason", age: 31 },
      ],
      { skipInstruct: true, indent: 0, root: "people" },
    );

    expect(xml.slice(0, 29)).toBe('<people type="array"><person>');
  });

  it("to xml with options", () => {
    const xml = toXml(
      [
        { name: "David", street_address: "Paulina" },
        { name: "Jason", street_address: "Evergreen" },
      ],
      { skipInstruct: true, skipTypes: true, indent: 0 },
    );

    expect(xml.slice(0, 17)).toBe("<objects><object>");
    expect(xml).toContain("<street-address>Paulina</street-address>");
    expect(xml).toContain("<name>David</name>");
    expect(xml).toContain("<street-address>Evergreen</street-address>");
    expect(xml).toContain("<name>Jason</name>");
  });

  it("to xml with indent set", () => {
    const xml = toXml(
      [
        { name: "David", street_address: "Paulina" },
        { name: "Jason", street_address: "Evergreen" },
      ],
      { skipInstruct: true, skipTypes: true, indent: 4 },
    );

    expect(xml.slice(0, 22)).toBe("<objects>\n    <object>");
    expect(xml).toContain("\n        <street-address>Paulina</street-address>");
    expect(xml).toContain("\n        <name>David</name>");
    expect(xml).toContain("\n        <street-address>Evergreen</street-address>");
    expect(xml).toContain("\n        <name>Jason</name>");
  });

  it("to xml with dasherize false", () => {
    const xml = toXml(
      [
        { name: "David", street_address: "Paulina" },
        { name: "Jason", street_address: "Evergreen" },
      ],
      { skipInstruct: true, skipTypes: true, indent: 0, dasherize: false },
    );

    expect(xml.slice(0, 17)).toBe("<objects><object>");
    expect(xml).toContain("<street_address>Paulina</street_address>");
    expect(xml).toContain("<street_address>Evergreen</street_address>");
  });

  it("to xml with dasherize true", () => {
    const xml = toXml(
      [
        { name: "David", street_address: "Paulina" },
        { name: "Jason", street_address: "Evergreen" },
      ],
      { skipInstruct: true, skipTypes: true, indent: 0, dasherize: true },
    );

    expect(xml.slice(0, 17)).toBe("<objects><object>");
    expect(xml).toContain("<street-address>Paulina</street-address>");
    expect(xml).toContain("<street-address>Evergreen</street-address>");
  });

  it("to xml with instruct", () => {
    const xml = toXml(
      [
        { name: "David", age: 26, age_in_millis: 820497600000 },
        { name: "Jason", age: 31, age_in_millis: new BigDecimal("1.0") },
      ],
      { skipInstruct: false, indent: 0 },
    );

    expect(xml).toMatch(/^<\?xml [^>]*/);
    expect(xml.lastIndexOf("<?xml ")).toBe(0);
  });

  it("to xml with block", () => {
    const xml = toXml(
      [
        { name: "David", age: 26, age_in_millis: 820497600000 },
        { name: "Jason", age: 31, age_in_millis: new BigDecimal("1.0") },
      ],
      { skipInstruct: true, indent: 0 },
      (builder) => {
        builder.tag("count", 2);
      },
    );

    expect(xml).toContain("<count>2</count>");
  });

  it("to xml with empty", () => {
    const xml = toXml([]);
    expect(xml).toMatch(/type="array"\/>/);
  });

  it("to xml dups options", () => {
    const options = { skipInstruct: true };
    toXml([], options);
    expect(options).toEqual({ skipInstruct: true });
  });
});
