import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "./base.js";
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
    expect(overview).toContain("bin/rails helpful:foo PATH");
    expect(overview).toContain("description of foo");
    expect(overview).toContain("bin/rails helpful:bar [paths...]");
    expect(overview).toContain("description of bar");

    const fooHelp = await capture(":stdout", () => HelpfulCommand.perform("foo", ["--help"], {}));
    expect(fooHelp).toContain("bin/rails helpful:foo PATH");
    expect(fooHelp).toContain("description of foo");
    expect(fooHelp).not.toContain("helpful:bar");

    const barHelp = await capture(":stdout", () => HelpfulCommand.perform("bar", ["--help"], {}));
    expect(barHelp).toContain("bin/rails helpful:bar [paths...]");
    expect(barHelp).toContain("description of bar");
    expect(barHelp).not.toContain("helpful:foo");
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
