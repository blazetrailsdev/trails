/**
 * Mirrors: i18n/test/api/fallbacks_test.rb. The `I18n::Tests::*` conformance
 * mixins the Ruby class includes are minitest scaffolding the gem ships for
 * third-party backends (see the `tests/` entry in unported-files.ts); trails'
 * equivalent coverage is backend/fallbacks.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Fallbacks } from "../backend/fallbacks.js";
import { Simple } from "../backend/simple.js";
import { resetClassConfig } from "../config.js";
import { config, resetConfig } from "../i18n.js";

class Backend extends Fallbacks(Simple) {}

describe("I18nFallbacksApiTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Backend();
  });

  it("make sure we use a backend with Fallbacks included", () => {
    expect(config().backend.constructor).toBe(Backend);
  });
});
