import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fixtures as FixturesType } from "./fixtures/autoload/fixtures.js";

describe("TestAutoloadModule", () => {
  let Fixtures: typeof FixturesType;
  const someClassPath = () => import("./fixtures/autoload/some-class.js");
  const anotherClassPath = () => import("./fixtures/autoload/another-class.js");

  beforeEach(async () => {
    vi.resetModules();
    ({ Fixtures } = await import("./fixtures/autoload/fixtures.js"));
  });

  it("the autoload module works like normal autoload", async () => {
    Fixtures.Autoload.autoload("SomeClass", someClassPath);

    await someClassPath();
    expect(Fixtures.Autoload.SomeClass).toBeDefined();
  });

  it("when specifying an :eager constant it still works like normal autoload by default", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass", someClassPath);
    });

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    await someClassPath();
    expect(Fixtures.Autoload.SomeClass).toBeDefined();
  });

  it("the location of autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.autoload("SomeClass");

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    await someClassPath();
    expect(Fixtures.Autoload.SomeClass).toBeDefined();
  });

  it("the location of :eager autoloaded constants defaults to :name.underscore", async () => {
    Fixtures.Autoload.eagerAutoload(() => {
      Fixtures.Autoload.autoload("SomeClass", someClassPath);
    });

    expect(Fixtures.Autoload.SomeClass).toBeUndefined();
    await Fixtures.Autoload.eagerLoadBang();
    expect(Fixtures.Autoload.SomeClass).toBeDefined();
  });

  it("a directory for a block of autoloads can be specified", async () => {
    Fixtures.autoloadUnder("autoload", () => {
      Fixtures.autoload("AnotherClass");
    });

    expect(Fixtures.AnotherClass).toBeUndefined();
    await anotherClassPath();
    expect(Fixtures.AnotherClass).toBeDefined();
  });

  it("a path for a block of autoloads can be specified", async () => {
    Fixtures.autoloadAt(anotherClassPath, () => {
      Fixtures.eagerAutoload(() => Fixtures.autoload("AnotherClass"));
    });

    expect(Fixtures.AnotherClass).toBeUndefined();
    await Fixtures.eagerLoadBang();
    expect(Fixtures.AnotherClass).toBeDefined();
  });
});
