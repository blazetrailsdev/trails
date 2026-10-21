import "../test-helpers/abstract-unit.js";
import { describe, it, expect } from "vitest";
import { Rational } from "@blazetrails/ruby-compat";
import { htmlSafe, isHtmlSafe, assertNil, assertRaises, I18n } from "@blazetrails/activesupport";
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
    assertNil(numberToPhone(null));
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
    assertNil(numberToCurrency(null));
    expect(s(numberToCurrency(1234567890.5))).toBe("$1,234,567,890.50");
    expect(s(numberToCurrency(1234567891.5, { precision: 0 }))).toBe("$1,234,567,892");
    expect(
      s(
        numberToCurrency("-1234567890.50", {
          unit: raw("K&#269;"),
          format: "%n %u",
          negativeFormat: "%n - %u",
        }),
      ),
    ).toBe("1,234,567,890.50 - K&#269;");
    expect(s(numberToCurrency("1234567890.50", { unit: "&pound;" }))).toBe(
      "&amp;pound;1,234,567,890.50",
    );
    expect(s(numberToCurrency("1234567890.50", { format: "<b>%n</b> %u" }))).toBe(
      "&lt;b&gt;1,234,567,890.50&lt;/b&gt; $",
    );
    expect(s(numberToCurrency("-1234567890.50", { negativeFormat: "<b>%n</b> %u" }))).toBe(
      "&lt;b&gt;1,234,567,890.50&lt;/b&gt; $",
    );
    expect(s(numberToCurrency("-1234567890.50", { negativeFormat: "<b>%n</b> %u" }))).toBe(
      "&lt;b&gt;1,234,567,890.50&lt;/b&gt; $",
    );
    expect(
      s(
        numberToCurrency(1230000, {
          delimiterPattern: /(\d+?)(?=(\d\d)+(\d)(?!\d))/,
          unit: "₹",
          format: "%u %n",
        }),
      ),
    ).toBe("₹ 12,30,000.00");
  });

  it("number to percentage", () => {
    assertNil(numberToPercentage(null));
    expect(s(numberToPercentage(100))).toBe("100.000%");
    expect(s(numberToPercentage(100, { format: "%n %" }))).toBe("100.000 %");
    expect(s(numberToPercentage(100, { format: "<b>%n</b> %" }))).toBe(
      "&lt;b&gt;100.000&lt;/b&gt; %",
    );
    expect(s(numberToPercentage(100, { format: raw("<b>%n</b> %") }))).toBe("<b>100.000</b> %");
    expect(s(numberToPercentage(100, { precision: 0 }))).toBe("100%");
    expect(s(numberToPercentage(123.4, { precision: 3, stripInsignificantZeros: true }))).toBe(
      "123.4%",
    );
    expect(s(numberToPercentage(1000, { delimiter: ".", separator: "," }))).toBe("1.000,000%");
    expect(s(numberToPercentage("98a"))).toBe("98a%");
    expect(s(numberToPercentage(NaN))).toBe("NaN%");
    expect(s(numberToPercentage(Infinity))).toBe("Inf%");
    expect(s(numberToPercentage(NaN, { precision: 0 }))).toBe("NaN%");
    expect(s(numberToPercentage(Infinity, { precision: 0 }))).toBe("Inf%");
    expect(s(numberToPercentage(NaN, { precision: 1 }))).toBe("NaN%");
    expect(s(numberToPercentage(Infinity, { precision: 1 }))).toBe("Inf%");
  });

  it("number with delimiter", () => {
    assertNil(numberWithDelimiter(null));
    expect(s(numberWithDelimiter(12345678))).toBe("12,345,678");
    expect(s(numberWithDelimiter(0))).toBe("0");
  });

  it("number with precision", () => {
    assertNil(numberWithPrecision(null));
    expect(s(numberWithPrecision(-111.2346))).toBe("-111.235");
    expect(s(numberWithPrecision(111, { precision: 2 }))).toBe("111.00");
    expect(s(numberWithPrecision(0.001, { precision: 5 }))).toBe("0.00100");
    expect(s(numberWithPrecision(new Rational(10, 3), { precision: 2 }))).toBe("3.33");
  });

  it("number to human size", () => {
    assertNil(numberToHumanSize(null));
    expect(s(numberToHumanSize(3.14159265))).toBe("3 Bytes");
    expect(s(numberToHumanSize(1234567, { precision: 2 }))).toBe("1.2 MB");
  });

  it("number to human", () => {
    assertNil(numberToHuman(null));
    expect(s(numberToHuman(0))).toBe("0");
    expect(s(numberToHuman(1234))).toBe("1.23 Thousand");
    expect(s(numberToHuman(489000, { precision: 4, stripInsignificantZeros: false }))).toBe(
      "489.0 Thousand",
    );
  });

  it("number to human escape units", () => {
    const volume = {
      unit: "<b>ml</b>",
      thousand: "<b>lt</b>",
      million: "<b>m3</b>",
      trillion: "<b>km3</b>",
      quadrillion: "<b>Pl</b>",
    };
    expect(s(numberToHuman(123456, { units: volume }))).toBe("123 &lt;b&gt;lt&lt;/b&gt;");
    expect(s(numberToHuman(12, { units: volume }))).toBe("12 &lt;b&gt;ml&lt;/b&gt;");
    expect(s(numberToHuman(1234567, { units: volume }))).toBe("1.23 &lt;b&gt;m3&lt;/b&gt;");
    expect(s(numberToHuman(1_234_567_000_000, { units: volume }))).toBe(
      "1.23 &lt;b&gt;km3&lt;/b&gt;",
    );
    expect(s(numberToHuman(1_234_567_000_000_000, { units: volume }))).toBe(
      "1.23 &lt;b&gt;Pl&lt;/b&gt;",
    );

    const distance = {
      mili: "<b>mm</b>",
      centi: "<b>cm</b>",
      deci: "<b>dm</b>",
      unit: "<b>m</b>",
      ten: "<b>dam</b>",
      hundred: "<b>hm</b>",
      thousand: "<b>km</b>",
      micro: "<b>um</b>",
      nano: "<b>nm</b>",
      pico: "<b>pm</b>",
      femto: "<b>fm</b>",
    };
    expect(s(numberToHuman(0.00123, { units: distance }))).toBe("1.23 &lt;b&gt;mm&lt;/b&gt;");
    expect(s(numberToHuman(0.0123, { units: distance }))).toBe("1.23 &lt;b&gt;cm&lt;/b&gt;");
    expect(s(numberToHuman(0.123, { units: distance }))).toBe("1.23 &lt;b&gt;dm&lt;/b&gt;");
    expect(s(numberToHuman(1.23, { units: distance }))).toBe("1.23 &lt;b&gt;m&lt;/b&gt;");
    expect(s(numberToHuman(12.3, { units: distance }))).toBe("1.23 &lt;b&gt;dam&lt;/b&gt;");
    expect(s(numberToHuman(123, { units: distance }))).toBe("1.23 &lt;b&gt;hm&lt;/b&gt;");
    expect(s(numberToHuman(1230, { units: distance }))).toBe("1.23 &lt;b&gt;km&lt;/b&gt;");
    expect(s(numberToHuman(0.00000123, { units: distance }))).toBe("1.23 &lt;b&gt;um&lt;/b&gt;");
    expect(s(numberToHuman(0.00000000123, { units: distance }))).toBe("1.23 &lt;b&gt;nm&lt;/b&gt;");
    expect(s(numberToHuman(0.00000000000123, { units: distance }))).toBe(
      "1.23 &lt;b&gt;pm&lt;/b&gt;",
    );
    expect(s(numberToHuman(0.00000000000000123, { units: distance }))).toBe(
      "1.23 &lt;b&gt;fm&lt;/b&gt;",
    );
  });

  it("number helpers escape delimiter and separator", () => {
    expect(s(numberToPhone(1111111111, { delimiter: "<script></script>" }))).toBe(
      "111&lt;script&gt;&lt;/script&gt;111&lt;script&gt;&lt;/script&gt;1111",
    );

    expect(s(numberToCurrency(1.01, { separator: "<script></script>" }))).toBe(
      "$1&lt;script&gt;&lt;/script&gt;01",
    );
    expect(s(numberToCurrency(1000, { delimiter: "<script></script>" }))).toBe(
      "$1&lt;script&gt;&lt;/script&gt;000.00",
    );

    expect(s(numberToPercentage(1.01, { separator: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;010%",
    );
    expect(s(numberToPercentage(1000, { delimiter: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;000.000%",
    );

    expect(s(numberWithDelimiter(1.01, { separator: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;01",
    );
    expect(s(numberWithDelimiter(1000, { delimiter: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;000",
    );

    expect(s(numberWithPrecision(1.01, { separator: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;010",
    );
    expect(s(numberWithPrecision(1000, { delimiter: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;000.000",
    );

    expect(s(numberToHumanSize(10100, { separator: "<script></script>" }))).toBe(
      "9&lt;script&gt;&lt;/script&gt;86 KB",
    );

    expect(s(numberToHuman(1.01, { separator: "<script></script>" }))).toBe(
      "1&lt;script&gt;&lt;/script&gt;01",
    );
    expect(s(numberToHuman(10n ** 20n, { delimiter: "<script></script>" }))).toBe(
      "100&lt;script&gt;&lt;/script&gt;000 Quadrillion",
    );
  });

  it("number to human with custom translation scope", () => {
    try {
      I18n.backend().storeTranslations("ts", {
        custom_units_for_number_to_human: {
          mili: "mm",
          centi: "cm",
          deci: "dm",
          unit: "m",
          ten: "dam",
          hundred: "hm",
          thousand: "km",
        },
      });
      expect(
        s(numberToHuman(0.0101, { locale: "ts", units: "custom_units_for_number_to_human" })),
      ).toBe("1.01 cm");
    } finally {
      I18n.reloadBang();
    }
  });

  it("number helpers outputs are html safe", () => {
    expect(isHtmlSafe(numberToHuman(1))).toBeTruthy();
    expect(isHtmlSafe(numberToHuman("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberToHuman(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberToHuman(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberToHumanSize(1))).toBeTruthy();
    expect(isHtmlSafe(numberToHumanSize(1000000))).toBeTruthy();
    expect(isHtmlSafe(numberToHumanSize("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberToHumanSize(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberToHumanSize(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberWithPrecision(1, { stripInsignificantZeros: false }))).toBeTruthy();
    expect(isHtmlSafe(numberWithPrecision(1, { stripInsignificantZeros: true }))).toBeTruthy();
    expect(isHtmlSafe(numberWithPrecision("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberWithPrecision(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberWithPrecision(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberToCurrency(1))).toBeTruthy();
    expect(isHtmlSafe(numberToCurrency("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberToCurrency(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberToCurrency(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberToPercentage(1))).toBeTruthy();
    expect(isHtmlSafe(numberToPercentage("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberToPercentage(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberToPercentage(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberToPhone(1))).toBeTruthy();
    expect(s(numberToPhone("<script></script>"))).toBe("&lt;script&gt;&lt;/script&gt;");
    expect(isHtmlSafe(numberToPhone("<script></script>"))).toBeTruthy();
    expect(isHtmlSafe(numberToPhone(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberToPhone(raw("1")))).toBeTruthy();

    expect(isHtmlSafe(numberWithDelimiter(1))).toBeTruthy();
    expect(isHtmlSafe(numberWithDelimiter("<script></script>"))).toBeFalsy();
    expect(isHtmlSafe(numberWithDelimiter(raw("asdf")))).toBeTruthy();
    expect(isHtmlSafe(numberWithDelimiter(raw("1")))).toBeTruthy();
  });

  it("number helpers should raise error if invalid when specified", async () => {
    let exception = await assertRaises([InvalidNumberError], {}, () =>
      numberToHuman("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberToHumanSize("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberWithPrecision("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberToCurrency("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberToPercentage("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberWithDelimiter("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");

    exception = await assertRaises([InvalidNumberError], {}, () =>
      numberToPhone("x", { raise: true }),
    );
    expect((exception as InvalidNumberError).number).toBe("x");
  });

  it("number helpers should not raise error if valid when specified", () => {
    expect(() => numberToHuman("3.33", { raise: true })).not.toThrow();

    expect(() => numberToHumanSize("3.33", { raise: true })).not.toThrow();

    expect(() => numberWithPrecision("3.33", { raise: true })).not.toThrow();

    expect(() => numberToCurrency("3.33", { raise: true })).not.toThrow();

    expect(() => numberToPercentage("3.33", { raise: true })).not.toThrow();

    expect(() => numberWithDelimiter("3.33", { raise: true })).not.toThrow();

    expect(() => numberToPhone("3.33", { raise: true })).not.toThrow();
  });
});
