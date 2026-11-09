import { describe, expect, it, vi } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { capture } from "@blazetrails/activesupport";
import { invoke } from "../../lib/command.js";
import { HelpCommand } from "../../lib/commands/help.js";
import { RakeCommand } from "../../lib/commands/rake.js";
import { VERSION } from "../../lib/gem-version.js";

async function withBuiltUsage<T>(block: () => Promise<T>): Promise<T> {
  const dir = Dir.mktmpdir();
  const source = await HelpCommand.usagePath();
  const usage = File.join(dir, "USAGE");
  const usagePath = vi.spyOn(HelpCommand, "usagePath").mockResolvedValue(usage);
  try {
    await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
    await buildTemplates([usage]);
    return await block();
  } finally {
    usagePath.mockRestore();
    await getFs().rm!(dir, { recursive: true, force: true });
  }
}

describe("Trails::Command::HelpCommand", () => {
  it("invoke with no namespace prints the help USAGE", async () => {
    const output = await withBuiltUsage(() => capture(":stdout", () => invoke("", [])));
    expect(output).toContain("bin/trails COMMAND [options]");
    expect(output).toContain("plugin new   Create a new Trails railtie or engine");
    expect(output).not.toContain("In addition to those commands");
  }, 30_000);

  it("invoke --help prints help_extended's kebab-case command list", async () => {
    const rakeTasks = vi
      .spyOn(RakeCommand, "printingCommands")
      .mockResolvedValue([["db:migrate", "Migrate the database"]]);
    try {
      const output = await withBuiltUsage(() => capture(":stdout", () => invoke("--help", [])));
      expect(output).toContain("In addition to those commands, there are:");
      expect(output).toMatch(/^db:system:change\b/m);
      expect(output).toMatch(/^db:migrate\s+Migrate the database/m);
      expect(output).not.toMatch(/^server\b/m);
    } finally {
      rakeTasks.mockRestore();
    }
  }, 30_000);
});

describe("Trails::Command::VersionCommand", () => {
  it("invoke -v prints the Trails version", async () => {
    const output = await capture(":stdout", () => invoke("-v", []).catch(() => undefined));
    expect(output).toContain(`Trails ${VERSION.STRING}`);
  }, 30_000);
});
