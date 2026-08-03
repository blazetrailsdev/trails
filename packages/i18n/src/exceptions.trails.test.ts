import { describe, it, expect, beforeEach } from "vitest";

import {
  ArgumentError,
  Disabled,
  ExceptionHandler,
  InvalidLocale,
  InvalidLocaleData,
  InvalidPluralizationData,
  MissingInterpolationArgument,
  MissingTranslation,
  MissingTranslationData,
  ReservedInterpolationKey,
  UnknownFileType,
} from "./exceptions.js";
import { resetClassConfig } from "./config.js";
import { resetConfig } from "./i18n.js";

/**
 * Trails-only: i18n/test/i18n/exceptions_test.rb drives every message assertion
 * through `I18n.translate`, which is not ported yet (and whose default
 * ExceptionHandler swallows MissingTranslation, leaving those cases vacuous
 * upstream). These assert the ported classes directly.
 */
describe("exceptions", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
  });

  it("roots every error at I18n::ArgumentError", () => {
    const errors = [
      new Disabled("t"),
      new InvalidLocale("de"),
      new InvalidLocaleData("en.yml", "boom"),
      new MissingTranslation("de", "foo"),
      new MissingTranslationData("de", "foo"),
      new InvalidPluralizationData({ other: "bar" }, 1, "one"),
      new MissingInterpolationArgument("bar", { baz: "baz" }, "%{bar}"),
      new ReservedInterpolationKey("scope", "%{scope}"),
      new UnknownFileType("xml", "en.xml"),
    ];
    for (const e of errors) expect(e).toBeInstanceOf(ArgumentError);
  });

  it("InvalidLocale stores the locale and inspects it in the message", () => {
    const exception = new InvalidLocale(null);
    expect(exception.locale).toBeNull();
    expect(exception.message).toBe("nil is not a valid locale");
    expect(new InvalidLocale("klingon").message).toBe(":klingon is not a valid locale");
  });

  it("InvalidLocaleData stores the filename", () => {
    const exception = new InvalidLocaleData("en.yml", "syntax error");
    expect(exception.filename).toBe("en.yml");
    expect(exception.message).toBe("can not load translations from en.yml: syntax error");
  });

  it("UnknownFileType stores type and filename", () => {
    const exception = new UnknownFileType("xml", "en.xml");
    expect(exception.type).toBe("xml");
    expect(exception.message).toBe(
      "can not load translations from en.xml, the file type xml is not known",
    );
  });

  it("Disabled names the disabled method", () => {
    expect(new Disabled("t").message).toContain("I18n.t is currently disabled");
  });

  it("MissingTranslationData stores locale, key and permitted options", () => {
    const exception = new MissingTranslationData("de", "foo", { scope: "bar", count: 1 });
    expect(exception.locale).toBe("de");
    expect(exception.key).toBe("foo");
    expect(exception.options).toEqual({ scope: "bar" });
  });

  it("MissingTranslation inspects Proc options", () => {
    const exception = new MissingTranslation("de", "foo", { default: () => "x" });
    expect(exception.options["default"]).toBe("#<Proc>");
  });

  it("MissingTranslation message contains the locale and scoped key", () => {
    const exception = new MissingTranslationData("de", "foo", { scope: "bar" });
    expect(exception.message).toBe("Translation missing: de.bar.foo");
    expect(exception.toString()).toBe(exception.message);
    expect(exception.keys()).toEqual(["de", "bar", "foo"]);
    expect(new MissingTranslation("de", "").keys()).toEqual(["de", "no key"]);
  });

  it("MissingTranslation message lists the options considered for an array default", () => {
    const exception = new MissingTranslation("de", "foo", { default: ["bar", "baz"] });
    expect(exception.message).toBe(
      "Translation missing. Options considered were:\n- de.foo\n- de.bar\n- de.baz",
    );
  });

  it("MissingTranslation#toException returns MissingTranslationData", () => {
    const exception = new MissingTranslation("de", "foo", { scope: "bar" });
    const converted = exception.toException();
    expect(converted).toBeInstanceOf(MissingTranslationData);
    expect(converted.message).toBe("Translation missing: de.bar.foo");
  });

  it("InvalidPluralizationData stores entry, count and key", () => {
    const exception = new InvalidPluralizationData({ other: "bar" }, 1, "one");
    expect(exception.entry).toEqual({ other: "bar" });
    expect(exception.count).toBe(1);
    expect(exception.key).toBe("one");
    expect(exception.message).toBe(
      `translation data {other: "bar"} can not be used with :count => 1. key 'one' is missing.`,
    );
  });

  it("MissingInterpolationArgument message contains the missing and given arguments", () => {
    const exception = new MissingInterpolationArgument("bar", { baz: "baz" }, "%{bar}");
    expect(exception.key).toBe("bar");
    expect(exception.string).toBe("%{bar}");
    expect(exception.message).toBe(
      `missing interpolation argument :bar in "%{bar}" ({baz: "baz"} given)`,
    );
  });

  it("ReservedInterpolationKey message contains the reserved key", () => {
    const exception = new ReservedInterpolationKey("scope", "%{scope}");
    expect(exception.key).toBe("scope");
    expect(exception.message).toBe(`reserved key :scope used in "%{scope}"`);
  });

  it("ExceptionHandler returns the message for MissingTranslation and re-raises everything else, MissingTranslationData included", () => {
    const handler = new ExceptionHandler();
    const missing = new MissingTranslation("de", "foo");
    expect(handler.call(missing, "de", "foo", {})).toBe("Translation missing: de.foo");

    const other = new InvalidLocale("de");
    expect(() => handler.call(other, "de", "foo", {})).toThrow(other);
    const data = new MissingTranslationData("de", "foo");
    expect(() => handler.call(data, "de", "foo", {})).toThrow(data);
  });
});
