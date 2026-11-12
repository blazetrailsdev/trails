import { describe, expect, it } from "vitest";

import { Base } from "../../lib/backend/base.js";
import { Chain } from "../../lib/backend/chain.js";

describe("Backend::Chain", () => {
  it("includes Base without replacing Chain's own members", () => {
    expect(Chain.prototype.translate).not.toBe(Base.prototype.translate);
    expect(Chain.prototype.storeTranslations).not.toBe(Base.prototype.storeTranslations);
    expect(Chain.prototype.availableLocales).not.toBe(Base.prototype.availableLocales);
    expect(typeof new Chain().transliterate).toBe("function");
  });
});
