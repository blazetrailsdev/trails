import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Autoload } from "./dependencies/autoload.js";
import type {
  Fixtures as FixturesType,
  LOADED_FEATURES as LoadedFeaturesType,
} from "./fixtures/autoload/fixtures.js";

async function constGet(mod: Autoload, constName: string): Promise<void> {
  const self = mod as unknown as Record<string, unknown>;
  if (self[constName] === undefined) await mod.loadPath[await mod._autoloads![constName]()]();
  if (self[constName] === undefined)
    throw new Error(`uninitialized constant ${mod.name}::${constName}`);
}

describe("TestAutoloadModule", () => {
  let Fixtures: typeof FixturesType;
  let LOADED_FEATURES: typeof LoadedFeaturesType;
  const someClassPath = "fixtures/autoload/some_class";
  const anotherClassPath = "fixtures/autoload/another_class";

  beforeEach(async () => {
    vi.resetModules();
    ({ Fixtures, LOADED_FEATURES } = await import("./fixtures/autoload/fixtures.js"));
  });

  it("the autoload module works like normal autoload", async () => {
    Fixtures.Autoload.autoload("SomeClass", "fixtures/autoload/some_class");

    await expect(constGet(Fixtures.Autoload, "SomeClass")).resolves.not.toThrow();
  });

  it("when specifying an :eager constant it still works like normal autoload by default", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass", "fixtures/autoload/some_class");
    });

    expect(LOADED_FEATURES).not.toContain(someClassPath);
    await expect(constGet(Fixtures.Autoload, "SomeClass")).resolves.not.toThrow();
  });

  it("the location of autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.autoload("SomeClass");

    expect(LOADED_FEATURES).not.toContain(someClassPath);
    await expect(constGet(Fixtures.Autoload, "SomeClass")).resolves.not.toThrow();
  });

  it("the location of :eager autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass");
    });

    expect(LOADED_FEATURES).not.toContain(someClassPath);
    await Fixtures.Autoload.eagerLoadBang();
    expect(LOADED_FEATURES).toContain(someClassPath);
    await expect(constGet(Fixtures.Autoload, "SomeClass")).resolves.not.toThrow();
  });

  it("a directory for a block of autoloads can be specified", async () => {
    Fixtures.autoloadUnder("autoload", () => {
      Fixtures.autoload("AnotherClass");
    });

    expect(LOADED_FEATURES).not.toContain(anotherClassPath);
    await expect(constGet(Fixtures, "AnotherClass")).resolves.not.toThrow();
  });

  it("a path for a block of autoloads can be specified", async () => {
    Fixtures.autoloadAt("fixtures/autoload/another_class", () => {
      Fixtures.autoload("AnotherClass");
    });

    expect(LOADED_FEATURES).not.toContain(anotherClassPath);
    await expect(constGet(Fixtures, "AnotherClass")).resolves.not.toThrow();
  });
});
