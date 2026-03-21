import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n } from "./i18n.js";
import { toSentence } from "./array-utils.js";

describe("I18nTest", () => {
  let date: Date;
  let time: Date;

  beforeEach(() => {
    I18n.loadDefaults();
    date = new Date(2008, 6, 2); // July 2, 2008 local midnight
    time = new Date(2008, 6, 2, 16, 47, 1); // July 2, 2008 16:47:01 local time
  });

  afterEach(() => {
    I18n.loadDefaults();
  });

  it("time zone localization with default format", () => {
    const now = new Date(2000, 0, 1); // Jan 1, 2000 local
    const result = I18n.localize(now, { type: "time" });
    expect(typeof result).toBe("string");
    expect(result).toMatch(/Sat, 01 Jan 2000 00:00:00/);
  });

  it("date localization should use default format", () => {
    expect(I18n.localize(date, { type: "date" })).toBe("2008-07-02");
  });

  it("date localization with default format", () => {
    expect(I18n.localize(date, { type: "date", format: "default" })).toBe("2008-07-02");
  });

  it("date localization with short format", () => {
    expect(I18n.localize(date, { type: "date", format: "short" })).toBe("Jul 02");
  });

  it("date localization with long format", () => {
    expect(I18n.localize(date, { type: "date", format: "long" })).toBe("July 02, 2008");
  });

  it("time localization should use default format", () => {
    const result = I18n.localize(time, { type: "time" });
    expect(result).toMatch(/Wed, 02 Jul 2008 16:47:01/);
  });

  it("time localization with default format", () => {
    const result = I18n.localize(time, { type: "time", format: "default" });
    expect(result).toMatch(/Wed, 02 Jul 2008 16:47:01/);
  });

  it("time localization with short format", () => {
    expect(I18n.localize(time, { type: "time", format: "short" })).toBe("02 Jul 16:47");
  });

  it("time localization with long format", () => {
    expect(I18n.localize(time, { type: "time", format: "long" })).toBe("July 02, 2008 16:47");
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

    I18n.backend.storeTranslations("en", {
      support: { array: { two_words_connector: " & " } },
    });
    const twoWords = I18n.translate("support.array.two_words_connector") as string;
    expect(toSentence(["a", "b"], { twoWordsConnector: twoWords })).toBe("a & b");

    I18n.backend.storeTranslations("en", {
      support: { array: { last_word_connector: " and " } },
    });
    const lastWord = I18n.translate("support.array.last_word_connector") as string;
    expect(toSentence(["a", "b", "c"], { lastWordConnector: lastWord })).toBe("a, b and c");
  });

  it("to sentence with empty i18n store", () => {
    expect(toSentence(["a", "b", "c"])).toBe("a, b, and c");
  });
});
