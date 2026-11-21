import { describe, it, expect, beforeEach, afterEach, onTestFinished } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { FileUtils, include } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Trailtie, resetTrailtieRegistry } from "../../lib/trailtie.js";
import "../../lib/trailties/action-controller.js";

class RailtieTest extends TestCase {}
include(RailtieTest, Isolation);
include(RailtieTest, Methods);
registerSpecType(/^RailtieTest$/, RailtieTest);

type Host = Generation & {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
};

describe("RailtieTest", { timeout: 240_000 }, () => {
  let restoreRegistry: () => void;
  let t: Host;

  beforeEach(async () => {
    restoreRegistry = resetTrailtieRegistry();
    t = new RailtieTest("test") as unknown as Host;
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
    restoreRegistry();
  });

  it("cannot instantiate a Railtie object", () => {
    expect(() => new Trailtie()).toThrow(/abstract/);
  });

  it("Railtie provides railtie_name", () => {
    class FooBarBaz extends Trailtie {}
    Trailtie.register(FooBarBaz);
    expect(FooBarBaz.railtieName()).toBe("foo_bar_baz");
  });

  it("railtie_name can be set manually", () => {
    class Foo extends Trailtie {
      static {
        this.railtieName("bar");
      }
    }
    Trailtie.register(Foo);
    expect(Foo.railtieName()).toBe("bar");
  });

  it("config is available to railtie", () => {
    class Foo extends Trailtie {}
    Trailtie.register(Foo);
    expect(
      (Foo.config as unknown as { actionController: { foo?: unknown } }).actionController.foo,
    ).toBeUndefined();
  });

  it("railtie can add to_prepare callbacks", async () => {
    let toPrepare = false;
    class Foo extends Trailtie {}
    Trailtie.register(Foo);
    Foo.config.toPrepare(() => {
      toPrepare = true;
    });
    expect(toPrepare).toBeFalsy();
    await t.bootTrails();
    await t.get("/");
    expect(toPrepare).toBeTruthy();
  });

  it("railtie can add initializers", async () => {
    let ranBlock = false;
    class MyTie extends Trailtie {}
    Trailtie.register(MyTie);
    MyTie.initializer("something_nice", function () {
      ranBlock = true;
    });
    expect(ranBlock).toBeFalsy();
    await t.bootTrails();
    expect(ranBlock).toBeTruthy();
  });

  it("rake_tasks block is executed when MyApp.load_tasks is called", async () => {
    let ranBlock = false;
    class MyTie extends Trailtie {}
    Trailtie.register(MyTie);
    MyTie.rakeTasks(() => {
      ranBlock = true;
    });
    await t.bootTrails();

    expect(ranBlock).toBeFalsy();
    await Trails.application!.loadTasks();
    expect(ranBlock).toBeTruthy();
  });

  it("rake_tasks block defined in superclass of railtie is also executed", async () => {
    const ranBlock: string[] = [];
    const own = new Map(
      Reflect.ownKeys(Trailtie).map((k) => [k, Object.getOwnPropertyDescriptor(Trailtie, k)]),
    );
    onTestFinished(() => {
      for (const k of Reflect.ownKeys(Trailtie))
        if (!own.has(k)) delete (Trailtie as unknown as Record<PropertyKey, unknown>)[k];
    });

    Trailtie.rakeTasks(function () {
      ranBlock.push(this.railtieName);
    });

    class MyTie extends Trailtie {
      static {
        this.railtieName("my_tie");
      }
    }
    Trailtie.register(MyTie);

    await t.bootTrails();

    expect(ranBlock).toEqual([]);
    await Trails.application!.loadTasks();
    expect(ranBlock).toContain("my_tie");
  });

  const LOADERS = {
    generators: "loadGenerators",
    console: "loadConsole",
    server: "loadServer",
    runner: "loadRunner",
  } as const;
  for (const kind of ["generators", "console", "server", "runner"] as const) {
    it(`${kind} block is executed when MyApp.load_${kind} is called`, async () => {
      let ranBlock = false;
      class MyTie extends Trailtie {}
      Trailtie.register(MyTie);
      MyTie[kind](() => {
        ranBlock = true;
      });
      await t.bootTrails();

      expect(ranBlock).toBeFalsy();
      await Trails.application![LOADERS[kind]]();
      expect(ranBlock).toBeTruthy();
    });
  }
});
