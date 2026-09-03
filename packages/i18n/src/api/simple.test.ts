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
