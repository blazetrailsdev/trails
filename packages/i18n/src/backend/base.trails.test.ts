import { beforeEach, describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Simple } from "./simple.js";
import { config, l, resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import {
  ArgumentError,
  InvalidLocale,
  InvalidPluralizationData,
  MissingTranslation,
  ReservedInterpolationKey,
} from "../exceptions.js";
import { ThrownException, catchException } from "../throw-catch.js";
import type { TranslateOptions } from "./base.js";

describe("I18n::Backend::Base", () => {
  let backend: Simple;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  function translate(key: string | null, options: TranslateOptions = {}): unknown {
    return backend.translate("en", key, options);
  }

  it("raises ArgumentError given an empty String or Symbol key", () => {
    expect(() => translate("")).toThrow(ArgumentError);
  });

  it("raises InvalidLocale given no locale", () => {
    expect(() => backend.translate(null, "foo")).toThrow(InvalidLocale);
  });

  it("throws MissingTranslation when the key is missing", () => {
    expect(() => translate("missing")).toThrow(ThrownException);

    const thrown = catchException(() => translate("missing.key")) as MissingTranslation;
    expect(thrown).toBeInstanceOf(MissingTranslation);
    expect(thrown.message).toBe("Translation missing: en.missing.key");
  });

  it("does not throw when an explicit nil default is given", () => {
    expect(translate("missing", { default: null })).toBeNull();
  });

  it("walks an array of defaults and resolves the first hit", () => {
    backend.storeTranslations("en", { fallback: "Fallback" });
    expect(translate("missing", { default: [":also_missing", "Literal"] })).toBe("Literal");
    expect(translate("missing", { default: [":fallback"] })).toBe("Fallback");
  });

  it("resolves a Symbol entry through the configured backend", () => {
    backend.storeTranslations("en", { target: "Target", alias: ":target" });
    expect(translate("alias")).toBe("Target");
  });

  it("deletes the object option from the options passed to a Proc entry", () => {
    let seen: TranslateOptions | undefined;
    const options: TranslateOptions = { object: "subject", other: 1 };
    backend.storeTranslations("en", {
      proc_entry: (value: unknown, opts: TranslateOptions) => {
        seen = opts;
        return value;
      },
    });

    expect(translate("proc_entry", options)).toBe("subject");
    expect(seen).not.toHaveProperty("object");
    expect(options).not.toHaveProperty("object");
  });

  it("falls through to the object argument when the object option is false", () => {
    backend.storeTranslations("en", {
      proc_entry: (value: unknown) => value,
    });

    expect(translate("proc_entry", { object: false })).toBe("proc_entry");
  });

  it("raises InvalidPluralizationData when the pluralization key is missing", () => {
    backend.storeTranslations("en", { stars: { one: "one star" } });
    expect(() => translate("stars", { count: 2 })).toThrow(InvalidPluralizationData);
  });

  it("picks the zero subkey only when it is present", () => {
    backend.storeTranslations("en", {
      with_zero: { zero: "none", one: "one", other: "many" },
      without_zero: { one: "one", other: "many" },
    });
    expect(translate("with_zero", { count: 0 })).toBe("none");
    expect(translate("without_zero", { count: 0 })).toBe("many");
  });

  it("ignores the attributes subkey when pluralizing", () => {
    backend.storeTranslations("en", {
      stars: { one: "one star", other: "many stars", attributes: { name: "Name" } },
    });
    expect(translate("stars", { count: 1 })).toBe("one star");
  });

  it("deep interpolates when deepInterpolation is set", () => {
    backend.storeTranslations("en", { people: { ann: "Ann is %{ann}", john: "John is %{john}" } });
    expect(translate("people", { deepInterpolation: true, ann: "good", john: "big" })).toEqual({
      ann: "Ann is good",
      john: "John is big",
    });
  });

  it("raises ReservedInterpolationKey when an entry uses a reserved key", () => {
    backend.storeTranslations("en", { reserved: "an entry with %{scope}" });
    expect(() => translate("reserved")).toThrow(ReservedInterpolationKey);
  });

  it("exists reports whether a key resolves", () => {
    backend.storeTranslations("en", { foo: { bar: "baz" } });
    expect(backend.exists("en", "foo.bar")).toBe(true);
    expect(backend.exists("en", "bar", { scope: "foo" })).toBe(true);
    expect(backend.exists("en", "missing")).toBe(false);
  });

  it("resolves a Symbol default through I18n.translate, so its guards run", () => {
    backend.storeTranslations("en", { foo: "bar" });
    config().availableLocales = ["en"];
    config().enforceAvailableLocales = true;

    expect(() => backend.translate("de", "missing", { default: ":foo" })).toThrow(InvalidLocale);
  });

  it("availableLocales skips locales holding only i18n metadata", () => {
    backend.storeTranslations("en", { foo: "bar" });
    backend.storeTranslations("de", { i18n: { transliterate: {} } });
    backend.storeTranslations("fr", {});
    expect(backend.availableLocales()).toEqual(["en"]);
  });
});

describe("I18n::Backend::Base#localize over a Temporal subject", () => {
  let backend: Simple;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
    backend.storeTranslations("de", {
      date: {
        formats: { default: "%d.%m.%Y", short: "%d. %b" },
        day_names: [
          "Sonntag",
          "Montag",
          "Dienstag",
          "Mittwoch",
          "Donnerstag",
          "Freitag",
          "Samstag",
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
      },
      time: {
        formats: { default: "%A, %d. %B %Y, %H:%M Uhr", short: "%d.%m.%y %H:%M" },
        am: "vormittags",
        pm: "nachmittags",
      },
    });
  });

  it("resolves a PlainDate against date.formats", () => {
    const date = Temporal.PlainDate.from("2008-03-01");
    expect(l(date, { format: ":default", locale: "de" })).toBe("01.03.2008");
    expect(l(date, { format: ":short", locale: "de" })).toBe("01. Mär");
    expect(l(date, { format: "%A", locale: "de" })).toBe("Samstag");
    expect(l(date, { format: "%B", locale: "de" })).toBe("März");
  });

  it("resolves a PlainDateTime against time.formats, since it answers sec", () => {
    const datetime = Temporal.PlainDateTime.from("2008-03-01T06:00:00");
    expect(l(datetime, { format: ":default", locale: "de" })).toBe(
      "Samstag, 01. März 2008, 06:00 Uhr",
    );
    expect(l(datetime, { format: ":short", locale: "de" })).toBe("01.03.08 06:00");
    expect(l(datetime, { format: "%p", locale: "de" })).toBe("VORMITTAGS");
  });

  it("resolves a ZonedDateTime and an Instant against time.formats", () => {
    expect(
      l(Temporal.ZonedDateTime.from("2008-03-01T18:00:00+09:00[+09:00]"), {
        format: ":default",
        locale: "de",
      }),
    ).toBe("Samstag, 01. März 2008, 18:00 Uhr");
    expect(
      l(Temporal.Instant.from("2008-03-01T18:00:00Z"), { format: "%H:%M %p", locale: "de" }),
    ).toBe("18:00 NACHMITTAGS");
  });

  it("still raises ArgumentError for an object that is neither", () => {
    expect(() => l({}, { format: ":default", locale: "de" })).toThrow(ArgumentError);
  });
});
