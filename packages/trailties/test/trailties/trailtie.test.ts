import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { Trailtie, resetTrailtieRegistry } from "../../lib/trailtie.js";
import { Configuration } from "../../lib/trailtie/configuration.js";
import "../../lib/trailties/action-controller.js";
import { sealAgainstInheritance } from "../../lib/trailtie/configurable.js";

describe("RailtieTest", () => {
  let restoreRegistry: () => void;

  beforeEach(() => {
    restoreRegistry = resetTrailtieRegistry();
  });

  afterEach(() => {
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

  it("railtie can add to_prepare callbacks", () => {
    let toPrepare = false;
    class Foo extends Trailtie {}
    Trailtie.register(Foo);
    Foo.config.toPrepare(() => {
      toPrepare = true;
    });
    expect(toPrepare).toBeFalsy();
    for (const block of Foo.config.toPrepareBlocks) block();
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
    await MyTie.instance().runInitializers();
    expect(ranBlock).toBeTruthy();
  });

  it("rake_tasks block is executed when MyApp.load_tasks is called", async () => {
    let ranBlock = false;
    class MyTie extends Trailtie {}
    Trailtie.register(MyTie);
    MyTie.rakeTasks(() => {
      ranBlock = true;
    });
    expect(ranBlock).toBeFalsy();
    await MyTie.instance().runTasksBlocks({});
    expect(ranBlock).toBeTruthy();
  });

  it("rake_tasks block defined in superclass of railtie is also executed", async () => {
    const ranBlock: string[] = [];
    class ParentTie extends Trailtie {}
    Trailtie.register(ParentTie);
    ParentTie.rakeTasks(function () {
      ranBlock.push(this.railtieName);
    });
    class MyTie extends ParentTie {}
    Trailtie.register(MyTie);
    MyTie.railtieName("my_tie");
    expect(ranBlock).toEqual([]);
    await MyTie.instance().runTasksBlocks({});
    expect(ranBlock).toContain("my_tie");
  });

  const RUNNERS = {
    generators: "runGeneratorsBlocks",
    console: "runConsoleBlocks",
    server: "runServerBlocks",
    runner: "runRunnerBlocks",
  } as const;
  for (const kind of ["generators", "console", "server", "runner"] as const) {
    it(`${kind} block is executed when MyApp.load_${kind} is called`, async () => {
      let ranBlock = false;
      class MyTie extends Trailtie {}
      Trailtie.register(MyTie);
      MyTie[kind](() => {
        ranBlock = true;
      });
      expect(ranBlock).toBeFalsy();
      const runner: (a: unknown) => unknown = MyTie.instance()[RUNNERS[kind]];
      await runner.call(MyTie.instance(), {});
      expect(ranBlock).toBeTruthy();
    });
  }

  it("non-rake block defined in superclass of railtie is also executed", async () => {
    const ran: string[] = [];
    class P extends Trailtie {}
    Trailtie.register(P);
    P.console(() => ran.push("p"));
    class C extends P {}
    Trailtie.register(C);
    await C.instance().runConsoleBlocks({});
    expect(ran).toEqual(["p"]);
  });

  const HOOKS = [
    ["beforeConfiguration", "before_configuration"],
    ["beforeInitialize", "before_initialize"],
    ["beforeEagerLoad", "before_eager_load"],
    ["afterInitialize", "after_initialize"],
    ["afterRoutesLoaded", "after_routes_loaded"],
  ] as const;
  afterEach(() => {
    resetLoadHooks();
  });

  for (const [hook, rubyName] of HOOKS) {
    it(`Configuration#${hook} block runs when ${hook} hook fires`, () => {
      const seen: unknown[] = [];
      new Configuration()[hook]((arg) => seen.push(arg));
      runLoadHooks(rubyName, "marker");
      expect(seen).toContain("marker");
    });
  }

  it("Configurable seal sees through an anonymous intermediate class", () => {
    class AnonSealed extends Trailtie {}
    sealAgainstInheritance(AnonSealed);
    const Anon = class extends AnonSealed {};
    class Grand extends Anon {}
    expect(() => Trailtie.register(Grand)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
  });

  it("Configurable seals a class — single and multi-level inheritance", () => {
    class SealedTie extends Trailtie {}
    sealAgainstInheritance(SealedTie);
    class Direct extends SealedTie {}
    class Mid extends SealedTie {}
    class Deep extends Mid {}
    expect(() => Trailtie.register(Direct)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
    expect(() => Trailtie.register(Deep)).toThrow(
      "You cannot inherit from a Trails::Railtie child",
    );
  });

  it("returns registered subclasses sorted by load order, excluding abstract entries", () => {
    class Early extends Trailtie {}
    Trailtie.register(Early);
    class Late extends Trailtie {}
    Trailtie.register(Late);
    const list = Trailtie.subclasses();
    expect(list.indexOf(Late)).toBeGreaterThan(list.indexOf(Early));
    expect(list.every((s) => !s.isAbstractRailtie())).toBe(true);
  });
});
