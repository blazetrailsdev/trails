import { describe, it, expect, beforeEach } from "vitest";

import { Config, resetClassConfig } from "./config.js";
import { ExceptionHandler, InvalidLocale, MissingInterpolationArgument } from "./exceptions.js";
import { DEFAULT_INTERPOLATION_PATTERNS } from "./interpolate/ruby.js";
import { resetConfig } from "./i18n.js";
import { Base } from "./backend/base.js";
import { Simple } from "./backend/simple.js";

class FakeBackend extends Base {
  reloaded = 0;
  constructor(private locales: string[] = ["en"]) {
    super();
  }
  storeTranslations(): unknown {
    return null;
  }
  availableLocales(): string[] {
    return this.locales;
  }
  override async reloadBang(): Promise<void> {
    this.reloaded += 1;
  }
  protected lookup(): unknown {
    return null;
  }
}

describe("Config", () => {
  let config: Config;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config = new Config();
  });

  it("locale defaults to the default locale and is per-instance", () => {
    expect(config.locale).toBe("en");
    config.enforceAvailableLocales = false;
    config.locale = "de";
    expect(config.locale).toBe("de");
    expect(new Config().locale).toBe("en");
  });

  it("locale= enforces available locales", () => {
    expect(() => (config.locale = "klingon")).toThrow(InvalidLocale);
    config.availableLocales = ["en", "de"];
    config.locale = "de";
    expect(config.locale).toBe("de");
  });

  it("defaultLocale= enforces available locales and is shared across instances", () => {
    expect(() => (config.defaultLocale = "klingon")).toThrow(InvalidLocale);
    config.availableLocales = ["en", "de"];
    config.defaultLocale = "de";
    expect(new Config().defaultLocale).toBe("de");
  });

  it("backend defaults to Backend::Simple and is settable", () => {
    expect(config.backend).toBeInstanceOf(Simple);
    const backend = new FakeBackend(["fr"]);
    config.backend = backend;
    expect(new Config().backend).toBe(backend);
  });

  it("availableLocales delegates to the backend until set", () => {
    config.backend = new FakeBackend(["en", "fr"]);
    expect(config.availableLocales).toEqual(["en", "fr"]);
    expect(config.availableLocalesInitialized).toBe(false);

    config.availableLocales = ["de"];
    expect(config.availableLocales).toEqual(["de"]);
    expect(config.availableLocalesInitialized).toBe(true);
  });

  it("availableLocales= wraps a single locale and clears back to the backend when empty", () => {
    config.availableLocales = "de";
    expect(config.availableLocales).toEqual(["de"]);
    config.availableLocales = [];
    expect(config.availableLocalesInitialized).toBe(false);
  });

  it("availableLocalesSet is memoized and cleared by clearAvailableLocalesSet", () => {
    config.availableLocales = ["en", "de"];
    const set = config.availableLocalesSet;
    expect(set.has("de")).toBe(true);
    expect(config.availableLocalesSet).toBe(set);

    config.clearAvailableLocalesSet();
    expect(config.availableLocalesSet).not.toBe(set);
  });

  it("defaultSeparator defaults to a dot", () => {
    expect(config.defaultSeparator).toBe(".");
    config.defaultSeparator = "|";
    expect(new Config().defaultSeparator).toBe("|");
  });

  it("exceptionHandler defaults to an ExceptionHandler", () => {
    expect(config.exceptionHandler).toBeInstanceOf(ExceptionHandler);
    const handler = { call: () => "handled" };
    config.exceptionHandler = handler;
    expect(config.exceptionHandler).toBe(handler);
  });

  it("missingInterpolationArgumentHandler raises MissingInterpolationArgument by default", () => {
    expect(() => config.missingInterpolationArgumentHandler("bar", { baz: 1 }, "%{bar}")).toThrow(
      MissingInterpolationArgument,
    );
    config.missingInterpolationArgumentHandler = (key) => `${key} is missing`;
    expect(config.missingInterpolationArgumentHandler("bar", {}, "%{bar}")).toBe("bar is missing");
  });

  it("loadPath defaults to an empty array and reloads the backend when assigned", async () => {
    expect(config.loadPath).toEqual([]);
    config.loadPath.push("a.yml");
    expect(new Config().loadPath).toEqual(["a.yml"]);

    const backend = new FakeBackend();
    config.backend = backend;
    config.availableLocales = ["en"];
    await config.setLoadPath(["b.yml"]);
    expect(backend.reloaded).toBe(1);
    expect(config.availableLocalesInitialized).toBe(true);
    expect(config.availableLocalesSet.has("en")).toBe(true);
  });

  it("enforceAvailableLocales defaults to true", () => {
    expect(config.enforceAvailableLocales).toBe(true);
    config.enforceAvailableLocales = false;
    expect(new Config().enforceAvailableLocales).toBe(false);
  });

  it("interpolationPatterns defaults to a copy of DEFAULT_INTERPOLATION_PATTERNS", () => {
    expect(config.interpolationPatterns).toEqual([...DEFAULT_INTERPOLATION_PATTERNS]);
    config.interpolationPatterns.push(/\{\{(\w+)\}\}/);
    expect(config.interpolationPatterns).toHaveLength(DEFAULT_INTERPOLATION_PATTERNS.length + 1);
    expect(DEFAULT_INTERPOLATION_PATTERNS).toHaveLength(3);
  });
});
