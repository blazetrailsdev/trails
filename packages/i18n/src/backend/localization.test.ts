/**
 * Mirrors: i18n/lib/i18n/tests/localization/date.rb and
 * i18n/lib/i18n/tests/localization/time.rb — the conformance mixins the gem
 * runs against the Simple backend in i18n/test/api/simple_test.rb.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, l, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { ArgumentError, MissingTranslationData } from "../exceptions.js";

/**
 * Stands in for Ruby's `::Date` — `localize` duck-types its object, so what a
 * test needs is `strftime`, `wday` and `mon`. The directives below are the
 * ones the gem's format strings use; `%a`/`%A`/`%b`/`%B`/`%p`/`%P` never reach
 * here, since `translate_localization_format` substitutes them first.
 */
class RubyDate {
  readonly utc: Date;

  constructor(year: number, month: number, day: number, hour = 0, min = 0, sec = 0) {
    this.utc = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
  }

  get wday(): number {
    return this.utc.getUTCDay();
  }

  get mon(): number {
    return this.utc.getUTCMonth() + 1;
  }

  strftime(format: string): string {
    const pad = (value: number, width = 2) => String(value).padStart(width, "0");
    return format.replace(/%(-?)([A-Za-z%])/g, (match, dash: string, directive: string) => {
      switch (directive) {
        case "d":
          return dash ? String(this.utc.getUTCDate()) : pad(this.utc.getUTCDate());
        case "m":
          return dash ? String(this.mon) : pad(this.mon);
        case "Y":
          return String(this.utc.getUTCFullYear());
        case "H":
          return pad(this.utc.getUTCHours());
        case "M":
          return pad(this.utc.getUTCMinutes());
        case "S":
          return pad(this.utc.getUTCSeconds());
        case "z":
          return "+0000";
        case "x":
          return `${pad(this.mon)}/${pad(this.utc.getUTCDate())}/${pad(
            this.utc.getUTCFullYear() % 100,
          )}`;
        case "%":
          return "%";
        default:
          return match;
      }
    });
  }
}

/** Ruby's `::Time` answers `hour` and `sec`, which is what routes a format
 * lookup to `time.formats` and picks the meridian. */
class RubyTime extends RubyDate {
  get hour(): number {
    return this.utc.getUTCHours();
  }

  get sec(): number {
    return this.utc.getUTCSeconds();
  }
}

function setupDateTranslations(backend: Simple): void {
  backend.storeTranslations("de", {
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

function setupTimeTranslations(backend: Simple): void {
  backend.storeTranslations("de", {
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

describe("I18nBackendSimpleLocalizationTest", () => {
  let date: RubyDate;
  let time: RubyTime;
  let otherTime: RubyTime;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    const backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
    setupDateTranslations(backend);
    setupTimeTranslations(backend);
    date = new RubyDate(2008, 3, 1);
    time = new RubyTime(2008, 3, 1, 6, 0);
    otherTime = new RubyTime(2008, 3, 1, 18, 0);
  });

  it("localize Date: given the short format it uses it", () => {
    expect(l(date, { format: Symbol.for("short"), locale: "de" })).toBe("01. Mär");
  });

  it("localize Date: given the long format it uses it", () => {
    expect(l(date, { format: Symbol.for("long"), locale: "de" })).toBe("01. März 2008");
  });

  it("localize Date: given the default format it uses it", () => {
    expect(l(date, { format: Symbol.for("default"), locale: "de" })).toBe("01.03.2008");
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
    expect(() => l(date, Object.freeze({ format: "%b", locale: "de" }))).not.toThrow();
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
    expect(() => l(date, { format: Symbol.for("missing") })).toThrow(MissingTranslationData);
  });

  it("localize Date: it does not alter the format string", () => {
    expect(l(new RubyDate(2009, 2, 1), { format: Symbol.for("long"), locale: "de" })).toBe(
      "01. Februar 2009",
    );
    expect(l(new RubyDate(2009, 10, 1), { format: Symbol.for("long"), locale: "de" })).toBe(
      "01. Oktober 2009",
    );
  });

  it("localize Time: given the short format it uses it", () => {
    expect(l(time, { format: Symbol.for("short"), locale: "de" })).toBe("01. Mär 06:00");
  });

  it("localize Time: given the long format it uses it", () => {
    expect(l(time, { format: Symbol.for("long"), locale: "de" })).toBe("01. März 2008 06:00");
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
    expect(l(new RubyTime(2008, 2, 1, 6, 0), { format: "%-d. %^B %Y", locale: "de" })).toBe(
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
    expect(() => l(time, { format: Symbol.for("missing") })).toThrow(MissingTranslationData);
  });
});
