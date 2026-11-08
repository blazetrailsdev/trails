import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Fallbacks } from "../../lib/backend/fallbacks.js";
import { Simple } from "../../lib/backend/simple.js";
import { config } from "../../lib/i18n.js";

class Backend extends Fallbacks(Simple) {}

describe("I18nFallbacksApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new Backend();
  });
  afterEach(TestCase.teardown);

  it("make sure we use a backend with Fallbacks included", () => {
    expect(config().backend.constructor).toBe(Backend);
  });
});
