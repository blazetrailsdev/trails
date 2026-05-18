import { describe, it, expect } from "vitest";
import { htmlSafe, isHtmlSafe } from "@blazetrails/activesupport";
import {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberWithPrecision,
  numberToHumanSize,
  numberToHuman,
  InvalidNumberError,
} from "../helpers/number-helper.js";

const raw = htmlSafe;
const s = (v: unknown) => (v == null ? v : (v as { toString(): string }).toString());

describe("NumberHelperTest", () => {
  it("number to phone", () => {
    expect(numberToPhone(null)).toBeNull();
    expect(s(numberToPhone(5551234))).toBe("555-1234");
    expect(s(numberToPhone(8005551212, { areaCode: true, extension: 123 }))).toBe(
      "(800) 555-1212 x 123",
    );
    expect(s(numberToPhone(8005551212, { countryCode: 1, delimiter: "" }))).toBe("+18005551212");
    expect(s(numberToPhone(8005551212, { countryCode: "<script></script>", delimiter: "" }))).toBe(
      "+&lt;script&gt;&lt;/script&gt;8005551212",
    );
    expect(s(numberToPhone(8005551212, { extension: "<script></script>", delimiter: "" }))).toBe(
      "8005551212 x &lt;script&gt;&lt;/script&gt;",
    );
  });

  it("number to currency", () => {
    expect(numberToCurrency(null)).toBeNull();
    expect(s(numberToCurrency(1234567890.5))).toBe("$1,234,567,890.50");
    expect(s(numberToCurrency(1234567891.5, { precision: 0 }))).toBe("$1,234,567,892");
    expect(s(numberToCurrency("1234567890.50", { unit: "&pound;" }))).toBe(
      "&amp;pound;1,234,567,890.50",
    );
    expect(s(numberToCurrency("1234567890.50", { format: "<b>%n</b> %u" }))).toBe(
      "&lt;b&gt;1,234,567,890.50&lt;/b&gt; $",
    );
    expect(s(numberToCurrency("-1234567890.50", { negativeFormat: "<b>%n</b> %u" }))).toBe(
      "&lt;b&gt;1,234,567,890.50&lt;/b&gt; $",
    );
  });

  it("number to percentage", () => {
    expect(numberToPercentage(null)).toBeNull();
    expect(s(numberToPercentage(100))).toBe("100.000%");
    expect(s(numberToPercentage(100, { format: "<b>%n</b> %" }))).toBe(
      "&lt;b&gt;100.000&lt;/b&gt; %",
    );
    expect(s(numberToPercentage(100, { format: raw("<b>%n</b> %") }))).toBe("<b>100.000</b> %");
    expect(s(numberToPercentage(100, { precision: 0 }))).toBe("100%");
    expect(s(numberToPercentage(123.4, { precision: 3, stripInsignificantZeros: true }))).toBe(
      "123.4%",
    );
    expect(s(numberToPercentage("98a"))).toBe("98a%");
  });

  it("number with delimiter", () => {
    expect(numberWithDelimiter(null)).toBeNull();
    expect(s(numberWithDelimiter(12345678))).toBe("12,345,678");
    expect(s(numberWithDelimiter(0))).toBe("0");
  });

  it("number with precision", () => {
    expect(numberWithPrecision(null)).toBeNull();
    expect(s(numberWithPrecision(-111.2346))).toBe("-111.235");
    expect(s(numberWithPrecision(111, { precision: 2 }))).toBe("111.00");
  });

  it("number to human size", () => {
    expect(numberToHumanSize(null)).toBeNull();
    expect(s(numberToHumanSize(3.14159265))).toBe("3 Bytes");
    expect(s(numberToHumanSize(1234567, { precision: 2 }))).toBe("1.2 MB");
  });

  it("number to human", () => {
    expect(numberToHuman(null)).toBeNull();
    expect(s(numberToHuman(0))).toBe("0");
    expect(s(numberToHuman(1234))).toBe("1.23 Thousand");
  });

  it("number to human escape units", () => {
    const volume = { unit: "<b>ml</b>", thousand: "<b>lt</b>", million: "<b>m3</b>" };
    expect(s(numberToHuman(123456, { units: volume }))).toBe("123 &lt;b&gt;lt&lt;/b&gt;");
    expect(s(numberToHuman(12, { units: volume }))).toBe("12 &lt;b&gt;ml&lt;/b&gt;");
    expect(s(numberToHuman(1234567, { units: volume }))).toBe("1.23 &lt;b&gt;m3&lt;/b&gt;");
  });

  it("number helpers escape delimiter and separator", () => {
    expect(s(numberToPhone(1111111111, { delimiter: "<script></script>" }))).toBe(
      "111&lt;script&gt;&lt;/script&gt;111&lt;script&gt;&lt;/script&gt;1111",
    );
    expect(s(numberToCurrency(1.01, { separator: "<script></script>" }))).toBe(
      "$1&lt;script&gt;&lt;/script&gt;01",
    );
    expect(s(numberWithDelimiter(1000, { delimiter: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;000",
    );
    expect(s(numberToHumanSize(10100, { separator: "<script></script>" }))).toBe(
      "9&lt;script&gt;&lt;/script&gt;86 KB",
    );
  });

  it("number helpers outputs are html safe", () => {
    for (const fn of [
      numberToHuman,
      numberToHumanSize,
      numberWithPrecision,
      numberToCurrency,
      numberToPercentage,
      numberWithDelimiter,
    ]) {
      expect(isHtmlSafe(fn(1))).toBe(true);
      expect(isHtmlSafe(fn("<script></script>"))).toBe(false);
      expect(isHtmlSafe(fn(raw("1")))).toBe(true);
    }
    // phone helper always html-escapes its output, so result is marked safe
    expect(isHtmlSafe(numberToPhone(1))).toBe(true);
    expect(isHtmlSafe(numberToPhone("<script></script>"))).toBe(true);
  });

  const fns = [
    numberToHuman,
    numberToHumanSize,
    numberWithPrecision,
    numberToCurrency,
    numberToPercentage,
    numberWithDelimiter,
    numberToPhone,
  ];

  it("number helpers should raise error if invalid when specified", () => {
    for (const fn of fns) expect(() => fn("x", { raise: true })).toThrow(InvalidNumberError);
    try {
      numberToCurrency("x", { raise: true });
    } catch (e) {
      expect((e as InvalidNumberError).number).toBe("x");
    }
  });

  it("number helpers should not raise error if valid when specified", () => {
    for (const fn of fns) expect(() => fn("3.33", { raise: true })).not.toThrow();
  });

  // I18n.backend.store_translations support is not yet ported.
  it.skip("number to human with custom translation scope", () => {});
});
