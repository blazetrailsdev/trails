import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n } from "./i18n.js";
import { en } from "./locale/en.js";
import { toSentence } from "./array-utils.js";

/** `I18n.reload!` plus the `en` locale Rails re-reads from its load path. */
function reloadTranslations(): void {
  I18n.reloadBang();
  I18n.backend().storeTranslations("en", en);
}

// Rails' activesupport/test/abstract_unit.rb:35 turns the check off for the
// whole suite.
I18n.setEnforceAvailableLocales(false);

describe("I18nTest", () => {
  beforeEach(() => {
    reloadTranslations();
  });

  afterEach(() => {
    reloadTranslations();
  });

  it("day names", () => {
    expect(I18n.translate("date.day_names")).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("abbr day names", () => {
    expect(I18n.translate("date.abbr_day_names")).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("month names", () => {
    expect(I18n.translate("date.month_names")).toEqual([
      null,
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]);
  });

  it("abbr month names", () => {
    expect(I18n.translate("date.abbr_month_names")).toEqual([
      null,
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
  });

  it("date order", () => {
    expect(I18n.translate("date.order")).toEqual(["year", "month", "day"]);
  });

  it("time am", () => {
    expect(I18n.translate("time.am")).toBe("am");
  });

  it("time pm", () => {
    expect(I18n.translate("time.pm")).toBe("pm");
  });

  it("words connector", () => {
    expect(I18n.translate("support.array.words_connector")).toBe(", ");
  });

  it("two words connector", () => {
    expect(I18n.translate("support.array.two_words_connector")).toBe(" and ");
  });

  it("last word connector", () => {
    expect(I18n.translate("support.array.last_word_connector")).toBe(", and ");
  });

  it("to sentence", () => {
    expect(toSentence(["a", "b", "c"])).toBe("a, b, and c");

    I18n.backend().storeTranslations("en", {
      support: { array: { two_words_connector: " & " } },
    });
    const twoWords = I18n.translate("support.array.two_words_connector") as string;
    expect(toSentence(["a", "b"], { twoWordsConnector: twoWords })).toBe("a & b");

    I18n.backend().storeTranslations("en", {
      support: { array: { last_word_connector: " and " } },
    });
    const lastWord = I18n.translate("support.array.last_word_connector") as string;
    expect(toSentence(["a", "b", "c"], { lastWordConnector: lastWord })).toBe("a, b and c");
  });

  it("to sentence with empty i18n store", () => {
    expect(toSentence(["a", "b", "c"])).toBe("a, b, and c");
  });

  it("ordinals resolve through the number.nth lambdas", () => {
    expect(I18n.translate("number.nth.ordinals", { number: 1 })).toBe("st");
    expect(I18n.translate("number.nth.ordinalized", { number: 2 })).toBe("2nd");
  });
});
