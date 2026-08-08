import { afterEach, describe, expect, it } from "vitest";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { Locator } from "./locator.js";

// Members with no dedicated Rails test of their own: GlobalID#deconstruct_keys
// (delegated to @uri), GlobalID.default_locator, and the private
// GlobalID.parse_encoded_gid fallback exercised through .parse.
describe("GlobalID (trails)", () => {
  afterEach(() => {
    _resetApp();
  });

  it("deconstruct_keys delegates to the uri", () => {
    setApp("bcx");
    const gid = GlobalID.create({ id: 5, constructor: { name: "Person" } }, { db: "primary" });
    expect(gid.deconstructKeys()).toEqual({
      app: "bcx",
      modelName: "Person",
      modelId: "5",
      params: { db: "primary" },
    });
  });

  it("default_locator sets Locator.default_locator", async () => {
    const previous = Locator.defaultLocator;
    const sentinel = { located: true };
    const myLocator = {
      locate: async () => sentinel,
      locateMany: async () => [sentinel],
    };
    try {
      await GlobalID.defaultLocator(myLocator);
      expect(Locator.defaultLocator).toBe(myLocator);
    } finally {
      Locator.defaultLocator = previous;
    }
  });

  it("parse falls back to parse_encoded_gid", () => {
    setApp("bcx");
    const gid = GlobalID.create({ id: 5, constructor: { name: "Person" } });
    expect(GlobalID.parse(gid.toParam())!.toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.parse("not a gid at all")).toBeNull();
  });
});
