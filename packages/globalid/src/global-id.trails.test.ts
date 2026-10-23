import { afterEach, describe, expect, it } from "vitest";
import { GlobalID } from "./global-id.js";
import { Locator } from "./locator.js";
import { GID } from "./uri/gid.js";

describe("GlobalID (trails)", () => {
  afterEach(() => {
    GlobalID["_app"] = undefined;
  });

  it("deconstruct_keys delegates to the uri", () => {
    GlobalID.setApp("bcx");
    const gid = GlobalID.create({ id: 5, constructor: { name: "Person" } }, { db: "primary" });
    const keys = gid.deconstructKeys();
    expect([keys.app, keys.modelName, keys.modelId]).toEqual(["bcx", "Person", "5"]);
    expect(keys.params!.get("db")).toBe("primary");
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

  it("== normalizes the app before comparing, as URI::Generic#== does", () => {
    expect(GID.parse("gid://App/Person/1").equals(GID.parse("gid://app/Person/1"))).toBe(true);
    expect(
      GlobalID.parse("gid://App/Person/1")!.equals(GlobalID.parse("gid://app/Person/1")!),
    ).toBe(true);
    expect(GID.parse("gid://app/person/1").equals(GID.parse("gid://app/Person/1"))).toBe(false);
  });

  it("parse falls back to parse_encoded_gid", () => {
    GlobalID.setApp("bcx");
    const gid = GlobalID.create({ id: 5, constructor: { name: "Person" } });
    expect(GlobalID.parse(gid.toParam())!.toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.parse("not a gid at all")).toBeNull();
  });
});
