import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerConstant, resetConstants } from "@blazetrails/ruby-compat";
import { GlobalID } from "./global-id.js";
import { Locator, BlockLocator, _resetLocators, type LocatorModel } from "./locator.js";

const TEST_APP = "bcx";

class Person {
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  static async find(id: unknown): Promise<Person | Person[]> {
    if (Array.isArray(id)) {
      if (id.some((p) => p === "missing")) throw new Error("not found");
      return id.map((i) => new this(String(i)));
    }
    if (id === "missing") throw new Error("not found");
    return new this(String(id));
  }
}
class PersonChild extends Person {}

function registerConstants(): void {
  registerConstant("Person", Person);
  registerConstant("PersonChild", PersonChild);
}

describe("Locator (non-Rails coverage)", () => {
  beforeEach(() => {
    GlobalID.setApp(TEST_APP);
    registerConstants();
  });
  afterEach(() => {
    GlobalID["_app"] = undefined;
    resetConstants();
  });

  it("propagates errors from find (Rails parity — find raises RecordNotFound)", async () => {
    await expect(Locator.locate("gid://bcx/Person/missing")).rejects.toThrow();
  });
});

describe("Locator non-Rails coverage — per-app dispatch helpers", () => {
  beforeEach(() => {
    GlobalID.setApp(TEST_APP);
    registerConstants();
  });
  afterEach(() => {
    GlobalID["_app"] = undefined;
    resetConstants();
    _resetLocators();
  });

  it("falls back to the default locator when no app-specific locator is registered", async () => {
    Locator.use("other-app", () => "should-not-be-called");
    const found = (await Locator.locate("gid://bcx/Person/5")) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("5");
  });

  it("defaultLocator getter/setter (Rails: Locator.default_locator=)", () => {
    const original = Locator.defaultLocator;
    const custom = new BlockLocator(() => "custom-default");
    Locator.defaultLocator = custom;
    expect(Locator.defaultLocator).toBe(custom);
    Locator.defaultLocator = original;
  });

  it("locatorFor returns the registered locator for the app", () => {
    const custom = new BlockLocator(() => null);
    Locator.use("zed", custom);
    const gid = GlobalID.parse("gid://zed/Person/1");
    expect(Locator.locatorFor(gid!)).toBe(custom);
  });

  it("parseAllowed filters by class allowlist", () => {
    const gids = ["gid://bcx/Person/1", "gid://bcx/PersonChild/2"];
    const allowed = Locator.parseAllowed(gids, PersonChild as unknown as LocatorModel);
    expect(allowed).toHaveLength(1);
    expect(allowed[0].modelName).toBe("PersonChild");
  });

  it("normalizeApp lowercases the app name", () => {
    expect(Locator.normalizeApp("MyApp")).toBe("myapp");
    expect(Locator.normalizeApp("FOO")).toBe("foo");
  });

  it("locateMany returns [] when parseAllowed filters out every input", async () => {
    const found = await Locator.locateMany(["not-a-gid"], {});
    expect(found).toEqual([]);
  });
});
