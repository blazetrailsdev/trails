/**
 * Trails-only: `translate!` has no case of its own in i18n_test.rb — the gem
 * covers `raise: true` through the backend tests.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "./exceptions.js";
import { config, resetConfig, translateBang } from "./i18n.js";
import { resetClassConfig } from "./config.js";
import { Simple } from "./backend/simple.js";

describe("I18n.translateBang", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Simple();
    config().enforceAvailableLocales = false;
  });

  it("raises MissingTranslationData for a bogus key", () => {
    expect(() => translateBang("bogus")).toThrow(MissingTranslationData);
  });
});
