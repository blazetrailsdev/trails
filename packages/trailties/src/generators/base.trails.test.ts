import { describe, it, expect, vi } from "vitest";
import { Dir, File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "./base.js";
import { Generators, type GeneratorClass } from "../generators.js";

class Host extends GeneratorBase {}

describe("GeneratorBase#relativeToOriginalDestinationRoot", () => {
  const base = new Host({ cwd: "/app", output: () => {} });

  it("strips the destination root and its leading dot", () => {
    expect(base.relativeToOriginalDestinationRoot("/app/db/migrate/1_x.ts")).toBe(
      "db/migrate/1_x.ts",
    );
  });

  it("keeps the dot when removeDot is false", () => {
    expect(base.relativeToOriginalDestinationRoot("/app/config", false)).toBe("./config");
  });

  it("answers an empty string for the root itself", () => {
    expect(base.relativeToOriginalDestinationRoot("/app")).toBe("");
    expect(base.relativeToOriginalDestinationRoot("/app", false)).toBe(".");
  });

  it("leaves a sibling path that only shares the prefix untouched", () => {
    expect(base.relativeToOriginalDestinationRoot("/application/x")).toBe("/application/x");
  });
});

describe("GeneratorBase.classOption defaults from Generators.options / Generators.aliases", () => {
  it("fills :default and :aliases from the :rails namespace", () => {
    class WidgetGenerator extends GeneratorBase {
      static {
        this.classOption("templateEngine", { type: "string" });
      }
    }
    expect(WidgetGenerator.classOptions()["templateEngine"]).toMatchObject({
      default: "tse",
      aliases: "-e",
    });
  });

  it("prefers the generator's own namespace over :rails, and an explicit default when unset", () => {
    const options = Generators.options();
    options["gadget"] = { orm: "active_record" };
    try {
      class GadgetGenerator extends GeneratorBase {
        static {
          this.classOption("orm", { type: "string" });
          this.classOption("widgets", { type: "boolean", default: true });
        }
      }
      expect(GadgetGenerator.classOptions()["orm"].default).toBe("active_record");
      expect(GadgetGenerator.classOptions()["widgets"].default).toBe(true);
    } finally {
      delete options["gadget"];
    }
  });
});

describe("GeneratorBase runtime options (Thor's add_runtime_options!)", () => {
  it("parses --pretend / -f / -q / -s as options, not attributes", async () => {
    let seen: { options: Record<string, unknown>; attributes: string[] } | undefined;
    class RecordingGenerator extends GeneratorBase {
      run(_name: string, attributes: string[]): void {
        seen = { options: { ...this.options }, attributes };
      }
    }
    await RecordingGenerator.start(["post", "title:string", "--pretend", "-f", "-q", "-s"], {
      cwd: "/app",
      output: () => {},
    });
    expect(seen!.attributes).toEqual(["title:string"]);
    expect(seen!.options).toMatchObject({ pretend: true, force: true, quiet: true, skip: true });
  });
});

describe("GeneratorBase#createFile conflict behavior (Thor's CreateFile#invoke!)", () => {
  class Writer extends GeneratorBase {
    write(content: string): void {
      this.createFile("app/x.ts", content);
    }
  }

  it("keeps a changed file under behavior: :skip, reports identical files, and forces through a conflict", () => {
    const cwd = File.join(Dir.tmpdir(), `trails-create-file-${SecureRandom.hex(8)}`);
    const lines: string[] = [];
    const make = (opts: Partial<GeneratorOptions> = {}) =>
      new Writer({ cwd, output: (m) => lines.push(m), ...opts });
    try {
      make().write("one ✓\n");
      make({ behavior: "skip" }).write("two\n");
      make({ behavior: "skip" }).write("one ✓\n");
      expect(File.read(File.join(cwd, "app/x.ts"))).toBe("one ✓\n");
      make({ behavior: "force" }).write("two\n");
      make().write("three\n");
      expect(File.read(File.join(cwd, "app/x.ts"))).toBe("three\n");
      expect(lines.map((l) => l.trim())).toEqual([
        "create  app/x.ts",
        "skip  app/x.ts",
        "identical  app/x.ts",
        "force  app/x.ts",
        "conflict  app/x.ts",
        "force  app/x.ts",
      ]);
    } finally {
      FileUtils.rmRf(cwd);
    }
  });
});

describe("GeneratorBase.hookFor", () => {
  class HookedGenerator extends GeneratorBase {
    static ran: string[] = [];
    run(name: string): void {
      HookedGenerator.ran.push(`hooked:${name}`);
    }
  }

  it("registers a class option defaulting from Generators.options and records [in, as]", () => {
    class AwesomeGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", "orm", { as: "controller", in: "rails" });
      }
    }
    expect(AwesomeGenerator.classOptions()["testFramework"]).toMatchObject({
      desc: "Test framework to be invoked",
      banner: "NAME",
      aliases: "-t",
    });
    expect(AwesomeGenerator.classOptions()["orm"]).toMatchObject({ banner: "", default: false });
    expect(AwesomeGenerator.hooks()).toEqual({
      testFramework: ["rails", "controller"],
      orm: ["rails", "controller"],
    });
  });

  it("start invokes the hooked generator after its own run, looking it up by [value, in, as]", async () => {
    const ran: string[] = [];
    HookedGenerator.ran = ran;
    class InvokingGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", { in: "rails", as: "invoking" });
      }
      run(name: string): void {
        ran.push(`own:${name}`);
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(HookedGenerator as unknown as GeneratorClass);
    const lines: string[] = [];
    try {
      await InvokingGenerator.start(["Account", "--test-framework=test_unit"], {
        cwd: "/tmp",
        output: (m) => lines.push(m),
      });
      expect(find).toHaveBeenCalledWith("test_unit", "rails", "invoking");
    } finally {
      find.mockRestore();
    }
    expect(ran).toEqual(["own:Account", "hooked:Account"]);
    expect(lines).toContain("      invoke  test_unit");
  });

  it("skips the hook when the option is unset, and reports a hook that does not resolve", async () => {
    class SilentGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework");
      }
    }
    const lines: string[] = [];
    await SilentGenerator.start(["Account"], { cwd: "/tmp", output: (m) => lines.push(m) });
    expect(lines).toEqual([]);

    const find = vi.spyOn(Generators, "findByNamespace").mockResolvedValue(null);
    try {
      await SilentGenerator.start(["Account", "-t", "nope"], {
        cwd: "/tmp",
        output: (m) => lines.push(m),
      });
    } finally {
      find.mockRestore();
    }
    expect(lines).toEqual(["       error  nope [not found]"]);
  });

  it("raises when a required class option has neither a value nor a default", async () => {
    class RequiredGenerator extends GeneratorBase {
      static {
        this.classOption("widget", { type: "string", required: true });
      }
    }
    await expect(
      RequiredGenerator.start(["Account"], { cwd: "/tmp", output: () => {} }),
    ).rejects.toThrow("No value provided for required options '--widget'");
    await expect(
      RequiredGenerator.start(["Account", "--widget=x"], { cwd: "/tmp", output: () => {} }),
    ).resolves.toEqual([]);
  });

  it("yields the instance and the hooked class to a block instead of invoking it", async () => {
    const yielded: unknown[] = [];
    class BlockGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", (instance, klass) => {
          yielded.push(instance, klass);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(HookedGenerator as unknown as GeneratorClass);
    try {
      await BlockGenerator.start(["Account", "-t", "test_unit"], { cwd: "/tmp", output: () => {} });
    } finally {
      find.mockRestore();
    }
    expect(yielded[0]).toBeInstanceOf(BlockGenerator);
    expect(yielded[1]).toBe(HookedGenerator);
  });

  it("instance_execs a one-argument block with the hooked class", async () => {
    const yielded: unknown[] = [];
    class ExecGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", function (this: GeneratorBase, klass: GeneratorClass) {
          yielded.push(this, klass);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(HookedGenerator as unknown as GeneratorClass);
    try {
      await ExecGenerator.start(["Account", "-t", "test_unit"], { cwd: "/tmp", output: () => {} });
    } finally {
      find.mockRestore();
    }
    expect(yielded[0]).toBeInstanceOf(ExecGenerator);
    expect(yielded[1]).toBe(HookedGenerator);
  });

  it("raises when the invocation's option was never declared", () => {
    expect(() => {
      class UndeclaredGenerator extends GeneratorBase {
        static {
          this.hookFor("testFramework");
          this.removeHookFor("testFramework");
          (this as unknown as { invokeFromOption(n: string, o: object): void }).invokeFromOption(
            "testFramework",
            {},
          );
        }
      }
      return UndeclaredGenerator;
    }).toThrow('You have to define the option "testFramework" before setting invoke_from_option.');
  });

  it("invokes a hooked class with the block's own args, as ResourceGenerator's hook does", async () => {
    const seen: string[] = [];
    class ArgsHookedGenerator extends GeneratorBase {
      run(name: string, attributes: string[]): void {
        seen.push(name, ...attributes);
      }
    }
    class ResourceLikeGenerator extends GeneratorBase {
      static {
        this.hookFor(
          "resourceController",
          function (this: GeneratorBase, controller: GeneratorClass) {
            return this.invoke(controller, ["Accounts", ["index", "show"]]);
          },
        );
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(ArgsHookedGenerator as unknown as GeneratorClass);
    try {
      await ResourceLikeGenerator.start(["Account"], { cwd: "/tmp", output: () => {} });
    } finally {
      find.mockRestore();
    }
    expect(seen).toEqual(["Accounts", "index", "show"]);
  });

  it("raises when invoke cannot resolve its class", async () => {
    class Invoker extends GeneratorBase {
      static {
        this.hookFor("testFramework", function (this: GeneratorBase, _klass: GeneratorClass) {
          return this.invoke("nope");
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockImplementation(async (n) =>
        n === "nope" ? null : (HookedGenerator as unknown as GeneratorClass),
      );
    try {
      await expect(
        Invoker.start(["Account", "-t", "x"], { cwd: "/tmp", output: () => {} }),
      ).rejects.toThrow("Missing Thor class for invoke nope");
    } finally {
      find.mockRestore();
    }
  });

  it("parses the invoking argv against the hooked class's own class options", async () => {
    let received: unknown;
    class FixtureGenerator extends GeneratorBase {
      static {
        this.classOption("fixtureReplacement", { type: "string" });
      }
      run(): void {
        received = (this.options as unknown as Record<string, unknown>)["fixtureReplacement"];
      }
    }
    class ModelLikeGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework");
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(FixtureGenerator as unknown as GeneratorClass);
    try {
      await ModelLikeGenerator.start(["Account", "-t", "test_unit", "--fixture-replacement=fab"], {
        cwd: "/tmp",
        output: () => {},
      });
    } finally {
      find.mockRestore();
    }
    expect(received).toBe("fab");
  });

  it("shares the invocation registry, so a class invoked twice runs its commands once", async () => {
    let runs = 0;
    class OnceGenerator extends GeneratorBase {
      run(): void {
        runs++;
      }
    }
    class TwiceGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", function (this: GeneratorBase, klass: GeneratorClass) {
          return this.invoke(klass).then(() => this.invoke(klass));
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(OnceGenerator as unknown as GeneratorClass);
    try {
      await TwiceGenerator.start(["Account", "-t", "x"], { cwd: "/tmp", output: () => {} });
    } finally {
      find.mockRestore();
    }
    expect(runs).toBe(1);
  });

  it("invoke with a command dispatches only that command", async () => {
    const ran: string[] = [];
    class CommandsGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", function (this: GeneratorBase, _klass: GeneratorClass) {
          ran.push("hook");
        });
      }
      run(): void {
        ran.push("run");
      }
    }
    class Caller extends GeneratorBase {
      static {
        this.hookFor("orm", function (this: GeneratorBase, _klass: GeneratorClass) {
          return this.invoke(CommandsGenerator as unknown as GeneratorClass, "run");
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(CommandsGenerator as unknown as GeneratorClass);
    try {
      await Caller.start(["Account", "--orm=x", "-t", "y"], { cwd: "/tmp", output: () => {} });
    } finally {
      find.mockRestore();
    }
    expect(ran).toEqual(["run"]);
  });

  it("removeHookFor raises NameError for a hook that was never added, as undef_method does", () => {
    class NoHookGenerator extends GeneratorBase {}
    expect(() => NoHookGenerator.removeHookFor("testFramework")).toThrow(
      "undefined method `testFrameworkGenerator' for class `#<Class:NoHookGenerator>'",
    );
  });

  it("invoke raises when the resolved class is not a generator, and hands the child parentOptions", async () => {
    let parent: unknown;
    class ChildGenerator extends GeneratorBase {
      run(): void {
        parent = this.parentOptions;
      }
    }
    class NotAGenerator {}
    class ParentGenerator extends GeneratorBase {
      static {
        this.hookFor("testFramework", function (this: GeneratorBase, klass: GeneratorClass) {
          return this.invoke(klass);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(ChildGenerator as unknown as GeneratorClass);
    try {
      await ParentGenerator.start(["Account", "-t", "x"], { cwd: "/tmp", output: () => {} });
      expect(parent).toMatchObject({ testFramework: "x" });

      const instance = new ParentGenerator({ cwd: "/tmp", output: () => {} });
      await expect(instance.invoke(NotAGenerator as unknown as GeneratorClass, [])).rejects.toThrow(
        "Expected Thor class, got NotAGenerator",
      );
    } finally {
      find.mockRestore();
    }
  });

  it("invoke with a command the class does not register raises, as Thor's all_commands lookup does", async () => {
    class Target extends GeneratorBase {
      run(): void {}
    }
    class Caller extends GeneratorBase {
      static {
        this.hookFor("orm", function (this: GeneratorBase, _klass: GeneratorClass) {
          return this.invoke(Target as unknown as GeneratorClass, "hooks");
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(Target as unknown as GeneratorClass);
    try {
      await expect(
        Caller.start(["Account", "--orm=x"], { cwd: "/tmp", output: () => {} }),
      ).rejects.toThrow("undefined method `name' for nil");
    } finally {
      find.mockRestore();
    }
  });
});
