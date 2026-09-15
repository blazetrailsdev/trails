import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Autoload } from "./dependencies/autoload.js";
import type { Fixtures as FixturesType } from "./fixtures/autoload/fixtures.js";

async function constGet(mod: Autoload, constName: string): Promise<unknown> {
  const value = (mod as unknown as Record<string, unknown>)[constName];
  if (value !== undefined) return value;
  await mod.loadPath[await mod._autoloads![constName]()]();
  return (mod as unknown as Record<string, unknown>)[constName];
}

describe("TestAutoloadModule", () => {
  let Fixtures: typeof FixturesType;

  beforeEach(async () => {
    vi.resetModules();
    ({ Fixtures } = await import("./fixtures/autoload/fixtures.js"));
  });

  it("the autoload module works like normal autoload", async () => {
    Fixtures.Autoload.autoload("SomeClass", "fixtures/autoload/some_class");

    expect(await constGet(Fixtures.Autoload, "SomeClass")).toBeDefined();
  });

  it("when specifying an :eager constant it still works like normal autoload by default", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass", "fixtures/autoload/some_class");
    });

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    expect(await constGet(Fixtures.Autoload, "SomeClass")).toBeDefined();
  });

  it("the location of autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.autoload("SomeClass");

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    expect(await constGet(Fixtures.Autoload, "SomeClass")).toBeDefined();
  });

  it("the location of :eager autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass");
    });

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    await Fixtures.Autoload.eagerLoadBang();
    expect(Fixtures.Autoload.SomeClass).toBeDefined();
    expect(await constGet(Fixtures.Autoload, "SomeClass")).toBeDefined();
  });

  it("a directory for a block of autoloads can be specified", async () => {
    Fixtures.autoloadUnder("autoload", () => {
      Fixtures.autoload("AnotherClass");
    });

    expect(Fixtures.AnotherClass).toBeUndefined();
    expect(await constGet(Fixtures, "AnotherClass")).toBeDefined();
  });

  it("a path for a block of autoloads can be specified", async () => {
    Fixtures.autoloadAt("fixtures/autoload/another_class", () => {
      Fixtures.autoload("AnotherClass");
    });

    expect(Fixtures.AnotherClass).toBeUndefined();
    expect(await constGet(Fixtures, "AnotherClass")).toBeDefined();
  });
});
