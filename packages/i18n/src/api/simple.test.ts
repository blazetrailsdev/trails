/**
 * Mirrors: i18n/test/api/simple_test.rb. The `I18n::Tests::*` conformance
 * mixins the Ruby class includes are minitest scaffolding the gem ships for
 * third-party backends (see the `tests/` entry in unported-files.ts); trails'
 * equivalent coverage is backend/simple.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Simple } from "../backend/simple.js";
import { resetClassConfig } from "../config.js";
import { config, resetConfig } from "../i18n.js";

describe("I18nSimpleBackendApiTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Simple();
  });

  it("make sure we use the Simple backend", () => {
    expect(config().backend.constructor).toBe(Simple);
  });
});
