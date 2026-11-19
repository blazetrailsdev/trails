import * as TestCase from "../support/test-case.js";
import { include } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fallbacks } from "../../lib/backend/fallbacks.js";
import { Pluralization } from "../../lib/backend/pluralization.js";
import { Simple } from "../../lib/backend/simple.js";
import { config, setDefaultLocale, translate } from "../../lib/i18n.js";

class PluralizationSimple extends Simple {}
include(PluralizationSimple, Pluralization);
class Backend extends PluralizationSimple {}
include(Backend, Fallbacks);

afterEach(TestCase.teardown);

describe("I18nBackendPluralizationScopeTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    setDefaultLocale("en");
    const backend = new Backend();
    config().backend = backend;

    const translations = {
      i18n: {
        plural: {
          keys: [":one", ":other"],
          rule: (n: number) => (n == 1 ? ":one" : ":other"),
        },
      },
      activerecord: {
        models: {
          my_model: {
            one: "one model",
            other: "more models",
            some_other_key: {
              key: "value",
            },
          },
        },
      },
    };

    backend.storeTranslations("en", translations);
  });

  it("pluralization picks :other for 2", () => {
    const args = {
      scope: [":activerecord", ":models"],
      count: 2,
      default: ["My model"],
    };
    expect(translate(":my_model", args)).toBe("more models");
  });

  it("pluralization picks :one for 1", () => {
    const args = {
      scope: [":activerecord", ":models"],
      count: 1,
      default: ["My model"],
    };
    expect(translate(":my_model", args)).toBe("one model");
  });
});
