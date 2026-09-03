import { beforeEach, describe, expect, it } from "vitest";

import { Chain } from "../backend/chain.js";
import { Simple } from "../backend/simple.js";
import { resetClassConfig } from "../config.js";
import { config, resetConfig } from "../i18n.js";

describe("I18nApiChainTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().backend = new Chain(new Simple(), config().backend);
  });

  it("make sure we use the Chain backend", () => {
    expect(config().backend.constructor).toBe(Chain);
  });
});
