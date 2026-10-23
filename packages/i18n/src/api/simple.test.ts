import * as TestCase from "../test-helpers/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Simple } from "../backend/simple.js";
import { config } from "../i18n.js";

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
