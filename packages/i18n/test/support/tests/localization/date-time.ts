import { beforeEach, expect, it } from "vitest";
import { DateTime as RubyDateTime } from "@blazetrails/date";
import { MissingTranslationData } from "../../../../lib/exceptions.js";
import { config, l } from "../../../../lib/i18n.js";

export function testsLocalizationDateTime(): void {
  let datetime: RubyDateTime;
  let otherDatetime: RubyDateTime;

  beforeEach(() => {
    setupDatetimeTranslations();
    datetime = new RubyDateTime(2008, 3, 1, 6);
    otherDatetime = new RubyDateTime(2008, 3, 1, 18);
  });

  it("localize DateTime: given the short format it uses it", () => {
    expect(l(datetime, { format: ":short", locale: "de" })).toBe("01. Mär 06:00");
  });

  it("localize DateTime: given the long format it uses it", () => {
    expect(l(datetime, { format: ":long", locale: "de" })).toBe("01. März 2008 06:00");
  });

  it("localize DateTime: given the default format it uses it", () => {
    expect(l(datetime, { format: ":default", locale: "de" })).toBe(
      "Sa, 01. Mär 2008 06:00:00 +0000",
    );
  });

  it("localize DateTime: given a day name format it returns the correct day name", () => {
    expect(l(datetime, { format: "%A", locale: "de" })).toBe("Samstag");
  });

  it("localize DateTime: given a uppercased day name format it returns the correct day name in upcase", () => {
    expect(l(datetime, { format: "%^A", locale: "de" })).toBe("samstag".toUpperCase());
  });

  it("localize DateTime: given an abbreviated day name format it returns the correct abbreviated day name", () => {
    expect(l(datetime, { format: "%a", locale: "de" })).toBe("Sa");
  });

  it("localize DateTime: given an abbreviated and uppercased day name format it returns the correct abbreviated day name in upcase", () => {
    expect(l(datetime, { format: "%^a", locale: "de" })).toBe("sa".toUpperCase());
  });

  it("localize DateTime: given a month name format it returns the correct month name", () => {
    expect(l(datetime, { format: "%B", locale: "de" })).toBe("März");
  });

  it("localize DateTime: given a uppercased month name format it returns the correct month name in upcase", () => {
    expect(l(datetime, { format: "%^B", locale: "de" })).toBe("märz".toUpperCase());
  });

  it("localize DateTime: given an abbreviated month name format it returns the correct abbreviated month name", () => {
    expect(l(datetime, { format: "%b", locale: "de" })).toBe("Mär");
  });

  it("localize DateTime: given an abbreviated and uppercased month name format it returns the correct abbreviated month name in upcase", () => {
    expect(l(datetime, { format: "%^b", locale: "de" })).toBe("mär".toUpperCase());
  });

  it("localize DateTime: given a date format with the month name upcased it returns the correct value", () => {
    expect(l(new RubyDateTime(2008, 2, 1, 6), { format: "%-d. %^B %Y", locale: "de" })).toBe(
      "1. FEBRUAR 2008",
    );
  });

  it("localize DateTime: given missing translations it returns the correct error message", () => {
    expect(l(datetime, { format: "%b", locale: "fr" })).toBe(
      "Translation missing: fr.date.abbr_month_names",
    );
  });

  it("localize DateTime: given a meridian indicator format it returns the correct meridian indicator", () => {
    expect(l(datetime, { format: "%p", locale: "de" })).toBe("AM");
    expect(l(otherDatetime, { format: "%p", locale: "de" })).toBe("PM");
  });

  it("localize DateTime: given a meridian indicator format it returns the correct meridian indicator in downcase", () => {
    expect(l(datetime, { format: "%P", locale: "de" })).toBe("am");
    expect(l(otherDatetime, { format: "%P", locale: "de" })).toBe("pm");
  });

  it("localize DateTime: given an unknown format it does not fail", () => {
    expect(() => l(datetime, { format: "%x" })).not.toThrow();
  });

  it("localize DateTime: given a format is missing it raises I18n::MissingTranslationData", () => {
    expect(() => l(datetime, { format: ":missing" })).toThrow(MissingTranslationData);
  });
}

export function setupDatetimeTranslations(): void {
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
