import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n } from "./i18n.js";
import {
  numberToCurrency,
  numberToRounded,
  numberWithDelimiter,
  numberToPercentage,
  numberToHumanSize,
  numberToHuman,
} from "./number-helper.js";

function setupTranslations(): void {
  I18n.backend.storeTranslations("ts", {
    number: {
      format: {
        precision: 3,
        round_mode: "half_even",
        delimiter: ",",
        separator: ".",
        significant: false,
        strip_insignificant_zeros: false,
      },
      currency: {
        format: { unit: "&$", format: "%u - %n", negative_format: "(%u - %n)", precision: 2 },
      },
      human: {
        format: {
          precision: 2,
          significant: true,
          strip_insignificant_zeros: true,
        },
        storage_units: {
          format: "%n %u",
          units: {
            byte: "b",
            kb: "k",
          },
        },
        decimal_units: {
          format: "%n %u",
          units: {
            deci: { one: "Tenth", other: "Tenths" },
            unit: "u",
            ten: { one: "Ten", other: "Tens" },
            thousand: "t",
            million: "m",
            billion: "b",
            trillion: "t",
            quadrillion: "q",
          },
        },
      },
      percentage: { format: { delimiter: "", precision: 2, strip_insignificant_zeros: true } },
      precision: { format: { delimiter: "", significant: true } },
    },
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

  I18n.backend.storeTranslations("empty", {});
}

describe("NumberHelperI18nTest", () => {
  beforeEach(() => {
    I18n.backend.reload();
    I18n.loadDefaults();
    setupTranslations();
  });

  afterEach(() => {
    I18n.backend.reload();
    I18n.loadDefaults();
  });

  it("number to i18n currency", () => {
    expect(numberToCurrency(10, { locale: "ts" })).toBe("&$ - 10.00");
    expect(numberToCurrency(-10, { locale: "ts" })).toBe("(&$ - 10.00)");
    expect(numberToCurrency(-10, { locale: "ts", format: "%n - %u" })).toBe("-10.00 - &$");
  });

  it("number to currency with empty i18n store", () => {
    expect(numberToCurrency(10, { locale: "empty" })).toBe("$10.00");
    expect(numberToCurrency(-10, { locale: "empty" })).toBe("-$10.00");
  });

  it("locale default format has precedence over helper defaults", () => {
    I18n.backend.storeTranslations("ts", {
      number: { format: { separator: ";" } },
    });

    expect(numberToCurrency(10, { locale: "ts" })).toBe("&$ - 10;00");
  });

  it("number to currency without currency negative format", () => {
    I18n.backend.storeTranslations("no_negative_format", {
      number: {
        currency: { format: { unit: "@", format: "%n %u" } },
      },
    });

    expect(numberToCurrency(-10, { locale: "no_negative_format" })).toBe("-10.00 @");
  });

  it("number with i18n precision", () => {
    expect(numberToRounded(10000, { locale: "ts" })).toBe("10000");
    expect(numberToRounded(1.0, { locale: "ts" })).toBe("1.00");
  });

  it("number with i18n round mode", () => {
    expect(numberToRounded(12344.5, { locale: "ts", precision: 0 })).toBe("12344");
  });

  it("number with i18n precision and empty i18n store", () => {
    // eslint-disable-next-line no-loss-of-precision
    expect(numberToRounded(123456789.123456789, { locale: "empty" })).toBe("123456789.123");
    expect(numberToRounded(1.0, { locale: "empty" })).toBe("1.000");
  });

  it("number with i18n delimiter", () => {
    expect(numberWithDelimiter(1000000.234, { locale: "ts" })).toBe("1,000,000.234");
  });

  it("number with i18n delimiter and empty i18n store", () => {
    expect(numberWithDelimiter(1000000.234, { locale: "empty" })).toBe("1,000,000.234");
  });

  it("number to i18n percentage", () => {
    expect(numberToPercentage(1, { locale: "ts" })).toBe("1%");
    expect(numberToPercentage(1.2434, { locale: "ts" })).toBe("1.24%");
    expect(numberToPercentage(12434, { locale: "ts" })).toBe("12434%");
  });

  it("number to i18n percentage and empty i18n store", () => {
    expect(numberToPercentage(1, { locale: "empty" })).toBe("1.000%");
    expect(numberToPercentage(1.2434, { locale: "empty" })).toBe("1.243%");
    expect(numberToPercentage(12434, { locale: "empty" })).toBe("12434.000%");
  });

  it("number to i18n human size", () => {
    expect(numberToHumanSize(2048, { locale: "ts" })).toBe("2 k");
    expect(numberToHumanSize(42, { locale: "ts" })).toBe("42 b");
  });

  it("number to i18n human size with empty i18n store", () => {
    expect(numberToHumanSize(2048, { locale: "empty" })).toBe("2 KB");
    expect(numberToHumanSize(42, { locale: "empty" })).toBe("42 Bytes");
  });

  it("number to human with default translation scope", () => {
    expect(numberToHuman(2000, { locale: "ts" })).toBe("2 t");
    expect(numberToHuman(1234567890, { locale: "ts" })).toBe("1.2 b");
    expect(numberToHuman(0.1, { locale: "ts" })).toBe("1 Tenth");
    expect(numberToHuman(0.134, { locale: "ts" })).toBe("1.3 Tenth");
    expect(numberToHuman(0.2, { locale: "ts" })).toBe("2 Tenths");
    expect(numberToHuman(10, { locale: "ts" })).toBe("1 Ten");
    expect(numberToHuman(12, { locale: "ts" })).toBe("1.2 Ten");
    expect(numberToHuman(20, { locale: "ts" })).toBe("2 Tens");
  });

  it("number to human with empty i18n store", () => {
    expect(numberToHuman(2000, { locale: "empty" })).toBe("2 Thousand");
    expect(numberToHuman(1234567890, { locale: "empty" })).toBe("1.23 Billion");
  });

  it("number to human with custom translation scope", () => {
    expect(
      numberToHuman(0.0432, {
        locale: "ts",
        units: "custom_units_for_number_to_human",
      }),
    ).toBe("4.3 cm");
  });
});
