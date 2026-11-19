import { beforeEach, expect, it } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { MissingTranslationData } from "../../../../lib/exceptions.js";
import { config, l } from "../../../../lib/i18n.js";

export function testsLocalizationTime(): void {
  let time: RubyTime;
  let otherTime: RubyTime;

  beforeEach(() => {
    setupTimeTranslations();
    time = RubyTime.utc(2008, 3, 1, 6, 0);
    otherTime = RubyTime.utc(2008, 3, 1, 18, 0);
  });

  it("localize Time: given the short format it uses it", () => {
    expect(l(time, { format: ":short", locale: "de" })).toBe("01. Mär 06:00");
  });

  it("localize Time: given the long format it uses it", () => {
    expect(l(time, { format: ":long", locale: "de" })).toBe("01. März 2008 06:00");
  });

  it("localize Time: given a day name format it returns the correct day name", () => {
    expect(l(time, { format: "%A", locale: "de" })).toBe("Samstag");
  });

  it("localize Time: given a uppercased day name format it returns the correct day name in upcase", () => {
    expect(l(time, { format: "%^A", locale: "de" })).toBe("samstag".toUpperCase());
  });

  it("localize Time: given an abbreviated day name format it returns the correct abbreviated day name", () => {
    expect(l(time, { format: "%a", locale: "de" })).toBe("Sa");
  });

  it("localize Time: given an abbreviated and uppercased day name format it returns the correct abbreviated day name in upcase", () => {
    expect(l(time, { format: "%^a", locale: "de" })).toBe("sa".toUpperCase());
  });

  it("localize Time: given a month name format it returns the correct month name", () => {
    expect(l(time, { format: "%B", locale: "de" })).toBe("März");
  });

  it("localize Time: given a uppercased month name format it returns the correct month name in upcase", () => {
    expect(l(time, { format: "%^B", locale: "de" })).toBe("märz".toUpperCase());
  });

  it("localize Time: given an abbreviated month name format it returns the correct abbreviated month name", () => {
    expect(l(time, { format: "%b", locale: "de" })).toBe("Mär");
  });

  it("localize Time: given an abbreviated and uppercased month name format it returns the correct abbreviated month name in upcase", () => {
    expect(l(time, { format: "%^b", locale: "de" })).toBe("mär".toUpperCase());
  });

  it("localize Time: given a date format with the month name upcased it returns the correct value", () => {
    expect(l(RubyTime.utc(2008, 2, 1, 6, 0), { format: "%-d. %^B %Y", locale: "de" })).toBe(
      "1. FEBRUAR 2008",
    );
  });

  it("localize Time: given missing translations it returns the correct error message", () => {
    expect(l(time, { format: "%b", locale: "fr" })).toBe(
      "Translation missing: fr.date.abbr_month_names",
    );
  });

  it("localize Time: given a meridian indicator format it returns the correct meridian indicator", () => {
    expect(l(time, { format: "%p", locale: "de" })).toBe("AM");
    expect(l(otherTime, { format: "%p", locale: "de" })).toBe("PM");
  });

  it("localize Time: given a meridian indicator format it returns the correct meridian indicator in upcase", () => {
    expect(l(time, { format: "%P", locale: "de" })).toBe("am");
    expect(l(otherTime, { format: "%P", locale: "de" })).toBe("pm");
  });

  it("localize Time: given an unknown format it does not fail", () => {
    expect(() => l(time, { format: "%x" })).not.toThrow();
  });

  it("localize Time: given a format is missing it raises I18n::MissingTranslationData", () => {
    expect(() => l(time, { format: ":missing" })).toThrow(MissingTranslationData);
  });
}

export function setupTimeTranslations(): void {
  config().backend.storeTranslations("de", {
    time: {
      formats: {
        default: "%a, %d. %b %Y %H:%M:%S %z",
        short: "%d. %b %H:%M",
        long: "%d. %B %Y %H:%M",
      },
      am: "am",
      pm: "pm",
    },
  });
}
