import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n } from "./i18n.js";
import { en } from "./locale/en.js";
import { toSentence } from "./array-utils.js";
import { TimeZone } from "./values/time-zone.js";
import type { TimeWithZone } from "./time-with-zone.js";

/** `I18n.reload!` plus the `en` locale Rails re-reads from its load path. */
function reloadTranslations(): void {
  I18n.reloadBang();
  I18n.backend().storeTranslations("en", en);
}

const MONTHNAMES = [
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
];
const ABBR_MONTHNAMES = [
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
];

/**
 * Stands in for Ruby's `::Date` (`Date.parse("2008-7-2")` in `setup`), which
 * trails has no analogue of. `localize` duck-types its object
 * (i18n/lib/i18n/backend/base.rb:78-92): `Date` answers `strftime`, `wday` and
 * `mon` but not `sec`, which is what selects `date.formats` over
 * `time.formats` (base.rb:82). Mirrors the stand-in in
 * i18n/src/backend/localization.test.ts.
 */
class RubyDate {
  readonly utc: Date;

  constructor(year: number, month: number, day: number) {
    this.utc = new Date(Date.UTC(year, month - 1, day));
  }

  get wday(): number {
    return this.utc.getUTCDay();
  }

  get mon(): number {
    return this.utc.getUTCMonth() + 1;
  }

  strftime(format: string): string {
    return format.replace(/%([A-Za-z%])/g, (match, directive: string) => {
      switch (directive) {
        case "Y":
          return String(this.utc.getUTCFullYear());
        case "m":
          return String(this.mon).padStart(2, "0");
        case "d":
          return String(this.utc.getUTCDate()).padStart(2, "0");
        case "b":
          return ABBR_MONTHNAMES[this.mon]!;
        case "B":
          return MONTHNAMES[this.mon]!;
        case "%":
          return "%";
        default:
          return match;
      }
    });
  }
}

// Rails' activesupport/test/abstract_unit.rb:35 turns the check off for the
// whole suite.
I18n.setEnforceAvailableLocales(false);

describe("I18nTest", () => {
  let date: RubyDate;
  let time: TimeWithZone;

  beforeEach(() => {
    reloadTranslations();
    date = new RubyDate(2008, 7, 2);
    time = TimeZone.find("UTC").local(2008, 7, 2, 16, 47, 1);
  });

  afterEach(() => {
    reloadTranslations();
  });

  it("time zone localization with default format", () => {
    const now = TimeZone.find("UTC").local(2000, 1, 1);
    expect(I18n.localize(now)).toBe(now.strftime("%a, %d %b %Y %H:%M:%S %z"));
  });

  it("date localization should use default format", () => {
    expect(I18n.localize(date)).toBe(date.strftime("%Y-%m-%d"));
  });

  it("date localization with default format", () => {
    expect(I18n.localize(date, { format: ":default" })).toBe(date.strftime("%Y-%m-%d"));
  });

  it("date localization with short format", () => {
    expect(I18n.localize(date, { format: ":short" })).toBe(date.strftime("%b %d"));
  });

  it("date localization with long format", () => {
    expect(I18n.localize(date, { format: ":long" })).toBe(date.strftime("%B %d, %Y"));
  });

  it("time localization should use default format", () => {
    expect(I18n.localize(time)).toBe(time.strftime("%a, %d %b %Y %H:%M:%S %z"));
  });

  it("time localization with default format", () => {
    expect(I18n.localize(time, { format: ":default" })).toBe(
      time.strftime("%a, %d %b %Y %H:%M:%S %z"),
    );
  });

  it("time localization with short format", () => {
    expect(I18n.localize(time, { format: ":short" })).toBe(time.strftime("%d %b %H:%M"));
  });

  it("time localization with long format", () => {
    expect(I18n.localize(time, { format: ":long" })).toBe(time.strftime("%B %d, %Y %H:%M"));
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
