import * as TestCase from "../test-helpers/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { KeyValue } from "../backend/key-value.js";
import { config } from "../i18n.js";

describe("I18nKeyValueApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new KeyValue(new Map());
  });
  afterEach(TestCase.teardown);

  it("make sure we use the KeyValue backend", () => {
    expect(config().backend.constructor).toBe(KeyValue);
  });
});
