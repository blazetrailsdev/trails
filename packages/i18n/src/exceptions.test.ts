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

  /**
   * Ports of the private helpers at i18n/test/i18n/exceptions_test.rb:80-108.
   * Ruby's `block_given?` arm is the optional `block` parameter; with no block
   * the rescued exception is re-raised.
   *
   * `forceInvalidLocale` and `forceMissingTranslationData` do not in fact
   * raise, upstream either: `I18n.translate` resolves a nil `locale:` to
   * `config.locale` (:en, since `Config#default_locale` is
   * `@@default_locale ||= :en`), and a missing translation is thrown to the
   * default `ExceptionHandler`, which returns the message rather than raising
   * it. Their blocks therefore never run — including the two spelling the
   * message lowercase, which `MissingTranslation#message` never produces. The
   * message and accessor shapes those cases meant to pin are asserted directly
   * in exceptions.trails.test.ts.
   */
  function forceInvalidLocale(block?: (exception: ArgumentError) => void): void {
    try {
      translate("foo", { locale: null });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e);
      else throw e;
    }
  }

  function forceMissingTranslationData(block?: (exception: ArgumentError) => void): void {
    storeTranslations("de", { bar: null });
    try {
      translate("foo", { scope: "bar", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e);
      else throw e;
    }
  }

  function forceInvalidPluralizationData(block?: (exception: ArgumentError) => void): void {
    storeTranslations("de", { foo: { other: "bar" } });
    try {
      translate("foo", { count: 1, locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e);
      else throw e;
    }
  }

  function forceMissingInterpolationArgument(block?: (exception: ArgumentError) => void): void {
    storeTranslations("de", { foo: "%{bar}" });
    try {
      translate("foo", { baz: "baz", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e);
      else throw e;
    }
  }

  function forceReservedInterpolationKey(block?: (exception: ArgumentError) => void): void {
    storeTranslations("de", { foo: "%{scope}" });
    try {
      translate("foo", { baz: "baz", locale: "de" });
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (block) block(e);
      else throw e;
    }
  }

  it("invalid locale stores locale", () => {
    forceInvalidLocale((exception) => {
      expect((exception as InvalidLocale).locale).toBeNull();
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
      expect((exception as MissingTranslationData).locale).toBe("de");
      expect((exception as MissingTranslationData).key).toBe("foo");
      expect((exception as MissingTranslationData).options).toEqual({ scope: "bar" });
    });
  });

  it("MissingTranslationData message contains the locale and scoped key", () => {
    forceMissingTranslationData((exception) => {
      expect(exception.message).toBe("translation missing: de.bar.foo");
    });
  });

  it("InvalidPluralizationData stores entry, count and key", () => {
    forceInvalidPluralizationData((exception) => {
      expect((exception as InvalidPluralizationData).entry).toEqual({ other: "bar" });
      expect((exception as InvalidPluralizationData).count).toBe(1);
      expect((exception as InvalidPluralizationData).key).toBe("one");
    });
  });

  it("InvalidPluralizationData message contains count, data and missing key", () => {
    forceInvalidPluralizationData((exception) => {
      expect(exception.message).toContain("1");
      expect(exception.message).toContain(`{other: "bar"}`);
      expect(exception.message).toContain("one");
    });
  });

  it("MissingInterpolationArgument stores key and string", () => {
    expect(() => forceMissingInterpolationArgument()).toThrow(MissingInterpolationArgument);
    forceMissingInterpolationArgument((exception) => {
      expect((exception as MissingInterpolationArgument).key).toBe("bar");
      expect((exception as MissingInterpolationArgument).string).toBe("%{bar}");
    });
  });

  it("MissingInterpolationArgument message contains the missing and given arguments", () => {
    forceMissingInterpolationArgument((exception) => {
      expect(exception.message).toBe(
        `missing interpolation argument :bar in "%{bar}" ({baz: "baz"} given)`,
      );
    });
  });

  it("ReservedInterpolationKey stores key and string", () => {
    forceReservedInterpolationKey((exception) => {
      expect((exception as ReservedInterpolationKey).key).toBe("scope");
      expect((exception as ReservedInterpolationKey).string).toBe("%{scope}");
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
});
