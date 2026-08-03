/**
 * Mirrors: i18n/lib/i18n/tests/localization/date.rb,
 * i18n/lib/i18n/tests/localization/time.rb,
 * i18n/lib/i18n/tests/localization/date_time.rb and
 * i18n/lib/i18n/tests/localization/procs.rb — the conformance mixins the gem
 * runs against the Simple backend in i18n/test/api/simple_test.rb.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, l, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { ArgumentError, MissingTranslationData, inspect } from "../exceptions.js";

/**
 * Stands in for Ruby's `::Date` — `localize` duck-types its object, so what a
 * test needs is `strftime`, `wday` and `mon`. The directives below are the
 * ones the gem's format strings use. `%a`/`%A`/`%b`/`%B`/`%p`/`%P` never reach
 * here through `localize`, since `translate_localization_format` substitutes
 * them first — but the Procs mixin's `inspect_args` calls `strftime` directly,
 * so `%a` and `%b` still answer the English names Ruby's core `strftime` gives.
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

  /** What `%Z` answers: `::Date` and `::DateTime` give the UTC offset. */
  get zone(): string {
    return "+00:00";
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
        case "Z":
          return this.zone;
        case "a":
          return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][this.wday];
        case "b":
          return [
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
          ][this.mon - 1];
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

  /** `Time.utc(...).strftime('%Z')` is `"UTC"`, not an offset. */
  override get zone(): string {
    return "UTC";
  }
}

/** Ruby's `::DateTime` — a `::Date` that answers `hour` and `sec` too, so it
 * routes to `time.formats` like `::Time` does but keeps `::Date`'s `%Z`. */
class RubyDateTime extends RubyTime {
  override get zone(): string {
    return "+00:00";
  }
}

