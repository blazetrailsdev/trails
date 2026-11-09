import { describe, expect, it, vi } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { capture } from "@blazetrails/activesupport";
import { invoke } from "../../lib/command.js";
import { GemHelpCommand } from "../../lib/commands/gem-help.js";

describe("Trails::Command::GemHelpCommand", () => {
  it("invoke gem_help prints the gem USAGE", async () => {
    const dir = Dir.mktmpdir();
    const source = await GemHelpCommand.usagePath();
    const usage = File.join(dir, "USAGE");
    const usagePath = vi.spyOn(GemHelpCommand, "usagePath").mockResolvedValue(usage);
    try {
      await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
      await buildTemplates([usage]);
      const output = await capture(":stdout", () => invoke("gem_help", []));
      expect(output).toContain("trails COMMAND [options]");
      expect(output).toContain("plugin new   Create a new Trails railtie or engine");
    } finally {
      usagePath.mockRestore();
      await getFs().rm!(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
