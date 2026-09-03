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
