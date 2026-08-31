/**
 * Mirrors: i18n/test/api/key_value_test.rb. The `I18n::Tests::*` conformance
 * mixins the Ruby class includes are minitest scaffolding the gem ships for
 * third-party backends (see the `tests/` entry in unported-files.ts); trails'
 * equivalent coverage is backend/key-value.test.ts.
 *
 * The gem guards the whole file with `if I18n::TestCase.key_value?`, which asks
 * whether ActiveSupport is loaded — the gem needs it for `ActiveSupport::JSON`
 * (key_value.rb:20). JS has `JSON` in the language, so there is nothing to
 * probe and the case always runs. The store the gem passes is a Ruby Hash
 * (`{}`); a `Map` is the JS Hash.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { KeyValue } from "../backend/key-value.js";
import { resetClassConfig } from "../config.js";
import { config, resetConfig } from "../i18n.js";

describe("I18nKeyValueApiTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new KeyValue(new Map());
  });

  it("make sure we use the KeyValue backend", () => {
    expect(config().backend.constructor).toBe(KeyValue);
  });
});
