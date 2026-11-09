import { capture } from "@blazetrails/activesupport";
import { describe, it, expect, vi } from "vitest";
import { Dir, File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";
import { Base, type GeneratorConfig } from "./base.js";
import { Generators, type GeneratorClass } from "../generators.js";

class Host extends Base {}

describe("Base#relativeToOriginalDestinationRoot", () => {
  const base = new Host([], {}, { destinationRoot: "/app" });

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

describe("Base.classOption defaults from Generators.options / Generators.aliases", () => {
  it("fills :default and :aliases from the :trails namespace", () => {
    class WidgetGenerator extends Base {
      static {
        this.classOption("templateEngine", { type: "string" });
      }
    }
    expect(WidgetGenerator.classOptions()["templateEngine"]).toMatchObject({
      default: "tse",
      aliases: ["-e"],
    });
  });

  it("prefers the generator's own namespace over :trails, and an explicit default when unset", () => {
    const options = Generators.options();
    options["gadget"] = { orm: "active_record" };
    try {
      class GadgetGenerator extends Base {
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

describe("Base runtime options (Thor's add_runtime_options!)", () => {
  it("parses --pretend / -f / -q / -s as options, not attributes", async () => {
    let seen: { options: Record<string, unknown>; attributes: string[] } | undefined;
    class RecordingGenerator extends Base {
      static {
        this.argument("name");
        this.argument("attributes", { type: "array", default: [] });
        this.methodAdded("record");
      }
      declare attributes: string[];
      record(): void {
        seen = {
          options: Object.fromEntries(this.options as unknown as Iterable<[string, unknown]>),
          attributes: this.attributes,
        };
      }
    }
    await RecordingGenerator.start(["post", "title:string", "--pretend", "-f", "-q", "-s"], {
      destinationRoot: "/app",
    });
    expect(seen!.attributes).toEqual(["title:string"]);
    expect(seen!.options).toMatchObject({ pretend: true, force: true, quiet: true, skip: true });
  });
});

describe("Base#createFile conflict behavior (Thor's CreateFile#invoke!)", () => {
  class Writer extends Base {
    static {
      this.methodAdded("write");
    }
    async write(content: string): Promise<void> {
      await this.createFile("app/x.ts", content);
    }
  }

  it("keeps a changed file under behavior: :skip, reports identical files, and forces through a conflict", async () => {
    const cwd = File.join(Dir.tmpdir(), `trails-create-file-${SecureRandom.hex(8)}`);
    const make = (config: GeneratorConfig = {}) =>
      new Writer([], {}, { destinationRoot: cwd, ...config });
    try {
      const output = await capture("stdout", async () => {
        await make().write("one ✓\n");
        await make({ behavior: "skip" }).write("two\n");
        await make({ behavior: "skip" }).write("one ✓\n");
        expect(File.read(File.join(cwd, "app/x.ts"))).toBe("one ✓\n");
        await make({ behavior: "force" }).write("two\n");
        const yes = make();
        (yes.shell as unknown as { ask(): unknown }).ask = async () => "y";
        await yes.write("three\n");
      });
      expect(File.read(File.join(cwd, "app/x.ts"))).toBe("three\n");
      expect(
        output
          .trimEnd()
          .split("\n")
          .map((l) => l.trim()),
      ).toEqual([
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

describe("Base.hookFor", () => {
  class HookedGenerator extends Base {
    static ran: string[] = [];
    static {
      this.argument("name");
      this.methodAdded("perform");
    }
    declare name: string;
    perform(): void {
      HookedGenerator.ran.push(`hooked:${this.name}`);
    }
  }

  it("registers a class option defaulting from Generators.options and records [in, as]", () => {
    class AwesomeGenerator extends Base {
      static {
        this.hookFor("testFramework", "orm", { as: "controller", in: "trails" });
      }
    }
    expect(AwesomeGenerator.classOptions()["testFramework"]).toMatchObject({
      description: "Test framework to be invoked",
      banner: "NAME",
      aliases: ["-t"],
    });
    expect(AwesomeGenerator.classOptions()["orm"]).toMatchObject({ banner: "", default: false });
    expect(AwesomeGenerator.hooks()).toEqual({
      testFramework: ["trails", "controller"],
      orm: ["trails", "controller"],
    });
  });

  it("start invokes the hooked generator after its own run, looking it up by [value, in, as]", async () => {
    const ran: string[] = [];
    HookedGenerator.ran = ran;
    class InvokingGenerator extends Base {
      static {
        this.argument("name");
        this.methodAdded("perform");
        this.hookFor("testFramework", { in: "trails", as: "invoking" });
      }
      declare name: string;
      perform(): void {
        ran.push(`own:${this.name}`);
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(HookedGenerator as unknown as GeneratorClass);
    let output: string;
    try {
      output = await capture("stdout", () =>
        InvokingGenerator.start(["Account", "--test-framework=test_unit"], {
          destinationRoot: "/tmp",
        }),
      );
      expect(find).toHaveBeenCalledWith("test_unit", "trails", "invoking");
    } finally {
      find.mockRestore();
    }
    expect(ran).toEqual(["own:Account", "hooked:Account"]);
    expect(output).toMatch(/^ +invoke {2}test_unit$/m);
  });

  it("skips the hook when the option is unset, and reports a hook that does not resolve", async () => {
    class SilentGenerator extends Base {
      static {
        this.hookFor("testFramework");
      }
    }
    expect(
      await capture("stdout", () =>
        SilentGenerator.start(["Account"], { destinationRoot: "/tmp" }),
      ),
    ).toBe("");

    const find = vi.spyOn(Generators, "findByNamespace").mockResolvedValue(null);
    let output: string;
    try {
      output = await capture("stdout", () =>
        SilentGenerator.start(["Account", "-t", "nope"], { destinationRoot: "/tmp" }),
      );
    } finally {
      find.mockRestore();
    }
    expect(output).toBe("       error  nope [not found]\n");
  });

  it("raises when a required class option has neither a value nor a default", async () => {
    class RequiredGenerator extends Base {
      static {
        this.classOption("widget", { type: "string", required: true });
      }
    }
    expect(
      await capture("stderr", () =>
        RequiredGenerator.start(["Account"], { destinationRoot: "/tmp" }),
      ),
    ).toContain("No value provided for required options '--widget'");
    await expect(
      RequiredGenerator.start(["Account", "--widget=x"], { destinationRoot: "/tmp" }),
    ).resolves.toEqual([]);
  });

  it("yields the instance and the hooked class to a block instead of invoking it", async () => {
    const yielded: unknown[] = [];
    class BlockGenerator extends Base {
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
      await BlockGenerator.start(["Account", "-t", "test_unit"], { destinationRoot: "/tmp" });
    } finally {
      find.mockRestore();
    }
    expect(yielded[0]).toBeInstanceOf(BlockGenerator);
    expect(yielded[1]).toBe(HookedGenerator);
  });

  it("instance_execs a one-argument block with the hooked class", async () => {
    const yielded: unknown[] = [];
    class ExecGenerator extends Base {
      static {
        this.hookFor("testFramework", function (this: Base, klass: GeneratorClass) {
          yielded.push(this, klass);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(HookedGenerator as unknown as GeneratorClass);
    try {
      await ExecGenerator.start(["Account", "-t", "test_unit"], { destinationRoot: "/tmp" });
    } finally {
      find.mockRestore();
    }
    expect(yielded[0]).toBeInstanceOf(ExecGenerator);
    expect(yielded[1]).toBe(HookedGenerator);
  });

  it("raises when the invocation's option was never declared", () => {
    expect(() => {
      class UndeclaredGenerator extends Base {
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
    class ArgsHookedGenerator extends Base {
      static {
        this.argument("name");
        this.argument("actions", { type: "array", default: [] });
        this.methodAdded("perform");
      }
      declare name: string;
      declare actions: string[];
      perform(): void {
        seen.push(this.name, ...this.actions.flat());
      }
    }
    class ResourceLikeGenerator extends Base {
      static {
        this.hookFor("resourceController", function (this: Base, controller: GeneratorClass) {
          return this.invoke(controller, ["Accounts", ["index", "show"]]);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(ArgsHookedGenerator as unknown as GeneratorClass);
    try {
      await ResourceLikeGenerator.start(["Account"], { destinationRoot: "/tmp" });
    } finally {
      find.mockRestore();
    }
    expect(seen).toEqual(["Accounts", "index", "show"]);
  });

  it("raises when invoke cannot resolve its class", async () => {
    class Invoker extends Base {
      static {
        this.hookFor("testFramework", function (this: Base, _klass: GeneratorClass) {
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
        Invoker.start(["Account", "-t", "x"], { destinationRoot: "/tmp" }),
      ).rejects.toThrow("Missing Thor class for invoke nope");
    } finally {
      find.mockRestore();
    }
  });

  it("parses the invoking argv against the hooked class's own class options", async () => {
    let received: unknown;
    class FixtureGenerator extends Base {
      static {
        this.classOption("fixtureReplacement", { type: "string" });
        this.methodAdded("perform");
      }
      perform(): void {
        received = (this.options as unknown as Record<string, unknown>)["fixtureReplacement"];
      }
    }
    class ModelLikeGenerator extends Base {
      static {
        this.hookFor("testFramework");
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(FixtureGenerator as unknown as GeneratorClass);
    try {
      await ModelLikeGenerator.start(["Account", "-t", "test_unit", "--fixture-replacement=fab"], {
        destinationRoot: "/tmp",
      });
    } finally {
      find.mockRestore();
    }
    expect(received).toBe("fab");
  });

  it("shares the invocation registry, so a class invoked twice runs its commands once", async () => {
    let runs = 0;
    class OnceGenerator extends Base {
      static {
        this.methodAdded("perform");
      }
      perform(): void {
        runs++;
      }
    }
    class TwiceGenerator extends Base {
      static {
        this.hookFor("testFramework", function (this: Base, klass: GeneratorClass) {
          return this.invoke(klass).then(() => this.invoke(klass));
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(OnceGenerator as unknown as GeneratorClass);
    try {
      await TwiceGenerator.start(["Account", "-t", "x"], { destinationRoot: "/tmp" });
    } finally {
      find.mockRestore();
    }
    expect(runs).toBe(1);
  });

  it("invoke with a command dispatches only that command", async () => {
    const ran: string[] = [];
    class CommandsGenerator extends Base {
      static {
        this.hookFor("testFramework", function (this: Base, _klass: GeneratorClass) {
          ran.push("hook");
        });
        this.methodAdded("perform");
      }
      perform(): void {
        ran.push("perform");
      }
    }
    class Caller extends Base {
      static {
        this.hookFor("orm", function (this: Base, _klass: GeneratorClass) {
          return this.invoke(CommandsGenerator as unknown as GeneratorClass, "perform");
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(CommandsGenerator as unknown as GeneratorClass);
    try {
      await Caller.start(["Account", "--orm=x", "-t", "y"], { destinationRoot: "/tmp" });
    } finally {
      find.mockRestore();
    }
    expect(ran).toEqual(["perform"]);
  });

  it("removeHookFor raises NameError for a hook that was never added, as undef_method does", () => {
    class NoHookGenerator extends Base {}
    expect(() => NoHookGenerator.removeHookFor("testFramework")).toThrow(
      "undefined method `testFrameworkGenerator' for class `#<Class:NoHookGenerator>'",
    );
  });

  it("invoke raises when the resolved class is not a generator, and hands the child parentOptions", async () => {
    let parent: unknown;
    class ChildGenerator extends Base {
      static {
        this.methodAdded("perform");
      }
      perform(): void {
        parent = (this as unknown as { parentOptions: unknown }).parentOptions;
      }
    }
    class NotAGenerator {}
    class ParentGenerator extends Base {
      static {
        this.hookFor("testFramework", function (this: Base, klass: GeneratorClass) {
          return this.invoke(klass);
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(ChildGenerator as unknown as GeneratorClass);
    try {
      await ParentGenerator.start(["Account", "-t", "x"], { destinationRoot: "/tmp" });
      expect((parent as Record<string, unknown>).testFramework).toBe("x");

      const instance = new ParentGenerator([], {}, { destinationRoot: "/tmp" });
      await expect(instance.invoke(NotAGenerator as unknown as GeneratorClass, [])).rejects.toThrow(
        "Expected Thor class, got NotAGenerator",
      );
    } finally {
      find.mockRestore();
    }
  });

  it("invoke with a command the class does not register raises, as Thor's all_commands lookup does", async () => {
    class Target extends Base {
      static {
        this.methodAdded("perform");
      }
      perform(): void {}
    }
    class Caller extends Base {
      static {
        this.hookFor("orm", function (this: Base, _klass: GeneratorClass) {
          return this.invoke(Target as unknown as GeneratorClass, "hooks");
        });
      }
    }
    const find = vi
      .spyOn(Generators, "findByNamespace")
      .mockResolvedValue(Target as unknown as GeneratorClass);
    try {
      await expect(
        Caller.start(["Account", "--orm=x"], { destinationRoot: "/tmp" }),
      ).rejects.toThrow(TypeError);
    } finally {
      find.mockRestore();
    }
  });
});

describe("Base.defaultSourceRoot", () => {
  it("resolves base_name/generator_name/templates under base_root", async () => {
    const { MigrationGenerator } = await import("./active-record/migration/migration-generator.js");
    expect(await MigrationGenerator.sourceRoot()).toBe(
      File.join(MigrationGenerator.baseRoot(), "active-record", "migration", "templates"),
    );
  });

  it("is nil when the generator has no templates directory", async () => {
    class WidgetGenerator extends Base {}
    expect(await WidgetGenerator.sourceRoot()).toBeUndefined();
  });
});

describe("Base.help", () => {
  it("--help prints the generator's banner, options and USAGE description", async () => {
    const help = await capture("stdout", () =>
      Generators.invoke("channel", ["--help"], { destinationRoot: "/tmp" }),
    );
    expect(help).toContain("bin/trails generate channel NAME [method method] [options]");
    expect(help).toContain("Generates a new cable channel for the server");
  });

  it("--help falls back to the default description and a kebab-case banner", async () => {
    const help = await capture("stdout", () =>
      Generators.invoke("resource_route", ["--help"], { destinationRoot: "/tmp" }),
    );
    expect(help).toContain("bin/trails generate resource-route NAME");
    expect(help).toContain("Description:\n    Create ");
  });

  it.each([
    ["app", "The `trails new` command creates a new Trails application"],
    ["authentication", "Generates a basic authentication system"],
    ["benchmark", "`bin/trails generate benchmark opt_compare`"],
    ["controller", "app/controllers/credit-cards-controller.ts"],
    ["generator", "lib/generators/awesome/awesome-generator.ts"],
    ["helper", "app/helpers/credit-card-helper.ts"],
    ["migration", "db/migrate/20080514090912_add_ssl_flag.ts"],
    ["scaffold_controller", "`bin/trails generate scaffold_controller CreditCard`"],
    ["scaffold", "'bin/trails destroy scaffold ModelName'"],
    ["script", "script/cleanup/my-script.ts"],
    ["task", "lib/tasks/feeds.ts"],
  ])("%s --help prints the generator's USAGE file", async (name, line) => {
    const help = await capture("stdout", () =>
      Generators.invoke(name, ["--help"], { destinationRoot: "/tmp" }),
    );
    expect(help).toContain(line);
  });
});

describe("Base names read the Ruby class path (base.rb:334-347)", () => {
  it("answers base and generator names from Trails::Generators::TaskGenerator", async () => {
    const { TaskGenerator } = await import("./trails/task/task-generator.js");
    const klass = TaskGenerator as unknown as {
      baseName(): string;
      generatorName(): string;
      namespace(): string;
    };
    expect(klass.baseName()).toBe("trails");
    expect(klass.generatorName()).toBe("task");
    expect(klass.namespace()).toBe("trails:task");
  });

  it("finds trails/task/templates and trails/app/templates as the default source root", async () => {
    const { TaskGenerator } = await import("./trails/task/task-generator.js");
    const { AppGenerator } = await import("./trails/app/app-generator.js");
    expect(await TaskGenerator.sourceRoot()).toBe(
      File.join(Base.baseRoot(), "trails/task/templates"),
    );
    expect(await AppGenerator.sourceRoot()).toBe(
      File.join(Base.baseRoot(), "trails/app/templates"),
    );
  });

  it("defaults hookFor's in / as to the Ruby base and generator names", async () => {
    const { ModelGenerator } = await import("./trails/model/model-generator.js");
    expect(ModelGenerator.hooks()["orm"]).toEqual(["trails", "model"]);
  });

  it("looks up defaultForOption under the Ruby generator name, then base name", async () => {
    const { ModelGenerator } = await import("./test-unit/model/model-generator.js");
    const klass = ModelGenerator as unknown as {
      defaultForOption(
        c: Record<string, Record<string, unknown>>,
        n: string,
        o: object,
        d: unknown,
      ): unknown;
    };
    expect(
      klass.defaultForOption({ model: { x: 1 }, test_unit: { x: 2 }, trails: {} }, "x", {}, 0),
    ).toBe(1);
    expect(klass.defaultForOption({ test_unit: { x: 2 }, trails: {} }, "x", {}, 0)).toBe(2);
  });
});
