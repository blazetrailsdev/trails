import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Simple } from "../../lib/backend/simple.js";
import { config } from "../../lib/i18n.js";

describe("I18nSimpleBackendApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new Simple();
  });
  afterEach(TestCase.teardown);

  it("make sure we use the Simple backend", () => {
    expect(config().backend.constructor).toBe(Simple);
  });
});
