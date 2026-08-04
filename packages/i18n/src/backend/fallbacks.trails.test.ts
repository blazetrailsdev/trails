/**
 * Covers the scenario story `i18n-backend-fallbacks` names as its consumer:
 * `activerecord/test/cases/validations/i18n_generate_message_validation_test.rb:91-101`
 * builds its backend as
 * `class Backend < I18n::Backend::Simple; include I18n::Backend::Fallbacks; end`
 * (:7-9) and asserts an `activerecord.errors.models.*.attributes.*` key in a
 * parent locale wins over the generic `errors.messages` key in the child
 * locale.
 *
 * The win comes from `ActiveModel::Error.generate_message`
 * (activemodel/lib/active_model/error.rb:79-100), which runs the `i18n_scope`
 * defaults as a first `throw: true` pass and only falls through to
 * `errors.attributes.*` / `errors.messages.*` when that whole pass misses.
 * Both passes are spelled out below, so what is asserted is this backend's
 * lookup and nothing else.
 *
 * `packages/activerecord` still routes the AR case through the bespoke
 * `I18nService` in `packages/activemodel/src/i18n.ts`, which PR #6026 deletes;
 * moving it onto this port is story `i18n-ar-fallbacks-wiring`.
 */

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

  /** Mirrors: `ActiveModel::Error.generate_message` (error.rb:79-100). */
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
