/**
 * Base-backend semantics the gem covers through `I18n::Tests::Basics` /
 * `Defaults` / `Pluralization` rather than `simple_test.rb`; those suites are
 * ported with their own story, so the throw/raise/default resolution order is
 * pinned here in the meantime.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Simple } from "./simple.js";
import { config, resetConfig } from "../i18n.js";
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
    expect(() => backend.translate("en", Symbol.for(""))).toThrow(ArgumentError);
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
    expect(translate("missing", { default: [Symbol.for("also_missing"), "Literal"] })).toBe(
      "Literal",
    );
    expect(translate("missing", { default: [Symbol.for("fallback")] })).toBe("Fallback");
  });

  it("resolves a Symbol entry through the configured backend", () => {
    backend.storeTranslations("en", { target: "Target", alias: Symbol.for("target") });
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

  it("availableLocales skips locales holding only i18n metadata", () => {
    backend.storeTranslations("en", { foo: "bar" });
    backend.storeTranslations("de", { i18n: { transliterate: {} } });
    backend.storeTranslations("fr", {});
    expect(backend.availableLocales()).toEqual(["en"]);
  });
});