function setupDateTranslations(): void {
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

function setupTimeTranslations(): void {
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

function setupDatetimeTranslations(): void {
  // time translations might have been set up in Tests::Api::Localization::Time
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

/**
 * Ruby's lambda takes `|*args, **kwargs|`; `resolve` calls it with the object
 * and the options hash, which is the two-parameter shape here.
 */
function inspectArgs(args: unknown[], kwargs: Record<string, unknown>): string {
  args.push(kwargs);
  args = args.map((arg) => {
    if (arg instanceof RubyTime) {
      return arg.strftime("%a, %d %b %Y %H:%M:%S %Z").replace("+0000", "+00:00");
    }
    if (arg instanceof RubyDate) {
      return arg.strftime("%a, %d %b %Y");
    }
    if (typeof arg === "object" && arg !== null) {
      delete (arg as Record<string, unknown>).fallbackInProgress;
      delete (arg as Record<string, unknown>).fallbackOriginalLocale;
      return inspect(arg);
    }
    return inspect(arg);
  });
  return `[${args.join(", ")}]`;
}

function setupTimeProcTranslations(): void {
  config().backend.storeTranslations("ru", {
    time: {
      formats: {
        proc: (object: unknown, options: Record<string, unknown>) => inspectArgs([object], options),
      },
    },
    date: {
      formats: {
        proc: (object: unknown, options: Record<string, unknown>) => inspectArgs([object], options),
      },
      day_names: (_key: unknown, options: Record<string, unknown>) =>
        /^%A/.test(options.format as string)
          ? ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]
          : ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
      month_names: (_key: unknown, options: Record<string, unknown>) =>
        /(%d|%e)(\s*)?(%B)/.test(options.format as string)
          ? [
              null,
              "января",
              "февраля",
              "марта",
              "апреля",
              "мая",
              "июня",
              "июля",
              "августа",
              "сентября",
              "октября",
              "ноября",
              "декабря",
            ]
          : [
              null,
              "Январь",
              "Февраль",
              "Март",
              "Апрель",
              "Май",
              "Июнь",
              "Июль",
              "Август",
              "Сентябрь",
              "Октябрь",
              "Ноябрь",
              "Декабрь",
            ],
      abbr_month_names: (_key: unknown, options: Record<string, unknown>) =>
        /(%d|%e)(\s*)(%b)/.test(options.format as string)
          ? [
              null,
              "янв.",
              "февр.",
              "марта",
              "апр.",
              "мая",
              "июня",
              "июля",
              "авг.",
              "сент.",
              "окт.",
              "нояб.",
              "дек.",
            ]
          : [
              null,
              "янв.",
              "февр.",
              "март",
              "апр.",
              "май",
              "июнь",
              "июль",
              "авг.",
              "сент.",
              "окт.",
              "нояб.",
              "дек.",
            ],
    },
  });
}

describe("I18nSimpleBackendApiTest", () => {
  let date: RubyDate;
  let time: RubyTime;
  let otherTime: RubyTime;
  let datetime: RubyDateTime;
  let otherDatetime: RubyDateTime;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Simple();
    config().enforceAvailableLocales = false;
    setupDateTranslations();
    setupTimeTranslations();
    date = new RubyDate(2008, 3, 1);
    time = new RubyTime(2008, 3, 1, 6, 0);
    otherTime = new RubyTime(2008, 3, 1, 18, 0);
    setupDatetimeTranslations();
    datetime = new RubyDateTime(2008, 3, 1, 6);
    otherDatetime = new RubyDateTime(2008, 3, 1, 18);
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
    expect(() => l(date, { format: ":missing" })).toThrow(MissingTranslationData);
  });

  it("localize Date: it does not alter the format string", () => {
    expect(l(new RubyDate(2009, 2, 1), { format: ":long", locale: "de" })).toBe("01. Februar 2009");
    expect(l(new RubyDate(2009, 10, 1), { format: ":long", locale: "de" })).toBe(
      "01. Oktober 2009",
    );
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
    expect(() => l(time, { format: ":missing" })).toThrow(MissingTranslationData);
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

  it("localize: using day names from lambdas", () => {
    setupTimeProcTranslations();
    const time = new RubyTime(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%A, %d %B", locale: "ru" })).toMatch(/Суббота/);
    expect(l(time, { format: "%d %B (%A)", locale: "ru" })).toMatch(/суббота/);
  });

  it("localize: using month names from lambdas", () => {
    setupTimeProcTranslations();
    const time = new RubyTime(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%d %B %Y", locale: "ru" })).toMatch(/марта/);
    expect(l(time, { format: "%B %Y", locale: "ru" })).toMatch(/Март /);
  });

  it("localize: using abbreviated day names from lambdas", () => {
    setupTimeProcTranslations();
    const time = new RubyTime(2008, 3, 1, 6, 0);
    expect(l(time, { format: "%d %b %Y", locale: "ru" })).toMatch(/марта/);
    expect(l(time, { format: "%b %Y", locale: "ru" })).toMatch(/март /);
  });

  it("localize Date: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const date = new RubyDate(2008, 3, 1);
    expect(l(date, { format: ":proc", locale: "ru" })).toBe("[Sat, 01 Mar 2008, {}]");
  });

  it("localize Date: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const date = new RubyDate(2008, 3, 1);
    expect(l(date, { format: ":proc", foo: "foo", locale: "ru" })).toBe(
      `[Sat, 01 Mar 2008, ${inspect({ foo: "foo" })}]`,
    );
  });

  it("localize DateTime: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect(l(datetime, { format: ":proc", locale: "ru" })).toBe(
      "[Sat, 01 Mar 2008 06:00:00 +00:00, {}]",
    );
  });

  it("localize DateTime: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const datetime = new RubyDateTime(2008, 3, 1, 6);
    expect(l(datetime, { format: ":proc", foo: "foo", locale: "ru" })).toBe(
      `[Sat, 01 Mar 2008 06:00:00 +00:00, ${inspect({ foo: "foo" })}]`,
    );
  });

  it("localize Time: given a format that resolves to a Proc it calls the Proc with the object", () => {
    setupTimeProcTranslations();
    const time = new RubyTime(2008, 3, 1, 6, 0);
    expect(l(time, { format: ":proc", locale: "ru" })).toBe(inspectArgs([time], {}));
  });

  it("localize Time: given a format that resolves to a Proc it calls the Proc with the object and extra options", () => {
    setupTimeProcTranslations();
    const time = new RubyTime(2008, 3, 1, 6, 0);
    const options = { foo: "foo" };
    expect(l(time, { ...options, format: ":proc", locale: "ru" })).toBe(
      inspectArgs([time], options),
    );
  });
});
