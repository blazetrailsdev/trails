import { beforeEach, describe, expect, it } from "vitest";
import { Fallbacks, setFallbacks } from "./fallbacks.js";
import { Simple } from "./simple.js";
import { config, resetConfig, t, withLocale } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { MissingTranslation } from "../exceptions.js";
import { catchException } from "../throw-catch.js";

class Backend extends Fallbacks(Simple) {}

describe("Backend::Fallbacks over the ActiveRecord error-message scopes", () => {
  let backend: Backend;

  function generateMessage(attribute: string, type: string): unknown {
    const scoped = [
      `activerecord.errors.models.topic.attributes.${attribute}.${type}`,
      `activerecord.errors.models.topic.${type}`,
      `activerecord.errors.messages.${type}`,
    ];
    const translation = catchException(() =>
      t(scoped[0], { default: scoped.slice(1).map((key) => `:${key}`), throw: true }),
    );
    if (!(translation instanceof MissingTranslation) && translation != null) return translation;

    const defaults = [`errors.attributes.${attribute}.${type}`, `errors.messages.${type}`];
    return t(defaults[0], { default: defaults.slice(1).map((key) => `:${key}`) });
  }

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    setFallbacks(null);
    config().enforceAvailableLocales = false;
    backend = new Backend();
    config().backend = backend;
    backend.storeTranslations("en", {
      activerecord: {
        errors: { models: { topic: { attributes: { title: { taken: "custom en message" } } } } },
      },
    });
    backend.storeTranslations("en-US", {
      errors: { messages: { taken: "generic en-US fallback" } },
    });
  });

  it("activerecord attributes scope falls back to parent locale before it falls back to the :errors namespace", () => {
    withLocale("en-US", () => {
      expect(generateMessage("title", "taken")).toBe("custom en message");
      expect(generateMessage("heading", "taken")).toBe("generic en-US fallback");
    });
  });
});
