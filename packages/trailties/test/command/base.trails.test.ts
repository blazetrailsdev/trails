import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../../lib/command/base.js";
import { printingCommands } from "../../lib/command.js";
import { NotesCommand } from "../../lib/commands/notes.js";
import { UnusedRoutesCommand } from "../../lib/commands/unused-routes.js";

describe("Trails::Command::Base.perform", () => {
  it("dispatches --help to help with the command name, as base.rb:68-71 does", async () => {
    const out = (
      await capture(":stdout", () => UnusedRoutesCommand.perform("unused-routes", ["--help"], {}))
    ).split("\n");
    expect(out.slice(0, 2)).toEqual(["Usage:", "  bin/trails unused-routes"]);
    expect(out).toContain("  -g, [--grep=GREP]              # Grep routes by a specific pattern.");
  });
});

describe("Trails::Command::Base helpers", () => {
  it("keeps executable and invokeCommand out of allCommands", () => {
    const commands = (Base as unknown as ThorClass).allCommands();
    expect(Object.keys(commands)).not.toContain("executable");
    expect(Object.keys(commands)).not.toContain("invokeCommand");
  });
});

describe("Trails::Command::Base class surface", () => {
  it("banner prints a multi-word command and namespace in kebab-case", () => {
    class MultiWordCommand extends Base {
      doThing(): void {}

      static {
        const klass = this as unknown as ThorClass;
        klass.methodAdded("doThing");
      }
    }
    const command = (MultiWordCommand as unknown as ThorClass).commands()["do-thing"];
    expect(MultiWordCommand.banner(command)).toBe("bin/trails multi-word:do-thing");
  });

  it("desc with no usage answers class_usage, nil with no USAGE file", async () => {
    class NoUsageCommand extends Base {}
    expect(await NoUsageCommand.desc()).toBeNull();
    expect(await NoUsageCommand.usagePath()).toBeNull();
  });

  it("class_usage renders a multi-word command in kebab-case from its compiled USAGE", async () => {
    const dir = Dir.mktmpdir();
    try {
      const usage = File.join(dir, "USAGE");
      await getFs().writeFile!(usage, "<%= executable() %> x\n");
      await buildTemplates([usage]);
      class RenderedUsageCommand extends Base {
        static override async usagePath(): Promise<string | null> {
          return usage;
        }
      }
      expect(await RenderedUsageCommand.classUsage()).toBe("bin/trails rendered-usage x\n");
    } finally {
      await getFs().rm!(dir, { recursive: true, force: true });
    }
  });

  it("default_command_root answers an existing command folder", async () => {
    class ConsoleCommand extends Base {}
    expect(await ConsoleCommand.defaultCommandRoot()).toMatch(/commands\/console$/);
  });

  it("base_name is the first path segment, underscored", () => {
    expect(NotesCommand.baseName()).toBe("trails");
  });

  describe("in an app", () => {
    let appPath: string;
    let originalCwd: string;

    beforeEach(async () => {
      appPath = Dir.mktmpdir();
      originalCwd = Dir.pwd();
      await getFs().writeFile!(File.join(appPath, "Rakefile.ts"), "");
      Dir.chdir(appPath);
    });

    afterEach(async () => {
      Dir.chdir(originalCwd);
      await getFs().rm!(appPath, { recursive: true, force: true });
    });

    it("Trails::Command.printing_commands skips hidden_commands", async () => {
      const names = (await printingCommands()).map(([name]) => name);
      expect(names).toContain("notes");
      expect(names).not.toContain("unused-routes");
    });
  });
});
