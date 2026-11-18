import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { LazyLoadable } from "../../lib/backend/lazy-loadable.js";
import { testsBasics } from "../support/tests/basics.js";
import { testsDefaults } from "../support/tests/defaults.js";
import { testsLookup } from "../support/tests/lookup.js";
import { testsPluralization } from "../support/tests/pluralization.js";
import { config } from "../../lib/i18n.js";

describe("I18nLazyLoadableBackendApiTest", () => {
  beforeEach(async () => {
    config().backend = new LazyLoadable();
    await TestCase.setup();
  });
  afterEach(TestCase.teardown);

  testsBasics();
  testsDefaults();
  testsLookup();
  testsPluralization();

  it("make sure we use the LazyLoadable backend", () => {
    expect(config().backend.constructor).toBe(LazyLoadable);
  });
});
