import * as TestCase from "../test-helpers/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Chain } from "../backend/chain.js";
import { Simple } from "../backend/simple.js";
import { config } from "../i18n.js";

describe("I18nApiChainTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new Chain(new Simple(), config().backend);
  });
  afterEach(TestCase.teardown);

  it("make sure we use the Chain backend", () => {
    expect(config().backend.constructor).toBe(Chain);
  });
});
