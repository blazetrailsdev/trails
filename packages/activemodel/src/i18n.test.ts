import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "./i18n.js";
import { MissingInterpolationArgument } from "./i18n.js";

describe("I18n", () => {
  beforeEach(() => {
    I18n.reset();
  });

  describe("interpolation", () => {
    it("substitutes %{key} placeholders from options", () => {
      I18n.storeTranslations("en", { greeting: "Hello, %{name}" });
      expect(I18n.t("greeting", { name: "World" })).toBe("Hello, World");
    });

    it("raises MissingInterpolationArgument when a placeholder has no matching option", () => {
      I18n.storeTranslations("en", { greeting: "Hello, %{name}" });
      expect(() => I18n.t("greeting")).toThrow(MissingInterpolationArgument);
    });

    it("exposes count as an interpolation value for plural strings", () => {
      I18n.storeTranslations("en", {
        apples: { one: "one apple", other: "%{count} apples" },
      });
      expect(I18n.t("apples", { count: 1 })).toBe("one apple");
      expect(I18n.t("apples", { count: 3 })).toBe("3 apples");
    });

    it("interpolates null/undefined option values as empty strings (Rails i18n semantics)", () => {
      // i18n/lib/i18n/interpolate/ruby.rb raises only when the key is
      // absent; a present-but-nil value is coerced to "" via to_s.
      I18n.storeTranslations("en", { row: "[%{a}] [%{b}]" });
      expect(I18n.t("row", { a: null, b: undefined })).toBe("[] []");
    });

    it("raises on %{toString} — inherited Object keys do not satisfy a placeholder", () => {
      I18n.storeTranslations("en", { hi: "hi %{toString}" });
      expect(() => I18n.t("hi")).toThrow(MissingInterpolationArgument);
    });

    it("does not pass I18n control keys (scope/default/locale) into interpolation", () => {
      I18n.storeTranslations("en", { hi: "hi %{name}" });
      // `locale` and `defaults` are reserved — they must not be mistakenly
      // forwarded to %{locale} etc., and must not swallow errors from
      // genuinely-missing interpolations like %{name}.
      expect(() => I18n.t("hi", { locale: "en", defaults: [{ key: "missing" }] })).toThrow(
        MissingInterpolationArgument,
      );
    });
  });

  describe("fallback chain", () => {
    it("falls back to the default locale when the requested locale has no entry", () => {
      I18n.storeTranslations("en", { hi: "hello" });
      I18n.locale = "fr";
      expect(I18n.t("hi")).toBe("hello");
    });

    it("walks an explicit per-locale fallback list before the default locale", () => {
      I18n.storeTranslations("en", { hi: "hello" });
      I18n.storeTranslations("en-GB", { hi: "hullo" });
      I18n.setFallbacks({ "en-US": ["en-US", "en-GB", "en"] });
      expect(I18n.t("hi", { locale: "en-US" })).toBe("hullo");
    });

    it("honors options.locale for a single lookup without mutating I18n.locale", () => {
      I18n.storeTranslations("en", { hi: "hi" });
      I18n.storeTranslations("es", { hi: "hola" });
      expect(I18n.t("hi", { locale: "es" })).toBe("hola");
      expect(I18n.locale).toBe("en");
    });

    it("does not mutate caller-supplied fallback chain arrays", () => {
      I18n.storeTranslations("en-GB", { hi: "hullo" });
      const chain = ["en-US", "en-GB"];
      I18n.setFallbacks({ "en-US": chain });
      chain.length = 0;
      expect(I18n.t("hi", { locale: "en-US" })).toBe("hullo");
    });

    it("appends default_locale to explicit fallback chains", () => {
      // Matches I18n::Locale::Fallbacks#compute (i18n/lib/i18n/locale/fallbacks.rb),
      // which always pushes the default_locale onto the chain.
      I18n.storeTranslations("en", { hi: "hello" });
      I18n.setFallbacks({ fr: ["fr", "de"] });
      expect(I18n.t("hi", { locale: "fr" })).toBe("hello");
    });

    it("still returns defaultValue when no locale in the chain has the key", () => {
      I18n.setFallbacks({ "en-US": ["en-US", "en"] });
      expect(I18n.t("nope", { locale: "en-US", defaultValue: "fallback %{x}", x: 1 })).toBe(
        "fallback 1",
      );
    });
  });

  describe("lambda values", () => {
    it("invokes function values with the lookup key and options", () => {
      I18n.storeTranslations("en", {
        greet: (key, options) => `fn:${key}:${(options as { n?: number }).n ?? 0}`,
      });
      expect(I18n.t("greet", { n: 4 })).toBe("fn:greet:4");
    });

    it("passes the effective locale into lambdas even when caller omits it", () => {
      I18n.storeTranslations("en", {
        who: (_key, options) => `locale:${(options as { locale?: string }).locale}`,
      });
      I18n.locale = "fr";
      expect(I18n.t("who")).toBe("locale:fr");
    });

    it("interpolates the string returned by a lambda", () => {
      I18n.storeTranslations("en", {
        shout: () => "HEY %{name}",
      });
      expect(I18n.t("shout", { name: "Alice" })).toBe("HEY Alice");
    });
  });
});
