import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { rbArgv, rbEqual, rbSetClassPathString } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "./base.js";
import { invoke } from "../command.js";
import { CredentialsCommand } from "../commands/credentials.js";
import { GenerateCommand } from "../commands/generate.js";
import { NotesCommand } from "../commands/notes.js";
import { ChangeCommand } from "../commands/db/system/change/change-command.js";

describe("Trails::Command::BaseTest", () => {
  it("printing commands returns command and description if present", async () => {
    expect((await GenerateCommand.printingCommands())[0]).toEqual(["generate", ""]);
    expect((await NotesCommand.printingCommands())[0]).toEqual([
      "notes",
      "Show comments in your code annotated with FIXME, OPTIMIZE, and TODO",
    ]);
  });

  it("printing commands returns namespaced commands", async () => {
    expect((await CredentialsCommand.printingCommands()).map(([name]) => name)).toEqual([
      "credentials:edit",
      "credentials:show",
      "credentials:diff",
    ]);
    expect((await ChangeCommand.printingCommands()).map(([name]) => name)).toEqual([
      "db:system:change",
    ]);
  });

  it("printing commands hides hidden commands", async () => {
    class HiddenCommand extends Base {
      command(): void {}

      static {
        rbSetClassPathString(this, { name: "Trails::Command" }, "HiddenCommand");
        const klass = this as unknown as ThorClass;
        klass.desc("command", "Hidden command", { hide: true });
        klass.methodAdded("command");
      }
    }
    expect(await HiddenCommand.printingCommands()).toEqual([]);
  });

  it("help shows usage and description", async () => {
    class HelpfulCommand extends Base {
      foo(_path: string): void {}
      bar(..._paths: string[]): void {}

      static {
        rbSetClassPathString(this, { name: "Trails::Command" }, "HelpfulCommand");
        const klass = this as unknown as ThorClass;
        klass.desc("foo PATH", "description of foo");
        klass.methodAdded("foo");
        klass.desc("bar [paths...]", "description of bar");
        klass.methodAdded("bar");
      }
    }

    const overview = await capture(":stdout", () => HelpfulCommand.perform("help", [], {}));
    expect(overview).toMatch("bin/trails helpful:foo PATH");
    expect(overview).toMatch("description of foo");
    expect(overview).toMatch("bin/trails helpful:bar [paths...]");
    expect(overview).toMatch("description of bar");

    const fooHelp = await capture(":stdout", () => HelpfulCommand.perform("foo", ["--help"], {}));
    expect(fooHelp).toMatch("bin/trails helpful:foo PATH");
    expect(fooHelp).toMatch("description of foo");
    expect(fooHelp).not.toMatch("helpful:bar");

    const barHelp = await capture(":stdout", () => HelpfulCommand.perform("bar", ["--help"], {}));
    expect(barHelp).toMatch("bin/trails helpful:bar [paths...]");
    expect(barHelp).toMatch("description of bar");
    expect(barHelp).not.toMatch("helpful:foo");
  });

  it("help usage banner shows full command name", async () => {
    class NestedCommand extends Base {
      perform(..._args: unknown[]): void {}
      foo(..._args: unknown[]): void {}

      static {
        rbSetClassPathString(this, { name: "Trails::Command::Nesting" }, "NestedCommand");
        const klass = this as unknown as ThorClass;
        klass.methodAdded("perform");
        klass.methodAdded("foo");
      }
    }

    const mainHelp = await capture(":stdout", () =>
      NestedCommand.perform("nested", ["--help"], {}),
    );
    expect(mainHelp).toMatch(/Usage:\s+bin\/trails nesting:nested$/m);

    const fooHelp = await capture(":stdout", () => NestedCommand.perform("foo", ["--help"], {}));
    expect(fooHelp).toMatch(/Usage:\s+bin\/trails nesting:nested:foo$/m);
  });

  it("::executable returns bin and command name", () => {
    expect(GenerateCommand.executable()).toEqual("bin/trails generate");
  });

  it("::executable integrates subcommand when given", () => {
    expect(GenerateCommand.executable("help")).toEqual("bin/trails generate:help");
  });

  it("::executable integrates ::bin", () => {
    class CustomBinCommand extends Base {
      static {
        this.bin = "FOO";
      }
    }

    expect(CustomBinCommand.executable()).toBe("FOO custom-bin");
  });

  it("#current_subcommand reflects current subcommand", async () => {
    class LastSubcommandCommand extends Base {
      static lastSubcommand: string | null | undefined;

      setLastSubcommand(): void {
        LastSubcommandCommand.lastSubcommand = this.currentSubcommand;
      }

      declare foo: () => void;
      declare bar: () => void;

      static {
        rbSetClassPathString(this, { name: "Trails::Command" }, "LastSubcommandCommand");
        this.prototype.foo = this.prototype.setLastSubcommand;
        this.prototype.bar = this.prototype.setLastSubcommand;
        const klass = this as unknown as ThorClass;
        klass.methodAdded("setLastSubcommand");
        klass.methodAdded("foo");
        klass.methodAdded("bar");
      }
    }

    await invoke("last_subcommand:foo");
    expect(LastSubcommandCommand.lastSubcommand).toEqual("foo");

    await invoke("last_subcommand:bar");
    expect(LastSubcommandCommand.lastSubcommand).toEqual("bar");
  });

  it("ARGV is populated", async () => {
    class ArgvCommand extends Base {
      checkPopulated(...args: string[]): void {
        const argv = rbArgv();
        if (argv.length === 0 || !rbEqual(argv, args)) throw new Error("not populated");
      }

      static {
        rbSetClassPathString(this, { name: "Trails::Command" }, "ArgvCommand");
        (this as unknown as ThorClass).methodAdded("checkPopulated");
      }
    }
    void ArgvCommand;

    await expect(invoke("argv:check_populated", ["foo", "bar"])).resolves.not.toThrow();
  });

  it("ARGV is isolated", async () => {
    class ArgvCommand extends Base {
      checkIsolated(): void {
        rbArgv().push("isolate this");
      }

      static {
        rbSetClassPathString(this, { name: "Trails::Command" }, "ArgvCommand");
        (this as unknown as ThorClass).methodAdded("checkIsolated");
      }
    }
    void ArgvCommand;

    const originalArgv = [...rbArgv()];
    rbArgv().length = 0;

    try {
      await invoke("argv:check_isolated");
      expect(rbArgv()).toBeEmpty();
    } finally {
      rbArgv().splice(0, rbArgv().length, ...originalArgv);
    }
  });
});
