import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { File, getFs } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "./base.js";
import { printingCommands } from "../command.js";
import { UnusedRoutesCommand } from "../commands/unused-routes.js";

describe("Rails::Command::Base.perform", () => {
  it("dispatches --help to help with the command name, as base.rb:68-71 does", async () => {
    const out = (
      await capture(":stdout", () => UnusedRoutesCommand.perform("unused-routes", ["--help"], {}))
    ).split("\n");
    expect(out.slice(0, 2)).toEqual(["Usage:", "  bin/rails unused-routes"]);
    expect(out).toContain("  -g, [--grep=GREP]              # Grep routes by a specific pattern.");
  });
});

describe("Rails::Command::Base helpers", () => {
  it("keeps executable and invokeCommand out of allCommands", () => {
    const commands = (Base as unknown as ThorClass).allCommands();
    expect(Object.keys(commands)).not.toContain("executable");
    expect(Object.keys(commands)).not.toContain("invokeCommand");
  });
});

describe("Rails::Command::Base class surface", () => {
  it("banner prints a multi-word command and namespace in kebab-case", () => {
    class MultiWordCommand extends Base {
      doThing(): void {}

      static {
        const klass = this as unknown as ThorClass;
        klass.methodAdded("doThing");
      }
    }
    const command = (MultiWordCommand as unknown as ThorClass).commands()["do-thing"];
    expect(MultiWordCommand.banner(command)).toBe("bin/rails multi-word:do-thing");
  });

  it("desc with no usage answers class_usage, nil with no USAGE file", async () => {
    class NoUsageCommand extends Base {}
    expect(await NoUsageCommand.desc()).toBeNull();
    expect(await NoUsageCommand.usagePath()).toBeNull();
  });

  it("class_usage renders the precompiled USAGE with the class as its binding", async () => {
    const dir = File.expandPath(`.usage-test-${Date.now()}`);
    await getFs().mkdir!(dir, { recursive: true });
    try {
      const usage = File.join(dir, "USAGE");
      await getFs().writeFile!(usage, "<%= executable %> x\n");
      await getFs().writeFile!(
        `${usage}.js`,
        "export default function () { return this.executable() + ' x'; }",
      );
      class RenderedCommand extends Base {
        static override async usagePath(): Promise<string | null> {
          return usage;
        }
      }
      expect(await RenderedCommand.classUsage()).toBe("bin/rails rendered x");
    } finally {
      await getFs().rm!(dir, { recursive: true, force: true });
    }
  });

  it("default_command_root answers an existing command folder", async () => {
    class ConsoleCommand extends Base {}
    expect(await ConsoleCommand.defaultCommandRoot()).toMatch(/commands\/console$/);
  });

  it("base_name is the first path segment, underscored", () => {
    class BaseNameCommand extends Base {}
    expect(BaseNameCommand.baseName()).toBe("base_name_command");
  });

  it("Rails::Command.printing_commands skips hidden_commands", async () => {
    const names = (await printingCommands()).map(([name]) => name);
    expect(names).toContain("notes");
    expect(names).not.toContain("unused-routes");
  });
});
