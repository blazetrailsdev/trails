import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { KeyValue } from "../../lib/backend/key-value.js";
import { testsBasics } from "../support/tests/basics.js";
import { testsDefaults } from "../support/tests/defaults.js";
import { testsLookup } from "../support/tests/lookup.js";
import { testsPluralization } from "../support/tests/pluralization.js";
import { config } from "../../lib/i18n.js";

describe("I18nKeyValueApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new KeyValue(new Map());
  });
  afterEach(TestCase.teardown);

  testsBasics();
  testsDefaults();
  testsLookup();
  testsPluralization();

  it("make sure we use the KeyValue backend", () => {
    expect(config().backend.constructor).toBe(KeyValue);
  });
});
