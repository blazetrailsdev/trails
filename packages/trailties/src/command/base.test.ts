import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "./base.js";
import { CredentialsCommand } from "../commands/credentials.js";
import { GenerateCommand } from "../commands/generate.js";
import { NotesCommand } from "../commands/notes.js";

describe("Rails::Command::BaseTest", () => {
  it("printing commands returns command and description if present", () => {
    expect(GenerateCommand.printingCommands()[0]).toEqual(["generate", ""]);
    expect(NotesCommand.printingCommands()[0]).toEqual([
      "notes",
      "Show comments in your code annotated with FIXME, OPTIMIZE, and TODO",
    ]);
  });

  it("printing commands returns namespaced commands", () => {
    expect(CredentialsCommand.printingCommands().map(([name]) => name)).toEqual([
      "credentials:edit",
      "credentials:show",
      "credentials:diff",
    ]);
  });

  it("printing commands hides hidden commands", () => {
    class HiddenCommand extends Base {
      command(): void {}

      static {
        const klass = this as unknown as ThorClass;
        klass.desc("command", "Hidden command", { hide: true });
        klass.methodAdded("command");
      }
    }
    expect(HiddenCommand.printingCommands()).toEqual([]);
  });

  it("help shows usage and description", async () => {
    class HelpfulCommand extends Base {
      foo(_path: string): void {}
      bar(..._paths: string[]): void {}

      static {
        const klass = this as unknown as ThorClass;
        klass.desc("foo PATH", "description of foo");
        klass.methodAdded("foo");
        klass.desc("bar [paths...]", "description of bar");
        klass.methodAdded("bar");
      }
    }

    const overview = await capture(":stdout", () => HelpfulCommand.perform("help", [], {}));
    expect(overview).toMatch("bin/rails helpful:foo PATH");
    expect(overview).toMatch("description of foo");
    expect(overview).toMatch("bin/rails helpful:bar [paths...]");
    expect(overview).toMatch("description of bar");

    const fooHelp = await capture(":stdout", () => HelpfulCommand.perform("foo", ["--help"], {}));
    expect(fooHelp).toMatch("bin/rails helpful:foo PATH");
    expect(fooHelp).toMatch("description of foo");
    expect(fooHelp).not.toMatch("helpful:bar");

    const barHelp = await capture(":stdout", () => HelpfulCommand.perform("bar", ["--help"], {}));
    expect(barHelp).toMatch("bin/rails helpful:bar [paths...]");
    expect(barHelp).toMatch("description of bar");
    expect(barHelp).not.toMatch("helpful:foo");
  });

  it("help usage banner shows full command name", async () => {
    class NestedCommand extends Base {
      static override namespace(name: string | null = null): string {
        return name ?? "nesting:nested";
      }
      perform(..._args: unknown[]): void {}
      foo(..._args: unknown[]): void {}

      static {
        const klass = this as unknown as ThorClass;
        klass.methodAdded("perform");
        klass.methodAdded("foo");
      }
    }

    const mainHelp = await capture(":stdout", () =>
      NestedCommand.perform("nested", ["--help"], {}),
    );
    expect(mainHelp).toMatch(/Usage:\s+bin\/rails nesting:nested$/m);

    const fooHelp = await capture(":stdout", () => NestedCommand.perform("foo", ["--help"], {}));
    expect(fooHelp).toMatch(/Usage:\s+bin\/rails nesting:nested:foo$/m);
  });

  it("::executable returns bin and command name", () => {
    expect(GenerateCommand.executable()).toEqual("bin/rails generate");
  });

  it("::executable integrates subcommand when given", () => {
    expect(GenerateCommand.executable("help")).toEqual("bin/rails generate:help");
  });

  it("::executable integrates ::bin", () => {
    class CustomBinCommand extends Base {
      static {
        this.bin = "FOO";
      }
    }

    expect(CustomBinCommand.executable()).toBe("FOO custom-bin");
  });
});
