/**
 * Mirrors `railties/test/railties/railtie_test.rb`. Tests depending on
 * Rails-only infrastructure (`Rails::Application`, Rake DSL, ASC
 * `on_load` chains) wait for later PRs; the cases below cover what
 * Trailtie alone can satisfy.
 */
import { describe, it, expect } from "vitest";
import { Trailtie } from "./trailtie.js";
import { Configuration } from "./trailtie/configuration.js";

type WithProtected = { runTasksBlocks: (a: unknown) => void };

describe("Trailtie", () => {
  it("cannot instantiate a Railtie object", () => {
    expect(() => new Trailtie()).toThrow(/abstract/);
  });

  it("Railtie provides railtie_name", () => {
    class MyTrailtie extends Trailtie {}
    Trailtie.register(MyTrailtie);
    expect(MyTrailtie.railtieName()).toBe("my_trailtie");
  });

  it("railtie_name can be set manually", () => {
    class OtherTrailtie extends Trailtie {}
    Trailtie.register(OtherTrailtie);
    OtherTrailtie.railtieName("custom_name");
    expect(OtherTrailtie.railtieName()).toBe("custom_name");
  });

  it("config is available to railtie", () => {
    class ConfigTrailtie extends Trailtie {}
    Trailtie.register(ConfigTrailtie);
    expect(ConfigTrailtie.config).toBeInstanceOf(Configuration);
    expect(ConfigTrailtie.config).toBe(ConfigTrailtie.config);
  });

  it("railtie can add to_prepare callbacks", () => {
    class PrepTrailtie extends Trailtie {}
    Trailtie.register(PrepTrailtie);
    const before = PrepTrailtie.config.toPrepareBlocks.length;
    const block = () => {};
    PrepTrailtie.config.toPrepare(block);
    expect(PrepTrailtie.config.toPrepareBlocks.length).toBe(before + 1);
    expect(PrepTrailtie.config.toPrepareBlocks).toContain(block);
  });

  it("rake_tasks block is executed when MyApp.load_tasks is called", () => {
    const calls: unknown[] = [];
    class TaskTrailtie extends Trailtie {}
    Trailtie.register(TaskTrailtie);
    TaskTrailtie.rakeTasks((app) => calls.push(app));
    (TaskTrailtie.instance() as unknown as WithProtected).runTasksBlocks({ name: "app" });
    expect(calls).toEqual([{ name: "app" }]);
  });

  it("rake_tasks block defined in superclass of railtie is also executed", () => {
    const calls: string[] = [];
    class Parent extends Trailtie {}
    Trailtie.register(Parent);
    class Child extends Parent {}
    Trailtie.register(Child);
    Parent.rakeTasks(() => calls.push("parent"));
    Child.rakeTasks(() => calls.push("child"));
    (Child.instance() as unknown as WithProtected).runTasksBlocks(undefined);
    expect(calls.sort()).toEqual(["child", "parent"]);
  });

  it("railtie can add initializers", () => {
    const calls: string[] = [];
    class InitTrailtie extends Trailtie {}
    Trailtie.register(InitTrailtie);
    InitTrailtie.initializer("init.one", function () {
      calls.push("one");
    });
    InitTrailtie.instance().runInitializers();
    expect(calls).toEqual(["one"]);
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
