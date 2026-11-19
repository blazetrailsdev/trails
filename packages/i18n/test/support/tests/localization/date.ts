import { beforeEach, expect, it } from "vitest";
import { Date as RubyDate } from "@blazetrails/date";
import { ArgumentError, MissingTranslationData } from "../../../../lib/exceptions.js";
import { config, l } from "../../../../lib/i18n.js";

export function testsLocalizationDate(): void {
  let date: RubyDate;

  beforeEach(() => {
    setupDateTranslations();
    date = new RubyDate(2008, 3, 1);
  });

  it("localize Date: given the short format it uses it", () => {
    expect(l(date, { format: ":short", locale: "de" })).toBe("01. Mär");
  });

  it("localize Date: given the long format it uses it", () => {
    expect(l(date, { format: ":long", locale: "de" })).toBe("01. März 2008");
  });

  it("localize Date: given the default format it uses it", () => {
    expect(l(date, { format: ":default", locale: "de" })).toBe("01.03.2008");
  });

  it("localize Date: given a day name format it returns the correct day name", () => {
    expect(l(date, { format: "%A", locale: "de" })).toBe("Samstag");
  });

  it("localize Date: given a uppercased day name format it returns the correct day name in upcase", () => {
    expect(l(date, { format: "%^A", locale: "de" })).toBe("samstag".toUpperCase());
  });

  it("localize Date: given an abbreviated day name format it returns the correct abbreviated day name", () => {
    expect(l(date, { format: "%a", locale: "de" })).toBe("Sa");
  });

  it("localize Date: given an meridian indicator format it returns the correct meridian indicator", () => {
    expect(l(date, { format: "%p", locale: "de" })).toBe("AM");
    expect(l(date, { format: "%P", locale: "de" })).toBe("am");
  });

  it("localize Date: given an abbreviated and uppercased day name format it returns the correct abbreviated day name in upcase", () => {
    expect(l(date, { format: "%^a", locale: "de" })).toBe("sa".toUpperCase());
  });

  it("localize Date: given a month name format it returns the correct month name", () => {
    expect(l(date, { format: "%B", locale: "de" })).toBe("März");
  });

  it("localize Date: given a uppercased month name format it returns the correct month name in upcase", () => {
    expect(l(date, { format: "%^B", locale: "de" })).toBe("märz".toUpperCase());
  });

  it("localize Date: given an abbreviated month name format it returns the correct abbreviated month name", () => {
    expect(l(date, { format: "%b", locale: "de" })).toBe("Mär");
  });

  it("localize Date: given an abbreviated and uppercased month name format it returns the correct abbreviated month name in upcase", () => {
    expect(l(date, { format: "%^b", locale: "de" })).toBe("mär".toUpperCase());
  });

  it("localize Date: given a date format with the month name upcased it returns the correct value", () => {
    expect(l(new RubyDate(2008, 2, 1), { format: "%-d. %^B %Y", locale: "de" })).toBe(
      "1. FEBRUAR 2008",
    );
  });

  it("localize Date: given missing translations it returns the correct error message", () => {
    expect(l(date, { format: "%b", locale: "fr" })).toBe(
      "Translation missing: fr.date.abbr_month_names",
    );
  });

  it("localize Date: given an unknown format it does not fail", () => {
    expect(() => l(date, { format: "%x" })).not.toThrow();
  });

  it("localize Date: does not modify the options hash", () => {
    const options = { format: "%b", locale: "de" };
    expect(l(date, options)).toBe("Mär");
    expect(options).toEqual({ format: "%b", locale: "de" });
    expect(() => l(date, Object.freeze(options))).not.toThrow();
  });

  it("localize Date: given nil with default value it returns default", () => {
    expect(l(null, { default: "default" })).toBe("default");
  });

  it("localize Date: given nil it raises I18n::ArgumentError", () => {
    expect(() => l(null)).toThrow(ArgumentError);
  });

  it("localize Date: given a plain Object it raises I18n::ArgumentError", () => {
    expect(() => l({})).toThrow(ArgumentError);
  });

  it("localize Date: given a format is missing it raises I18n::MissingTranslationData", () => {
    expect(() => l(date, { format: ":missing" })).toThrow(MissingTranslationData);
  });

  it("localize Date: it does not alter the format string", () => {
    expect(l(RubyDate.parse("2009-02-01"), { format: ":long", locale: "de" })).toBe(
      "01. Februar 2009",
    );
    expect(l(RubyDate.parse("2009-10-01"), { format: ":long", locale: "de" })).toBe(
      "01. Oktober 2009",
    );
  });
}

export function setupDateTranslations(): void {
  config().backend.storeTranslations("de", {
    date: {
      formats: {
        default: "%d.%m.%Y",
        short: "%d. %b",
        long: "%d. %B %Y",
      },
      day_names: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
      abbr_day_names: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
      month_names: [
        null,
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
      ],
      abbr_month_names: [
        null,
        "Jan",
        "Feb",
        "Mär",
        "Apr",
        "Mai",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Okt",
        "Nov",
        "Dez",
      ],
    },
  });
}
