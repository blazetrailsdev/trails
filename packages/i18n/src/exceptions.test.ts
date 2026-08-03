/** Mirrors: i18n/test/i18n/exceptions_test.rb */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ArgumentError,
  InvalidLocale,
  InvalidPluralizationData,
  MissingInterpolationArgument,
  MissingTranslation,
  MissingTranslationData,
  ReservedInterpolationKey,
} from "./exceptions.js";
import { config, resetConfig, translate } from "./i18n.js";
import { resetClassConfig } from "./config.js";
import { Simple } from "./backend/simple.js";
import type { TranslationData } from "./utils.js";

describe("I18nExceptionsTest", () => {
  let backend: Simple;

  /** Mirrors: `store_translations` in i18n/test/test_helper.rb:40. */
  function storeTranslations(locale: string, data: TranslationData): void {
    backend.storeTranslations(locale, data);
  }

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    backend = new Simple();
    config().backend = backend;
    config().enforceAvailableLocales = false;
  });

  it("invalid locale stores locale", () => {
    forceInvalidLocale((exception) => {
      expect(exception.locale).toBeNull();
    });
  });

  it("passing an invalid locale raises an InvalidLocale exception", () => {
    forceInvalidLocale((exception) => {
      expect(exception.message).toBe("nil is not a valid locale");
    });
  });

  it("MissingTranslation can be initialized without options", () => {
    const exception = new MissingTranslation("en", "foo");
    expect(exception.options).toEqual({});
  });

  it("MissingTranslationData exception stores locale, key and options", () => {
    forceMissingTranslationData((exception) => {
      expect(exception.locale).toBe("de");
      expect(exception.key).toBe("foo");
      expect(exception.options).toEqual({ scope: "bar" });
    });
  });

  it("MissingTranslationData message contains the locale and scoped key", () => {
    forceMissingTranslationData((exception) => {
      expect(exception.message).toBe("translation missing: de.bar.foo");
    });
  });

  it("InvalidPluralizationData stores entry, count and key", () => {
    forceInvalidPluralizationData((exception) => {
      expect(exception.entry).toEqual({ other: "bar" });
      expect(exception.count).toBe(1);
      expect(exception.key).toBe("one");
    });
  });

  it("InvalidPluralizationData message contains count, data and missing key", () => {
    forceInvalidPluralizationData((exception) => {
      expect(exception.message).toContain("1");
      expect(exception.message).toContain(`{:other=>"bar"}`);
      expect(exception.message).toContain("one");
    });
  });

  it("MissingInterpolationArgument stores key and string", () => {
    expect(() => forceMissingInterpolationArgument()).toThrow(MissingInterpolationArgument);
    forceMissingInterpolationArgument((exception) => {
      expect(exception.key).toBe(":bar");
      expect(exception.string).toBe("%{bar}");
    });
  });

  it("MissingInterpolationArgument message contains the missing and given arguments", () => {
    forceMissingInterpolationArgument((exception) => {
      expect(exception.message).toBe(
        `missing interpolation argument :bar in "%{bar}" ({:baz=>"baz"} given)`,
      );
    });
  });

  it("ReservedInterpolationKey stores key and string", () => {
    forceReservedInterpolationKey((exception) => {
      expect(exception.key).toBe(":scope");
      expect(exception.string).toBe("%{scope}");
    });
  });

  it("ReservedInterpolationKey message contains the reserved key", () => {
    forceReservedInterpolationKey((exception) => {
      expect(exception.message).toBe(`reserved key :scope used in "%{scope}"`);
    });
  });

  it("MissingTranslationData#new can be initialized with just two arguments", () => {
    expect(new MissingTranslationData("en", "key")).toBeTruthy();
  });

  /** Mirrors: the private helpers at i18n/test/i18n/exceptions_test.rb:80-108. */
  function forceInvalidLocale(block?: (exception: InvalidLocale) => void): void {
    try {
      translate("foo", { locale: null });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e as InvalidLocale);
      else throw e;
    }
  }

  function forceMissingTranslationData(block?: (exception: MissingTranslationData) => void): void {
    storeTranslations("de", { bar: null });
    try {
      translate("foo", { scope: "bar", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e as MissingTranslationData);
      else throw e;
    }
  }

  function forceInvalidPluralizationData(
    block?: (exception: InvalidPluralizationData) => void,
  ): void {
    storeTranslations("de", { foo: { other: "bar" } });
    try {
      translate("foo", { count: 1, locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e as InvalidPluralizationData);
      else throw e;
    }
  }

  function forceMissingInterpolationArgument(
    block?: (exception: MissingInterpolationArgument) => void,
  ): void {
    storeTranslations("de", { foo: "%{bar}" });
    try {
      translate("foo", { baz: "baz", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e as MissingInterpolationArgument);
      else throw e;
    }
  }

  function forceReservedInterpolationKey(
    block?: (exception: ReservedInterpolationKey) => void,
  ): void {
    storeTranslations("de", { foo: "%{scope}" });
    try {
      translate("foo", { baz: "baz", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e as ReservedInterpolationKey);
      else throw e;
    }
  }
});
